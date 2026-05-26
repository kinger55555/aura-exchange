import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getRank, formatAura } from "@/lib/rank";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Absolute Communism" }] }),
  component: LeaderboardPage,
});

type Row = { id: string; nickname: string | null; aura_balance: number };

function LeaderboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportAmount, setReportAmount] = useState<number>(1);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState<number>(1);
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nickname, aura_balance")
        .not("nickname", "is", null)
        .order("aura_balance", { ascending: false })
        .limit(500);
      if (data) setRows(data.map((r) => ({ ...r, aura_balance: Number(r.aura_balance) })));
      setBusy(false);
    })();

    const ch = supabase
      .channel("leaderboard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload: any) => {
          setRows((prev) =>
            prev
              .map((r) =>
                r.id === payload.new.id
                  ? { ...r, aura_balance: Number(payload.new.aura_balance), nickname: payload.new.nickname }
                  : r
              )
              .sort((a, b) => b.aura_balance - a.aura_balance)
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, user, navigate]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => (r.nickname ?? "").toLowerCase().includes(term));
  }, [rows, q]);

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTarget) return;
    setReporting(true);
    try {
      const { error } = await supabase.rpc("report_comrade", {
        p_recipient: reportTarget,
        p_amount: reportAmount,
        p_reason: reportReason.trim() || undefined,
      });
      if (error) throw error;
      toast.success(`Comrade ${reportTarget} denounced. You both lost ${reportAmount} Aura.`);
      setReportTarget(null);
      setReportReason("");
      setReportAmount(1);
    } catch (err: any) {
      toast.error(err.message ?? "Denouncement denied by the State");
    } finally {
      setReporting(false);
    }
  }

  async function sendAuraToTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!sendTarget) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("send_aura", {
        p_recipient: sendTarget,
        p_amount: sendAmount,
        p_message: sendMessage.trim() || undefined,
      });
      if (error) throw error;
      toast.success(`+${(sendAmount * 1.5).toFixed(2)} Aura delivered to ${sendTarget}`);
      setSendTarget(null);
      setSendMessage("");
      setSendAmount(1);
    } catch (err: any) {
      toast.error(err.message ?? "The State denies this transaction");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="text-secondary text-3xl">★</span>
            <span className="font-display text-2xl uppercase tracking-wider">Absolute Communism</span>
          </Link>
          <nav className="flex gap-2">
            <Link to="/dashboard">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Dashboard
              </Button>
            </Link>
            <Link to="/leaderboard">
              <Button variant="ghost" className="text-primary-foreground bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Leaderboard
              </Button>
            </Link>
            <Link to="/arena">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Arena
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <h1 className="font-display text-4xl uppercase text-primary">Roll of Honor</h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
            Comrades ranked by accumulated Aura
          </p>

          <div className="mt-5">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search comrade by nickname…"
              className="border-2 border-primary/30 focus:border-primary font-mono"
            />
          </div>
        </section>

        <section className="border-2 border-primary bg-card shadow-[6px_6px_0_0_var(--primary)]">
          {busy ? (
            <p className="p-8 text-center font-display text-xl uppercase text-primary">Loading the State…</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground uppercase tracking-wider text-sm">
              No comrades found.
            </p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-primary/20">
              {filtered.map((r) => {
                const rank = getRank(r.aura_balance);
                const globalIdx = rows.findIndex((x) => x.id === r.id) + 1;
                const isMe = r.id === user?.id;
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-4 p-4 ${isMe ? "bg-secondary/20" : ""}`}
                  >
                    <span className="font-display text-3xl w-12 text-primary tabular-nums">
                      {globalIdx}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold text-primary truncate">
                        <button
                          onClick={() => { setSendTarget(r.nickname!); setSendAmount(1); }}
                          className="hover:underline cursor-pointer"
                        >
                          {r.nickname}
                        </button>
                        {isMe && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest bg-secondary text-secondary-foreground px-1.5 py-0.5">
                            You
                          </span>
                        )}
                      </p>
                      <p className={`text-xs uppercase tracking-widest ${rank.tone}`}>
                        {rank.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {!isMe && r.nickname && (
                        <>
                          <button
                            onClick={() => { setSendTarget(r.nickname!); setSendAmount(1); }}
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            Send Aura
                          </button>
                          <button
                            onClick={() => { setReportTarget(r.nickname!); setReportAmount(1); }}
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            Denounce
                          </button>
                        </>
                      )}
                      <div className="text-right">
                        <p className="font-display text-2xl text-primary">{formatAura(r.aura_balance)}</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Aura</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

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
              <Label className="uppercase tracking-wider text-xs">Aura to burn (max 5)</Label>
              <Input
                required
                type="number"
                min={0.01}
                max={5}
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

      {/* Send Aura dialog */}
      <Dialog open={!!sendTarget} onOpenChange={(o) => !o && setSendTarget(null)}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">
              Reward {sendTarget}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={sendAuraToTarget} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sent Aura is multiplied by ×1.5 for the receiver.
            </p>
            <div>
              <Label className="uppercase tracking-wider text-xs">Amount (max 10)</Label>
              <Input
                required
                type="number"
                min={0.01}
                max={10}
                step={0.01}
                value={sendAmount}
                onChange={(e) => setSendAmount(Number(e.target.value))}
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Good deed (optional)</Label>
              <Textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="For exemplary service to the collective…"
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sending} className="uppercase tracking-widest font-display">
                {sending ? "Submitting…" : `Send ${sendAmount || 0} Aura`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
