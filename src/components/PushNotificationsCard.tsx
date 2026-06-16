import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isPushSubscribed,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

export function PushNotificationsCard() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = pushSupported();
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    isPushSubscribed().then(setSubscribed).catch(() => setSubscribed(false));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setSubscribed(true);
      setPermission("granted");
      toast.success("Notifications enabled, comrade.");
    } catch (e: any) {
      toast.error(e?.message || "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      toast.success("Notifications disabled.");
    } catch (e: any) {
      toast.error(e?.message || "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        Push notifications are not supported in this browser. For mobile push, install the
        app from your browser menu (Add to Home Screen) and re-open it.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          {subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Mobile push notifications</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Get notified about party invites, shift starts, warnings, and bans — even when
            the app is closed. On phones, install the app to your home screen first for the
            best experience.
          </p>
          {permission === "denied" && (
            <p className="mt-2 text-xs text-destructive">
              Notifications were blocked. Enable them from your browser's site settings.
            </p>
          )}
          <div className="mt-3">
            {subscribed ? (
              <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
                Turn off notifications
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={enable}
                disabled={busy || permission === "denied"}
              >
                Enable notifications
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}