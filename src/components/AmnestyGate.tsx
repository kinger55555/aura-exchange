import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const AMNESTY_DEADLINE = new Date("2026-06-14T18:00:00Z");

export function AmnestyGate() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [alts, setAlts] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    if (loading || !user) { setOpen(false); return; }
    (async () => {
      const { data } = await supabase.rpc("my_private_profile" as any);
      const row = (data ?? {}) as any;
      if (row && !row.amnesty_acknowledged && !row.is_amnesty_alt) {
        setOpen(true);
      }
    })();
  }, [user, loading]);

  async function submit(declared: string[]) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("declare_amnesty" as any, { p_alts: declared });
      if (error) throw error;
      if (declared.length > 0) {
        toast.success(`Declared ${declared.length} alt(s). Their accounts will be purged at the reset; you earned ${declared.length} free suitcase(s).`);
      } else {
        toast.success("Declaration recorded. Long live the State.");
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Declaration refused");
    } finally {
      setBusy(false);
    }
  }

  function handleDeclareAlts() {
    const list = alts.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error("Enter at least one nickname, or pick 'I have none'"); return; }
    if (!confirm(`Permanently ban these accounts at the reset?\n\n${list.join(", ")}\n\nYou will receive ${list.length} free suitcase(s).`)) return;
    submit(list);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg border-4 border-destructive bg-card"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <p className="text-[10px] uppercase tracking-widest text-destructive font-bold">⚡ State Decree №47 ⚡</p>
          <DialogTitle className="font-display text-3xl uppercase text-destructive leading-tight">
            Amnesty Program — Declare Your True Account
          </DialogTitle>
          <DialogDescription className="text-sm text-foreground/80 pt-2">
            Smurf accounts gifting Aura to themselves have been detected by <span className="text-primary font-bold">AuraGuard</span>. Every comrade must now confirm their <span className="font-bold">true</span> account and list any <span className="font-bold">secondary</span> accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs text-muted-foreground border-l-2 border-destructive/40 pl-3">
          <p>• Listed secondaries will be <span className="text-destructive font-bold">permanently banned</span> at the reset on <span className="font-mono text-foreground">{AMNESTY_DEADLINE.toLocaleString()}</span>.</p>
          <p>• Your main account receives <span className="text-primary font-bold">one free Suitcase per declared alt</span>.</p>
          <p>• If AuraGuard catches you smurfing after the reset, <span className="text-destructive font-bold">both accounts are banned</span>.</p>
        </div>

        {!confirmEmpty ? (
          <>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Nicknames of your secondary accounts (comma or newline separated)</label>
              <Textarea
                value={alts}
                onChange={(e) => setAlts(e.target.value)}
                placeholder="comrade_alt1, ghost_volkov_2…"
                rows={3}
                className="font-mono mt-1"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleDeclareAlts}
                disabled={busy}
                className="w-full bg-destructive text-destructive-foreground font-display uppercase tracking-widest"
              >
                Declare alts & accept ban
              </Button>
              <Button
                onClick={() => setConfirmEmpty(true)}
                disabled={busy}
                variant="outline"
                className="w-full uppercase tracking-widest text-xs"
              >
                I have no secondary accounts
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              You swear before the State that this is your <span className="font-bold">only</span> account. If AuraGuard proves otherwise, <span className="text-destructive font-bold">both accounts will be permanently banned</span>.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => submit([])} disabled={busy} className="flex-1 bg-primary text-primary-foreground font-display uppercase tracking-widest">
                {busy ? "Submitting…" : "Swear it"}
              </Button>
              <Button onClick={() => setConfirmEmpty(false)} disabled={busy} variant="outline" className="uppercase tracking-widest text-xs">
                Go back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}