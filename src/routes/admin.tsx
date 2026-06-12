import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileNav } from "@/components/MobileNav";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Staff — Absolute Communism" }] }),
  component: AdminPage,
});

type Role = "owner" | "admin" | "moderator";
type StaffRow = {
  id: string;
  user_id: string;
  role: Role;
  hired_by: string | null;
  weekly_salary: number;
  hired_at: string;
  profile?: { nickname: string | null; aura_balance: number } | null;
};

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [newNick, setNewNick] = useState("");
  const [newSalary, setNewSalary] = useState(10);
  // Reverse-transfer UI moved to /dashboard ledger

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const { data: roles } = await supabase.from("staff_roles").select("role").eq("user_id", user.id);
    const ranks: Role[] = (roles ?? []).map((r: any) => r.role);
    const best: Role | null = ranks.includes("owner") ? "owner" : ranks.includes("admin") ? "admin" : ranks.includes("moderator") ? "moderator" : null;
    setMyRole(best);
    const { data } = await supabase
      .from("staff_roles")
      .select("id,user_id,role,hired_by,weekly_salary,hired_at,profile:user_id(nickname,aura_balance)")
      .order("role", { ascending: true });
    setStaff((data as any) ?? []);
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    load();
  }, [loading, user, navigate, load]);

  async function hire(role: Role) {
    if (!newNick.trim()) return;
    try {
      const { error } = await supabase.rpc("hire_staff", {
        p_nickname: newNick.trim(),
        p_role: role,
        p_salary: newSalary,
      });
      if (error) throw error;
      toast.success(`${newNick} hired as ${role}`);
      setNewNick(""); setNewSalary(10); load();
    } catch (err: any) { toast.error(err.message ?? "Hire denied"); }
  }

  async function fire(row: StaffRow) {
    if (!confirm(`Fire ${row.profile?.nickname}?`)) return;
    try {
      const { error } = await supabase.rpc("fire_staff", { p_user_id: row.user_id, p_role: row.role });
      if (error) throw error;
      toast.success("Fired");
      load();
    } catch (err: any) { toast.error(err.message ?? "Action denied"); }
  }

  if (loading || busy) return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-xl uppercase text-primary">Loading…</p></main>;
  if (!myRole || (myRole !== "owner" && myRole !== "admin")) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="border-2 border-primary p-6 bg-card max-w-sm w-full text-center">
          <h1 className="font-display text-2xl uppercase text-primary">No clearance</h1>
          <Button onClick={() => navigate({ to: "/dashboard" })} className="mt-4">Return</Button>
        </div>
      </main>
    );
  }

  const canHireRole: Role = myRole === "owner" ? "admin" : "moderator";

  return (
    <main className="min-h-screen pb-24 bg-background">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary px-4 py-3 sticky top-0 z-20">
        <h1 className="font-display text-xl uppercase tracking-wider">Staff Roster</h1>
        <p className="text-[10px] uppercase tracking-widest opacity-90">{myRole === "owner" ? "Owner — hires Admins" : "Admin — hires Moderators"}</p>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)] space-y-3">
          <h2 className="font-display text-lg uppercase text-primary">Hire {canHireRole}</h2>
          <div>
            <Label className="uppercase tracking-wider text-xs">Nickname</Label>
            <Input value={newNick} onChange={(e) => setNewNick(e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label className="uppercase tracking-wider text-xs">Weekly salary (Aura, paid from your balance)</Label>
            <Input type="number" min={0} max={1000} value={newSalary} onChange={(e) => setNewSalary(Number(e.target.value))} />
          </div>
          <Button onClick={() => hire(canHireRole)} className="w-full bg-primary text-primary-foreground font-display uppercase tracking-widest">Hire</Button>
        </section>

        <section className="border-2 border-primary bg-card shadow-[4px_4px_0_0_var(--primary)]">
          <ul className="divide-y-2 divide-dashed divide-primary/20">
            {staff.map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-primary truncate">{s.profile?.nickname ?? "—"}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.role} · {Number(s.weekly_salary).toFixed(2)} Aura / wk</p>
                </div>
                {s.role !== "owner" && ((myRole === "owner" && s.role === "admin") || (myRole === "owner" && s.role === "moderator") || (myRole === "admin" && s.role === "moderator" && s.hired_by === user!.id)) && (
                  <Button size="sm" variant="destructive" onClick={() => fire(s)}>Fire</Button>
                )}
              </li>
            ))}
            {staff.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">No staff yet.</li>}
          </ul>
        </section>

        <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">Reverse transfers from the Dashboard ledger.</p>

        {myRole === "owner" && (
          <section className="border-2 border-destructive bg-card p-4 shadow-[4px_4px_0_0_var(--destructive)] space-y-3">
            <h2 className="font-display text-lg uppercase text-destructive">Amnesty Program</h2>
            <p className="text-xs text-muted-foreground">
              Run AuraGuard to file reports on suspicious email clusters, then execute the amnesty reset to ban every declared alt and wipe the realm.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="uppercase tracking-widest text-xs"
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.rpc("auraguard_email_scan" as any);
                    if (error) throw error;
                    toast.success(`AuraGuard filed ${(data as any)?.clusters_filed ?? 0} report(s)`);
                  } catch (e: any) { toast.error(e.message ?? "Scan failed"); }
                }}
              >
                Run AuraGuard
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground uppercase tracking-widest text-xs font-display"
                onClick={async () => {
                  if (!confirm("EXECUTE AMNESTY RESET?\n\nThis will permanently ban every declared alt and wipe Aura/titles/history for all non-staff comrades. Staff are preserved.")) return;
                  try {
                    const { data, error } = await supabase.rpc("amnesty_process" as any);
                    if (error) throw error;
                    toast.success(`Amnesty complete. ${(data as any)?.banned ?? 0} alt(s) banned.`);
                  } catch (e: any) { toast.error(e.message ?? "Reset failed"); }
                }}
              >
                Execute Reset
              </Button>
            </div>
          </section>
        )}
      </div>
      <MobileNav />
    </main>
  );
}