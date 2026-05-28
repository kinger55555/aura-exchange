import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/$sessionId")({
  head: () => ({ meta: [{ title: "Russian Roulette — Absolute Communism" }] }),
  component: SessionPage,
});

type RRState = {
  phase: "playing" | "voting" | "resolved";
  turn_order: string[];
  alive: string[];
  current_idx: number;
  multiplier: number;
  rotations: number;
  presses_in_rotation: number;
  last_action_at: string;
  vote_deadline?: string;
  votes?: Record<string, boolean>;
  exploded?: string;
  dissident?: string;
  cashed_out?: boolean;
  log: { type: string; user_id: string; at: string; chance?: number }[];
};

type Session = {
  id: string;
  party_id: string;
  game_type: string;
  status: string;
  aura_quota: number;
  state: RRState;
  result_data: any;
};

function SessionPage() {
  const { sessionId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [nicks, setNicks] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [bet, setBet] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const fetchSession = useCallback(async () => {
    const { data, error } = await supabase
      .from("game_sessions")
      .select("id, party_id, game_type, status, aura_quota, state, result_data")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) return;
    setSession(data as any);

    // Load party bet + members nicknames
    const { data: party } = await supabase
      .from("parties").select("aura_bet").eq("id", (data as any).party_id).maybeSingle();
    if (party) setBet(Number((party as any).aura_bet));

    const order: string[] = (data as any).state?.turn_order ?? [];
    if (order.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, nickname").in("id", order);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.nickname ?? "???"; });
      setNicks(map);
    }
  }, [sessionId]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    fetchSession();

    const ch = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "game_sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setSession((prev) => prev ? { ...prev, ...(payload.new as any) } : (payload.new as any));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loading, user, sessionId, navigate, fetchSession]);

  const myId = user?.id;
  const state = session?.state;

  const currentTurn = useMemo(() => {
    if (!state || state.phase !== "playing") return null;
    return state.alive[state.current_idx];
  }, [state]);

  const isMyTurn = currentTurn === myId;
  const amAlive = state?.alive.includes(myId ?? "");
  const lastActionMs = state ? new Date(state.last_action_at).getTime() : 0;
  const idleSeconds = Math.max(0, Math.floor((now - lastActionMs) / 1000));
  const voteDeadlineMs = state?.vote_deadline ? new Date(state.vote_deadline).getTime() : 0;
  const voteSecondsLeft = state?.phase === "voting" ? Math.max(0, Math.ceil((voteDeadlineMs - now) / 1000)) : 0;

  async function press() {
    setBusy(true);
    const { error } = await supabase.rpc("rr_press", { p_session_id: sessionId });
    setBusy(false);
    if (error) toast.error(error.message);
  }
  async function vote(cash: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("rr_vote", { p_session_id: sessionId, p_cash_out: cash });
    setBusy(false);
    if (error) toast.error(error.message);
  }
  async function markAfk() {
    setBusy(true);
    const { error } = await supabase.rpc("rr_mark_afk", { p_session_id: sessionId });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Dissident denounced.");
  }

  if (!session || !state) {
    return <main className="min-h-screen flex items-center justify-center"><p className="font-display text-2xl uppercase text-primary">Loading shift…</p></main>;
  }

  const resolved = session.status !== "in_progress";

  return (
    <main className="min-h-screen">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/games" className="flex items-center gap-3">
            <span className="text-secondary text-3xl">★</span>
            <span className="font-display text-2xl uppercase tracking-wider">Russian Roulette</span>
          </Link>
          <Link to="/games"><Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">Back</Button></Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Status banner */}
        <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)] text-center">
          {resolved ? (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Shift concluded</p>
              {state.cashed_out && (
                <>
                  <h2 className="font-display text-4xl uppercase text-primary mt-1">Cashed out!</h2>
                  <p className="mt-2">Each comrade receives <b>{(bet * state.multiplier).toFixed(2)}</b> Aura ({state.multiplier.toFixed(2)}×).</p>
                </>
              )}
              {state.exploded && (
                <>
                  <h2 className="font-display text-4xl uppercase text-destructive mt-1">Detonation!</h2>
                  <p className="mt-2"><b>{nicks[state.exploded] ?? "Comrade"}</b> was vaporized. Survivors recover 0.5× their bet ({(bet * 0.5).toFixed(2)} Aura).</p>
                </>
              )}
              {state.dissident && (
                <>
                  <h2 className="font-display text-4xl uppercase text-destructive mt-1">Dissident exposed</h2>
                  <p className="mt-2"><b>{nicks[state.dissident] ?? "Comrade"}</b> abandoned the line. Loyal comrades refunded their bet.</p>
                </>
              )}
              <Link to="/games"><Button className="mt-4 uppercase tracking-widest font-display">Return to Games</Button></Link>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Current Multiplier</p>
              <p className="font-display text-7xl text-primary tabular-nums">{state.multiplier.toFixed(2)}×</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
                Rotation {state.rotations} · Quota {Number(session.aura_quota).toFixed(2)} Aura
              </p>
            </>
          )}
        </section>

        {/* Turn order */}
        {!resolved && (
          <section className="border-2 border-primary bg-card p-4 shadow-[6px_6px_0_0_var(--primary)]">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Comrades at the table</p>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {state.turn_order.map((uid) => {
                const aliveFlag = state.alive.includes(uid);
                const isCurrent = state.phase === "playing" && currentTurn === uid;
                const voted = state.votes && uid in (state.votes ?? {});
                return (
                  <li
                    key={uid}
                    className={`p-2 border-2 font-mono text-sm flex items-center justify-between ${
                      isCurrent ? "border-secondary bg-secondary/20" : aliveFlag ? "border-primary/40" : "border-muted opacity-40 line-through"
                    }`}
                  >
                    <span>{nicks[uid] ?? "???"}{uid === myId ? " (you)" : ""}</span>
                    {state.phase === "voting" && aliveFlag && (
                      <span className="text-[10px] uppercase tracking-widest">
                        {voted ? (state.votes![uid] ? "💰 cash" : "🎲 spin") : "…"}
                      </span>
                    )}
                    {isCurrent && <span className="text-secondary">●</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Action panel */}
        {!resolved && (
          <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)] text-center space-y-4">
            {state.phase === "playing" && (
              <>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {isMyTurn ? "Your turn, comrade" : `Awaiting ${nicks[currentTurn ?? ""] ?? "comrade"}`}
                </p>
                <Button
                  onClick={press} disabled={!isMyTurn || busy}
                  className="w-40 h-40 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-30 font-display text-3xl uppercase shadow-[0_0_40px_var(--destructive)]"
                >
                  {busy ? "…" : "Press"}
                </Button>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Idle: {idleSeconds}s {idleSeconds >= 15 && amAlive && !isMyTurn && "— may be denounced"}
                </p>
              </>
            )}

            {state.phase === "voting" && (
              <>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Rotation complete — vote!</p>
                <p className="font-display text-5xl text-primary tabular-nums">{voteSecondsLeft}s</p>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => vote(true)} disabled={!amAlive || busy || (state.votes && myId! in state.votes)}
                    className="uppercase tracking-widest font-display bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  >
                    Cash Out
                  </Button>
                  <Button
                    onClick={() => vote(false)} disabled={!amAlive || busy || (state.votes && myId! in state.votes)}
                    variant="destructive"
                    className="uppercase tracking-widest font-display"
                  >
                    Spin Again
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  Unanimous cash-out required. Otherwise the shift continues.
                </p>
              </>
            )}

            {idleSeconds >= 15 && (
              <Button onClick={markAfk} variant="outline" size="sm" disabled={busy}
                className="uppercase tracking-widest text-xs border-destructive text-destructive">
                Denounce as Dissident
              </Button>
            )}
          </section>
        )}

        {/* Log */}
        {state.log.length > 0 && (
          <section className="border-2 border-primary bg-card shadow-[6px_6px_0_0_var(--primary)]">
            <div className="p-3 border-b-2 border-dashed border-primary/30">
              <h3 className="font-display uppercase text-primary text-sm">Shift Log</h3>
            </div>
            <ul className="divide-y divide-dashed divide-primary/20 max-h-60 overflow-auto">
              {[...state.log].reverse().map((e, i) => (
                <li key={i} className="px-3 py-1.5 text-xs font-mono flex justify-between">
                  <span>
                    <b>{nicks[e.user_id] ?? "???"}</b>{" "}
                    {e.type === "safe" ? "pressed → safe" : "pressed → 💥"}
                  </span>
                  {e.chance != null && <span className="text-muted-foreground">{(e.chance * 100).toFixed(0)}%</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}