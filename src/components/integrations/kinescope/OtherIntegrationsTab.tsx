import { useIntegrations } from "@/hooks/useIntegrations";
import { KinescopeSettingsCard } from "./KinescopeSettingsCard";
import { Skeleton } from "@/components/ui/skeleton";

export function OtherIntegrationsTab() {
  const { data: instances, isLoading } = useIntegrations("other");
  
  const kinescopeInstance = instances?.find((i) => i.provider === "kinescope") || null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <KinescopeSettingsCard instance={kinescopeInstance} />
        
        {/* Placeholder for future integrations */}
        {/* 
        <SomeOtherIntegrationCard />
        */}
      </div>
    </div>
  );
}
