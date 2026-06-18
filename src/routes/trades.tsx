import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileNav } from "@/components/MobileNav";
import { formatAura, tierTone } from "@/lib/rank";
import { Store, Coins, Tag, X, Eye } from "lucide-react";

export const Route = createFileRoute("/trades")({
  head: () => ({ meta: [{ title: "Market — Absolute Communism" }] }),
  component: MarketPage,
});

type Title = { id: string; text: string; tier: string };
type OwnedTitle = { title_id: string; titles: Title };
type Listing = {
  id: string;
  seller_id: string;
  title_id: string;
  price: number;
  status: string;
  created_at: string;
  views: number;
  titles: Title;
  profiles: { nickname: string | null };
};

function MarketPage() {
  const { user, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<OwnedTitle[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(true);
  const [priceFor, setPriceFor] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const [pRes, ownRes, lRes] = await Promise.all([
      supabase.from("profiles").select("aura_balance").eq("id", user.id).single(),
      supabase.from("user_titles").select("title_id, titles(id,text,tier)").eq("user_id", user.id),
      supabase
        .from("marketplace_listings")
        .select("*, titles(id,text,tier), profiles!marketplace_listings_seller_id_fkey(nickname)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setBalance(Number(pRes.data?.aura_balance ?? 0));
    setOwned((ownRes.data ?? []) as any);
    setListings((lRes.data ?? []) as any);
    setBusy(false);
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  // Bump view counts for other people's listings (once per refresh)
  useEffect(() => {
    if (!user || listings.length === 0) return;
    const others = listings.filter(l => l.seller_id !== user.id).map(l => l.id);
    if (others.length === 0) return;
    supabase.rpc("bump_listing_views", { p_listing_ids: others });
  }, [user, listings]);

  if (loading || !user) return null;
  const me = user.id;

  // Hide titles that are already actively listed by me
  const listedTitleIds = new Set(listings.filter(l => l.seller_id === me).map(l => l.title_id));
  const listable = owned.filter(o => !listedTitleIds.has(o.title_id));
  const myListings = listings.filter(l => l.seller_id === me);
  const otherListings = listings.filter(l => l.seller_id !== me);

  async function listForSale(titleId: string) {
    const raw = priceFor[titleId];
    const price = Number(raw);
    if (!price || price <= 0) { toast.error("Enter a price"); return; }
    setWorking(true);
    const { error } = await supabase.rpc("list_title_for_sale", { p_title_id: titleId, p_price: price });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Listed on the market");
    setPriceFor(p => ({ ...p, [titleId]: "" }));
    refresh();
  }

  async function cancelListing(id: string) {
    setWorking(true);
    const { error } = await supabase.rpc("cancel_listing", { p_listing_id: id });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Listing cancelled");
    refresh();
  }

  async function buyListing(id: string) {
    setWorking(true);
    const { error } = await supabase.rpc("buy_listing", { p_listing_id: id });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Acquired!");
    refresh();
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileNav />
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-1">
          <Store className="size-6 text-secondary" />
          <h1 className="text-2xl font-bold uppercase tracking-widest">Open Market</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          List titles from your inventory. Comrades buy them with Aura. The State takes 10%.
        </p>
        <div className="text-sm font-mono mb-6">
          Balance: <span className="text-primary font-bold">{formatAura(balance)}</span> Aura
        </div>

        {/* MY INVENTORY → LIST */}
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your Inventory</h2>
        <div className="border-2 border-primary/30 bg-card p-3 mb-6">
          {listable.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              No titles available to list. Open suitcases in the Shop to get titles.
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-primary/15">
              {listable.map(o => (
                <li key={o.title_id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`font-mono text-sm truncate ${tierTone(o.titles?.tier ?? "")}`}>
                      {o.titles?.text}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {o.titles?.tier}
                    </div>
                  </div>
                  <Input
                    type="number" min="1" placeholder="Price"
                    className="w-24 h-9"
                    value={priceFor[o.title_id] ?? ""}
                    onChange={e => setPriceFor(p => ({ ...p, [o.title_id]: e.target.value }))}
                  />
                  <Button size="sm" disabled={working || busy} onClick={() => listForSale(o.title_id)}>
                    <Tag className="size-3 mr-1" /> List
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* MARKETPLACE */}
        {/* MY LISTINGS */}
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Your Listings ({myListings.length})
        </h2>
        <div className="space-y-2 mb-6">
          {myListings.length === 0 ? (
            <div className="text-sm text-muted-foreground italic px-2 py-3">
              You have no active listings.
            </div>
          ) : (
            myListings.map(l => (
              <div key={l.id} className="border-2 border-secondary/40 bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`font-bold truncate ${tierTone(l.titles?.tier ?? "")}`}>
                    {l.titles?.text}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{l.titles?.tier}</span>
                    <span className="flex items-center gap-1" title="Comrades who saw this listing">
                      <Eye className="size-3" /> {l.views ?? 0} {(l.views ?? 0) === 1 ? "view" : "views"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold flex items-center gap-1 justify-end mb-1">
                    <Coins className="size-4" />{formatAura(l.price)}
                  </div>
                  <Button size="sm" variant="outline" disabled={working} onClick={() => cancelListing(l.id)}>
                    <X className="size-3 mr-1" />Unlist
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Market ({otherListings.length})
        </h2>
        <div className="space-y-2">
          {otherListings.length === 0 ? (
            <div className="text-sm text-muted-foreground italic px-2 py-3">
              Nothing on the market.
            </div>
          ) : (
            otherListings.map(l => (
              <div key={l.id} className="border-2 border-primary/30 bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`font-bold truncate ${tierTone(l.titles?.tier ?? "")}`}>
                    {l.titles?.text}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    by {l.profiles?.nickname ?? "—"} · {l.titles?.tier}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold flex items-center gap-1 justify-end mb-1">
                    <Coins className="size-4" />{formatAura(l.price)}
                  </div>
                  <Button size="sm" disabled={working || balance < l.price} onClick={() => buyListing(l.id)}>
                    Buy
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}