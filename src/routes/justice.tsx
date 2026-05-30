import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";

export const Route = createFileRoute("/justice")({
  head: () => ({ meta: [{ title: "Justice — Absolute Communism" }] }),
  component: JusticePage,
});

type Role = "owner" | "admin" | "moderator";
type Report = {
  id: string;
  type: string;
  priority: number;
  queue: string;
  reporter_id: string | null;
  target_user_id: string | null;
  payload: any;
  status: string;
  created_at: string;
  reporter?: { nickname: string | null } | null;
  target?: { nickname: string | null; aura_balance: number } | null;
};
type Quota = { actions: number; checkins: number; points: number; goal: number };

function JusticePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState(true);
  const [active, setActive] = useState<Report | null>(null);
  const [penaltyAmt, setPenaltyAmt] = useState(1);
  const [notes, setNotes] = useState("");
  const [banDays, setBanDays] = useState(1);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const [{ data: rolesData }, { data: q }] = await Promise.all([
      supabase.from("staff_roles").select("role").eq("user_id", user.id),
      supabase.rpc("my_quota"),
    ]);
    const ranks: Role[] = (rolesData ?? []).map((r: any) => r.role);
    const best: Role | null =
      ranks.includes("owner") ? "owner" : ranks.includes("admin") ? "admin" : ranks.includes("moderator") ? "moderator" : null;
    setRole(best);
    setQuota(q as any);

    if (!best) {
      setBusy(false);
      return;
    }
    const queues = best === "owner" ? ["owner", "admin", "mod"] : best === "admin" ? ["admin", "mod"] : ["mod"];
    const { data } = await supabase
      .from("reports")
      .select("id,type,priority,queue,reporter_id,target_user_id,payload,status,created_at,reporter:reporter_id(nickname),target:target_user_id(nickname,aura_balance)")
      .in("queue", queues)
      .eq("status", "open")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200);
    setReports((data as any) ?? []);
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    load();
    const ch = supabase
      .channel("reports-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loading, user, navigate, load]);

  async function act(action: string) {
    if (!active) return;
    try {
      const { error } = await supabase.rpc("act_on_report", {
        p_report_id: active.id,
        p_action: action,
        p_amount: action === "penalize" ? penaltyAmt : 0,
        p_notes: notes.trim() || undefined,
      });
      if (error) throw error;
      toast.success(`Action recorded: ${action}`);
      setActive(null);
      setNotes("");
      setPenaltyAmt(1);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "The State refused");
    }
  }

  async function issueBan() {
    if (!active || !active.target_user_id) return;
    const days = role === "owner" && banDays === 0 ? undefined : banDays;
    try {
      const { error } = await supabase.rpc("issue_ban", {
        p_user_id: active.target_user_id,
        p_reason: notes.trim() || "Justice served",
        p_days: days,
      });
      if (error) throw error;
      await supabase.rpc("act_on_report", {
        p_report_id: active.id, p_action: "resolve", p_notes: `Banned ${days ?? "permanently"}`,
      });
      toast.success("Ban issued");
      setActive(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Ban denied");
    }
  }

  async function checkin() {
    try {
      const { error } = await supabase.rpc("staff_checkin");
      if (error) throw error;
      toast.success("Check-in recorded (+2 quota points)");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Cannot check in right now");
    }
  }

  if (loading || busy) {
    return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading dossiers…</p></main>;
  }
  if (!role) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="border-2 border-primary p-6 bg-card max-w-sm w-full text-center">
          <h1 className="font-display text-2xl uppercase text-primary">No clearance</h1>
          <p className="text-sm text-muted-foreground mt-2">You are not a staff comrade.</p>
          <Button onClick={() => navigate({ to: "/dashboard" })} className="mt-4">Return</Button>
        </div>
      </main>
    );
  }

  const labelMap: Record<string, string> = {
    player_report: "Player report",
    mod_report: "Mod report",
    auraguard: "AuraGuard",
    aura_appeal: "Aura penalty appeal",
    ban_appeal: "Ban appeal",
    admin_escalation: "Admin escalation",
    feature_idea: "Feature idea",
    minigame_idea: "Mini-game idea",
  };

  return (
    <main className="min-h-screen pb-24 bg-background">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl uppercase tracking-wider">Justice — {role}</h1>
          {role === "owner" && (
            <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/admin" })}>Staff</Button>
          )}
        </div>
        {quota && (
          <p className="text-[10px] uppercase tracking-widest mt-1 opacity-90">
            Weekly quota: {quota.points} / {quota.goal} pts · {quota.actions} actions · {quota.checkins} check-ins
          </p>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {reports.length === 0 ? (
          <div className="border-2 border-primary bg-card p-6 text-center space-y-3">
            <p className="font-display text-lg uppercase text-primary">The queue is empty, comrade.</p>
            <p className="text-xs text-muted-foreground">All is quiet in the State. Claim your daily check-in.</p>
            <Button onClick={checkin} className="bg-secondary text-secondary-foreground font-display uppercase tracking-widest">Daily Check-in (+2 pts)</Button>
          </div>
        ) : (
          reports.map((r) => (
            <button
              key={r.id}
              onClick={() => { setActive(r); setNotes(""); setPenaltyAmt(1); setBanDays(role === "admin" ? 1 : 0); }}
              className="w-full text-left border-2 border-primary bg-card p-3 shadow-[4px_4px_0_0_var(--primary)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 font-bold ${
                  r.priority === 1 ? "bg-destructive text-destructive-foreground" : r.priority === 2 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                }`}>P{r.priority} · {labelMap[r.type] ?? r.type}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground">Reporter:</span> <span className="font-mono">{r.reporter?.nickname ?? "—"}</span>
                {r.target?.nickname && (<>
                  {" "}· <span className="text-muted-foreground">Target:</span> <span className="font-mono">{r.target.nickname}</span>
                </>)}
              </div>
              {r.payload?.message && (<p className="mt-1 text-sm italic text-muted-foreground line-clamp-2">"{r.payload.message}"</p>)}
              {r.payload?.reason && (<p className="mt-1 text-sm italic text-muted-foreground line-clamp-2">{r.payload.reason}</p>)}
            </button>
          ))
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="border-2 border-primary max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-xl">
              {active ? (labelMap[active.type] ?? active.type) : ""}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Reporter:</span> <span className="font-mono">{active.reporter?.nickname ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Target:</span> <span className="font-mono">{active.target?.nickname ?? "—"}</span>
                {active.target && <span className="ml-2 text-xs">({Number(active.target.aura_balance).toFixed(2)} Aura)</span>}
              </div>
              {active.payload && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">{JSON.stringify(active.payload, null, 2)}</pre>}
              <div>
                <Label className="uppercase tracking-wider text-xs">Notes / resolution</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} />
              </div>
              {active.target_user_id && (
                <div>
                  <Label className="uppercase tracking-wider text-xs">Penalty (Aura)</Label>
                  <Input type="number" min={0.1} max={50} step={0.1} value={penaltyAmt} onChange={(e) => setPenaltyAmt(Number(e.target.value))} />
                </div>
              )}
              <DialogFooter className="flex flex-wrap gap-2">
                {active.target_user_id && (
                  <Button onClick={() => act("penalize")} variant="destructive" className="uppercase tracking-widest">Deduct Aura</Button>
                )}
                <Button onClick={() => act("dismiss")} variant="outline" className="uppercase tracking-widest">Dismiss</Button>
                <Button onClick={() => act("resolve")} className="uppercase tracking-widest">Resolve</Button>
                {role !== "owner" && (
                  <Button onClick={() => act("escalate")} variant="secondary" className="uppercase tracking-widest">Escalate ↑</Button>
                )}
                {(role === "admin" || role === "owner") && active.target_user_id && (
                  <div className="basis-full border-t-2 border-dashed border-primary/30 pt-2 flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="uppercase tracking-wider text-[10px]">Ban (days, 0 = permanent)</Label>
                      <Input type="number" min={0} max={role === "admin" ? 7 : 365} value={banDays} onChange={(e) => setBanDays(Number(e.target.value))} />
                    </div>
                    <Button onClick={issueBan} variant="destructive" className="uppercase tracking-widest">Issue Ban</Button>
                  </div>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <IdeaButton />
      <MobileNav />
    </main>
  );
}