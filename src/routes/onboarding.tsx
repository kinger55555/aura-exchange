import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Choose your nickname — Absolute Communism" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    // If already has nickname, skip.
    supabase
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nickname) navigate({ to: "/dashboard" });
      });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_nickname", { p_nickname: nickname });
      if (error) throw error;
      toast.success("Welcome to the collective, " + nickname);
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Nickname rejected by the State");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_var(--primary)]">
        <div className="text-secondary text-5xl mb-2">★</div>
        <h1 className="font-display text-4xl uppercase text-primary">Claim your name</h1>
        <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">
          The State requires a unique identifier. Choose wisely — it is permanent.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="nickname" className="uppercase tracking-wider text-xs">Nickname</Label>
            <Input
              id="nickname"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="comrade_volkov"
              pattern="[A-Za-z0-9_]{3,20}"
              className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
            />
            <p className="text-xs text-muted-foreground mt-2">
              3–20 characters. Letters, numbers, underscore.
            </p>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase text-lg tracking-widest h-12"
          >
            {busy ? "Registering…" : "Submit to the State"}
          </Button>
        </form>
      </div>
    </main>
  );
}