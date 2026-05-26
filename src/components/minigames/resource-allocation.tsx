import { useEffect, useRef, useState, useCallback } from "react";
import { useGameChannel } from "@/hooks/use-game-channel";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  sessionId: string;
  userId: string;
  members: { user_id: string; nickname: string | null }[];
  auraQuota: number;
  onFinish: (result: { multiplier: number; flawlessCount: number; dissidentId?: string }) => void;
};

type Request = {
  id: number;
  resource: string;
  amount: number;
  timeLimit: number; // seconds
};

type Crate = {
  id: number;
  value: number;
};

const RESOURCES = ["Food", "Steel", "Coal", "Timber", "Oil"];
const CRATE_VALUES = [10, 25, 50];
const ROUND_TIME = 15;

export function ResourceAllocation({ sessionId, userId, members, auraQuota, onFinish }: Props) {
  const TOTAL_ROUNDS = 8;

  const [phase, setPhase] = useState<"countdown" | "playing" | "done">("countdown");
  const [round, setRound] = useState(0);
  const [currentRequest, setCurrentRequest] = useState<Request | null>(null);
  const [pool, setPool] = useState<Crate[]>([]);
  const [myGrabbed, setMyGrabbed] = useState<number[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [flawlessCount, setFlawlessCount] = useState(0);
  const [roundTimer, setRoundTimer] = useState(ROUND_TIME);
  const [roundResult, setRoundResult] = useState<"flawless" | "hoarding" | "under" | null>(null);

  const hasFinished = useRef(false);
  const flawlessRef = useRef(0);
  const teamTotalRef = useRef(0);
  const roundStartRef = useRef<number>(0);
  const myGrabbedRef = useRef<number[]>([]);

  const onAfkDetected = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    onFinish({ multiplier: 0, flawlessCount: 0, dissidentId: userId });
  }, [onFinish, userId]);

  const { send, recordAction, connected } = useGameChannel({
    sessionId,
    userId,
    afkTimeoutMs: 15000,
    onAfkDetected,
    onEvent: (event) => {
      if (event.type === "grab" && event.userId !== userId) {
        const val = event.crateValue as number;
        teamTotalRef.current += val;
        setTeamTotal(teamTotalRef.current);
      }
      if (event.type === "dissident" && !hasFinished.current) {
        hasFinished.current = true;
        onFinish({ multiplier: 0, flawlessCount: 0, dissidentId: event.userId as string });
      }
      if (event.type === "new_round") {
        const req = event.request as Request;
        const crates = event.crates as Crate[];
        setCurrentRequest(req);
        setPool(crates);
        setMyGrabbed([]);
        myGrabbedRef.current = [];
        setTeamTotal(0);
        teamTotalRef.current = 0;
        setRoundResult(null);
        setRoundTimer(ROUND_TIME);
        setRound(event.round as number);
        roundStartRef.current = Date.now();
      }
      if (event.type === "start") {
        setPhase("playing");
      }
    },
  });

  // Round timer tick
  useEffect(() => {
    if (phase !== "playing" || !currentRequest) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - roundStartRef.current) / 1000;
      const left = Math.max(ROUND_TIME - elapsed, 0);
      setRoundTimer(Math.ceil(left));

      if (left <= 0) {
        // Evaluate round
        const total = teamTotalRef.current;
        if (total === currentRequest.amount) {
          flawlessRef.current += 1;
          setFlawlessCount(flawlessRef.current);
          setRoundResult("flawless");
        } else if (total > currentRequest.amount) {
          setRoundResult("hoarding");
        } else {
          setRoundResult("under");
        }

        // Next round after brief pause
        setTimeout(() => {
          if (round >= TOTAL_ROUNDS) {
            if (!hasFinished.current) {
              hasFinished.current = true;
              setPhase("done");
              const fc = flawlessRef.current;
              let mult = 0;
              if (fc >= 7) mult = 2.0;
              else if (fc >= 5) mult = 1.5;
              else if (fc >= 3) mult = 1.0;
              else mult = 0.5;
              onFinish({ multiplier: mult, flawlessCount: fc });
            }
          } else {
            generateRound(round + 1);
          }
        }, 1500);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [phase, currentRequest, round]);

  const generateRound = useCallback(
    (roundNum: number) => {
      const resource = RESOURCES[Math.floor(Math.random() * RESOURCES.length)];
      const amount = [100, 125, 150, 175, 200][Math.floor(Math.random() * 5)];
      const req: Request = { id: roundNum, resource, amount, timeLimit: ROUND_TIME };

      // Generate crates that can sum to the target (with some distractors)
      const crates: Crate[] = [];
      let cid = 0;
      let sum = 0;
      while (sum < amount + 50) {
        const val = CRATE_VALUES[Math.floor(Math.random() * CRATE_VALUES.length)];
        crates.push({ id: cid++, value: val });
        sum += val;
      }

      send("new_round", { request: req, crates, round: roundNum });
      setCurrentRequest(req);
      setPool(crates);
      setMyGrabbed([]);
      myGrabbedRef.current = [];
      setTeamTotal(0);
      teamTotalRef.current = 0;
      setRoundResult(null);
      setRoundTimer(ROUND_TIME);
      setRound(roundNum);
      roundStartRef.current = Date.now();
    },
    [send]
  );

  const handleGrab = (crate: Crate) => {
    if (phase !== "playing" || !currentRequest) return;
    recordAction();

    const newGrabbed = [...myGrabbedRef.current, crate.value];
    myGrabbedRef.current = newGrabbed;
    setMyGrabbed(newGrabbed);
    teamTotalRef.current += crate.value;
    setTeamTotal(teamTotalRef.current);

    // Remove from pool
    setPool((prev) => prev.filter((c) => c.id !== crate.id));

    send("grab", { crateId: crate.id, crateValue: crate.value });
  };

  const handleStart = () => {
    send("start");
    generateRound(1);
  };

  useEffect(() => {
    if (!connected || phase !== "countdown") return;
    const t = setTimeout(handleStart, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, phase]);

  const mySum = myGrabbed.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="text-center">
        <h2 className="font-display text-4xl uppercase text-primary">Resource Allocation</h2>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          Take exactly what the State requires. No more, no less.
        </p>
      </div>

      {phase === "countdown" && (
        <p className="font-display text-2xl text-primary animate-pulse">Preparing supply depot...</p>
      )}

      {phase === "playing" && currentRequest && (
        <>
          <div className="flex items-center gap-4">
            <div className="border-2 border-primary bg-card px-4 py-2 text-center shadow-[4px_4px_0_0_var(--primary)]">
              <p className="font-display text-3xl text-primary">Round {round}/{TOTAL_ROUNDS}</p>
            </div>
            <div className="border-2 border-secondary bg-card px-4 py-2 text-center shadow-[4px_4px_0_0_var(--secondary)]">
              <p className="font-display text-3xl text-secondary">{flawlessCount} Flawless</p>
            </div>
          </div>

          {/* Current request */}
          <motion.div
            key={currentRequest.id}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="border-2 border-primary bg-primary/5 p-4 text-center w-full max-w-md shadow-[4px_4px_0_0_var(--primary)]"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">The State Requires</p>
            <p className="font-display text-4xl text-primary">
              {currentRequest.amount} {currentRequest.resource}
            </p>
            <div className="w-full h-2 border border-primary/20 bg-card mt-2 overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: ROUND_TIME, ease: "linear" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{roundTimer}s remaining</p>
          </motion.div>

          {/* Pool of crates */}
          <div className="w-full max-w-md">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Supply Pool</p>
            <div className="flex flex-wrap gap-2">
              {pool.map((crate) => (
                <button
                  key={crate.id}
                  onClick={() => handleGrab(crate)}
                  className={`px-4 py-3 border-2 font-display text-lg transition-transform active:scale-95 ${
                    crate.value === 50
                      ? "border-secondary bg-secondary/10 text-secondary"
                      : crate.value === 25
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-primary/40 bg-card text-primary"
                  }`}
                >
                  {crate.value}
                </button>
              ))}
            </div>
          </div>

          {/* My grabbed & team total */}
          <div className="flex gap-4 w-full max-w-md">
            <div className="flex-1 border border-primary/20 p-3 text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Your Share</p>
              <p className="font-display text-2xl text-primary">{mySum}</p>
            </div>
            <div className="flex-1 border border-primary/20 p-3 text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Collective Total</p>
              <p className={`font-display text-2xl ${
                currentRequest && teamTotal > currentRequest.amount
                  ? "text-destructive"
                  : teamTotal === currentRequest.amount
                    ? "text-secondary"
                    : "text-primary"
              }`}>
                {teamTotal} / {currentRequest.amount}
              </p>
            </div>
          </div>

          {/* Round result */}
          <AnimatePresence>
            {roundResult && (
              <motion.p
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className={`font-display text-3xl uppercase ${
                  roundResult === "flawless"
                    ? "text-secondary"
                    : roundResult === "hoarding"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {roundResult === "flawless"
                  ? "Flawless Allocation!"
                  : roundResult === "hoarding"
                    ? "Hoarding Penalty!"
                    : "Under-Supplied!"}
              </motion.p>
            )}
          </AnimatePresence>
        </>
      )}

      {phase === "done" && (
        <div className="text-center">
          <p className="font-display text-3xl text-primary">Allocation Complete!</p>
          <p className="text-sm text-muted-foreground mt-2">
            {flawlessCount} flawless allocations out of {TOTAL_ROUNDS}
          </p>
        </div>
      )}
    </div>
  );
}
