import { useEffect, useRef, useState, useCallback } from "react";
import { useGameChannel } from "@/hooks/use-game-channel";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  sessionId: string;
  userId: string;
  members: { user_id: string; nickname: string | null }[];
  auraQuota: number;
  onFinish: (result: { multiplier: number; survivalTime: number; dissidentId?: string }) => void;
};

export function ReactorCore({ sessionId, userId, members, auraQuota, onFinish }: Props) {
  const DURATION = 90;
  const INITIAL_PASS_WINDOW = 5; // seconds to pass
  const SPEEDUP_INTERVAL = 15;

  const [phase, setPhase] = useState<"countdown" | "playing" | "done">("countdown");
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [holderId, setHolderId] = useState<string>(members[0]?.user_id ?? userId);
  const [holderTimer, setHolderTimer] = useState(INITIAL_PASS_WINDOW);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [exploded, setExploded] = useState(false);

  const startRef = useRef<number>(0);
  const holderTimerRef = useRef(INITIAL_PASS_WINDOW);
  const passWindowRef = useRef(INITIAL_PASS_WINDOW);
  const hasFinished = useRef(false);

  const onAfkDetected = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    setExploded(true);
    onFinish({ multiplier: 0, survivalTime: 0, dissidentId: userId });
  }, [onFinish, userId]);

  const { send, recordAction, connected } = useGameChannel({
    sessionId,
    userId,
    afkTimeoutMs: 15000,
    onAfkDetected,
    onEvent: (event) => {
      if (event.type === "pass" && !hasFinished.current) {
        const newHolder = event.newHolder as string;
        setHolderId(newHolder);
        holderTimerRef.current = passWindowRef.current;
        setHolderTimer(passWindowRef.current);
      }
      if (event.type === "explode" && !hasFinished.current) {
        hasFinished.current = true;
        setExploded(true);
        const surv = (event.survivalTime as number) || 0;
        setSurvivalTime(surv);
        const mult = surv >= 90 ? 2.0 : surv >= 60 ? 1.0 : surv >= 30 ? 0.5 : 0;
        onFinish({ multiplier: mult, survivalTime: surv, dissidentId: event.dissidentId as string | undefined });
      }
      if (event.type === "start") {
        setPhase("playing");
        startRef.current = Date.now();
        const firstHolder = event.firstHolder as string;
        if (firstHolder) setHolderId(firstHolder);
      }
    },
  });

  // Game tick
  useEffect(() => {
    if (phase !== "playing") return;
    const tickMs = 100;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(DURATION - elapsed, 0);

      // Speed up pass window every 15s
      const speedUps = Math.floor(elapsed / SPEEDUP_INTERVAL);
      passWindowRef.current = Math.max(INITIAL_PASS_WINDOW - speedUps * 0.5, 1.5);

      setTimeLeft(Math.ceil(left));

      // If I'm the holder, tick down my personal timer
      if (holderId === userId) {
        holderTimerRef.current -= tickMs / 1000;
        setHolderTimer(Math.max(holderTimerRef.current, 0));

        if (holderTimerRef.current <= 0 && !hasFinished.current) {
          hasFinished.current = true;
          setExploded(true);
          const surv = Math.min(elapsed, DURATION);
          setSurvivalTime(surv);
          send("explode", { survivalTime: surv, dissidentId: userId });
          const mult = surv >= 90 ? 2.0 : surv >= 60 ? 1.0 : surv >= 30 ? 0.5 : 0;
          onFinish({ multiplier: mult, survivalTime: surv, dissidentId: userId });
        }
      } else {
        setHolderTimer(holderTimerRef.current);
      }

      // Survived full duration
      if (left <= 0 && !hasFinished.current) {
        hasFinished.current = true;
        setSurvivalTime(DURATION);
        setPhase("done");
        onFinish({ multiplier: 2.0, survivalTime: DURATION });
      }
    }, tickMs);

    return () => clearInterval(interval);
  }, [phase, holderId, userId, send, onFinish]);

  const handlePass = (targetId: string) => {
    if (holderId !== userId || hasFinished.current) return;
    recordAction();
    holderTimerRef.current = passWindowRef.current;
    send("pass", { newHolder: targetId });
    setHolderId(targetId);
  };

  const handleStart = () => {
    const firstIdx = Math.floor(Math.random() * members.length);
    send("start", { firstHolder: members[firstIdx]?.user_id ?? userId });
  };

  useEffect(() => {
    if (!connected || phase !== "countdown") return;
    const t = setTimeout(handleStart, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, phase]);

  const isHolder = holderId === userId;
  const holderName = members.find((m) => m.user_id === holderId)?.nickname ?? "Unknown";

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="text-center">
        <h2 className="font-display text-4xl uppercase text-primary">The Reactor Core</h2>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          Pass the core before it melts down!
        </p>
      </div>

      {phase === "countdown" && (
        <p className="font-display text-2xl text-primary animate-pulse">Stabilizing the reactor...</p>
      )}

      {phase === "playing" && !exploded && (
        <>
          <div className="flex items-center gap-4">
            <div className="border-2 border-primary bg-card px-6 py-3 text-center shadow-[4px_4px_0_0_var(--primary)]">
              <p className="font-display text-5xl text-primary tabular-nums">{timeLeft}s</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Survival Time</p>
            </div>
          </div>

          {/* Core indicator */}
          <AnimatePresence mode="wait">
            <motion.div
              key={holderId}
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`w-32 h-32 rounded-full border-4 flex items-center justify-center font-display text-lg uppercase ${
                isHolder
                  ? "border-destructive bg-destructive/20 text-destructive animate-pulse"
                  : "border-secondary bg-secondary/10 text-secondary"
              }`}
            >
              {isHolder ? "YOU HOLD IT!" : `${holderName}`}
            </motion.div>
          </AnimatePresence>

          {/* Holder timer bar */}
          {isHolder && (
            <div className="w-64 h-4 border-2 border-primary/30 bg-card overflow-hidden">
              <div
                className="h-full bg-destructive transition-all duration-100"
                style={{ width: `${(holderTimer / passWindowRef.current) * 100}%` }}
              />
            </div>
          )}

          {/* Pass buttons */}
          {isHolder && (
            <div className="flex gap-3">
              {members
                .filter((m) => m.user_id !== userId)
                .map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => handlePass(m.user_id)}
                    className="px-4 py-2 border-2 border-primary bg-primary/10 text-primary font-display uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    Pass to {m.nickname ?? "?"}
                  </button>
                ))}
            </div>
          )}

          {/* Payout info */}
          <div className="text-xs uppercase tracking-widest text-muted-foreground text-center">
            <p>30s = 0.5x | 60s = 1.0x | 90s = 2.0x</p>
            <p>Core gets hotter every 15s — pass window shrinks!</p>
          </div>
        </>
      )}

      {exploded && (
        <div className="text-center">
          <motion.p
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-display text-5xl text-destructive uppercase"
          >
            Meltdown!
          </motion.p>
          <p className="text-sm text-muted-foreground mt-2">The core exploded at {survivalTime.toFixed(1)}s</p>
        </div>
      )}

      {phase === "done" && !exploded && (
        <div className="text-center">
          <p className="font-display text-5xl text-primary uppercase">Core Stabilized!</p>
          <p className="text-sm text-muted-foreground mt-2">Full 90 seconds survived — Vanguard payout!</p>
        </div>
      )}
    </div>
  );
}
