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

  // Don't hide on unsupported — show disabled state instead
  const handleClick = async () => {
    if (state === "unsupported") {
      toast.error("Push-уведомления не поддерживаются в этом браузере");
      return;
    }
    if (state === "subscribed") {
      await unsubscribe();
      toast.info("Push-уведомления отключены");
    } else if (state === "denied") {
      toast.error("Уведомления заблокированы в настройках браузера. Разрешите их и перезагрузите страницу.");
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
    ) : state === "denied" || state === "unsupported" ? (
      <BellOff className="h-4 w-4" />
    ) : (
      <Bell className="h-4 w-4" />
    );

  const label =
    state === "subscribed"
      ? "Уведомления включены"
      : state === "denied"
        ? "Уведомления заблокированы"
        : state === "unsupported"
          ? "Не поддерживается"
          : state === "loading"
            ? "Загрузка..."
            : "Включить уведомления";

  const showPulse = state === "prompt";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 min-h-[44px] min-w-[44px]"
          onClick={handleClick}
          disabled={state === "loading"}
        >
          {icon}
          {showPulse && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
