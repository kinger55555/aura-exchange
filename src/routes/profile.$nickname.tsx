import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";
import { StaffBadge, useStaffRole } from "@/components/StaffBadge";
import { getRank, formatAura } from "@/lib/rank";
import { Crown, Shield, AlertTriangle, ArrowLeft, Send, Gavel, Ban } from "lucide-react";

export const Route = createFileRoute("/profile/$nickname")({
  head: () => ({ meta: [{ title: "Profile — Absolute Communism" }] }),
  component: ProfilePage,
});

type Role = "owner" | "admin" | "moderator" | null;

function ProfilePage() {
  const { nickname } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [target, setTarget] = useState<{ id: string; nickname: string; aura_balance: number; gray_aura: number; current_rank: number } | null>(null);
  const [myRole, setMyRole] = useState<Role>(null);
  const targetRole = useStaffRole(target?.id);
  const [busy, setBusy] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [salary, setSalary] = useState(10);
  const [acting, setActing] = useState(false);
  const [punishOpen, setPunishOpen] = useState(false);
  const [punishAmt, setPunishAmt] = useState(1);
  const [punishReason, setPunishReason] = useState("");
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banDays, setBanDays] = useState(1);
  const [setAuraVal, setSetAuraVal] = useState<number>(0);
  const [grayAmt, setGrayAmt] = useState<number>(10);

  const load = useCallback(async () => {
    setBusy(true);
    const { data } = await supabase.from("profiles")
      .select("id, nickname, aura_balance, gray_aura, current_rank")
      .ilike("nickname", nickname).maybeSingle();
    if (data) {
      setTarget({
        id: data.id,
        nickname: data.nickname!,
        aura_balance: Number(data.aura_balance),
        gray_aura: Number((data as any).gray_aura ?? 0),
        current_rank: Number((data as any).current_rank ?? 1),
      });
      setSetAuraVal(Number(data.aura_balance));
    }
    if (user) {
      const { data: r } = await supabase.from("staff_roles").select("role").eq("user_id", user.id);
      const ranks = (r ?? []).map((x: any) => x.role);
      setMyRole(ranks.includes("owner") ? "owner" : ranks.includes("admin") ? "admin" : ranks.includes("moderator") ? "moderator" : null);
    }
    setBusy(false);
  }, [nickname, user]);

  useEffect(() => { load(); }, [load]);

  async function promote(role: "admin" | "moderator") {
    if (!target) return;
    setActing(true);
    try {
      const { error } = await supabase.rpc("promote_user", { p_user_id: target.id, p_role: role, p_salary: salary });
      if (error) throw error;
      toast.success(`${target.nickname} promoted to ${role}`);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setActing(false); }
  }

  async function demote(role: "admin" | "moderator") {
    if (!target) return;
    if (!confirm(`Strip ${target.nickname} of ${role}?`)) return;
    try {
      const { error } = await supabase.rpc("fire_staff", { p_user_id: target.id, p_role: role });
      if (error) throw error;
      toast.success("Demoted");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function submitReport(type: "player_report" | "mod_report") {
    if (!target) return;
    try {
      const { error } = await supabase.rpc("submit_report", {
        p_type: type,
        p_target_nickname: target.nickname,
        p_message: reason.trim() || undefined,
      });
      if (error) throw error;
      toast.success(type === "mod_report" ? "Report sent to High Council" : "Report filed (0.5 Aura fee)");
      setReportOpen(false); setReason("");
    } catch (e: any) { toast.error(e.message); }
  }

  async function punish() {
    if (!target) return;
    try {
      const { error } = await supabase.rpc("staff_punish", {
        p_user_id: target.id,
        p_amount: punishAmt,
        p_reason: punishReason.trim() || "Punished from profile",
      });
      if (error) throw error;
      toast.success(`Deducted ${punishAmt} Aura from ${target.nickname}`);
      setPunishOpen(false); setPunishReason(""); setPunishAmt(1);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function issueBan() {
    if (!target) return;
    const days = myRole === "owner" && banDays === 0 ? undefined : banDays;
    try {
      const { error } = await supabase.rpc("issue_ban", {
        p_user_id: target.id,
        p_reason: banReason.trim() || "Justice served",
        p_days: days,
      });
      if (error) throw error;
      toast.success("Ban issued");
      setBanOpen(false); setBanReason("");
    } catch (e: any) { toast.error(e.message); }
  }

  async function ownerSetAura() {
    if (!target) return;
    try {
      const { error } = await supabase.rpc("set_user_aura", { p_nickname: target.nickname, p_amount: setAuraVal });
      if (error) throw error;
      toast.success(`Aura set to ${setAuraVal}`); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function ownerGrantGray() {
    if (!target) return;
    try {
      const { error } = await supabase.rpc("grant_gray_aura", { p_nickname: target.nickname, p_amount: grayAmt });
      if (error) throw error;
      toast.success(`Granted ${grayAmt} gray Aura`); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function ownerRankUp() {
    if (!target) return;
    try {
      const { error } = await supabase.rpc("owner_rank_up", { p_nickname: target.nickname });
      if (error) throw error;
      toast.success("Ascended one rank"); load();
    } catch (e: any) { toast.error(e.message); }
  }

  if (busy) return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading…</p></main>;
  if (!target) return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="border-2 border-primary bg-card p-6 text-center max-w-sm w-full">
        <p className="font-display text-2xl uppercase text-primary">Comrade not found</p>
        <Button onClick={() => navigate({ to: "/leaderboard" })} className="mt-4">Back</Button>
      </div>
    </main>
  );

  const rank = getRank(target.aura_balance);
  const isSelf = user?.id === target.id;
  const canPromoteAdmin = myRole === "owner" && targetRole === null && !isSelf;
  const canPromoteMod = (myRole === "owner" || myRole === "admin") && targetRole === null && !isSelf;
  const canDemoteAdmin = myRole === "owner" && targetRole === "admin";
  const canDemoteMod = (myRole === "owner" || myRole === "admin") && targetRole === "moderator";
  const canPunish = !isSelf && (myRole === "moderator" || myRole === "admin" || myRole === "owner");
  const canBan = !isSelf && (myRole === "admin" || myRole === "owner");
  const punishCap = myRole === "moderator" ? 10 : myRole === "admin" ? 50 : 100;

  return (
    <main className="min-h-screen pb-32 bg-background">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <section className="border-2 border-primary bg-card p-5 shadow-[4px_4px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Comrade</p>
          <h1 className="font-display text-3xl uppercase text-primary mt-1 break-words flex items-center gap-2">
            {target.nickname}
            <StaffBadge role={targetRole} />
          </h1>
          <div className="mt-1 inline-block px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] uppercase tracking-widest font-bold">
            {targetRole ?? rank.title}
          </div>
          <div className="mt-4 border-t-2 border-dashed border-primary/30 pt-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Aura Balance</p>
            <p className="font-display text-4xl text-primary mt-1">{formatAura(target.aura_balance)}</p>
            {target.gray_aura > 0 && (
              <p className="font-display text-xl text-muted-foreground mt-1">
                {formatAura(target.gray_aura)} <span className="text-xs uppercase tracking-widest">Gray</span>
              </p>
            )}
          </div>
        </section>

        {!isSelf && (
          <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)] space-y-3">
            <h2 className="font-display text-lg uppercase text-primary">Actions</h2>

            <Link to="/dashboard" search={{ to: target.nickname }} className="block">
              <Button className="w-full bg-primary text-primary-foreground font-display uppercase tracking-widest">
                <Send className="size-4 mr-2" /> Send Aura
              </Button>
            </Link>

            {(canPromoteAdmin || canPromoteMod) && (
              <div className="border-t-2 border-dashed border-primary/30 pt-3 space-y-2">
                <Label className="uppercase tracking-wider text-xs">Weekly salary (Aura)</Label>
                <Input type="number" min={0} max={1000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
                {canPromoteAdmin && (
                  <Button disabled={acting} onClick={() => promote("admin")} className="w-full bg-secondary text-secondary-foreground font-display uppercase tracking-widest">
                    <Crown className="size-4 mr-2" /> Promote to Admin
                  </Button>
                )}
                {canPromoteMod && (
                  <Button disabled={acting} onClick={() => promote("moderator")} variant="outline" className="w-full font-display uppercase tracking-widest">
                    <Shield className="size-4 mr-2" /> Promote to Moderator
                  </Button>
                )}
              </div>
            )}

            {(canDemoteAdmin || canDemoteMod) && (
              <div className="border-t-2 border-dashed border-primary/30 pt-3 space-y-2">
                {canDemoteAdmin && <Button onClick={() => demote("admin")} variant="destructive" className="w-full uppercase tracking-widest">Strip Admin</Button>}
                {canDemoteMod && <Button onClick={() => demote("moderator")} variant="destructive" className="w-full uppercase tracking-widest">Strip Moderator</Button>}
              </div>
            )}

            <div className="border-t-2 border-dashed border-primary/30 pt-3">
              {targetRole === "moderator" ? (
                <Button onClick={() => setReportOpen(true)} variant="outline" className="w-full uppercase tracking-widest text-destructive border-destructive">
                  <Shield className="size-4 mr-2" /> Report this Moderator
                </Button>
              ) : (
                <Button onClick={() => setReportOpen(true)} variant="outline" className="w-full uppercase tracking-widest text-destructive border-destructive">
                  <AlertTriangle className="size-4 mr-2" /> Report (0.5 Aura)
                </Button>
              )}
            </div>

            {(canPunish || canBan) && (
              <div className="border-t-2 border-dashed border-destructive/40 pt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-destructive font-bold">Staff Justice</p>
                {canPunish && (
                  <Button onClick={() => setPunishOpen(true)} variant="destructive" className="w-full uppercase tracking-widest">
                    <Gavel className="size-4 mr-2" /> Deduct Aura (cap {punishCap})
                  </Button>
                )}
                {canBan && (
                  <Button onClick={() => setBanOpen(true)} variant="destructive" className="w-full uppercase tracking-widest">
                    <Ban className="size-4 mr-2" /> Issue Ban
                  </Button>
                )}
              </div>
            )}

            {myRole === "owner" && !isSelf && (
              <div className="border-t-2 border-dashed border-secondary/40 pt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-secondary-foreground font-bold">Owner Tools</p>
                <Label className="uppercase tracking-wider text-xs">Set Aura to</Label>
                <div className="flex gap-2">
                  <Input type="number" value={setAuraVal} onChange={(e) => setSetAuraVal(Number(e.target.value))} />
                  <Button onClick={ownerSetAura} className="bg-secondary text-secondary-foreground uppercase tracking-widest font-display">Set</Button>
                </div>
                <Label className="uppercase tracking-wider text-xs">Grant Gray Aura</Label>
                <div className="flex gap-2">
                  <Input type="number" value={grayAmt} onChange={(e) => setGrayAmt(Number(e.target.value))} />
                  <Button onClick={ownerGrantGray} variant="outline" className="uppercase tracking-widest font-display">Grant</Button>
                </div>
                <Button onClick={ownerRankUp} className="w-full bg-primary text-primary-foreground uppercase tracking-widest font-display">
                  <Crown className="size-4 mr-2" /> Rank Up (currently #{target.current_rank})
                </Button>
              </div>
            )}
          </section>
        )}

        <Button onClick={() => navigate({ to: "/leaderboard" })} variant="ghost" className="w-full uppercase tracking-widest text-xs">
          <ArrowLeft className="size-4 mr-2" /> Back to Ranks
        </Button>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="border-2 border-destructive max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-destructive">Report {target.nickname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="uppercase tracking-wider text-xs">Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} required />
            <DialogFooter>
              <Button
                onClick={() => submitReport(targetRole === "moderator" ? "mod_report" : "player_report")}
                variant="destructive"
                className="uppercase tracking-widest font-display"
              >
                File Report
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={punishOpen} onOpenChange={setPunishOpen}>
        <DialogContent className="border-2 border-destructive max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-destructive">Punish {target.nickname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="uppercase tracking-wider text-xs">Aura to deduct (cap {punishCap})</Label>
            <Input type="number" min={0.1} max={punishCap} step={0.1} value={punishAmt} onChange={(e) => setPunishAmt(Number(e.target.value))} />
            <Label className="uppercase tracking-wider text-xs">Reason</Label>
            <Textarea value={punishReason} onChange={(e) => setPunishReason(e.target.value)} maxLength={300} rows={3} />
            <DialogFooter>
              <Button onClick={punish} variant="destructive" className="uppercase tracking-widest font-display">Deduct</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent className="border-2 border-destructive max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-destructive">Ban {target.nickname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="uppercase tracking-wider text-xs">
              Days {myRole === "owner" ? "(0 = permanent)" : "(1-7)"}
            </Label>
            <Input type="number" min={myRole === "owner" ? 0 : 1} max={myRole === "admin" ? 7 : 365} value={banDays} onChange={(e) => setBanDays(Number(e.target.value))} />
            <Label className="uppercase tracking-wider text-xs">Reason</Label>
            <Textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={300} rows={3} />
            <DialogFooter>
              <Button onClick={issueBan} variant="destructive" className="uppercase tracking-widest font-display">Issue Ban</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <IdeaButton />
      <MobileNav />
    </main>
  );
}