import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";
import { formatAura } from "@/lib/rank";
import { ArrowUp, Coins, Send, Ticket, Sparkles, Crown, Star } from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Shop — Absolute Communism" }] }),
  component: ShopPage,
});

type Rank = {
  rank: number;
  name: string;
  upgrade_cost: number;
  max_aura: number;
  max_send: number;
  tickets: number;
  multiplier: number;
  salary: number;
  super_tickets: number;
};

function StatRow({ icon: Icon, label, from, to }: { icon: any; label: string; from: string | number; to: string | number }) {
  const changed = String(from) !== String(to);
  return (
    <div className="flex items-center justify-between py-1.5 text-sm border-b border-dashed border-primary/15 last:border-0">
      <span className="flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="font-mono">
        <span className="text-muted-foreground">{from}</span>
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span className={changed ? "text-primary font-bold" : "text-muted-foreground"}>{to}</span>
      </span>
    </div>
  );
}

function ShopPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [current, setCurrent] = useState<Rank | null>(null);
  const [next, setNext] = useState<Rank | null>(null);
  const [busy, setBusy] = useState(true);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("aura_balance, current_rank")
      .eq("id", user.id)
      .maybeSingle();
    if (!p) return;
    setBalance(Number((p as any).aura_balance));
    const cr = (p as any).current_rank ?? 1;
    const [{ data: c }, { data: n }] = await Promise.all([
      supabase.rpc("get_rank_info", { p_rank: cr }),
      supabase.rpc("get_rank_info", { p_rank: cr + 1 }),
    ]);
    setCurrent(c as Rank);
    setNext(n as Rank);
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    load();
  }, [loading, user, navigate, load]);

  async function buy() {
    if (!next) return;
    setBuying(true);
    try {
      const { error } = await supabase.rpc("purchase_rank");
      if (error) throw error;
      toast.success(`Ascended to ${next.name}`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "The State denies your ascension");
    } finally {
      setBuying(false);
    }
  }

  if (loading || busy || !current || !next) {
    return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading shop…</p></main>;
  }

  const canAfford = balance >= Number(next.upgrade_cost);

  return (
    <main className="min-h-screen pb-32 bg-background">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-secondary text-2xl">★</span>
          <h1 className="font-display text-xl uppercase tracking-wider">State Shop</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your Aura</p>
          <p className="font-display text-4xl text-primary">{formatAura(balance)}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
            Current rank: <span className="text-primary font-bold">{current.name}</span> (#{current.rank})
          </p>
        </section>

        <section className="border-2 border-secondary bg-card p-4 shadow-[4px_4px_0_0_var(--secondary)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg uppercase text-secondary-foreground bg-secondary inline-block px-2">
              Rank Upgrade
            </h2>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">#{next.rank}</span>
          </div>

          <p className="font-display text-3xl uppercase text-primary flex items-center gap-2">
            <Crown className="size-6 text-secondary" /> {next.name}
          </p>

          <div className="mt-4 space-y-0">
            <StatRow icon={Coins} label="Max Aura"        from={formatAura(current.max_aura)}    to={formatAura(next.max_aura)} />
            <StatRow icon={Send}  label="Max Send"        from={formatAura(current.max_send)}    to={formatAura(next.max_send)} />
            <StatRow icon={Ticket} label="Daily Tickets"  from={current.tickets}                 to={next.tickets} />
            <StatRow icon={Sparkles} label="Multiplier"   from={`${Number(current.multiplier).toFixed(1)}x`} to={`${Number(next.multiplier).toFixed(1)}x`} />
            <StatRow icon={Coins} label="Weekly Salary"   from={formatAura(current.salary)}      to={formatAura(next.salary)} />
            <StatRow icon={Star}  label="Super Tickets"   from={current.super_tickets}           to={next.super_tickets} />
          </div>

          <div className="mt-4 pt-3 border-t-2 border-dashed border-primary/30">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ascension cost</p>
            <p className="font-display text-3xl text-destructive">{formatAura(next.upgrade_cost)} Aura</p>
          </div>

          <Button
            disabled={!canAfford || buying}
            onClick={buy}
            className="w-full mt-4 h-12 bg-primary text-primary-foreground font-display uppercase tracking-widest text-base"
          >
            <ArrowUp className="size-5 mr-2" />
            {buying ? "Ascending…" : canAfford ? `Buy ${next.name}` : "Insufficient Aura"}
          </Button>
        </section>

        <p className="text-xs text-muted-foreground text-center px-4">
          Tickets are granted daily and salaries paid weekly once the Games tab returns. The State remembers.
        </p>
      </div>

      <IdeaButton />
      <MobileNav />
    </main>
  );
}