import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MobileNav } from "@/components/MobileNav";
import { formatAura } from "@/lib/rank";
import { ArrowLeftRight, Coins, X, Check, Tag, Send, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/trades")({
  head: () => ({ meta: [{ title: "Trades — Absolute Communism" }] }),
  component: TradesPage,
});

type Title = { id: string; text: string; tier: string };
type OwnedTitle = { title_id: string; titles: Title };
type TradeRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  offered_aura: number;
  requested_aura: number;
  message: string | null;
  status: string;
  created_at: string;
  trade_offer_titles: { title_id: string; side: string; titles: Title }[];
  from_profile?: { nickname: string | null };
  to_profile?: { nickname: string | null };
};
type Listing = {
  id: string;
  seller_id: string;
  title_id: string;
  price: number;
  status: string;
  created_at: string;
  titles: Title;
  profiles: { nickname: string | null };
};

function TradesPage() {
  const { user, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<OwnedTitle[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(true);

  // Create-trade form
  const [toNick, setToNick] = useState("");
  const [offerAura, setOfferAura] = useState("0");
  const [requestAura, setRequestAura] = useState("0");
  const [offerTitles, setOfferTitles] = useState<Set<string>>(new Set());
  const [requestTitleInput, setRequestTitleInput] = useState("");
  const [requestTitleIds, setRequestTitleIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  // Listing form
  const [listingTitle, setListingTitle] = useState("");
  const [listingPrice, setListingPrice] = useState("10");

  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const [pRes, ownRes, tRes, lRes] = await Promise.all([
      supabase.from("profiles").select("aura_balance").eq("id", user.id).single(),
      supabase.from("user_titles").select("title_id, titles(id,text,tier)").eq("user_id", user.id),
      supabase
        .from("trade_offers")
        .select("*, trade_offer_titles(title_id, side, titles(id,text,tier))")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("marketplace_listings")
        .select("*, titles(id,text,tier), profiles!marketplace_listings_seller_id_fkey(nickname)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setBalance(Number(pRes.data?.aura_balance ?? 0));
    setOwned((ownRes.data ?? []) as any);

    // Hydrate nicknames for trade participants
    const ids = new Set<string>();
    (tRes.data ?? []).forEach((r: any) => { ids.add(r.from_user_id); ids.add(r.to_user_id); });
    let nickMap: Record<string, string> = {};
    if (ids.size > 0) {
      const { data: ps } = await supabase.from("profiles").select("id,nickname").in("id", Array.from(ids));
      (ps ?? []).forEach((p: any) => { nickMap[p.id] = p.nickname ?? "—"; });
    }
    setTrades(((tRes.data ?? []) as any).map((r: any) => ({
      ...r,
      from_profile: { nickname: nickMap[r.from_user_id] },
      to_profile: { nickname: nickMap[r.to_user_id] },
    })));
    setListings((lRes.data ?? []) as any);
    setBusy(false);
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  if (loading || !user) return null;

  const me = user.id;
  const incoming = trades.filter(t => t.to_user_id === me && t.status === "pending");
  const outgoing = trades.filter(t => t.from_user_id === me && t.status === "pending");
  const history = trades.filter(t => t.status !== "pending");

  function toggleOfferTitle(id: string) {
    setOfferTitles(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function addRequestedTitle() {
    const text = requestTitleInput.trim();
    if (!text) return;
    const { data } = await supabase.from("titles").select("id,text").ilike("text", text).maybeSingle();
    if (!data) { toast.error("No such title"); return; }
    if (requestTitleIds.includes(data.id)) return;
    setRequestTitleIds(ids => [...ids, data.id]);
    setRequestTitleInput("");
  }

  async function submitTrade() {
    if (!toNick.trim()) { toast.error("Enter a comrade's nickname"); return; }
    const oa = Number(offerAura) || 0;
    const ra = Number(requestAura) || 0;
    if (oa < 0 || ra < 0) { toast.error("Aura cannot be negative"); return; }
    if (oa > balance) { toast.error("You don't have that much Aura"); return; }
    const { error } = await supabase.rpc("create_trade_offer", {
      p_to_nickname: toNick.trim(),
      p_offered_aura: oa,
      p_requested_aura: ra,
      p_offered_title_ids: Array.from(offerTitles),
      p_requested_title_ids: requestTitleIds,
      p_message: message || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Trade offer sent");
    setToNick(""); setOfferAura("0"); setRequestAura("0");
    setOfferTitles(new Set()); setRequestTitleIds([]); setMessage("");
    refresh();
  }

  async function actTrade(id: string, action: "accept" | "reject" | "cancel") {
    const rpc = action === "accept" ? "accept_trade_offer"
      : action === "reject" ? "reject_trade_offer"
      : "cancel_trade_offer";
    const { error } = await supabase.rpc(rpc as any, { p_trade_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success(`Trade ${action}ed`);
    refresh();
  }

  async function listForSale() {
    const t = owned.find(o => o.titles?.text?.toLowerCase() === listingTitle.trim().toLowerCase());
    if (!t) { toast.error("Pick one of your owned titles"); return; }
    const price = Number(listingPrice) || 0;
    if (price <= 0) { toast.error("Price must be positive"); return; }
    const { error } = await supabase.rpc("list_title_for_sale", {
      p_title_id: t.title_id, p_price: price,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Listed on the market");
    setListingTitle(""); setListingPrice("10");
    refresh();
  }

  async function cancelListing(id: string) {
    const { error } = await supabase.rpc("cancel_listing", { p_listing_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Listing cancelled");
    refresh();
  }

  async function buyListing(id: string) {
    const { error } = await supabase.rpc("buy_listing", { p_listing_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Acquired!");
    refresh();
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileNav />
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-1">
          <ArrowLeftRight className="size-6 text-secondary" />
          <h1 className="text-2xl font-bold uppercase tracking-widest">Trades</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Trade titles and Aura with comrades. The State takes a 10% Aura tax.
        </p>
        <div className="text-sm font-mono mb-4">Balance: <span className="text-primary font-bold">{formatAura(balance)}</span> Aura</div>

        <Tabs defaultValue="offers">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="new">New Trade</TabsTrigger>
            <TabsTrigger value="market">Market</TabsTrigger>
          </TabsList>

          {/* OFFERS */}
          <TabsContent value="offers" className="space-y-6 mt-4">
            <Section title={`Incoming (${incoming.length})`}>
              {incoming.length === 0 ? <Empty>No incoming trades</Empty> :
                incoming.map(t => (
                  <TradeCard key={t.id} t={t} mine={false}
                    onAccept={() => actTrade(t.id, "accept")}
                    onReject={() => actTrade(t.id, "reject")} />
                ))}
            </Section>
            <Section title={`Outgoing (${outgoing.length})`}>
              {outgoing.length === 0 ? <Empty>No outgoing trades</Empty> :
                outgoing.map(t => (
                  <TradeCard key={t.id} t={t} mine={true}
                    onCancel={() => actTrade(t.id, "cancel")} />
                ))}
            </Section>
            <Section title="History">
              {history.length === 0 ? <Empty>No past trades</Empty> :
                history.slice(0, 10).map(t => (
                  <TradeCard key={t.id} t={t} mine={t.from_user_id === me} historical />
                ))}
            </Section>
          </TabsContent>

          {/* NEW TRADE */}
          <TabsContent value="new" className="mt-4">
            <div className="border-2 border-primary/30 bg-card p-4 space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Recipient nickname</label>
                <Input value={toNick} onChange={e => setToNick(e.target.value)} placeholder="Comrade nickname" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">You offer (Aura)</label>
                  <Input type="number" min="0" value={offerAura} onChange={e => setOfferAura(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">You request (Aura)</label>
                  <Input type="number" min="0" value={requestAura} onChange={e => setRequestAura(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Your titles to offer</label>
                {owned.length === 0 ? <div className="text-sm text-muted-foreground">You own no titles</div> :
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {owned.map(o => (
                      <button key={o.title_id} type="button" onClick={() => toggleOfferTitle(o.title_id)}
                        className={`text-xs px-2 py-1 border-2 ${offerTitles.has(o.title_id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-primary/30 hover:border-primary/60"}`}>
                        {o.titles?.text}
                      </button>
                    ))}
                  </div>}
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Titles you want from them</label>
                <div className="flex gap-2">
                  <Input value={requestTitleInput} onChange={e => setRequestTitleInput(e.target.value)}
                    placeholder="Exact title text" onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRequestedTitle())} />
                  <Button type="button" onClick={addRequestedTitle} size="icon" variant="outline"><Plus className="size-4" /></Button>
                </div>
                {requestTitleIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {requestTitleIds.map(id => (
                      <button key={id} type="button" onClick={() => setRequestTitleIds(ids => ids.filter(x => x !== id))}
                        className="text-xs px-2 py-1 border-2 border-secondary bg-secondary/10 inline-flex items-center gap-1">
                        {id.slice(0, 8)}… <X className="size-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Message (optional)</label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={200} rows={2} />
              </div>

              <Button onClick={submitTrade} disabled={busy} className="w-full">
                <Send className="size-4 mr-2" /> Send Trade Offer
              </Button>
            </div>
          </TabsContent>

          {/* MARKETPLACE */}
          <TabsContent value="market" className="space-y-4 mt-4">
            <div className="border-2 border-primary/30 bg-card p-4">
              <h3 className="text-sm uppercase tracking-wider font-bold mb-3">List a Title for Sale</h3>
              <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                <Input list="owned-titles" value={listingTitle} onChange={e => setListingTitle(e.target.value)} placeholder="Title text" />
                <datalist id="owned-titles">
                  {owned.map(o => <option key={o.title_id} value={o.titles?.text} />)}
                </datalist>
                <Input type="number" min="1" value={listingPrice} onChange={e => setListingPrice(e.target.value)} placeholder="Price" />
                <Button onClick={listForSale}><Tag className="size-4" /></Button>
              </div>
            </div>

            <Section title={`Active Listings (${listings.length})`}>
              {listings.length === 0 ? <Empty>Nothing on the market</Empty> :
                listings.map(l => (
                  <div key={l.id} className="border-2 border-primary/30 bg-card p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{l.titles?.text}</div>
                      <div className="text-xs text-muted-foreground">
                        by {l.profiles?.nickname ?? "—"} · {l.titles?.tier}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold flex items-center gap-1 justify-end">
                        <Coins className="size-4" />{formatAura(l.price)}
                      </div>
                      {l.seller_id === me ? (
                        <Button size="sm" variant="outline" onClick={() => cancelListing(l.id)}>
                          <Minus className="size-3 mr-1" />Unlist
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => buyListing(l.id)} disabled={balance < l.price}>
                          Buy
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground italic px-2 py-3">{children}</div>;
}

function TradeCard({ t, mine, historical, onAccept, onReject, onCancel }: {
  t: TradeRow; mine: boolean; historical?: boolean;
  onAccept?: () => void; onReject?: () => void; onCancel?: () => void;
}) {
  const offerTitles = t.trade_offer_titles?.filter(x => x.side === "offer") ?? [];
  const reqTitles = t.trade_offer_titles?.filter(x => x.side === "request") ?? [];
  const counterName = mine ? t.to_profile?.nickname : t.from_profile?.nickname;

  return (
    <div className="border-2 border-primary/30 bg-card p-3 space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">
          {mine ? "To" : "From"} <span className="text-foreground font-bold">{counterName ?? "—"}</span>
        </span>
        <span className={`uppercase tracking-wider px-1.5 py-0.5 border ${
          t.status === "pending" ? "border-secondary text-secondary"
          : t.status === "accepted" ? "border-green-500 text-green-500"
          : "border-muted text-muted-foreground"
        }`}>{t.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="border border-dashed border-primary/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Offered</div>
          {t.offered_aura > 0 && <div className="font-mono">{formatAura(t.offered_aura)} Aura</div>}
          {offerTitles.map(x => <div key={x.title_id} className="truncate">{x.titles?.text}</div>)}
          {t.offered_aura === 0 && offerTitles.length === 0 && <div className="text-muted-foreground">—</div>}
        </div>
        <div className="border border-dashed border-primary/30 p-2">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Requested</div>
          {t.requested_aura > 0 && <div className="font-mono">{formatAura(t.requested_aura)} Aura</div>}
          {reqTitles.map(x => <div key={x.title_id} className="truncate">{x.titles?.text}</div>)}
          {t.requested_aura === 0 && reqTitles.length === 0 && <div className="text-muted-foreground">—</div>}
        </div>
      </div>
      {t.message && <div className="text-xs italic text-muted-foreground">"{t.message}"</div>}
      {!historical && (
        <div className="flex gap-2 justify-end">
          {onAccept && <Button size="sm" onClick={onAccept}><Check className="size-3 mr-1" />Accept</Button>}
          {onReject && <Button size="sm" variant="outline" onClick={onReject}><X className="size-3 mr-1" />Reject</Button>}
          {onCancel && <Button size="sm" variant="outline" onClick={onCancel}><X className="size-3 mr-1" />Cancel</Button>}
        </div>
      )}
    </div>
  );
}