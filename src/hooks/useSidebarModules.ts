import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

export interface SidebarModule {
  id: string;
  title: string;
  slug: string;
  menu_section_key: string | null;
  icon: string | null;
  sort_order: number;
  has_access?: boolean;
}

interface ModulesBySection {
  [sectionKey: string]: SidebarModule[];
}

/**
 * Fetches active training modules grouped by their menu_section_key
 * for dynamic sidebar navigation. Maps child keys to parent keys
 * so modules appear in the correct sidebar sections.
 */
export function useSidebarModules() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["sidebar-modules", user?.id],
    queryFn: async () => {
      // Get active modules with their access info
      const { data: modulesData, error: modulesError } = await supabase
        .from("training_modules")
        .select(`
          id,
          title,
          slug,
          menu_section_key,
          icon,
          sort_order
        `)
        .eq("is_active", true)
        .order("sort_order");

      if (modulesError) throw modulesError;

      // Fetch menu sections to map child keys to parent keys
      const { data: menuSections } = await supabase
        .from("user_menu_sections")
        .select("key, parent_key")
        .eq("is_active", true);

      // Create child → parent mapping
      const childToParentMap = new Map<string, string>();
      menuSections?.forEach(section => {
        if (section.parent_key) {
          childToParentMap.set(section.key, section.parent_key);
        }
      });

      // If user is logged in, check access
      let accessibleModuleIds = new Set<string>();
      if (user) {
        // Get user's accessible tariff IDs via subscriptions
        const { data: subs } = await supabase
          .from("subscriptions_v2")
          .select("tariff_id")
          .eq("user_id", user.id)
          .in("status", ["active", "trial"]);

        const activeTariffIds = subs?.map(s => s.tariff_id).filter(Boolean) || [];

        if (activeTariffIds.length > 0) {
          // Get modules accessible via these tariffs
          const { data: accessData } = await supabase
            .from("module_access")
            .select("module_id")
            .in("tariff_id", activeTariffIds);

          accessibleModuleIds = new Set(accessData?.map(a => a.module_id) || []);
        }

        // Also check modules without access restrictions (free modules)
        const { data: freeModules } = await supabase
          .from("training_modules")
          .select("id")
          .eq("is_active", true)
          .not("id", "in", `(${Array.from(
            new Set((await supabase.from("module_access").select("module_id")).data?.map(a => a.module_id) || [])
          ).join(",") || "00000000-0000-0000-0000-000000000000"})`);

        freeModules?.forEach(m => accessibleModuleIds.add(m.id));
      }

      const modules = modulesData?.map(m => ({
        ...m,
        has_access: !user || accessibleModuleIds.has(m.id),
      })) || [];

      return { modules, childToParentMap };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const modules = data?.modules || [];
  const childToParentMap = data?.childToParentMap || new Map<string, string>();

  // Group modules by section, mapping child keys to parent keys
  const modulesBySection = useMemo<ModulesBySection>(() => {
    if (!modules.length) return {};

    return modules.reduce((acc, module) => {
      let key = module.menu_section_key || "products";
      
      // Map child key (e.g., "products-library") to parent key ("products")
      if (childToParentMap.has(key)) {
        key = childToParentMap.get(key)!;
      }
      
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(module);
      return acc;
    }, {} as ModulesBySection);
  }, [modules, childToParentMap]);

  return {
    modules,
    modulesBySection,
    isLoading,
  };
}
