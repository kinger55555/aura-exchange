import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/banned")({
  head: () => ({ meta: [{ title: "Banned — Absolute Communism" }] }),
  component: BannedPage,
});

type Ban = { id: string; reason: string | null; expires_at: string | null; created_at: string; status: string };

function BannedPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ban, setBan] = useState<Ban | null>(null);
  const [defense, setDefense] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    (async () => {
      const { data } = await supabase
        .from("bans")
        .select("id,reason,expires_at,created_at,status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) { navigate({ to: "/dashboard" }); return; }
      setBan(data as Ban);
    })();
  }, [loading, user, navigate]);

  async function appeal(e: React.FormEvent) {
    e.preventDefault();
    if (!defense.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_report", {
        p_type: "ban_appeal",
        p_message: defense.trim(),
        p_extra: { ban_id: ban?.id },
      });
      if (error) throw error;
      toast.success("Your appeal has reached the Supreme Lord");
      setDefense("");
    } catch (err: any) {
      toast.error(err.message ?? "The State refused");
    } finally { setBusy(false); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (!ban) return null;
  const perm = !ban.expires_at;

  return (
    <main className="min-h-screen p-4 flex items-center justify-center bg-background">
      <div className="border-4 border-destructive bg-card p-6 max-w-md w-full shadow-[6px_6px_0_0_var(--destructive)]">
        <p className="text-xs uppercase tracking-widest text-destructive font-bold">The State has spoken</p>
        <h1 className="font-display text-4xl uppercase text-destructive mt-1">You are banned</h1>
        <p className="text-sm text-muted-foreground mt-3">{ban.reason ?? "No reason given."}</p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
          {perm ? "Permanent — only the Supreme Lord can lift this" : `Expires: ${new Date(ban.expires_at!).toLocaleString()}`}
        </p>
        <form onSubmit={appeal} className="mt-5 space-y-3">
          <div>
            <Label className="uppercase tracking-wider text-xs">File an appeal to the Supreme Lord</Label>
            <Textarea value={defense} onChange={(e) => setDefense(e.target.value)} maxLength={500} rows={4} placeholder="Plead your case…" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1 bg-destructive text-destructive-foreground uppercase tracking-widest font-display">
              {busy ? "Submitting…" : "Submit Appeal"}
            </Button>
            <Button type="button" onClick={signOut} variant="outline" className="uppercase tracking-widest">Desert</Button>
          </div>
        </form>
      </div>
    </main>
  );
}