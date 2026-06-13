import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Status = {
  event_start: string;
  event_end: string;
  event_day: number;
  active: boolean;
  claimed_count: number;
  last_claim_day: number;
  can_claim: boolean;
  falling_star_pending: number;
};

const REWARDS = [
  { day: 1, label: "1 Aura", icon: "★" },
  { day: 2, label: "2 Aura", icon: "★★" },
  { day: 3, label: "4 Aura", icon: "★★★" },
  { day: 4, label: "Free Case", icon: "🎁" },
  { day: 5, label: "Free Rank Up", icon: "▲" },
  { day: 6, label: "Falling Star Case", icon: "☄" },
  { day: 7, label: "Title: O.G", icon: "♛" },
];

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return "";
  const diff = Math.max(0, target.getTime() - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function nextMoscowMidnight(): Date {
  // Moscow = UTC+3, no DST. Find the next moment when UTC = 21:00.
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0));
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

export function EventCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [reveals, setReveals] = useState<(boolean | null)[]>([null, null, null, null, null]);
  const [starSlot, setStarSlot] = useState<number>(0);
  const [showStar, setShowStar] = useState(false);
  const [caseResult, setCaseResult] = useState<{ tier: string | null; title: { text: string; tier: string } | null; refunded: boolean; bunker: boolean } | null>(null);

  const target = useMemo(() => nextMoscowMidnight(), [status?.last_claim_day, status?.event_day]);
  const countdown = useCountdown(target);

  async function load() {
    const { data, error } = await supabase.rpc("event_status");
    if (error) return;
    setStatus(data as unknown as Status);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  async function claim() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_event_reward");
    setClaiming(false);
    if (error) { toast.error(error.message); return; }
    const d = data as { day: number; reward: string };
    const r = REWARDS[d.day - 1];
    toast.success(`Day ${d.day} claimed — ${r.label}`);
    await load();
  }

  async function openFallingStar() {
    setOpening(true);
    setCaseOpen(true);
    setReveals([null, null, null, null, null]);
    setShowStar(false);
    setStarSlot(0);
    setCaseResult(null);
    const { data, error } = await supabase.rpc("open_falling_star_case");
    if (error) {
      toast.error(error.message);
      setOpening(false);
      setCaseOpen(false);
      return;
    }
    const d = data as {
      pre_spins: boolean[];
      spins: boolean[];
      star_slot: number;
      successes: number;
      tier: string | null;
      title: { text: string; tier: string } | null;
      refunded: boolean;
      bunker_unlocked: boolean;
    };
    // Reveal pre-spins one by one
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 450));
      setReveals((prev) => {
        const next = [...prev];
        next[i] = d.pre_spins[i];
        return next;
      });
    }
    // Falling star animation
    if (d.star_slot > 0) {
      await new Promise((r) => setTimeout(r, 600));
      setStarSlot(d.star_slot);
      setShowStar(true);
      await new Promise((r) => setTimeout(r, 900));
      setReveals((prev) => {
        const next = [...prev];
        next[d.star_slot - 1] = true;
        return next;
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    setCaseResult({
      tier: d.tier,
      title: d.title,
      refunded: d.refunded,
      bunker: d.bunker_unlocked,
    });
    setOpening(false);
    await load();
  }

  if (!status) return null;
  const showActive = status.active || status.claimed_count > 0 || status.falling_star_pending > 0;
  if (!showActive) return null;

  return (
    <section className="max-w-6xl mx-auto px-6 pt-6">
      <div className="border-2 border-secondary bg-card p-6 shadow-[6px_6px_0_0_var(--secondary)] relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-secondary">Limited Event</p>
            <h2 className="font-display text-2xl uppercase tracking-wider">Falling Star Week</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {status.active ? `Day ${status.event_day} of 7 · Next reset in ${countdown} (Moscow)` : "Event ended"}
            </p>
          </div>
          <div className="flex gap-2">
            {status.falling_star_pending > 0 && (
              <Button onClick={openFallingStar} disabled={opening} variant="secondary" className="uppercase tracking-widest font-display">
                ☄ Open Falling Star ({status.falling_star_pending})
              </Button>
            )}
            <Button
              onClick={claim}
              disabled={!status.can_claim || claiming}
              className="uppercase tracking-widest font-display"
            >
              {claiming ? "Claiming…" : status.can_claim ? `Claim Day ${status.claimed_count + 1}` : status.claimed_count >= 7 ? "All Claimed" : "Come back tomorrow"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {REWARDS.map((r, i) => {
            const claimed = i < status.claimed_count;
            const next = i === status.claimed_count && status.can_claim;
            return (
              <div
                key={r.day}
                className={[
                  "border-2 p-2 text-center transition-all",
                  claimed ? "border-primary bg-primary/10 opacity-60" :
                  next ? "border-secondary bg-secondary/10 animate-pulse" :
                  "border-border bg-muted/20",
                ].join(" ")}
              >
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Day {r.day}</div>
                <div className="text-2xl my-1">{claimed ? "✓" : r.icon}</div>
                <div className="text-[10px] leading-tight">{r.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={caseOpen} onOpenChange={(o) => { if (!opening) setCaseOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest">Falling Star Case</DialogTitle>
          </DialogHeader>
          <div className="relative grid grid-cols-5 gap-2 py-6">
            {reveals.map((v, i) => (
              <div key={i} className="relative aspect-square border-2 border-primary flex items-center justify-center bg-card overflow-visible">
                <AnimatePresence mode="wait">
                  {v === null ? (
                    <motion.div key="q" className="text-2xl text-muted-foreground" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>?</motion.div>
                  ) : v ? (
                    <motion.div key="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} className="text-3xl text-secondary">★</motion.div>
                  ) : (
                    <motion.div key="no" initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-3xl text-destructive">✗</motion.div>
                  )}
                </AnimatePresence>
                {showStar && starSlot === i + 1 && (
                  <motion.div
                    initial={{ y: -200, opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ y: 0, opacity: 1, scale: 1.4, rotate: 0 }}
                    transition={{ duration: 0.8, ease: "easeIn" }}
                    className="absolute inset-0 flex items-center justify-center text-4xl text-secondary drop-shadow-[0_0_12px_var(--secondary)] pointer-events-none"
                  >
                    ☄
                  </motion.div>
                )}
              </div>
            ))}
          </div>
          {caseResult && (
            <div className="text-center space-y-2 pt-2 border-t-2 border-border">
              {caseResult.refunded ? (
                <p className="text-sm">You own all titles in this tier — refunded as another Falling Star Case.</p>
              ) : caseResult.title ? (
                <>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{caseResult.title.tier} title</p>
                  <p className="font-display text-2xl">[{caseResult.title.text}]</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing this time.</p>
              )}
              {caseResult.bunker && (
                <p className="text-xs text-secondary uppercase tracking-widest">Bunker unlocked — visit the shop!</p>
              )}
              <Button onClick={() => setCaseOpen(false)} className="mt-2 uppercase tracking-widest font-display">Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}