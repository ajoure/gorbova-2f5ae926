import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 3DS-related error codes from bePaid that indicate card requires 3DS for each transaction
const REQUIRES_3DS_CODES = ['P.4011', 'P.4012', 'P.4013', 'P.4014', 'P.4015'];

// Rate limit / temporary error codes that should trigger retry
const RETRIABLE_CODES = ['G.9999', 'N.1001', 'N.1002', 'N.1003'];

function calculateBackoff(attempt: number): number {
  // Exponential backoff: 1min, 5min, 15min, 30min, 60min
  const delays = [60, 300, 900, 1800, 3600];
  return delays[Math.min(attempt, delays.length - 1)] * 1000;
}

interface VerificationJob {
  id: string;
  payment_method_id: string;
  user_id: string;
  attempt_count: number;
  max_attempts: number;
  status: string;
  idempotency_key: string;
}

interface PaymentMethod {
  id: string;
  provider_token: string;
  last4: string;
  brand: string;
  user_id: string;
}

interface ProcessingResult {
  verified: number;
  rejected: number;
  retried: number;
  failed: number;
  errors: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse request body
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run ?? true; // Default to dry_run for safety
  const limit = Math.min(body.limit ?? 10, 50); // Max 50 per run for safety

  console.log(`[payment-method-verify-recurring] Starting: dry_run=${dryRun}, limit=${limit}`);

  const now = new Date().toISOString();

  // SELECT pending jobs ready for processing
  const { data: jobs, error: fetchError } = await supabase
    .from('payment_method_verification_jobs')
    .select('id, payment_method_id, user_id, attempt_count, max_attempts, status, idempotency_key')
    .in('status', ['pending', 'rate_limited'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchError) {
    console.error('[payment-method-verify-recurring] Error fetching jobs:', fetchError);
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({
      mode: dryRun ? 'dry_run' : 'execute',
      message: 'No pending jobs found',
      processed: 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // DRY RUN mode - just return what would be processed
  if (dryRun) {
    return new Response(JSON.stringify({
      mode: 'dry_run',
      would_process: jobs.length,
      jobs: jobs.map(j => ({
        id: j.id,
        payment_method_id: j.payment_method_id,
        user_id: j.user_id,
        attempt: j.attempt_count,
        status: j.status,
      })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Get bePaid credentials
  const { data: bepaidConfig } = await supabase
    .from('integration_instances')
    .select('config')
    .eq('provider', 'bepaid')
    .in('status', ['active', 'connected'])
    .maybeSingle();

  const secretKey = bepaidConfig?.config?.secret_key || Deno.env.get('BEPAID_SECRET_KEY');
  const shopId = bepaidConfig?.config?.shop_id || Deno.env.get('BEPAID_SHOP_ID') || '33524';
  
  if (!secretKey) {
    console.error('[payment-method-verify-recurring] No bePaid secret key configured');
    return new Response(JSON.stringify({ error: 'bePaid not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bepaidAuth = btoa(`${shopId}:${secretKey}`);

  // EXECUTE mode - process jobs
  const results: ProcessingResult = {
    verified: 0,
    rejected: 0,
    retried: 0,
    failed: 0,
    errors: [],
  };

  let rateLimitHit = false;

  for (const job of jobs as VerificationJob[]) {
    // Stop if rate limit was hit
    if (rateLimitHit) {
      console.log(`[payment-method-verify-recurring] Rate limit hit, stopping batch`);
      break;
    }

    try {
      // Lock job: UPDATE status='processing'
      const { error: lockError } = await supabase
        .from('payment_method_verification_jobs')
        .update({ status: 'processing', updated_at: now })
        .eq('id', job.id)
        .eq('status', job.status); // Optimistic lock

      if (lockError) {
        console.error(`[job ${job.id}] Lock error:`, lockError);
        results.errors.push(job.id);
        continue;
      }

      // Get payment method
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('id, provider_token, last4, brand, user_id')
        .eq('id', job.payment_method_id)
        .single();

      if (!pm?.provider_token) {
        // Mark as failed - no token
        await finalizeJob(supabase, job, 'failed', 'No payment token found');
        await updatePaymentMethodStatus(supabase, job.payment_method_id, 'failed', 'Токен карты не найден');
        results.failed++;
        continue;
      }

      // Test charge: 1 BYN (100 kopecks)
      const testAmount = 100;
      const testCurrency = 'BYN';
      const trackingId = `verify_${pm.id}_${Date.now()}`;

      const chargePayload = {
        request: {
          amount: testAmount,
          currency: testCurrency,
          description: 'Проверка карты для автоплатежей (будет возвращено)',
          tracking_id: trackingId,
          test: true, // Always test mode for verification charges
          skip_three_d_secure_verification: true, // Try to skip 3DS
          credit_card: { token: pm.provider_token },
          additional_data: {
            contract: ['recurring', 'unscheduled'],
            card_on_file: { initiator: 'merchant', type: 'delayed_charge' },
          },
        },
      };

      console.log(`[job ${job.id}] Attempting test charge for card ${pm.brand} ****${pm.last4}`);

      const chargeResp = await fetch('https://gateway.bepaid.by/transactions/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${bepaidAuth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Version': '2',
        },
        body: JSON.stringify(chargePayload),
      });

      const chargeResult = await chargeResp.json();
      const txStatus = chargeResult.transaction?.status;
      const txCode = chargeResult.transaction?.code;
      const txUid = chargeResult.transaction?.uid;
      const txMessage = chargeResult.transaction?.message || chargeResult.message;

      console.log(`[job ${job.id}] Charge result: status=${txStatus}, code=${txCode}, uid=${txUid}`);

      // === CASE A: SUCCESS → Refund ===
      if (txStatus === 'successful') {
        console.log(`[job ${job.id}] Test charge successful, initiating refund`);

        // Attempt refund
        const refundPayload = {
          request: {
            parent_uid: txUid,
            amount: testAmount,
            reason: 'Проверка карты: возврат',
          },
        };

        const refundResp = await fetch('https://gateway.bepaid.by/transactions/refunds', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${bepaidAuth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Version': '2',
          },
          body: JSON.stringify(refundPayload),
        });

        const refundResult = await refundResp.json();
        const refundOk = refundResult.transaction?.status === 'successful';
        const refundUid = refundResult.transaction?.uid;

        console.log(`[job ${job.id}] Refund result: ok=${refundOk}, uid=${refundUid}`);

        // Update payment_method as verified (even if refund failed - charge worked!)
        await supabase.from('payment_methods').update({
          recurring_verified: true,
          verification_status: 'verified',
          verification_checked_at: new Date().toISOString(),
          verification_tx_uid: txUid,
          verification_error: refundOk ? null : `Refund pending: ${refundResult.transaction?.message || 'unknown'}`,
        }).eq('id', pm.id);

        // Mark job done
        await supabase.from('payment_method_verification_jobs').update({
          status: 'done',
          charge_tx_uid: txUid,
          refund_tx_uid: refundUid,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);

        // SYSTEM ACTOR audit
        await supabase.from('audit_logs').insert({
          actor_type: 'system',
          actor_user_id: null,
          actor_label: 'payment-method-verify-recurring',
          action: 'card.verification.verified',
          meta: {
            payment_method_id: pm.id,
            user_id: pm.user_id,
            last4: pm.last4,
            brand: pm.brand,
            charge_tx_uid: txUid,
            refund_tx_uid: refundUid,
            refund_status: refundResult.transaction?.status,
          },
        });

        // If refund failed, log separately for manual follow-up
        if (!refundOk) {
          await supabase.from('audit_logs').insert({
            actor_type: 'system',
            actor_user_id: null,
            actor_label: 'payment-method-verify-recurring',
            action: 'card.refund.failed',
            meta: {
              payment_method_id: pm.id,
              charge_tx_uid: txUid,
              refund_error: refundResult.transaction?.message,
              requires_manual_refund: true,
            },
          });
        }

        results.verified++;

        // ========== AUTO-LINK to subscriptions ==========
        // Link verified card to orphan subscriptions (auto_renew=true, payment_method_id=null)
        try {
          const { data: orphanSubs } = await supabase
            .from('subscriptions_v2')
            .select('id')
            .eq('user_id', pm.user_id)
            .in('status', ['active', 'trial'])
            .eq('auto_renew', true)
            .is('payment_method_id', null);

          if (orphanSubs && orphanSubs.length > 0) {
            const subIds = orphanSubs.map(s => s.id);
            await supabase
              .from('subscriptions_v2')
              .update({
                payment_method_id: pm.id,
                payment_token: pm.provider_token,
              })
              .in('id', subIds);

            console.log(`[job ${job.id}] Auto-linked ${subIds.length} subscriptions to verified card`);

            await supabase.from('audit_logs').insert({
              actor_type: 'system',
              actor_user_id: null,
              actor_label: 'payment-method-verify-recurring',
              action: 'subscription.payment_method_auto_linked',
              meta: {
                payment_method_id: pm.id,
                user_id: pm.user_id,
                subscriptions_linked: subIds,
                count: subIds.length,
              },
            });
          }
        } catch (linkError) {
          console.error(`[job ${job.id}] Auto-link error:`, linkError);
        }
      }

      // === CASE B: 3DS Required → Rejected ===
      else if (txStatus === 'incomplete' && REQUIRES_3DS_CODES.includes(txCode)) {
        console.log(`[job ${job.id}] Card requires 3DS: ${txCode}`);

        await supabase.from('payment_methods').update({
          recurring_verified: false,
          verification_status: 'rejected',
          verification_checked_at: new Date().toISOString(),
          verification_error: 'Карта требует 3D-Secure на каждую операцию',
        }).eq('id', pm.id);

        await supabase.from('payment_method_verification_jobs').update({
          status: 'done',
          last_error: `3DS required: ${txCode}`,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);

        // SYSTEM ACTOR audit
        await supabase.from('audit_logs').insert({
          actor_type: 'system',
          actor_user_id: null,
          actor_label: 'payment-method-verify-recurring',
          action: 'card.verification.rejected',
          meta: {
            payment_method_id: pm.id,
            user_id: pm.user_id,
            last4: pm.last4,
            brand: pm.brand,
            code: txCode,
            reason: '3ds_required',
          },
        });

        // Queue notification to user
        await sendCardNotSuitableNotification(supabase, supabaseUrl, supabaseServiceKey, pm);

        results.rejected++;
      }

      // === CASE C: Rate limit → Stop batch ===
      else if (txCode === 'G.9999' || chargeResp.status === 429) {
        console.log(`[job ${job.id}] Rate limit hit: ${txCode}`);
        rateLimitHit = true;

        // Revert to pending with next_retry_at
        const nextRetry = new Date(Date.now() + 300000).toISOString(); // 5 min
        await supabase.from('payment_method_verification_jobs').update({
          status: 'rate_limited',
          next_retry_at: nextRetry,
          last_error: 'Rate limited',
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);

        await supabase.from('audit_logs').insert({
          actor_type: 'system',
          actor_user_id: null,
          actor_label: 'payment-method-verify-recurring',
          action: 'card.verification.rate_limited',
          meta: { job_id: job.id, next_retry_at: nextRetry },
        });
      }

      // === CASE D: Other error → Retry with backoff ===
      else {
        const newAttempt = job.attempt_count + 1;
        const maxAttempts = job.max_attempts || 5;

        console.log(`[job ${job.id}] Charge failed: ${txStatus}/${txCode}/${txMessage}, attempt ${newAttempt}/${maxAttempts}`);

        if (newAttempt >= maxAttempts) {
          // Final failure
          await supabase.from('payment_methods').update({
            verification_status: 'failed',
            verification_error: txMessage || 'Max attempts exceeded',
            verification_checked_at: new Date().toISOString(),
          }).eq('id', pm.id);

          await supabase.from('payment_method_verification_jobs').update({
            status: 'failed',
            attempt_count: newAttempt,
            last_error: txMessage,
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);

          await supabase.from('audit_logs').insert({
            actor_type: 'system',
            actor_user_id: null,
            actor_label: 'payment-method-verify-recurring',
            action: 'card.verification.failed',
            meta: {
              payment_method_id: pm.id,
              user_id: pm.user_id,
              attempts: newAttempt,
              last_error: txMessage,
              code: txCode,
            },
          });

          results.failed++;
        } else {
          // Retry with backoff
          const backoffMs = calculateBackoff(newAttempt);
          const nextRetry = new Date(Date.now() + backoffMs).toISOString();

          await supabase.from('payment_method_verification_jobs').update({
            status: 'pending',
            attempt_count: newAttempt,
            next_retry_at: nextRetry,
            last_error: txMessage,
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);

          console.log(`[job ${job.id}] Scheduled retry at ${nextRetry}`);
          results.retried++;
        }
      }

      // Small delay between jobs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (jobError) {
      console.error(`[job ${job.id}] Unexpected error:`, jobError);
      results.errors.push(job.id);

      // Revert job to pending for retry
      await supabase.from('payment_method_verification_jobs').update({
        status: 'pending',
        last_error: jobError instanceof Error ? jobError.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
  }

  console.log(`[payment-method-verify-recurring] Completed: verified=${results.verified}, rejected=${results.rejected}, retried=${results.retried}, failed=${results.failed}`);

  return new Response(JSON.stringify({
    mode: 'execute',
    processed: jobs.length,
    results,
    rate_limit_hit: rateLimitHit,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// Helper: Finalize job with status
async function finalizeJob(
  supabase: any,
  job: VerificationJob,
  status: string,
  error: string
) {
  await supabase.from('payment_method_verification_jobs').update({
    status,
    last_error: error,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);
}

// Helper: Update payment method verification status
async function updatePaymentMethodStatus(
  supabase: any,
  pmId: string,
  status: string,
  error: string
) {
  await supabase.from('payment_methods').update({
    verification_status: status,
    verification_error: error,
    verification_checked_at: new Date().toISOString(),
  }).eq('id', pmId);
}

// Helper: Send notification for rejected card
async function sendCardNotSuitableNotification(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  pm: PaymentMethod
) {
  try {
    // Get profile for notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('telegram_user_id, telegram_link_status, full_name')
      .eq('user_id', pm.user_id)
      .single();

    if (!profile?.telegram_user_id || profile.telegram_link_status !== 'active') {
      console.log(`[notification] User ${pm.user_id} has no active Telegram link`);
      return;
    }

    // Get link bot
    const { data: linkBot } = await supabase
      .from('telegram_bots')
      .select('token')
      .eq('is_link_bot', true)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!linkBot?.token) {
      console.log('[notification] No link bot configured');
      return;
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://club.gorbova.by';
    const userName = profile.full_name || 'Клиент';
    const brandUpper = pm.brand?.toUpperCase() || '';

    const message = `⚠️ *Карта не подходит для автоплатежей*

${userName}, ваша карта ${brandUpper} ****${pm.last4} успешно добавлена, но *требует подтверждения 3D-Secure* на каждую операцию.

📋 *Что это значит:*
Автопродление подписки не сможет работать с этой картой — каждый платёж потребует ввода кода из SMS.

💡 *Рекомендуем:*
• Привязать другую карту (Visa или Mastercard)
• Или оплачивать вручную на сайте

🔗 [Привязать другую карту](${siteUrl}/settings/payment-methods)`;

    const resp = await fetch(`https://api.telegram.org/bot${linkBot.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: profile.telegram_user_id,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const result = await resp.json();
    if (result.ok) {
      console.log(`[notification] Sent card rejection notice to user ${pm.user_id}`);

      // Log to telegram_logs for history
      await supabase.from('telegram_logs').insert({
        user_id: pm.user_id,
        direction: 'out',
        message_type: 'card_not_suitable_for_autopay',
        message_text: message,
        telegram_user_id: profile.telegram_user_id,
        status: 'sent',
        meta: {
          payment_method_id: pm.id,
          card_last4: pm.last4,
          card_brand: pm.brand,
        },
      });
    } else {
      console.error(`[notification] Failed to send:`, result);
    }
  } catch (error) {
    console.error('[notification] Error sending card rejection notice:', error);
  }
}
