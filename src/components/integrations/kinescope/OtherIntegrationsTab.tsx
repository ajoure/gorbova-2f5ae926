import { useIntegrations } from "@/hooks/useIntegrations";
import { KinescopeSettingsCard } from "./KinescopeSettingsCard";
import { HosterBySettingsCard } from "@/components/integrations/hosterby/HosterBySettingsCard";
import { Skeleton } from "@/components/ui/skeleton";

export function OtherIntegrationsTab() {
  const { data: instances, isLoading } = useIntegrations("other");

  const kinescopeInstance = instances?.find((i) => i.provider === "kinescope") || null;
  const hosterByInstance = instances?.find((i) => i.provider === "hosterby") || null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <KinescopeSettingsCard instance={kinescopeInstance} />
        <HosterBySettingsCard instance={hosterByInstance} />
      </div>
    </div>
  );
}
