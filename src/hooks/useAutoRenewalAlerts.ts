import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * PATCH 3.2: Lightweight hook for auto-renewal problem indicators in tab badges.
 * Returns counts of errors, bad cards, and no-card MIT subscriptions.
 * Uses a single lightweight query (no joins, only counts).
 */
export function useAutoRenewalAlerts() {
  return useQuery({
    queryKey: ['auto-renewal-alerts'],
    queryFn: async () => {
      // Fetch active auto-renew subscriptions with payment_method info
      const { data: subs, error } = await supabase
        .from('subscriptions_v2_safe')
        .select('id, payment_method_id, has_payment_token, meta, billing_type, payment_methods(verification_status, recurring_verified)')
        .eq('auto_renew', true)
        .in('status', ['active', 'trial', 'past_due'])
        .limit(500);

      if (error || !subs) return { hasProblems: false, errors: 0, badCard: 0, noCard: 0 };

      let errors = 0;
      let badCard = 0;
      let noCard = 0;

      for (const sub of subs) {
        const meta = sub.meta as Record<string, any> | null;
        const pm = sub.payment_methods as any;
        const isMit = (sub as any).billing_type !== 'provider_managed';

        // Errors
        if (meta?.last_charge_attempt_success === false || (meta?.last_charge_attempt_error != null && meta.last_charge_attempt_error !== '')) {
          errors++;
        }

        // Bad card (MIT only)
        if (isMit && sub.payment_method_id && pm) {
          if (pm.verification_status !== 'verified' || pm.recurring_verified !== true) {
            badCard++;
          }
        }

        // No card (MIT only)
        if (isMit && !sub.payment_method_id) {
          noCard++;
        }
      }

      return {
        hasProblems: errors > 0 || badCard > 0 || noCard > 0,
        errors,
        badCard,
        noCard,
      };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });
}
