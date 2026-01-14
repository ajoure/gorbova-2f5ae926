import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdminLinkContactRequest {
  action: 'link_existing' | 'create_ghost' | 'auto_link';
  payment_id: string;
  order_id?: string | null;
  is_queue_item: boolean;
  profile_id?: string;
  ghost_data?: {
    full_name: string;
    email?: string;
    phone?: string;
  };
  force?: boolean;
  dry_run?: boolean;
}

interface AdminLinkContactResponse {
  success: boolean;
  status: 'linked' | 'created' | 'conflict' | 'error';
  profile_id?: string;
  existing_profile_id?: string;
  message: string;
  changes?: {
    payment_updated: boolean;
    order_updated: boolean;
    profile_created: boolean;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Create admin client (service role)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  // Create user client for auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, status: 'error', message: "Missing authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }
  });

  try {
    // Get current user
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, status: 'error', message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role using has_role function
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.log(`User ${user.id} is not admin. Role check result:`, isAdmin, roleError);
      return new Response(
        JSON.stringify({ success: false, status: 'error', message: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: AdminLinkContactRequest = await req.json();
    const { action, payment_id, order_id, is_queue_item, profile_id, ghost_data, force, dry_run } = body;

    console.log(`[admin-link-contact] action=${action} payment=${payment_id} order=${order_id} is_queue=${is_queue_item} force=${force} dry_run=${dry_run}`);

    // B3: Conflict handling - check if order already has a different profile
    let existingOrderProfileId: string | null = null;
    if (order_id) {
      const { data: order } = await supabaseAdmin
        .from('orders_v2')
        .select('profile_id')
        .eq('id', order_id)
        .single();
      
      existingOrderProfileId = order?.profile_id || null;
    }

    // Determine target profile_id based on action
    let targetProfileId: string | null = null;
    let profileCreated = false;

    if (action === 'link_existing') {
      if (!profile_id) {
        return new Response(
          JSON.stringify({ success: false, status: 'error', message: "profile_id required for link_existing" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetProfileId = profile_id;

    } else if (action === 'create_ghost') {
      if (!ghost_data?.full_name) {
        return new Response(
          JSON.stringify({ success: false, status: 'error', message: "ghost_data.full_name required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // B2: Create ghost profile using service role (bypasses RLS)
      if (dry_run) {
        // In dry-run mode, don't actually create
        targetProfileId = 'dry-run-ghost-id';
      } else {
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('profiles')
          .insert({
            full_name: ghost_data.full_name,
            email: ghost_data.email || null,
            phone: ghost_data.phone || null,
            user_id: null, // Ghost - no auth user
            status: 'ghost',
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Failed to create ghost profile:', createError);
          return new Response(
            JSON.stringify({ success: false, status: 'error', message: `Failed to create ghost: ${createError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        targetProfileId = newProfile.id;
        profileCreated = true;
        console.log(`[admin-link-contact] Created ghost profile: ${targetProfileId}`);
      }

    } else if (action === 'auto_link') {
      // Try to find existing profile by email/phone from payment data
      // (Not implemented in this version - use link_existing or create_ghost)
      return new Response(
        JSON.stringify({ success: false, status: 'error', message: "auto_link not yet implemented" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // B3: Conflict check - if order has different profile and force is not set
    if (order_id && existingOrderProfileId && existingOrderProfileId !== targetProfileId && !force) {
      console.log(`[admin-link-contact] CONFLICT: order ${order_id} has profile ${existingOrderProfileId}, trying to set ${targetProfileId}`);
      
      // Get existing profile name for better UX
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', existingOrderProfileId)
        .single();
      
      return new Response(
        JSON.stringify({
          success: false,
          status: 'conflict',
          existing_profile_id: existingOrderProfileId,
          message: `Сделка уже привязана к другому контакту: ${existingProfile?.full_name || existingProfile?.email || existingOrderProfileId}. Используйте force=true для перезаписи.`,
        } as AdminLinkContactResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dry-run - return what would happen
    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          status: action === 'create_ghost' ? 'created' : 'linked',
          profile_id: targetProfileId,
          message: `[DRY-RUN] Would ${action === 'create_ghost' ? 'create ghost and ' : ''}link profile to payment${order_id ? ' and order' : ''}`,
          changes: {
            payment_updated: true,
            order_updated: !!order_id,
            profile_created: action === 'create_ghost',
          },
        } as AdminLinkContactResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Execute changes
    let paymentUpdated = false;
    let orderUpdated = false;

    // Update payment
    if (is_queue_item) {
      const { error } = await supabaseAdmin
        .from('payment_reconcile_queue')
        .update({ matched_profile_id: targetProfileId })
        .eq('id', payment_id);
      
      if (error) {
        console.error('Failed to update queue item:', error);
      } else {
        paymentUpdated = true;
      }
    } else {
      const { error } = await supabaseAdmin
        .from('payments_v2')
        .update({ profile_id: targetProfileId })
        .eq('id', payment_id);
      
      if (error) {
        console.error('Failed to update payment:', error);
      } else {
        paymentUpdated = true;
      }
    }

    // Update order
    if (order_id && targetProfileId) {
      const { error } = await supabaseAdmin
        .from('orders_v2')
        .update({ profile_id: targetProfileId })
        .eq('id', order_id);
      
      if (error) {
        console.error('Failed to update order:', error);
      } else {
        orderUpdated = true;
      }
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      action: action === 'create_ghost' ? 'admin_create_ghost_link' : 'admin_link_contact',
      actor_user_id: user.id,
      target_user_id: targetProfileId,
      meta: {
        payment_id,
        order_id,
        is_queue_item,
        force,
        previous_order_profile_id: existingOrderProfileId,
        new_profile_id: targetProfileId,
        ghost_data: action === 'create_ghost' ? ghost_data : undefined,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: action === 'create_ghost' ? 'created' : 'linked',
        profile_id: targetProfileId,
        message: `${action === 'create_ghost' ? 'Ghost-контакт создан и привязан' : 'Контакт привязан'}`,
        changes: {
          payment_updated: paymentUpdated,
          order_updated: orderUpdated,
          profile_created: profileCreated,
        },
      } as AdminLinkContactResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[admin-link-contact] Error:', error);
    return new Response(
      JSON.stringify({ success: false, status: 'error', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
