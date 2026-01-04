import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting expired access check...');

    // Find all active telegram_access records that have expired
    // and don't have active manual access
    const now = new Date().toISOString();
    
    const { data: expiredAccess, error: queryError } = await supabase
      .from('telegram_access')
      .select(`
        id,
        user_id,
        club_id,
        state_chat,
        state_channel,
        active_until
      `)
      .or('state_chat.eq.active,state_channel.eq.active')
      .lt('active_until', now);

    if (queryError) {
      console.error('Failed to query expired access:', queryError);
      throw queryError;
    }

    if (!expiredAccess || expiredAccess.length === 0) {
      console.log('No expired access found');
      return new Response(JSON.stringify({ 
        success: true, 
        processed: 0,
        message: 'No expired access found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${expiredAccess.length} expired access records`);

    const results = [];
    
    for (const access of expiredAccess) {
      // Check if user has active manual access for this club
      const { data: manualAccess } = await supabase
        .from('telegram_manual_access')
        .select('*')
        .eq('user_id', access.user_id)
        .eq('club_id', access.club_id)
        .eq('is_active', true)
        .or(`valid_until.is.null,valid_until.gt.${now}`)
        .single();

      if (manualAccess) {
        console.log(`User ${access.user_id} has active manual access for club ${access.club_id}, skipping`);
        results.push({ 
          user_id: access.user_id, 
          club_id: access.club_id, 
          skipped: true,
          reason: 'manual_access_active'
        });
        continue;
      }

      // Also check if user has renewed their subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', access.user_id)
        .eq('is_active', true)
        .gte('expires_at', now)
        .single();

      if (subscription) {
        // Subscription renewed, update access record
        console.log(`User ${access.user_id} has renewed subscription, updating access`);
        await supabase
          .from('telegram_access')
          .update({ active_until: subscription.expires_at })
          .eq('id', access.id);
        
        results.push({
          user_id: access.user_id,
          club_id: access.club_id,
          skipped: true,
          reason: 'subscription_renewed'
        });
        continue;
      }

      // Revoke access
      console.log(`Revoking access for user ${access.user_id} in club ${access.club_id}`);
      
      const revokeResponse = await supabase.functions.invoke('telegram-revoke-access', {
        body: { 
          user_id: access.user_id, 
          club_id: access.club_id,
          reason: 'expired'
        },
      });

      results.push({
        user_id: access.user_id,
        club_id: access.club_id,
        revoked: true,
        response: revokeResponse.data,
      });
    }

    console.log('Expired access check completed');

    return new Response(JSON.stringify({ 
      success: true,
      processed: expiredAccess.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Check expired error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
