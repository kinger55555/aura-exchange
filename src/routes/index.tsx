import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Absolute Communism — Reward your comrades" },
      {
        name: "description",
        content: "Send Aura to fellow comrades for good deeds. The State watches.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("The State has registered you, comrade");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "The State rejects your papers");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Poster panel */}
      <section className="relative hidden lg:flex items-center justify-center bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 bg-poster-stripes opacity-40" />
        <div className="absolute -top-10 -left-10 w-80 h-80 rounded-full bg-secondary/30 blur-3xl" />
        <div className="relative z-10 max-w-md px-12 py-16">
          <div className="text-secondary text-7xl mb-4">★</div>
          <h1 className="font-display text-7xl leading-none uppercase">
            Absolute<br />Communism
          </h1>
          <div className="h-1 w-24 bg-secondary my-6" />
          <p className="text-lg font-medium uppercase tracking-wider opacity-90">
            From each according to their kindness,<br />
            to each according to their deeds.
          </p>
          <p className="mt-10 text-sm uppercase tracking-[0.3em] opacity-70">
            Reward your comrades · Earn your rank
          </p>
        </div>
      </section>

      {/* Auth form */}
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="text-secondary text-5xl">★</div>
            <h1 className="font-display text-5xl uppercase text-primary">Absolute Communism</h1>
          </div>

          <div className="border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_var(--primary)]">
            <h2 className="font-display text-3xl uppercase text-primary mb-1">
              {mode === "signin" ? "Report for duty" : "Join the collective"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6 uppercase tracking-wider">
              The State requires your papers
            </p>

            <form onSubmit={submit} className="space-y-4">
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
              <div>
                <Label htmlFor="password" className="uppercase tracking-wider text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 border-2 border-primary/30 focus:border-primary"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase text-lg tracking-widest h-12"
              >
                {busy ? "Verifying…" : mode === "signin" ? "Sign In" : "Register"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-6 text-sm text-primary hover:underline w-full text-center uppercase tracking-wider"
            >
              {mode === "signin"
                ? "Not yet a comrade? Register"
                : "Already enlisted? Sign in"}
            </button>

            {mode === "signin" && (
              <Link
                to="/forgot-password"
                className="mt-3 block text-xs text-muted-foreground hover:text-primary w-full text-center uppercase tracking-wider"
              >
                Forgot your papers?
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
