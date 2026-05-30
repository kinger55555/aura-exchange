import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function IdeaButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"feature_idea" | "minigame_idea">("feature_idea");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_report", {
        p_type: kind,
        p_message: msg.trim(),
      });
      if (error) throw error;
      toast.success("Your idea has been forwarded to the Supreme Lord");
      setMsg("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "The State did not accept your idea");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label="Submit idea"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 size-12 rounded-full bg-secondary text-secondary-foreground shadow-[4px_4px_0_0_var(--primary)] border-2 border-primary flex items-center justify-center md:bottom-6"
      >
        <Lightbulb className="size-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-2 border-primary max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">Petition the Supreme Lord</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" variant={kind === "feature_idea" ? "default" : "outline"} size="sm" onClick={() => setKind("feature_idea")}>Feature</Button>
              <Button type="button" variant={kind === "minigame_idea" ? "default" : "outline"} size="sm" onClick={() => setKind("minigame_idea")}>Mini-game</Button>
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Your idea</Label>
              <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} rows={4} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground font-display uppercase tracking-widest">
                {busy ? "Sending…" : "Submit Petition"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}