import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseHasRoleV2Result {
  hasRole: boolean;
  isLoading: boolean;
}

/**
 * Hook to check if the current user has a specific role using has_role_v2 RPC.
 * Accepts string role_code (e.g. 'super_admin', 'admin') — no enum restrictions.
 */
export function useHasRoleV2(roleCode: string): UseHasRoleV2Result {
  const [hasRole, setHasRole] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (mounted) { setHasRole(false); setIsLoading(false); }
          return;
        }

        const { data, error } = await supabase.rpc('has_role_v2', {
          _user_id: user.id,
          _role_code: roleCode,
        });

        if (mounted) {
          if (error) {
            console.error('useHasRoleV2 error:', error);
            setHasRole(false);
          } else {
            setHasRole(!!data);
          }
          setIsLoading(false);
        }
      } catch (e) {
        console.error('useHasRoleV2 exception:', e);
        if (mounted) { setHasRole(false); setIsLoading(false); }
      }
    };

    checkRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkRole();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [roleCode]);

  return { hasRole, isLoading };
}
