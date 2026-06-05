import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAura, formatDisplayName, TIER_ORDER, tierTone } from "@/lib/rank";
import { Lock, Check, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/titles")({
  head: () => ({ meta: [{ title: "Titles — Absolute Communism" }] }),
  component: TitlesPage,
});

type Title = {
  id: string;
  text: string;
  tier: string;
  buyable: boolean;
  cost: number | null;
  unlock_condition: string | null;
};

function TitlesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [balance, setBalance] = useState(0);
  const [nickname, setNickname] = useState<string>("");
  const [equipped, setEquipped] = useState<string | null>(null);
  const [position, setPosition] = useState<"prefix" | "suffix">("prefix");
  const [catalog, setCatalog] = useState<Title[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: prof }, { data: titles }, { data: mine }] = await Promise.all([
      supabase.from("profiles")
        .select("nickname, aura_balance, equipped_title_id, title_position")
        .eq("id", user.id).maybeSingle(),
      supabase.from("titles").select("*").order("tier").order("text"),
      supabase.from("user_titles").select("title_id").eq("user_id", user.id),
    ]);
    if (prof) {
      setBalance(Number((prof as any).aura_balance));
      setNickname((prof as any).nickname ?? "");
      setEquipped((prof as any).equipped_title_id ?? null);
      setPosition((prof as any).title_position ?? "prefix");
    }
    setCatalog((titles ?? []) as Title[]);
    setOwned(new Set(((mine ?? []) as any[]).map((r) => r.title_id)));
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    load();
  }, [loading, user, navigate, load]);

  async function purchase(t: Title) {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("purchase_title", { p_title_id: t.id });
      if (error) throw error;
      toast.success(`Acquired "${t.text.trim()}"`);
      load();
    } catch (e: any) { toast.error(e.message ?? "The State refuses"); }
    finally { setWorking(false); }
  }

  async function equip(t: Title, pos: "prefix" | "suffix") {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("equip_title", { p_title_id: t.id, p_position: pos });
      if (error) throw error;
      toast.success(`Equipped "${t.text.trim()}"`);
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setWorking(false); }
  }

  async function unequip() {
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

  if (loading || busy) return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading titles…</p></main>;

  return (
    <main className="min-h-screen pb-32 bg-background">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-secondary text-2xl">★</span>
          <h1 className="font-display text-xl uppercase tracking-wider">Titles</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your Identity</p>
          <p className="font-display text-2xl text-primary mt-1 break-words">
            {formatDisplayName(nickname, equippedTitle?.text, position)}
          </p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
            Aura: <span className="text-primary font-bold">{formatAura(balance)}</span>
          </p>
          {equippedTitle && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => equip(equippedTitle, position === "prefix" ? "suffix" : "prefix")} disabled={working}>
                <ArrowLeftRight className="size-3 mr-1" /> Move {position === "prefix" ? "after" : "before"} name
              </Button>
              <Button size="sm" variant="destructive" onClick={unequip} disabled={working}>Remove</Button>
            </div>
          )}
        </section>

        <Tabs defaultValue="shop" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="shop">Shop</TabsTrigger>
            <TabsTrigger value="mine">My Titles ({myTitles.length})</TabsTrigger>
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
                          <Button size="sm" disabled={working || balance < (t.cost ?? 0)} onClick={() => purchase(t)}>
                            Buy
                          </Button>
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
                <p className="p-6 text-center text-sm text-muted-foreground">No titles yet. Visit the shop, comrade.</p>
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
                            <Button size="sm" variant="outline" disabled={working} onClick={() => equip(t, "prefix")}>Before</Button>
                            <Button size="sm" variant="outline" disabled={working} onClick={() => equip(t, "suffix")}>After</Button>
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
      </div>

      <MobileNav />
    </main>
  );
}