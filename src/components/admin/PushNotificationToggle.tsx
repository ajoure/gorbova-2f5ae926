import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const { state, subscribe, unsubscribe } = usePushNotifications();

  if (state === "unsupported") return null;

  const handleClick = async () => {
    if (state === "subscribed") {
      await unsubscribe();
      toast.info("Push-уведомления отключены");
    } else if (state === "denied") {
      toast.error("Уведомления заблокированы в настройках браузера");
    } else {
      const ok = await subscribe();
      if (ok) {
        toast.success("Push-уведомления включены");
      }
    }
  };

  const icon =
    state === "subscribed" ? (
      <BellRing className="h-4 w-4" />
    ) : state === "denied" ? (
      <BellOff className="h-4 w-4" />
    ) : (
      <Bell className="h-4 w-4" />
    );

  const label =
    state === "subscribed"
      ? "Уведомления включены"
      : state === "denied"
        ? "Уведомления заблокированы"
        : state === "loading"
          ? "Загрузка..."
          : "Включить уведомления";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClick}
          disabled={state === "loading"}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
