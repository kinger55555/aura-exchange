import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAura, TIER_ORDER, tierTone } from "@/lib/rank";
import { DisplayName } from "@/components/DisplayName";
import { GlitchText } from "@/components/GlitchText";
import { ArrowUp, Coins, Send, Ticket, Sparkles, Crown, Star, Lock, Check, ArrowLeftRight, Briefcase, X, DoorClosed } from "lucide-react";

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

type Title = {
  id: string;
  text: string;
  tier: string;
  buyable: boolean;
  cost: number | null;
  unlock_condition: string | null;
  is_glitch?: boolean;
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
  const [gray, setGray] = useState(0);
  const [nickname, setNickname] = useState("");
  const [current, setCurrent] = useState<Rank | null>(null);
  const [next, setNext] = useState<Rank | null>(null);
  const [nextNext, setNextNext] = useState<Rank | null>(null);
  const [busy, setBusy] = useState(true);
  const [buying, setBuying] = useState(false);

  // Titles state
  const [equipped, setEquipped] = useState<string | null>(null);
  const [position, setPosition] = useState<"prefix" | "suffix">("prefix");
  const [catalog, setCatalog] = useState<Title[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("nickname, aura_balance, gray_aura, current_rank, equipped_title_id, title_position, bunker_pending")
      .eq("id", user.id)
      .maybeSingle();
    if (!p) return;
    setBalance(Number((p as any).aura_balance));
    setGray(Number((p as any).gray_aura ?? 0));
    setNickname((p as any).nickname ?? "");
    setEquipped((p as any).equipped_title_id ?? null);
    setPosition((p as any).title_position ?? "prefix");
    setBunkerPending(Boolean((p as any).bunker_pending));
    const cr = (p as any).current_rank ?? 1;
    const [{ data: c }, { data: n }, { data: nn }, { data: titles }, { data: mine }] = await Promise.all([
      supabase.rpc("get_rank_info", { p_rank: cr }),
      supabase.rpc("get_rank_info", { p_rank: cr + 1 }),
      supabase.rpc("get_rank_info", { p_rank: cr + 2 }),
      supabase.from("titles").select("*").order("tier").order("text"),
      supabase.from("user_titles").select("title_id").eq("user_id", user.id),
    ]);
    setCurrent(c as Rank);
    setNext(n as Rank);
    setNextNext(nn as Rank);
    setCatalog((titles ?? []) as Title[]);
    setOwned(new Set(((mine ?? []) as any[]).map((r) => r.title_id)));
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

  async function buyGray() {
    if (!next) return;
    setBuying(true);
    try {
      const { error } = await supabase.rpc("purchase_rank_gray");
      if (error) throw error;
      toast.success(`Ascended to ${next.name} (gray)`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "The State denies your ascension");
    } finally {
      setBuying(false);
    }
  }

  async function buyTicket(kind: "regular" | "special") {
    setBuying(true);
    try {
      const { error } = await supabase.rpc("buy_ticket", { p_kind: kind });
      if (error) throw error;
      toast.success(kind === "regular" ? "Ticket acquired" : "Special ticket acquired");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "The State refuses");
    } finally {
      setBuying(false);
    }
  }

  async function purchaseTitle(t: Title) {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("purchase_title", { p_title_id: t.id });
      if (error) throw error;
      toast.success(`Acquired "${t.text.trim()}"`);
      load();
    } catch (e: any) { toast.error(e.message ?? "The State refuses"); }
    finally { setWorking(false); }
  }

  async function purchaseTitleGray(t: Title) {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("purchase_title_gray", { p_title_id: t.id });
      if (error) throw error;
      toast.success(`Acquired "${t.text.trim()}" (gray)`);
      load();
    } catch (e: any) { toast.error(e.message ?? "The State refuses"); }
    finally { setWorking(false); }
  }

  async function equipTitle(t: Title, pos: "prefix" | "suffix") {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("equip_title", { p_title_id: t.id, p_position: pos });
      if (error) throw error;
      toast.success(`Equipped "${t.text.trim()}"`);
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setWorking(false); }
  }

  async function unequipTitle() {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("unequip_title");
      if (error) throw error;
      toast.success("Title removed");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setWorking(false); }
  }

  const equippedTitle = useMemo(() => catalog.find((c) => c.id === equipped) ?? null, [catalog, equipped]);
  const byTier = useMemo(() => {
    const map: Record<string, Title[]> = {};
    for (const t of catalog) (map[t.tier] ??= []).push(t);
    return map;
  }, [catalog]);
  const myTitles = useMemo(() => catalog.filter((t) => owned.has(t.id)), [catalog, owned]);

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
          {gray > 0 && (
            <p className="font-display text-2xl text-muted-foreground mt-1">
              {formatAura(gray)} <span className="text-xs uppercase tracking-widest">Gray Aura</span>
            </p>
          )}
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
            Current rank: <span className="text-primary font-bold">{current.name}</span> (#{current.rank})
          </p>
        </section>

        <Tabs defaultValue="ranks" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="ranks">Ranks & Tickets</TabsTrigger>
            <TabsTrigger value="titles">Titles</TabsTrigger>
          </TabsList>

          <TabsContent value="ranks" className="space-y-4 mt-3">
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
                <StatRow icon={Send}  label="Daily Send Cap"  from={formatAura(Number(next.upgrade_cost) / 10)} to={formatAura(Number(nextNext?.upgrade_cost ?? 0) / 10)} />
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
              <Button
                disabled={buying || gray < Number(next.upgrade_cost)}
                onClick={buyGray}
                variant="outline"
                className="w-full mt-2 h-10 uppercase tracking-widest text-xs"
              >
                {gray >= Number(next.upgrade_cost) ? `Buy with Gray Aura` : `Need ${formatAura(next.upgrade_cost)} Gray`}
              </Button>
            </section>

            <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
              <h2 className="font-display text-lg uppercase text-primary mb-2">Tickets</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Spend Aura for an extra shift ticket. Regular tickets start games. Special tickets swap which minigame your party plays.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  disabled={buying || balance < 5}
                  onClick={() => buyTicket("regular")}
                  className="h-14 bg-primary text-primary-foreground uppercase tracking-widest font-display flex flex-col gap-0"
                >
                  <span className="flex items-center gap-1"><Ticket className="size-4" /> Regular</span>
                  <span className="text-xs">5 Aura</span>
                </Button>
                <Button
                  disabled={buying || balance < 100}
                  onClick={() => buyTicket("special")}
                  className="h-14 bg-secondary text-secondary-foreground uppercase tracking-widest font-display flex flex-col gap-0"
                >
                  <span className="flex items-center gap-1"><Star className="size-4" /> Special</span>
                  <span className="text-xs">100 Aura</span>
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="titles" className="space-y-4 mt-3">
            <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your Identity</p>
              <p className="font-display text-2xl text-primary mt-1 break-words">
                <DisplayName nickname={nickname} titleText={equippedTitle?.text} titlePosition={position} isGlitch={equippedTitle?.is_glitch} />
              </p>
              {equippedTitle && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => equipTitle(equippedTitle, position === "prefix" ? "suffix" : "prefix")} disabled={working}>
                    <ArrowLeftRight className="size-3 mr-1" /> Move {position === "prefix" ? "after" : "before"} name
                  </Button>
                  <Button size="sm" variant="destructive" onClick={unequipTitle} disabled={working}>Remove</Button>
                </div>
              )}
            </section>

            <Tabs defaultValue="shop" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="shop">Catalog</TabsTrigger>
                <TabsTrigger value="mine">Mine ({myTitles.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="shop" className="space-y-4 mt-3">
                {TIER_ORDER.map((tier) => (
                  <section key={tier} className="border-2 border-primary bg-card shadow-[4px_4px_0_0_var(--primary)]">
                    <h2 className={`font-display text-lg uppercase px-3 py-2 border-b-2 border-primary/20 ${tierTone(tier)}`}>{tier}</h2>
                    <ul className="divide-y divide-dashed divide-primary/15">
                      {(byTier[tier] ?? []).map((t) => {
                        const own = owned.has(t.id);
                        return (
                          <li key={t.id} className="p-3 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`font-mono text-sm ${tierTone(tier)} truncate`}>{t.text}</p>
                              {t.unlock_condition && (
                                <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 mt-0.5">
                                  <Lock className="size-3" /> {t.unlock_condition}
                                </p>
                              )}
                              {t.buyable && (
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                                  {formatAura(t.cost ?? 0)} Aura
                                </p>
                              )}
                            </div>
                            {own ? (
                              <span className="text-xs uppercase tracking-widest text-primary flex items-center gap-1"><Check className="size-3" /> Owned</span>
                            ) : t.buyable ? (
                              <div className="flex flex-col gap-1">
                                <Button size="sm" disabled={working || balance < (t.cost ?? 0)} onClick={() => purchaseTitle(t)}>
                                  Buy
                                </Button>
                                <Button size="sm" variant="outline" disabled={working || gray < (t.cost ?? 0)} onClick={() => purchaseTitleGray(t)}>
                                  Gray
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Locked</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </TabsContent>

              <TabsContent value="mine" className="mt-3">
                <section className="border-2 border-primary bg-card shadow-[4px_4px_0_0_var(--primary)]">
                  {myTitles.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">No titles yet. Visit the catalog, comrade.</p>
                  ) : (
                    <ul className="divide-y divide-dashed divide-primary/15">
                      {myTitles.map((t) => {
                        const isEq = equipped === t.id;
                        return (
                          <li key={t.id} className="p-3 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`font-mono text-sm ${tierTone(t.tier)} truncate`}>{t.text}</p>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.tier}</p>
                            </div>
                            {isEq ? (
                              <span className="text-xs uppercase tracking-widest text-secondary-foreground bg-secondary px-2 py-0.5">Equipped {position}</span>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" disabled={working} onClick={() => equipTitle(t, "prefix")}>Before</Button>
                                <Button size="sm" variant="outline" disabled={working} onClick={() => equipTitle(t, "suffix")}>After</Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <IdeaButton />
      <MobileNav />
    </main>
  );
}
