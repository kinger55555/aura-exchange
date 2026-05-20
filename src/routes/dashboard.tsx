import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Absolute Communism" }] }),
  component: Dashboard,
});

type Profile = { id: string; nickname: string | null; aura_balance: number };
type Ledger = {
  id: string;
  amount_sent: number;
  amount_received: number;
  message: string | null;
  created_at: string;
  sender: { nickname: string | null; aura_balance: number } | null;
  receiver: { nickname: string | null; aura_balance: number } | null;
};

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState<number>(1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [starKey, setStarKey] = useState(0);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);

  // Auth gate
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
  }, [loading, user, navigate]);

  async function loadProfile() {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, nickname, aura_balance")
      .eq("id", user.id)
      .maybeSingle();
    if (data && !data.nickname) {
      navigate({ to: "/onboarding" });
      return;
    }
    if (data) setProfile({ ...data, aura_balance: Number(data.aura_balance) });
  }

  async function loadLedger() {
    const { data } = await supabase
      .from("transactions")
      .select(
        "id, amount_sent, amount_received, message, created_at, sender:sender_id(nickname, aura_balance), receiver:receiver_id(nickname, aura_balance)"
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setLedger(data as unknown as Ledger[]);
  }

  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadLedger();

    const ch = supabase
      .channel("ledger")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        loadLedger();
        loadProfile();
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
      toast.success(`+${(amount * 1.5).toFixed(2)} Aura delivered to ${recipient}`);
      setRecipient("");
      setMessage("");
      setAmount(1);
      setStarKey((k) => k + 1);
      loadProfile();
      loadLedger();
    } catch (err: any) {
      toast.error(err.message ?? "The State denies this transaction");
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl uppercase text-primary">Loading the State…</p>
      </div>
    );
  }

  const rank = getRank(profile.aura_balance);
  const dailyCap = (profile.aura_balance * 0.1).toFixed(2);

  return (
    <main className="min-h-screen">
      {/* Top banner */}
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-secondary text-3xl">★</span>
            <span className="font-display text-2xl uppercase tracking-wider">Absolute Communism</span>
          </div>
          <Button
            onClick={signOut}
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs"
          >
            Desert
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-3 gap-6">
        {/* Comrade card */}
        <section className="lg:col-span-1 border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Comrade</p>
          <h2 className="font-display text-4xl uppercase text-primary mt-1 break-words">
            {profile.nickname}
          </h2>
          <div className="mt-1 inline-block px-2 py-0.5 bg-secondary text-secondary-foreground text-xs uppercase tracking-widest font-bold">
            {rank.title}
          </div>

          <div className="mt-8 border-t-2 border-dashed border-primary/30 pt-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Aura Balance</p>
            <p className="font-display text-6xl text-primary mt-1">
              {formatAura(profile.aura_balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Daily transfer cap: <span className="font-bold">{dailyCap} Aura</span> (10%)
            </p>
          </div>
        </section>

        {/* Send form */}
        <section className="lg:col-span-2 border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)] relative overflow-visible">
          <h3 className="font-display text-2xl uppercase text-primary">Reward a Comrade</h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
            Sent Aura is multiplied by ×1.5 for the receiver
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
              <Label className="uppercase tracking-wider text-xs">Amount (max 10)</Label>
              <Input
                required
                type="number"
                min={0.01}
                max={10}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
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
                  <span className="font-mono font-bold text-primary">{t.sender?.nickname ?? "?"}</span>
                  <span className="text-muted-foreground text-sm">sent</span>
                  <span className="font-display text-secondary-foreground bg-secondary px-1.5">
                    {formatAura(t.amount_sent)}
                  </span>
                  <span className="text-muted-foreground text-sm">→</span>
                  <span className="font-mono font-bold text-primary">{t.receiver?.nickname ?? "?"}</span>
                  <span className="text-muted-foreground text-sm">received</span>
                  <span className="font-display text-primary">+{formatAura(t.amount_received)}</span>
                  {t.message && (
                    <span className="basis-full text-sm italic text-muted-foreground mt-1">
                      “{t.message}”
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      </div>
    </main>
  );
}