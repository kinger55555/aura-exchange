import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Recover access — Absolute Communism" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Recovery dispatch sent, comrade");
    } catch (err: any) {
      toast.error(err.message ?? "The State could not process your request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_var(--primary)]">
        <div className="text-secondary text-5xl mb-2">★</div>
        <h1 className="font-display text-4xl uppercase text-primary">Recover papers</h1>
        <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">
          The State will dispatch instructions to your email.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm">Check your inbox, comrade. Follow the link to restore your credentials.</p>
            <Link to="/" className="block text-sm text-primary hover:underline uppercase tracking-wider">
              ← Return to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" className="uppercase tracking-wider text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase text-lg tracking-widest h-12"
            >
              {busy ? "Dispatching…" : "Send recovery"}
            </Button>
            <Link to="/" className="block text-sm text-primary hover:underline uppercase tracking-wider text-center">
              ← Return to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}