import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";
import { StaffBadge } from "@/components/StaffBadge";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Absolute Communism" }] }),
  component: SettingsPage,
});

type Role = "owner" | "admin" | "moderator" | null;

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>(null);
  const [salary, setSalary] = useState<number>(0);
  const [nick, setNick] = useState<string>("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: roles }, { data: salaryRpc }] = await Promise.all([
      supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle(),
      supabase.from("staff_roles").select("role").eq("user_id", user.id),
      supabase.rpc("my_staff_salary"),
    ]);
    setNick(p?.nickname ?? "");
    const ranks = (roles ?? []).map((r: any) => r.role);
    const best: Role = ranks.includes("owner") ? "owner" : ranks.includes("admin") ? "admin" : ranks.includes("moderator") ? "moderator" : null;
    setRole(best);
    if (salaryRpc != null) setSalary(Number(salaryRpc));
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    load();
  }, [loading, user, navigate, load]);

  async function saveSalary() {
    try {
      const { error } = await supabase.rpc("set_owner_salary", { p_salary: salary });
      if (error) throw error;
      toast.success("Treasury updated");
    } catch (e: any) { toast.error(e.message); }
  }

  async function oblivion() {
    const confirmText = prompt('Type "OBLIVION" to permanently delete your account.');
    if (confirmText !== "OBLIVION") return;
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Vanished from the State");
      navigate({ to: "/" });
    } catch (e: any) { toast.error(e.message); }
  }

  const [grantNick, setGrantNick] = useState("");
  const [grantAmt, setGrantAmt] = useState(10);
  const [grantRank, setGrantRank] = useState(1);

  async function doGrantGray() {
    try {
      const { error } = await supabase.rpc("grant_gray_aura", { p_nickname: grantNick.trim(), p_amount: grantAmt });
      if (error) throw error;
      toast.success(`Granted ${grantAmt} gray Aura to ${grantNick}`);
    } catch (e: any) { toast.error(e.message); }
  }
  async function doGrantAura() {
    try {
      const { error } = await supabase.rpc("grant_aura", { p_nickname: grantNick.trim(), p_amount: grantAmt });
      if (error) throw error;
      toast.success(`Granted ${grantAmt} Aura to ${grantNick}`);
    } catch (e: any) { toast.error(e.message); }
  }
  async function doSetRank() {
    try {
      const { error } = await supabase.rpc("set_user_rank", { p_nickname: grantNick.trim(), p_rank: grantRank });
      if (error) throw error;
      toast.success(`Set ${grantNick} to rank ${grantRank}`);
    } catch (e: any) { toast.error(e.message); }
  }
  async function doResetGray() {
    if (!confirm("Wipe ALL gray Aura and roll back every rank bought with it?")) return;
    try {
      const { error } = await supabase.rpc("reset_all_gray_aura");
      if (error) throw error;
      toast.success("Gray Aura purged from the State");
    } catch (e: any) { toast.error(e.message); }
  }

  async function doDestroyAllParties() {
    if (!confirm("Destroy ALL parties (even ones mid-game) and refund all bets? This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure?")) return;
    try {
      const { error } = await supabase.rpc("destroy_all_parties");
      if (error) throw error;
      toast.success("All parties annihilated");
    } catch (e: any) { toast.error(e.message); }
  }

  async function doFullReset() {
    if (!confirm("FULL RESET: wipe ALL Aura, ranks, titles, transactions, reports, bans, parties, tickets and history. This cannot be undone. Continue?")) return;
    if (!confirm("Are you absolutely sure? Type OK on the next prompt.")) return;
    const c = prompt("Type RESET to confirm");
    if (c !== "RESET") { toast.error("Reset cancelled"); return; }
    try {
      const { error } = await supabase.rpc("full_reset");
      if (error) throw error;
      toast.success("The State has been reset to Year Zero");
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading || busy) return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading…</p></main>;

  return (
    <main className="min-h-screen pb-32 bg-background">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <section className="border-2 border-primary bg-card p-5 shadow-[4px_4px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Identity</p>
          <h1 className="font-display text-3xl uppercase text-primary mt-1 flex items-center gap-2">
            {nick} <StaffBadge role={role} />
          </h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{role ?? "Player"}</p>
        </section>

        {role === "owner" && (
          <section className="border-2 border-secondary bg-card p-4 shadow-[4px_4px_0_0_var(--secondary)] space-y-3">
            <h2 className="font-display text-lg uppercase text-secondary-foreground bg-secondary inline-block px-2">Owner's Treasury</h2>
            <Label className="uppercase tracking-wider text-xs block">Your weekly salary (Aura)</Label>
            <Input type="number" min={0} max={10000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
            <Button onClick={saveSalary} className="w-full bg-secondary text-secondary-foreground font-display uppercase tracking-widest">Save Treasury</Button>
            <Button onClick={() => navigate({ to: "/admin" })} variant="outline" className="w-full uppercase tracking-widest text-xs">Manage Staff Roster</Button>
          </section>
        )}

        {role === "owner" && (
          <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)] space-y-3">
            <h2 className="font-display text-lg uppercase text-primary">Owner Grant Powers</h2>
            <p className="text-xs text-muted-foreground">Tip: open a comrade's profile for one-tap Set Aura / Grant Gray / Rank Up.</p>
            <div>
              <Label className="uppercase tracking-wider text-xs">Comrade nickname</Label>
              <Input value={grantNick} onChange={(e) => setGrantNick(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Amount (can be negative)</Label>
              <Input type="number" value={grantAmt} onChange={(e) => setGrantAmt(Number(e.target.value))} />
            </div>
            <Button onClick={doGrantGray} variant="outline" className="w-full uppercase tracking-widest text-xs">Grant Gray Aura</Button>
            <Button onClick={doGrantAura} className="w-full bg-primary text-primary-foreground uppercase tracking-widest text-xs">Grant Real Aura</Button>
            <div>
              <Label className="uppercase tracking-wider text-xs">Set rank (#)</Label>
              <Input type="number" min={1} value={grantRank} onChange={(e) => setGrantRank(Number(e.target.value))} />
            </div>
            <Button onClick={doSetRank} variant="outline" className="w-full uppercase tracking-widest text-xs">Set Comrade Rank</Button>
            <Button onClick={doResetGray} variant="destructive" className="w-full uppercase tracking-widest text-xs">Reset ALL Gray Aura</Button>
            <Button onClick={doDestroyAllParties} variant="destructive" className="w-full uppercase tracking-widest text-xs font-display border-2 border-destructive-foreground">☢ Destroy ALL Parties (even mid-game)</Button>
            <Button onClick={doFullReset} variant="destructive" className="w-full uppercase tracking-widest text-xs font-display border-2 border-destructive-foreground">⚠ Full Reset (Year Zero)</Button>
          </section>
        )}

        {(role === "admin" || role === "moderator") && (
          <section className="border-2 border-primary bg-card p-4 space-y-2">
            <h2 className="font-display text-lg uppercase text-primary">Staff Tools</h2>
            <Button onClick={() => navigate({ to: "/justice" })} className="w-full uppercase tracking-widest">Open Justice Queue</Button>
            {role === "admin" && <Button onClick={() => navigate({ to: "/admin" })} variant="outline" className="w-full uppercase tracking-widest">Manage Moderators</Button>}
          </section>
        )}

        <section className="border-2 border-destructive bg-card p-4 shadow-[4px_4px_0_0_var(--destructive)] space-y-2">
          <h2 className="font-display text-lg uppercase text-destructive">Oblivion Protocol</h2>
          <p className="text-xs text-muted-foreground">Permanently erase your account from the State. This cannot be undone.</p>
          <Button onClick={oblivion} variant="destructive" className="w-full uppercase tracking-widest font-display" disabled={role === "owner"}>
            {role === "owner" ? "The Owner cannot vanish" : "Vanish Forever"}
          </Button>
        </section>

        <Button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }} variant="ghost" className="w-full uppercase tracking-widest text-xs">
          Desert (sign out)
        </Button>
      </div>
      <IdeaButton />
      <MobileNav />
    </main>
  );
}