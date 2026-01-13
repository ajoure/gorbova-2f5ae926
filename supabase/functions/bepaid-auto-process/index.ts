import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueItem {
  id: string;
  bepaid_uid: string | null;
  tracking_id: string | null;
  amount: number | null;
  currency: string;
  customer_email: string | null;
  card_last4: string | null;
  card_holder: string | null;
  card_brand: string | null;
  product_name: string | null;
  tariff_name: string | null;
  matched_profile_id: string | null;
  matched_product_id: string | null;
  matched_tariff_id: string | null;
  matched_order_id: string | null;
  status: string;
  source: string;
  paid_at: string | null;
  attempts: number;
}

// Transliterate Latin name to Cyrillic for matching
function transliterateToCyrillic(name: string): string {
  const map: Record<string, string> = {
    'a': 'а', 'b': 'б', 'c': 'ц', 'd': 'д', 'e': 'е', 'f': 'ф',
    'g': 'г', 'h': 'х', 'i': 'и', 'j': 'й', 'k': 'к', 'l': 'л',
    'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р',
    's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс',
    'y': 'ы', 'z': 'з',
  };
  
  let result = name.toLowerCase();
  // Replace digraphs first
  result = result.replace(/sh/g, 'ш').replace(/ch/g, 'ч').replace(/zh/g, 'ж')
    .replace(/ya/g, 'я').replace(/yu/g, 'ю').replace(/yo/g, 'ё')
    .replace(/ts/g, 'ц').replace(/kh/g, 'х');
  
  // Then single letters
  result = result.split('').map(c => map[c] || c).join('');
  
  // Capitalize first letter of each word
  return result.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { limit = 50, dryRun = false, queueItemId } = body;

    console.log(`[BEPAID-AUTO-PROCESS] Starting with limit=${limit}, dryRun=${dryRun}, queueItemId=${queueItemId || 'none'}`);

    // Fetch pending queue items - support single item or batch
    let query = supabase
      .from('payment_reconcile_queue')
      .select('*');
    
    if (queueItemId) {
      // Process single item by ID
      query = query.eq('id', queueItemId);
    } else {
      // Process batch of pending items
      query = query
        .in('status', ['pending', 'error'])
        .lt('attempts', 5)
        .order('created_at', { ascending: true })
        .limit(limit);
    }

    const { data: queueItems, error: queueError } = await query;

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`);
    }

    console.log(`[BEPAID-AUTO-PROCESS] Found ${queueItems?.length || 0} items to process`);

    const results = {
      processed: 0,
      orders_created: 0,
      profiles_matched: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const item of queueItems || []) {
      try {
        console.log(`[BEPAID-AUTO-PROCESS] Processing item ${item.id}, bepaid_uid=${item.bepaid_uid}`);

        // Skip if already has matched order
        if (item.matched_order_id && item.status === 'completed') {
          console.log(`[BEPAID-AUTO-PROCESS] Item already completed with order, skipping`);
          results.skipped++;
          continue;
        }

        // Step 1: Find or match profile
        let profileId = item.matched_profile_id;
        let profileUserId: string | null = null;
        let matchedBy = null;

        if (!profileId && item.customer_email) {
          // Try email match
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('id, user_id')
            .eq('email', item.customer_email)
            .maybeSingle();
          
          if (profileByEmail) {
            profileId = profileByEmail.id;
            profileUserId = profileByEmail.user_id;
            matchedBy = 'email';
            console.log(`[BEPAID-AUTO-PROCESS] Matched by email: ${profileId}`);
          }
        }

        if (!profileId && item.card_last4 && item.card_holder) {
          // Try card link match
          const { data: cardLink } = await supabase
            .from('card_profile_links')
            .select('profile_id, profiles!inner(id, user_id)')
            .eq('card_last4', item.card_last4)
            .eq('card_holder', item.card_holder)
            .maybeSingle();
          
          if (cardLink) {
            profileId = cardLink.profile_id;
            profileUserId = (cardLink.profiles as any)?.user_id;
            matchedBy = 'card';
            console.log(`[BEPAID-AUTO-PROCESS] Matched by card: ${profileId}`);
          }
        }

        if (!profileId && item.card_holder) {
          // Try transliterated name match
          const translitName = transliterateToCyrillic(item.card_holder);
          const { data: profileByName } = await supabase
            .from('profiles')
            .select('id, user_id')
            .ilike('full_name', `%${translitName}%`)
            .maybeSingle();
          
          if (profileByName) {
            profileId = profileByName.id;
            profileUserId = profileByName.user_id;
            matchedBy = 'name_translit';
            console.log(`[BEPAID-AUTO-PROCESS] Matched by name translit: ${profileId}`);
          }
        }

        // Get user_id if we have profile but not user_id yet
        if (profileId && !profileUserId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('id', profileId)
            .maybeSingle();
          profileUserId = profile?.user_id;
        }

        if (profileId && !item.matched_profile_id) {
          results.profiles_matched++;
          
          if (!dryRun) {
            // Update queue item with matched profile
            await supabase
              .from('payment_reconcile_queue')
              .update({ matched_profile_id: profileId })
              .eq('id', item.id);

            // Save card link for future
            if (matchedBy !== 'card' && item.card_last4 && item.card_holder) {
              await supabase.from('card_profile_links').upsert({
                card_last4: item.card_last4,
                card_holder: item.card_holder,
                card_brand: item.card_brand,
                profile_id: profileId,
              }, {
                onConflict: 'card_last4,card_holder',
                ignoreDuplicates: true,
              });
            }
          }
        }

        // Step 2: Find product mapping by product_name or tariff_name
        const planTitle = item.product_name || item.tariff_name;
        let mapping = null;

        if (planTitle) {
          const { data: foundMapping } = await supabase
            .from('bepaid_product_mappings')
            .select('product_id, tariff_id, offer_id, is_subscription, auto_create_order')
            .eq('bepaid_plan_title', planTitle)
            .maybeSingle();
          
          if (foundMapping) {
            mapping = foundMapping;
            console.log(`[BEPAID-AUTO-PROCESS] Found product mapping for: ${planTitle}`);
          }
        }

        // Step 3: Check if order already exists
        let existingOrder = null;
        if (item.tracking_id) {
          const { data } = await supabase
            .from('orders_v2')
            .select('id, order_number')
            .eq('tracking_id', item.tracking_id)
            .maybeSingle();
          existingOrder = data;
        }
        
        if (!existingOrder && item.bepaid_uid) {
          const { data } = await supabase
            .from('orders_v2')
            .select('id, order_number')
            .contains('purchase_snapshot', { bepaid_uid: item.bepaid_uid })
            .maybeSingle();
          existingOrder = data;
        }

        if (existingOrder) {
          console.log(`[BEPAID-AUTO-PROCESS] Order already exists: ${existingOrder.order_number}`);
          
          if (!dryRun) {
            await supabase
              .from('payment_reconcile_queue')
              .update({ 
                matched_order_id: existingOrder.id,
                status: 'completed',
                processed_at: new Date().toISOString(),
              })
              .eq('id', item.id);
          }
          
          results.skipped++;
          continue;
        }

        // Step 4: Create order if we have profile and mapping allows auto-create
        if (profileId && mapping?.auto_create_order && !dryRun) {
          // Generate order number
          const year = new Date().getFullYear().toString().slice(-2);
          const { count } = await supabase
            .from('orders_v2')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${new Date().getFullYear()}-01-01`);
          
          const orderNumber = `ORD-${year}-${String((count || 0) + 1).padStart(5, '0')}`;

          // Create order
          const { data: newOrder, error: orderError } = await supabase
            .from('orders_v2')
            .insert({
              profile_id: profileId,
              user_id: profileUserId,
              product_id: mapping.product_id,
              tariff_id: mapping.tariff_id,
              offer_id: mapping.offer_id,
              order_number: orderNumber,
              tracking_id: item.tracking_id,
              status: 'paid',
              final_price: item.amount || 0,
              currency: item.currency || 'BYN',
              payment_method: 'bepaid',
              customer_email: item.customer_email,
              purchase_snapshot: {
                bepaid_uid: item.bepaid_uid,
                source: 'auto_process',
                imported_at: new Date().toISOString(),
                card_last4: item.card_last4,
                card_holder: item.card_holder,
              },
            })
            .select('id, order_number')
            .single();

          if (orderError) {
            throw new Error(`Failed to create order: ${orderError.message}`);
          }

          console.log(`[BEPAID-AUTO-PROCESS] Created order: ${newOrder.order_number}`);

          // Create payment record
          await supabase.from('payments_v2').insert({
            order_id: newOrder.id,
            profile_id: profileId,
            amount: item.amount || 0,
            currency: item.currency || 'BYN',
            status: 'succeeded',
            provider: 'bepaid',
            provider_payment_id: item.bepaid_uid,
            payment_method: 'card',
            provider_response: {
              card_last4: item.card_last4,
              card_holder: item.card_holder,
              card_brand: item.card_brand,
            },
          });

          // Create subscription if needed - use correct column names!
          if (mapping.is_subscription && profileUserId) {
            const now = new Date();
            const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            await supabase.from('subscriptions_v2').insert({
              user_id: profileUserId,
              profile_id: profileId,
              order_id: newOrder.id,
              product_id: mapping.product_id,
              tariff_id: mapping.tariff_id,
              status: 'active',
              access_start_at: now.toISOString(),
              access_end_at: endDate.toISOString(),
              next_charge_at: endDate.toISOString(),
              auto_renew: true,
            });
          }

          // Create entitlement
          const { data: product } = await supabase
            .from('products_v2')
            .select('code')
            .eq('id', mapping.product_id)
            .maybeSingle();

          if (product?.code && profileUserId) {
            await supabase.from('entitlements').insert({
              user_id: profileUserId,
              profile_id: profileId,
              order_id: newOrder.id,
              product_code: product.code,
              status: 'active',
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              meta: { source: 'bepaid_auto_process' },
            });
          }

          // Update queue item
          await supabase
            .from('payment_reconcile_queue')
            .update({
              matched_order_id: newOrder.id,
              matched_profile_id: profileId,
              matched_product_id: mapping.product_id,
              matched_tariff_id: mapping.tariff_id,
              status: 'completed',
              processed_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          results.orders_created++;
        } else {
          // Cannot auto-create - update with reason
          if (!dryRun) {
            let errorReason = 'unknown';
            if (!profileId) errorReason = 'no_profile_match';
            else if (!mapping) errorReason = 'no_product_mapping';
            else if (!mapping.auto_create_order) errorReason = 'auto_create_disabled';
            
            await supabase
              .from('payment_reconcile_queue')
              .update({
                status: 'error',
                last_error: errorReason,
                attempts: (item.attempts || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);
          }
          results.skipped++;
        }

        results.processed++;
      } catch (err: any) {
        console.error(`[BEPAID-AUTO-PROCESS] Error processing item ${item.id}:`, err);
        results.errors.push(`${item.id}: ${err.message}`);
        
        if (!dryRun) {
          await supabase
            .from('payment_reconcile_queue')
            .update({ 
              status: 'error',
              last_error: err.message,
              attempts: (item.attempts || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        }
      }
    }

    console.log(`[BEPAID-AUTO-PROCESS] Completed:`, results);

    return new Response(JSON.stringify({
      success: true,
      results,
      dryRun,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[BEPAID-AUTO-PROCESS] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
