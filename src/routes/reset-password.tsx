import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Absolute Communism" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase exchanges the recovery token via the auth state listener.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also handle the case where the session is already established.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password too short, comrade (min 6 chars)");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Credentials reissued by the State");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "The State rejected your new credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_var(--primary)]">
        <div className="text-secondary text-5xl mb-2">★</div>
        <h1 className="font-display text-4xl uppercase text-primary">New credentials</h1>
        <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">
          {ready ? "Choose a new password worthy of the State." : "Verifying recovery token…"}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="password" className="uppercase tracking-wider text-xs">New password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 border-2 border-primary/30 focus:border-primary"
              disabled={!ready}
            />
          </div>
          <div>
            <Label htmlFor="confirm" className="uppercase tracking-wider text-xs">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 border-2 border-primary/30 focus:border-primary"
              disabled={!ready}
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !ready}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase text-lg tracking-widest h-12"
          >
            {busy ? "Submitting…" : "Reissue credentials"}
          </Button>
        </form>
      </div>
    </main>
  );
}