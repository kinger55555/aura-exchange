import { useEffect, useRef, useState, useCallback } from "react";
import { useGameChannel } from "@/hooks/use-game-channel";
import { motion } from "framer-motion";

type Props = {
  sessionId: string;
  userId: string;
  members: { user_id: string; nickname: string | null }[];
  auraQuota: number;
  onFinish: (result: { multiplier: number; avgClicks: number; dissidentId?: string }) => void;
};

type PlayerState = {
  clicks: number;
  surgeStart: number | null;
  fatigueStart: number | null;
  isDissident: boolean;
};

export function AssemblyLine({ sessionId, userId, members, auraQuota, onFinish }: Props) {
  const DURATION = 60;
  const SURGE_LEN = 10;
  const FATIGUE_LEN = 10;

  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [myClicks, setMyClicks] = useState(0);
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});
  const [phase, setPhase] = useState<"countdown" | "playing" | "done">("countdown");
  const [surgeActive, setSurgeActive] = useState(false);
  const [fatigueActive, setFatigueActive] = useState(false);
  const startRef = useRef<number>(0);
  const clickCountRef = useRef(0);
  const surgeStartRef = useRef<number | null>(null);
  const fatigueStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFinished = useRef(false);

  // Assign random surge/fatigue windows at mount
  useEffect(() => {
    const surgeStart = 5 + Math.random() * 35; // between 5-40s
    const fatigueStart = 5 + Math.random() * 35;
    surgeStartRef.current = surgeStart;
    fatigueStartRef.current = fatigueStart;
  }, []);

  // AFK detection
  const onAfkDetected = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    onFinish({ multiplier: 0, avgClicks: 0, dissidentId: userId });
  }, [onFinish, userId]);

  const { send, recordAction, connected } = useGameChannel({
    sessionId,
    userId,
    afkTimeoutMs: 15000,
    onAfkDetected,
    onEvent: (event) => {
      if (event.type === "click" && event.userId !== userId) {
        setPlayerStates((prev) => ({
          ...prev,
          [event.userId]: {
            ...((prev[event.userId] as PlayerState) || { clicks: 0, surgeStart: null, fatigueStart: null, isDissident: false }),
            clicks: event.totalClicks as number,
          },
        }));
      }
      if (event.type === "dissident" && !hasFinished.current) {
        hasFinished.current = true;
        onFinish({ multiplier: 0, avgClicks: 0, dissidentId: event.userId as string });
      }
      if (event.type === "start") {
        setPhase("playing");
        startRef.current = Date.now();
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
          const left = DURATION - elapsed;
          if (left <= 0) {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeLeft(0);
            setPhase("done");
            return;
          }
          setTimeLeft(left);

          // Check surge/fatigue windows
          const ss = surgeStartRef.current ?? -1;
          const fs = fatigueStartRef.current ?? -1;
          setSurgeActive(elapsed >= ss && elapsed < ss + SURGE_LEN);
          setFatigueActive(elapsed >= fs && elapsed < fs + FATIGUE_LEN);
        }, 200);
      }
    },
  });

  // When phase becomes "done", calculate result
  useEffect(() => {
    if (phase !== "done" || hasFinished.current) return;
    hasFinished.current = true;

    const allClicks: Record<string, number> = {};
    allClicks[userId] = clickCountRef.current;
    Object.entries(playerStates).forEach(([uid, st]) => {
      allClicks[uid] = st.clicks;
    });

    const totalClicks = Object.values(allClicks).reduce((a, b) => a + b, 0);
    const avgClicks = totalClicks / members.length;

    let multiplier = 0;
    if (avgClicks >= 480) multiplier = 2.0;
    else if (avgClicks >= 360) multiplier = 1.5;
    else if (avgClicks >= 240) multiplier = 1.0;
    else multiplier = 0.5;

    onFinish({ multiplier, avgClicks });
  }, [phase, playerStates, userId, members.length, auraQuota, onFinish]);

  const handleClick = () => {
    if (phase !== "playing") return;
    recordAction();

    let increment = 1;
    if (surgeActive) increment = 2;
    if (fatigueActive) increment = 0;

    clickCountRef.current += increment;
    setMyClicks(clickCountRef.current);
    send("click", { totalClicks: clickCountRef.current });
  };

  const handleStart = () => {
    send("start");
  };

  // Auto-start after 3s if host
  useEffect(() => {
    if (!connected || phase !== "countdown") return;
    const t = setTimeout(handleStart, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, phase]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="text-center">
        <h2 className="font-display text-4xl uppercase text-primary">The Assembly Line</h2>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          Click your terminal! The State demands production!
        </p>
      </div>

      {phase === "countdown" && (
        <p className="font-display text-2xl text-primary animate-pulse">Preparing the factory...</p>
      )}

      {phase === "playing" && (
        <>
          <div className="flex items-center gap-4">
            <div className="border-2 border-primary bg-card px-6 py-3 text-center shadow-[4px_4px_0_0_var(--primary)]">
              <p className="font-display text-5xl text-primary tabular-nums">{timeLeft}s</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Time Left</p>
            </div>
            <div className="border-2 border-secondary bg-card px-6 py-3 text-center shadow-[4px_4px_0_0_var(--secondary)]">
              <p className="font-display text-5xl text-secondary tabular-nums">{myClicks}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Your Output</p>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex gap-3 h-8">
            {surgeActive && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-primary text-primary-foreground px-3 py-1 text-xs uppercase tracking-widest font-display"
              >
                Stakhanovite Surge x2!
              </motion.span>
            )}
            {fatigueActive && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-destructive text-destructive-foreground px-3 py-1 text-xs uppercase tracking-widest font-display"
              >
                Worker's Fatigue x0!
              </motion.span>
            )}
          </div>

          {/* Click button */}
          <button
            onClick={handleClick}
            className={`w-40 h-40 rounded-full border-4 shadow-[6px_6px_0_0_var(--primary)] font-display text-xl uppercase tracking-widest transition-transform active:scale-95 ${
              fatigueActive
                ? "border-destructive/40 bg-destructive/10 text-destructive cursor-not-allowed"
                : surgeActive
                  ? "border-secondary bg-secondary/20 text-secondary"
                  : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {fatigueActive ? "JAMMED" : "WORK!"}
          </button>

          {/* Team overview */}
          <div className="w-full border-2 border-primary/20 bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Collective Output</p>
            <div className="grid grid-cols-3 gap-2">
              {members.map((m) => {
                const clicks = m.user_id === userId ? myClicks : (playerStates[m.user_id]?.clicks ?? 0);
                return (
                  <div key={m.user_id} className="text-center p-2 border border-primary/20">
                    <p className="font-mono text-xs text-primary truncate">{m.nickname ?? "?"}</p>
                    <p className="font-display text-2xl text-primary">{clicks}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="text-center">
          <p className="font-display text-3xl text-primary">Shift Complete!</p>
        </div>
      )}
    </div>
  );
}
