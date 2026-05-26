import { useEffect, useRef, useState, useCallback } from "react";
import { useGameChannel } from "@/hooks/use-game-channel";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  sessionId: string;
  userId: string;
  members: { user_id: string; nickname: string | null }[];
  auraQuota: number;
  onFinish: (result: { multiplier: number; avgPoints: number; dissidentId?: string }) => void;
};

type Prompt = {
  id: number;
  targetTime: number; // ms from game start
  label: string;
};

type HitResult = "perfect" | "good" | "early" | "late" | "miss";

const PERFECT_WINDOW = 80; // ms
const GOOD_WINDOW = 200; // ms

export function SynchronizedMarch({ sessionId, userId, members, auraQuota, onFinish }: Props) {
  const DURATION = 60;
  const PROMPT_INTERVAL = 3000; // new prompt every 3s
  const COMBO_THRESHOLD = 0.8; // 80% of party must hit perfect for combo

  const [phase, setPhase] = useState<"countdown" | "playing" | "done">("countdown");
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [myPoints, setMyPoints] = useState(0);
  const [playerPoints, setPlayerPoints] = useState<Record<string, number>>({});
  const [comboActive, setComboActive] = useState(false);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [lastHit, setLastHit] = useState<HitResult | null>(null);
  const [activePromptId, setActivePromptId] = useState<number | null>(null);

  const startRef = useRef<number>(0);
  const promptIdxRef = useRef(0);
  const pointsRef = useRef(0);
  const hasFinished = useRef(false);
  const hitMapRef = useRef<Record<number, Record<string, { result: HitResult; points: number }>>>({});

  // Generate prompts
  useEffect(() => {
    const p: Prompt[] = [];
    const labels = ["MARCH", "HALT", "SALUTE", "TURN", "KNEEL", "RISE", "SHOUT", "BUILD"];
    for (let i = 0; i < 20; i++) {
      p.push({
        id: i,
        targetTime: 2000 + i * PROMPT_INTERVAL,
        label: labels[i % labels.length],
      });
    }
    setPrompts(p);
  }, []);

  const onAfkDetected = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    onFinish({ multiplier: 0, avgPoints: 0, dissidentId: userId });
  }, [onFinish, userId]);

  const { send, recordAction, connected } = useGameChannel({
    sessionId,
    userId,
    afkTimeoutMs: 15000,
    onAfkDetected,
    onEvent: (event) => {
      if (event.type === "hit" && event.userId !== userId) {
        const pid = event.promptId as number;
        const pts = event.points as number;
        const result = event.result as HitResult;
        if (!hitMapRef.current[pid]) hitMapRef.current[pid] = {};
        hitMapRef.current[pid][event.userId] = { result, points: pts };
        setPlayerPoints((prev) => ({ ...prev, [event.userId]: (prev[event.userId] || 0) + pts }));

        // Check combo: if enough perfects for this prompt
        const hits = hitMapRef.current[pid] || {};
        const perfectCount = Object.values(hits).filter((h) => h.result === "perfect").length;
        if (perfectCount / members.length >= COMBO_THRESHOLD && !comboActive) {
          setComboActive(true);
          setComboMultiplier(2);
          setTimeout(() => {
            setComboActive(false);
            setComboMultiplier(1);
          }, 5000);
        }
      }
      if (event.type === "dissident" && !hasFinished.current) {
        hasFinished.current = true;
        onFinish({ multiplier: 0, avgPoints: 0, dissidentId: event.userId as string });
      }
      if (event.type === "start") {
        setPhase("playing");
        startRef.current = Date.now();
      }
    },
  });

  // Game tick
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(DURATION - elapsed, 0);
      setTimeLeft(Math.ceil(left));

      // Find active prompt
      const elapsedMs = (Date.now() - startRef.current);
      const currentPrompt = prompts.find(
        (p) => elapsedMs >= p.targetTime - GOOD_WINDOW && elapsedMs <= p.targetTime + GOOD_WINDOW
      );
      setActivePromptId(currentPrompt?.id ?? null);

      if (left <= 0 && !hasFinished.current) {
        hasFinished.current = true;
        setPhase("done");
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, prompts]);

  // Calculate result when done
  useEffect(() => {
    if (phase !== "done" || hasFinished.current) return;
    hasFinished.current = true;

    const allPts: Record<string, number> = {};
    allPts[userId] = pointsRef.current;
    Object.entries(playerPoints).forEach(([uid, pts]) => {
      allPts[uid] = pts;
    });

    const total = Object.values(allPts).reduce((a, b) => a + b, 0);
    const avg = total / members.length;

    let multiplier = 0;
    if (avg >= 480) multiplier = 2.0;
    else if (avg >= 360) multiplier = 1.5;
    else if (avg >= 240) multiplier = 1.0;
    else multiplier = 0.5;

    onFinish({ multiplier, avgPoints: avg });
  }, [phase, playerPoints, userId, members.length, auraQuota, onFinish]);

  const handleHit = () => {
    if (phase !== "playing" || !activePromptId) return;
    recordAction();

    const elapsedMs = Date.now() - startRef.current;
    const prompt = prompts.find((p) => p.id === activePromptId);
    if (!prompt) return;

    const diff = Math.abs(elapsedMs - prompt.targetTime);
    let result: HitResult;
    let pts: number;

    if (diff <= PERFECT_WINDOW) {
      result = "perfect";
      pts = 30 * comboMultiplier;
    } else if (diff <= GOOD_WINDOW) {
      result = elapsedMs < prompt.targetTime ? "early" : "late";
      pts = 15 * comboMultiplier;
    } else {
      result = "miss";
      pts = -5;
    }

    pointsRef.current += pts;
    setMyPoints(pointsRef.current);
    setLastHit(result);

    if (!hitMapRef.current[prompt.id]) hitMapRef.current[prompt.id] = {};
    hitMapRef.current[prompt.id][userId] = { result, points: pts };

    send("hit", { promptId: prompt.id, result, points: pts });

    // Check combo
    const hits = hitMapRef.current[prompt.id] || {};
    const perfectCount = Object.values(hits).filter((h) => h.result === "perfect").length;
    if (perfectCount / members.length >= COMBO_THRESHOLD && !comboActive) {
      setComboActive(true);
      setComboMultiplier(2);
      setTimeout(() => {
        setComboActive(false);
        setComboMultiplier(1);
      }, 5000);
    }

    setTimeout(() => setLastHit(null), 500);
  };

  const handleStart = () => {
    send("start");
  };

  useEffect(() => {
    if (!connected || phase !== "countdown") return;
    const t = setTimeout(handleStart, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, phase]);

  const currentPrompt = prompts.find((p) => p.id === activePromptId);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="text-center">
        <h2 className="font-display text-4xl uppercase text-primary">Synchronized March</h2>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          Precision over speed! Hit the prompt at the perfect moment!
        </p>
      </div>

      {phase === "countdown" && (
        <p className="font-display text-2xl text-primary animate-pulse">Assembling the battalion...</p>
      )}

      {phase === "playing" && (
        <>
          <div className="flex items-center gap-4">
            <div className="border-2 border-primary bg-card px-6 py-3 text-center shadow-[4px_4px_0_0_var(--primary)]">
              <p className="font-display text-5xl text-primary tabular-nums">{timeLeft}s</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Time Left</p>
            </div>
            <div className="border-2 border-secondary bg-card px-6 py-3 text-center shadow-[4px_4px_0_0_var(--secondary)]">
              <p className="font-display text-5xl text-secondary tabular-nums">{myPoints}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Precision Pts</p>
            </div>
          </div>

          {/* Combo indicator */}
          {comboActive && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-secondary text-secondary-foreground px-4 py-1 font-display text-xl uppercase tracking-widest"
            >
              Collective Combo x2!
            </motion.div>
          )}

          {/* Current prompt */}
          <div className="h-24 flex items-center justify-center">
            {currentPrompt ? (
              <motion.div
                key={currentPrompt.id}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center"
              >
                <p className="font-display text-6xl uppercase text-primary">{currentPrompt.label}</p>
                <div className="w-64 h-3 border border-primary/30 bg-card mt-2 mx-auto overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: GOOD_WINDOW * 2 / 1000, ease: "linear" }}
                  />
                </div>
              </motion.div>
            ) : (
              <p className="font-display text-2xl text-muted-foreground uppercase">Wait for the command...</p>
            )}
          </div>

          {/* Hit button */}
          <button
            onClick={handleHit}
            disabled={!activePromptId}
            className={`w-36 h-36 rounded-full border-4 font-display text-xl uppercase tracking-widest transition-transform active:scale-95 ${
              activePromptId
                ? "border-primary bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                : "border-primary/20 bg-card text-muted-foreground cursor-not-allowed"
            }`}
          >
            Execute!
          </button>

          {/* Last hit result */}
          <AnimatePresence>
            {lastHit && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`font-display text-2xl uppercase ${
                  lastHit === "perfect"
                    ? "text-secondary"
                    : lastHit === "early" || lastHit === "late"
                      ? "text-primary"
                      : "text-destructive"
                }`}
              >
                {lastHit === "perfect" ? "PERFECT!" : lastHit === "early" ? "EARLY!" : lastHit === "late" ? "LATE!" : "MISS!"}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Team scores */}
          <div className="w-full border-2 border-primary/20 bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Battalion Scores</p>
            <div className="grid grid-cols-3 gap-2">
              {members.map((m) => {
                const pts = m.user_id === userId ? myPoints : (playerPoints[m.user_id] ?? 0);
                return (
                  <div key={m.user_id} className="text-center p-2 border border-primary/20">
                    <p className="font-mono text-xs text-primary truncate">{m.nickname ?? "?"}</p>
                    <p className="font-display text-2xl text-primary">{pts}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="text-center">
          <p className="font-display text-3xl text-primary">March Complete!</p>
        </div>
      )}
    </div>
  );
}
