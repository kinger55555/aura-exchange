import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getRank, formatAura } from "@/lib/rank";
import { DisplayName } from "@/components/DisplayName";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Absolute Communism" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    to: typeof search.to === "string" ? search.to : undefined,
  }),
  component: Dashboard,
});

type Profile = { id: string; nickname: string | null; aura_balance: number; gray_aura?: number; title_text?: string | null; title_position?: "prefix" | "suffix"; title_is_glitch?: boolean };
type Rank = { rank: number; name: string; max_send: number; max_aura: number; multiplier: number; upgrade_cost: number };
type Ledger = {
  id: string;
  amount_sent: number;
  amount_received: number;
  message: string | null;
  created_at: string;
  reversed_at: string | null;
  sender: { nickname: string | null; aura_balance: number } | null;
  receiver: { nickname: string | null; aura_balance: number } | null;
};

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { to } = Route.useSearch();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [recipient, setRecipient] = useState(to ?? "");
  const [amount, setAmount] = useState<number>(1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [starKey, setStarKey] = useState(0);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);
  const [nickOpen, setNickOpen] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [savingNick, setSavingNick] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportAmount, setReportAmount] = useState<number>(1);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [sentLast24h, setSentLast24h] = useState<number>(0);
  const [rankInfo, setRankInfo] = useState<Rank | null>(null);
  const [nextRankInfo, setNextRankInfo] = useState<Rank | null>(null);
  const [burnOpen, setBurnOpen] = useState(false);
  const [burnKeep, setBurnKeep] = useState<number>(0);
  const [burning, setBurning] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  // Auth gate
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    // Ban gate
    (async () => {
      const { data } = await supabase
        .from("bans")
        .select("id,expires_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);
      const active = (data ?? []).find((b: any) => !b.expires_at || new Date(b.expires_at) > new Date());
      if (active) navigate({ to: "/banned" });
    })();
  }, [loading, user, navigate]);

  async function loadProfile() {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, nickname, aura_balance, gray_aura, title_position, title:equipped_title_id(text, is_glitch)")
      .eq("id", user.id)
      .maybeSingle();
    if (data && !data.nickname) {
      navigate({ to: "/onboarding" });
      return;
    }
    if (data) setProfile({
      id: (data as any).id,
      nickname: (data as any).nickname,
      aura_balance: Number((data as any).aura_balance),
      gray_aura: Number((data as any).gray_aura ?? 0),
      title_text: ((data as any).title?.text) ?? null,
      title_position: ((data as any).title_position ?? "prefix"),
      title_is_glitch: Boolean((data as any).title?.is_glitch),
    });
    if (data) {
      const { data: r } = await supabase
        .from("profiles")
        .select("current_rank")
        .eq("id", user.id)
        .maybeSingle();
      const cr = (r as any)?.current_rank ?? 1;
      const { data: ri } = await supabase.rpc("get_rank_info", { p_rank: cr });
      if (ri) setRankInfo(ri as Rank);
      const { data: rn } = await supabase.rpc("get_rank_info", { p_rank: cr + 1 });
      if (rn) setNextRankInfo(rn as Rank);
    }
  }

  async function loadQuota() {
    if (!user) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("transactions")
      .select("amount_sent")
      .eq("sender_id", user.id)
      .gte("created_at", since);
    const sum = (data ?? []).reduce((acc, r: any) => acc + Number(r.amount_sent), 0);
    setSentLast24h(sum);
  }

  async function loadLedger() {
    const { data } = await supabase
      .from("transactions")
      .select(
        "id, amount_sent, amount_received, message, created_at, reversed_at, sender:sender_id(nickname, aura_balance), receiver:receiver_id(nickname, aura_balance)"
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setLedger(data as unknown as Ledger[]);
  }

  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadLedger();
    loadQuota();
    (async () => {
      const { data } = await supabase
        .from("staff_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      setIsStaff(roles.includes("owner") || roles.includes("admin"));
    })();

    const ch = supabase
      .channel("ledger")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        loadLedger();
        loadProfile();
        loadQuota();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => {
        loadProfile();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function reverseTx(txId: string) {
    if (!confirm("Reverse this transfer? Sender is refunded, receiver debited, and 'The Restricted' awarded.")) return;
    setReversingId(txId);
    try {
      const { error } = await supabase.rpc("staff_reverse_transfer", { p_tx_id: txId });
      if (error) throw error;
      toast.success("Transfer reversed");
      loadLedger();
      loadProfile();
    } catch (err: any) {
      toast.error(err.message ?? "Reversal denied");
    } finally {
      setReversingId(null);
    }
  }

  async function sendAura(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("send_aura", {
        p_recipient: recipient.trim(),
        p_amount: amount,
        p_message: message.trim() || undefined,
      });
      if (error) throw error;
      const mult = rankInfo?.multiplier ?? 1;
      toast.success(`+${(amount * mult).toFixed(2)} Aura delivered to ${recipient}`);
      setRecipient("");
      setMessage("");
      setAmount(1);
      setStarKey((k) => k + 1);
      loadProfile();
      loadLedger();
      loadQuota();
    } catch (err: any) {
      toast.error(err.message ?? "The State denies this transaction");
    } finally {
      setSending(false);
    }
  }

  async function burnAura(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBurning(true);
    try {
      const { error } = await supabase.rpc("burn_aura", { p_keep: burnKeep });
      if (error) throw error;
      toast.success(`Burned to ${burnKeep.toFixed(2)} Aura. Dust to the State Bank.`);
      setBurnOpen(false);
      loadProfile();
    } catch (err: any) {
      toast.error(err.message ?? "The State rejected your purge");
    } finally {
      setBurning(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  async function changeNickname(e: React.FormEvent) {
    e.preventDefault();
    setSavingNick(true);
    try {
      const { error } = await supabase.rpc("set_nickname", { p_nickname: newNick.trim() });
      if (error) throw error;
      toast.success("The State has registered your new identity");
      setNickOpen(false);
      setNewNick("");
      loadProfile();
    } catch (err: any) {
      toast.error(err.message ?? "The State rejected this identity");
    } finally {
      setSavingNick(false);
    }
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTarget) return;
    setReporting(true);
    try {
      const { error } = await supabase.rpc("denounce_comrade", {
        p_recipient: reportTarget,
        p_amount: reportAmount,
        p_reason: reportReason.trim() || undefined,
      });
      if (error) throw error;
      toast.success(`⚡ ${reportTarget} denounced. ${reportAmount} Aura burned from both.`);
      setReportTarget(null);
      setReportReason("");
      setReportAmount(1);
      loadProfile();
      loadLedger();
      loadQuota();
    } catch (err: any) {
      toast.error(err.message ?? "Denouncement denied by the State");
    } finally {
      setReporting(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl uppercase text-primary">Loading the State…</p>
      </div>
    );
  }

  const rank = getRank(profile.aura_balance);
  // Daily cap = cost to reach the next rank / 10
  const dailyCap = Number(nextRankInfo?.upgrade_cost ?? 0) / 10;
  const remaining = Math.max(dailyCap - sentLast24h, 0);

  return (
    <main className="min-h-screen">
      {/* Top banner */}
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-secondary text-3xl">★</span>
            <span className="font-display text-2xl uppercase tracking-wider">Absolute Communism</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-3 gap-6">
        {/* Comrade card */}
        <section className="lg:col-span-1 border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Comrade</p>
          <h2 className="font-display text-4xl uppercase text-primary mt-1 break-words">
            <DisplayName nickname={profile.nickname} titleText={profile.title_text} titlePosition={profile.title_position} isGlitch={profile.title_is_glitch} />
          </h2>
          <div className="mt-1 inline-block px-2 py-0.5 bg-secondary text-secondary-foreground text-xs uppercase tracking-widest font-bold">
            {rankInfo?.name ?? rank.title}
          </div>
          <button
            onClick={() => { setNewNick(profile.nickname ?? ""); setNickOpen(true); }}
            className="block mt-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-primary underline"
          >
            Change identity
          </button>

          <div className="mt-8 border-t-2 border-dashed border-primary/30 pt-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Aura Balance</p>
            <p className="font-display text-6xl text-primary mt-1">
              {formatAura(profile.aura_balance)}
            </p>
            {Number(profile.gray_aura ?? 0) > 0 && (
              <p className="font-display text-2xl text-muted-foreground mt-1">
                {formatAura(Number(profile.gray_aura))} <span className="text-xs uppercase tracking-widest">Gray Aura</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Daily quota: <span className="font-bold">{remaining.toFixed(2)}</span> / {dailyCap.toFixed(2)} Aura remaining
            </p>
            <button
              onClick={() => {
                setBurnKeep(Math.floor(profile.aura_balance * 100) / 100);
                setBurnOpen(true);
              }}
              className="mt-3 text-xs uppercase tracking-widest text-destructive border border-destructive/40 px-2 py-1 hover:bg-destructive hover:text-destructive-foreground"
            >
              🔥 Burn Aura
            </button>
          </div>
        </section>

        {/* Send form */}
        <section className="lg:col-span-2 border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)] relative overflow-visible">
          <h3 className="font-display text-2xl uppercase text-primary">Reward a Comrade</h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
            Sent Aura is multiplied by ×{(rankInfo?.multiplier ?? 1).toFixed(1)} for the receiver (your rank bonus)
          </p>

          <form onSubmit={sendAura} className="mt-6 grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="uppercase tracking-wider text-xs">Recipient nickname</Label>
              <Input
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="comrade_petrov"
                className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
              />
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">
                Amount (max {Math.min(Number(rankInfo?.max_send ?? 0), remaining).toFixed(2)})
              </Label>
              <Input
                required
                type="number"
                min={0.01}
                max={Math.min(Number(rankInfo?.max_send ?? 0), remaining)}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                onBlur={() => {
                  const maxSend = Math.min(Number(rankInfo?.max_send ?? 0), remaining, Math.max(profile.aura_balance, 0));
                  if (amount > maxSend) setAmount(Math.max(Math.min(amount, maxSend), 0.01));
                }}
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="uppercase tracking-wider text-xs">Good deed (optional)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="For sharing the last potato…"
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <div className="sm:col-span-2 relative">
              <Button
                ref={sendBtnRef}
                type="submit"
                disabled={sending}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase text-lg tracking-widest h-12"
              >
                {sending ? "Submitting to the State…" : `Send ${amount || 0} Aura`}
              </Button>
              {/* Rising star animation */}
              {starKey > 0 && (
                <span
                  key={starKey}
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -top-2 text-secondary text-5xl animate-star-rise"
                  style={{ textShadow: "0 0 16px color-mix(in oklab, var(--secondary) 60%, transparent)" }}
                >
                  ★
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Ledger */}
        <section className="lg:col-span-3 border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl uppercase text-primary">Recent Good Deeds</h3>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Public Ledger</span>
          </div>

          <ul className="mt-4 divide-y-2 divide-dashed divide-primary/20">
            <AnimatePresence initial={false}>
              {ledger.length === 0 && (
                <li className="py-8 text-center text-muted-foreground uppercase tracking-wider text-sm">
                  No deeds yet. Be the first to reward a comrade.
                </li>
              )}
              {ledger.map((t) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"
                >
                  <span className="font-mono font-bold text-primary inline-flex items-center gap-1">
                    {t.sender?.nickname ?? "?"}
                  </span>
                  <span className="text-muted-foreground text-sm">sent</span>
                  <span className="font-display text-secondary-foreground bg-secondary px-1.5">
                    {formatAura(t.amount_sent)}
                  </span>
                  <span className="text-muted-foreground text-sm">→</span>
                  <span className="font-mono font-bold text-primary inline-flex items-center gap-1">
                    {t.receiver?.nickname ?? "?"}
                  </span>
                  <span className="text-muted-foreground text-sm">received</span>
                  <span className={`font-display ${t.amount_received < 0 ? "text-destructive" : "text-primary"}`}>
                    {t.amount_received < 0 ? "" : "+"}{formatAura(t.amount_received)}
                  </span>
                  {t.message && (
                    <span className="basis-full text-sm italic text-muted-foreground mt-1">
                      “{t.message}”
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </span>
                    {t.reversed_at && (
                      <span className="text-[10px] uppercase tracking-widest text-destructive border border-destructive/40 px-1.5 py-0.5">
                        Reversed
                      </span>
                    )}
                    {isStaff && !t.reversed_at && (
                      <button
                        onClick={() => reverseTx(t.id)}
                        disabled={reversingId === t.id}
                        className="text-[10px] uppercase tracking-widest text-destructive border border-destructive/40 px-1.5 py-0.5 hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                      >
                        {reversingId === t.id ? "…" : "Reverse"}
                      </button>
                    )}
                    {t.sender?.nickname && t.sender.nickname !== profile.nickname && (
                      <button
                        onClick={() => setReportTarget(t.sender!.nickname)}
                        className="text-[10px] uppercase tracking-widest text-destructive border border-destructive/40 px-1.5 py-0.5 hover:bg-destructive hover:text-destructive-foreground"
                      >
                        Denounce
                      </button>
                    )}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      </div>

      {/* Burn dialog */}
      <Dialog open={burnOpen} onOpenChange={setBurnOpen}>
        <DialogContent className="border-2 border-destructive">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-destructive text-2xl">🔥 Burn Aura</DialogTitle>
          </DialogHeader>
          <form onSubmit={burnAura} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose how much Aura to keep. The rest is burned into the State Bank — once it holds at least 1 full Aura, it's seized by the Owner.
            </p>
            <div>
              <Label className="uppercase tracking-wider text-xs">Keep (Aura)</Label>
              <Input
                required
                type="number"
                min={0}
                max={profile.aura_balance}
                step={0.01}
                value={burnKeep}
                onChange={(e) => setBurnKeep(Number(e.target.value))}
                className="mt-1 border-2 border-destructive/30 focus:border-destructive font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: <span className="font-mono">{profile.aura_balance}</span> · Will burn: <span className="font-mono text-destructive">{Math.max(profile.aura_balance - burnKeep, 0).toFixed(8)}</span>
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={burning} variant="destructive" className="uppercase tracking-widest font-display">
                {burning ? "Burning…" : "Burn It"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={nickOpen} onOpenChange={setNickOpen}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">Change Identity</DialogTitle>
          </DialogHeader>
          <form onSubmit={changeNickname} className="space-y-4">
            <div>
              <Label className="uppercase tracking-wider text-xs">New nickname</Label>
              <Input
                required
                value={newNick}
                onChange={(e) => setNewNick(e.target.value)}
                minLength={3}
                maxLength={20}
                className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">3-20 chars, letters/numbers/underscore</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={savingNick} className="bg-primary text-primary-foreground uppercase tracking-widest font-display">
                {savingNick ? "Registering…" : "Register New Identity"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={!!reportTarget} onOpenChange={(o) => !o && setReportTarget(null)}>
        <DialogContent className="border-2 border-destructive">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-destructive text-2xl">
              Denounce {reportTarget}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReport} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Filing a report costs Aura. Both you and the accused will lose the same amount.
              The State demands sacrifice for justice.
            </p>
            <div>
              <Label className="uppercase tracking-wider text-xs">Aura to burn (max {Math.max(0, Number(rankInfo?.max_send ?? 0) / 2)})</Label>
              <Input
                required
                type="number"
                min={0.01}
                max={Math.max(0.01, Number(rankInfo?.max_send ?? 0) / 2)}
                step={0.01}
                value={reportAmount}
                onChange={(e) => setReportAmount(Number(e.target.value))}
                className="mt-1 border-2 border-destructive/30 focus:border-destructive"
              />
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Reason (optional)</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="Hoarding potatoes…"
                className="mt-1 border-2 border-destructive/30 focus:border-destructive"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={reporting} variant="destructive" className="uppercase tracking-widest font-display">
                {reporting ? "Filing…" : `Burn ${reportAmount} Aura — Denounce`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <IdeaButton />
      <MobileNav />
    </main>
  );
}