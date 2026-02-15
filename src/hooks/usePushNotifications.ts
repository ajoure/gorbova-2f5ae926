/// <reference lib="webworker" />
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

declare global {
  interface ServiceWorkerRegistration {
    pushManager: PushManager;
  }
}
import { toast } from "sonner";

type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>("loading");

  // Check current state on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[Push] Service Worker or PushManager not supported");
      setState("unsupported");
      return;
    }

    if (!("Notification" in window)) {
      console.warn("[Push] Notification API not supported");
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      console.warn("[Push] Notifications denied by user");
      setState("denied");
      return;
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        console.log("[Push] Current subscription:", sub ? "active" : "none");
        setState(sub ? "subscribed" : "prompt");
      });
    });
  }, []);

  // Register SW on mount
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[Push] SW registered, scope:", reg.scope);
        })
        .catch((err) => {
          console.error("[Push] SW registration failed:", err);
        });
    }
  }, []);

  // Log VAPID key availability
  useEffect(() => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    console.log("[Push] VAPID key available:", !!vapidKey);
    if (!vapidKey) {
      console.warn("[Push] VITE_VAPID_PUBLIC_KEY is not set — push subscriptions will fail");
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!user?.id) {
      console.warn("[Push] No user ID, cannot subscribe");
      toast.error("Необходимо авторизоваться");
      return false;
    }

    setState("loading");
    try {
      // Step 1: Check VAPID key
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error("[Push] VITE_VAPID_PUBLIC_KEY not set");
        toast.error("Push-уведомления не настроены: отсутствует VAPID ключ");
        setState("prompt");
        return false;
      }
      console.log("[Push] Step 1: VAPID key found");

      // Step 2: Request permission
      const permission = await Notification.requestPermission();
      console.log("[Push] Step 2: Permission result:", permission);
      if (permission !== "granted") {
        setState("denied");
        toast.error("Разрешите уведомления в настройках браузера");
        return false;
      }

      // Step 3: Get SW registration
      const reg = await navigator.serviceWorker.ready;
      console.log("[Push] Step 3: SW ready");

      // Step 4: Subscribe to push
      const subscription = await (reg as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      console.log("[Push] Step 4: Push subscription created:", subscription.endpoint);

      const json = subscription.toJSON();

      // Step 5: Save to DB
      const { error } = await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: "endpoint" }
      );

      if (error) {
        console.error("[Push] Step 5: DB save error:", error.message, error.details, error.hint);
        toast.error(`Ошибка сохранения подписки: ${error.message}`);
        setState("prompt");
        return false;
      }

      console.log("[Push] Step 5: Subscription saved to DB successfully");
      setState("subscribed");
      return true;
    } catch (err: any) {
      console.error("[Push] Subscribe error:", err);
      toast.error(`Ошибка подписки: ${err?.message || "неизвестная ошибка"}`);
      setState("prompt");
      return false;
    }
  }, [user?.id]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", sub.endpoint);

        await sub.unsubscribe();
        console.log("[Push] Unsubscribed successfully");
      }
      setState("prompt");
    } catch (err) {
      console.error("[Push] Unsubscribe error:", err);
    }
  }, []);

  return { state, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
