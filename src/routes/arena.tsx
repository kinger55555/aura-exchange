import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatAura } from "@/lib/rank";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Lock, Users, Trophy, Ticket, Play, ArrowLeft } from "lucide-react";
import { AssemblyLine } from "@/components/minigames/assembly-line";
import { ReactorCore } from "@/components/minigames/reactor-core";
import { SynchronizedMarch } from "@/components/minigames/synchronized-march";
import { ResourceAllocation } from "@/components/minigames/resource-allocation";

export const Route = createFileRoute("/arena")({
  head: () => ({ meta: [{ title: "Arena — Absolute Communism" }] }),
  component: ArenaPage,
});

type GameWeek = {
  id: string;
  week_label: string;
  game_name: string;
  game_type: string;
  starts_at: string;
  ends_at: string;
};

type Party = {
  id: string;
  name: string;
  aura_bet: number;
  password: string | null;
  owner_id: string;
  owner: { nickname: string | null } | null;
  party_members: { user_id: string; profiles: { nickname: string | null } | null }[];
};

type GameSession = {
  id: string;
  party_id: string;
  game_type: string;
  status: string;
  aura_quota: number;
  result_data: Record<string, any> | null;
};

type TicketInfo = { used: number; total: number };

type Screen = "lobby" | "party" | "playing" | "results";

const GAME_INFO: Record<string, { name: string; desc: string }> = {
  assembly_line: { name: "The Assembly Line", desc: "Co-op clicking frenzy! Click as fast as possible for 60 seconds." },
  reactor_core: { name: "The Reactor Core", desc: "Pass the volatile core before it melts down! Survive 90 seconds." },
  synchronized_march: { name: "Synchronized March", desc: "Hit prompts at the perfect moment! Precision over speed." },
  resource_allocation: { name: "Resource Allocation", desc: "Grab crates to perfectly match the State's demands. No hoarding!" },
};

function ArenaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [gameWeek, setGameWeek] = useState<GameWeek | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [tickets, setTickets] = useState<TicketInfo>({ used: 0, total: 0 });
  const [busy, setBusy] = useState(true);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [activeParty, setActiveParty] = useState<Party | null>(null);
  const [activeSession, setActiveSession] = useState<GameSession | null>(null);
  const [starting, setStarting] = useState(false);

  // Create party dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pBet, setPBet] = useState<number>(0);
  const [pPassword, setPPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Join party dialog
  const [joinTarget, setJoinTarget] = useState<Party | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  // Result state
  const [lastResult, setLastResult] = useState<{
    multiplier: number;
    status: string;
    dissidentId?: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: gw } = await supabase.rpc("get_or_create_game_week");
      if (gw) setGameWeek(gw as GameWeek);

      await supabase.rpc("ensure_tickets");

      const today = new Date().toISOString().slice(0, 10);
      const { data: tData } = await supabase
        .from("tickets")
        .select("id, used_at, created_at")
        .eq("user_id", user.id)
        .eq("game_week_id", (gw as GameWeek)?.id)
        .gte("created_at", today);
      if (tData) {
        const used = tData.filter((t: any) => t.used_at !== null).length;
        setTickets({ used, total: tData.length });
      }

      const { data: pData } = await supabase
        .from("parties")
        .select("id, name, aura_bet, password, owner_id, owner:owner_id(nickname), party_members(user_id, profiles:user_id(nickname))")
        .eq("game_week_id", (gw as GameWeek)?.id)
        .order("created_at", { ascending: true });
      if (pData) setParties(pData as unknown as Party[]);
    } catch (err: any) {
      toast.error(err.message ?? "The State failed to load the Arena");
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    loadData();

    const ch = supabase
      .channel("arena")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "parties" }, () => loadData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_members" }, () => loadData())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "party_members" }, () => loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, user, navigate, loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_party", {
        p_name: pName.trim(),
        p_aura_bet: Number(pBet),
        p_password: pPassword.trim() || undefined,
      });
      if (error) {
        throw new Error(error.message || "The State denied your party request");
      }
      if (!data) {
        throw new Error("No party was created");
      }
      toast.success("Party forged in the spirit of the collective");
      setCreateOpen(false);
      setPName("");
      setPBet(0);
      setPPassword("");
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "The State denied your party request");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinTarget) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc("join_party", {
        p_party_id: joinTarget.id,
        p_password: joinPassword || undefined,
      });
      if (error) {
        throw new Error(error.message || "The State denied your entry");
      }
      if (!data) {
        throw new Error("Failed to join party");
      }
      toast.success(`Joined "${joinTarget.name}" — glory to the collective!`);
      setJoinTarget(null);
      setJoinPassword("");
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "The State denied your entry");
    } finally {
      setJoining(false);
    }
  }

  async function handleStartGame(partyId: string) {
    setStarting(true);
    try {
      const { data, error } = await supabase.rpc("start_game_session", { p_party_id: partyId });
      if (error) {
        throw new Error(error.message || "The State denied your shift request");
      }
      if (!data) {
        throw new Error("Failed to start game session");
      }
      setActiveSession(data as GameSession);
      setScreen("playing");
    } catch (err: any) {
      toast.error(err.message ?? "The State denied your shift request");
    } finally {
      setStarting(false);
    }
  }

  async function handleGameFinish(result: { multiplier: number; dissidentId?: string } & Record<string, any>) {
    if (!activeSession) return;
    const status = result.multiplier === 0 ? "failed" : "completed";
    try {
      const { data } = await supabase.rpc("resolve_game", {
        p_session_id: activeSession.id,
        p_status: status,
        p_result_data: result,
      });
      if (data) {
        setLastResult({ multiplier: result.multiplier, status, dissidentId: result.dissidentId });
        setScreen("results");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to resolve game");
      setScreen("lobby");
    }
    loadData();
  }

  const openPartyView = (party: Party) => {
    setActiveParty(party);
    setScreen("party");
  };

  const [timeLeft, setTimeLeft] = useState("--");

  // Update countdown every second
  useEffect(() => {
    if (!gameWeek) return;
    const updateTime = () => {
      const weekEnd = new Date(gameWeek.ends_at);
      const diff = weekEnd.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("expired");
      } else {
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        setTimeLeft(`${days}d ${hours}h`);
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [gameWeek]);

  const ticketsLeft = tickets.total - tickets.used;
  const myPartyIds = parties
    .filter((p) => p.party_members.some((m) => m.user_id === user?.id))
    .map((p) => p.id);

  const gameInfo = gameWeek ? GAME_INFO[gameWeek.game_type] ?? GAME_INFO.assembly_line : GAME_INFO.assembly_line;

  const renderMinigame = () => {
    if (!activeSession || !activeParty || !user) return null;
    const members = activeParty.party_members.map((m) => ({
      user_id: m.user_id,
      nickname: m.profiles?.nickname ?? null,
    }));

    const props = {
      sessionId: activeSession.id,
      userId: user.id,
      members,
      auraQuota: activeSession.aura_quota,
      onFinish: handleGameFinish,
    };

    switch (activeSession.game_type) {
      case "assembly_line":
        return <AssemblyLine {...props} />;
      case "reactor_core":
        return <ReactorCore {...props} onFinish={(r) => handleGameFinish(r)} />;
      case "synchronized_march":
        return <SynchronizedMarch {...props} onFinish={(r) => handleGameFinish(r)} />;
      case "resource_allocation":
        return <ResourceAllocation {...props} onFinish={(r) => handleGameFinish(r)} />;
      default:
        return <AssemblyLine {...props} />;
    }
  };

  return (
    <main className="min-h-screen">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="text-secondary text-3xl">★</span>
            <span className="font-display text-2xl uppercase tracking-wider">Absolute Communism</span>
          </Link>
          <nav className="flex gap-2">
            <Link to="/dashboard">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Dashboard
              </Button>
            </Link>
            <Link to="/leaderboard">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Leaderboard
              </Button>
            </Link>
            <Link to="/arena">
              <Button variant="ghost" className="text-primary-foreground bg-primary-foreground/10 uppercase tracking-wider text-xs">
                Arena
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ========= LOBBY ========= */}
        {screen === "lobby" && (
          <>
            {/* Hero: current game week */}
            <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">This Week's Directive</p>
                  <h1 className="font-display text-5xl uppercase text-primary mt-1">
                    {gameWeek?.game_name ?? gameInfo.name}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">{gameInfo.desc}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
                    Week {gameWeek?.week_label ?? "--"} &middot; Ends in {timeLeft}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="border-2 border-primary/30 bg-card p-4 text-center min-w-[120px]">
                    <Ticket className="mx-auto text-primary mb-1" size={28} />
                    <p className="font-display text-3xl text-primary">{ticketsLeft}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Tickets Today</p>
                  </div>
                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="uppercase tracking-widest font-display bg-primary text-primary-foreground hover:bg-primary/90 h-12"
                  >
                    Create Party
                  </Button>
                </div>
              </div>
            </section>

            {/* Rules */}
            <section className="border-2 border-primary/30 bg-card p-4">
              <h3 className="font-display text-lg uppercase text-primary">Ministry Directives</h3>
              <ul className="mt-2 space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
                <li>Minimum 3 comrades per Proletariat Party</li>
                <li>3 shifts (tickets) per day — no overwork</li>
                <li>Aura Quota is pledged before the shift begins</li>
                <li>15 seconds of inactivity = Dissident label — you lose your Quota</li>
                <li>Payout is distributed equally among loyal workers</li>
              </ul>
            </section>

            {/* Party list */}
            <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
              <h2 className="font-display text-3xl uppercase text-primary">Active Parties</h2>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
                Join a party or create your own to enter the Arena
              </p>

              {busy ? (
                <p className="mt-8 text-center font-display text-xl uppercase text-primary">Loading the Arena...</p>
              ) : parties.length === 0 ? (
                <p className="mt-8 text-center text-muted-foreground uppercase tracking-wider text-sm">
                  No parties yet. Be the first to create one.
                </p>
              ) : (
                <ul className="mt-6 divide-y-2 divide-dashed divide-primary/20">
                  {parties.map((p) => {
                    const isMember = myPartyIds.includes(p.id);
                    const isOwner = p.owner_id === user?.id;
                    const memberCount = p.party_members.length;
                    const hasPassword = p.password !== null && p.password !== "";
                    const canPlay = isMember && memberCount >= 3 && ticketsLeft > 0;
                    return (
                      <motion.li
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-4 py-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => isMember ? openPartyView(p) : undefined}
                              className={`font-mono font-bold text-primary text-lg truncate ${isMember ? "hover:underline cursor-pointer" : ""}`}
                            >
                              {p.name}
                            </button>
                            {hasPassword && <Lock size={14} className="text-muted-foreground" />}
                            {isOwner && (
                              <span className="text-[10px] uppercase tracking-widest bg-secondary text-secondary-foreground px-1.5 py-0.5">
                                Owner
                              </span>
                            )}
                            {isMember && !isOwner && (
                              <span className="text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-1.5 py-0.5">
                                Joined
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                              <Users size={12} /> {memberCount} comrade{memberCount !== 1 ? "s" : ""}
                              {memberCount < 3 && <span className="text-destructive ml-1">(need 3+)</span>}
                            </span>
                            <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                              <Trophy size={12} /> {formatAura(p.aura_bet)} Aura bet
                            </span>
                            <span className="text-xs text-muted-foreground">
                              by {p.owner?.nickname ?? "Unknown"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canPlay && (
                            <Button
                              onClick={() => handleStartGame(p.id)}
                              disabled={starting}
                              className="uppercase tracking-wider text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <Play size={14} className="mr-1" /> Start Shift
                            </Button>
                          )}
                          {!isMember && (
                            <Button
                              onClick={() => { setJoinTarget(p); setJoinPassword(""); }}
                              variant="outline"
                              className="uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                            >
                              Join
                            </Button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        {/* ========= PARTY VIEW ========= */}
        {screen === "party" && activeParty && (
          <>
            <Button
              variant="ghost"
              onClick={() => { setScreen("lobby"); setActiveParty(null); }}
              className="uppercase tracking-wider text-xs text-muted-foreground hover:text-primary"
            >
              <ArrowLeft size={14} className="mr-1" /> Back to Lobby
            </Button>

            <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
              <h2 className="font-display text-4xl uppercase text-primary">{activeParty.name}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Users size={14} /> {activeParty.party_members.length} comrade{activeParty.party_members.length !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Trophy size={14} /> {formatAura(activeParty.aura_bet)} Aura per comrade
                </span>
                {activeParty.password && (
                  <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                    <Lock size={14} /> Password protected
                  </span>
                )}
              </div>

              {/* Member list */}
              <div className="mt-6 space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Proletariat Roster</p>
                {activeParty.party_members.map((m) => (
                  <div
                    key={m.user_id}
                    className={`flex items-center gap-3 p-2 border ${
                      m.user_id === user?.id ? "border-primary bg-primary/5" : "border-primary/20"
                    }`}
                  >
                    <span className="font-mono text-sm text-primary">{m.profiles?.nickname ?? "Unknown"}</span>
                    {m.user_id === activeParty.owner_id && (
                      <span className="text-[10px] uppercase tracking-widest bg-secondary text-secondary-foreground px-1.5 py-0.5">
                        Commissar
                      </span>
                    )}
                    {m.user_id === user?.id && (
                      <span className="text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-1.5 py-0.5">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Start game */}
              <div className="mt-6 border-t-2 border-dashed border-primary/30 pt-4">
                {activeParty.party_members.length < 3 ? (
                  <p className="text-sm text-destructive uppercase tracking-widest">
                    Need at least 3 comrades to start the shift. Waiting for {3 - activeParty.party_members.length} more...
                  </p>
                ) : ticketsLeft <= 0 ? (
                  <p className="text-sm text-destructive uppercase tracking-widest">
                    No tickets remaining today. Return tomorrow, comrade.
                  </p>
                ) : (
                  <Button
                    onClick={() => handleStartGame(activeParty.id)}
                    disabled={starting}
                    className="w-full bg-primary text-primary-foreground uppercase tracking-widest font-display text-lg h-14 hover:bg-primary/90"
                  >
                    <Play size={20} className="mr-2" />
                    {starting ? "Clocking in..." : "Clock In — Start the Shift!"}
                  </Button>
                )}
              </div>
            </section>

            {/* Game info for this week */}
            <section className="border-2 border-primary/30 bg-card p-4">
              <h3 className="font-display text-lg uppercase text-primary">{gameInfo.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{gameInfo.desc}</p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">
                15s AFK = Dissident label. The Dissident loses their Quota; loyal comrades are refunded.
              </p>
            </section>
          </>
        )}

        {/* ========= PLAYING ========= */}
        {screen === "playing" && (
          <>
            <div className="text-center mb-2">
              <p className="text-xs uppercase tracking-widest text-destructive">
                INACTIVITY FOR 15s = DISSIDENT LABEL — YOU WILL LOSE YOUR AURA QUOTA
              </p>
            </div>
            {renderMinigame()}
          </>
        )}

        {/* ========= RESULTS ========= */}
        {screen === "results" && lastResult && activeParty && (
          <>
            <section className="border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_var(--primary)] text-center">
              {lastResult.status === "failed" && lastResult.dissidentId ? (
                <>
                  <motion.p
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-6xl uppercase text-destructive"
                  >
                    Dissident Detected!
                  </motion.p>
                  <p className="text-sm text-muted-foreground mt-4 uppercase tracking-widest">
                    A comrade failed to contribute. The shift has been terminated.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    The Dissident forfeits their Aura Quota. Loyal comrades are refunded in full.
                  </p>
                </>
              ) : lastResult.multiplier === 0 ? (
                <>
                  <p className="font-display text-6xl uppercase text-destructive">Substandard</p>
                  <p className="text-sm text-muted-foreground mt-4 uppercase tracking-widest">
                    The State is disappointed. Your collective output was insufficient.
                  </p>
                </>
              ) : (
                <>
                  <motion.p
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-6xl uppercase text-primary"
                  >
                    {lastResult.multiplier >= 2
                      ? "Vanguard of the Proletariat!"
                      : lastResult.multiplier >= 1.5
                        ? "Exemplary!"
                        : "Adequate"}
                  </motion.p>
                  <div className="mt-6 border-2 border-secondary bg-secondary/10 p-6 inline-block">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Payout Multiplier</p>
                    <p className="font-display text-8xl text-secondary">{lastResult.multiplier}x</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Aura distributed equally among all loyal workers.
                  </p>
                </>
              )}

              <Button
                onClick={() => {
                  setScreen("lobby");
                  setActiveParty(null);
                  setActiveSession(null);
                  setLastResult(null);
                  loadData();
                }}
                className="mt-8 bg-primary text-primary-foreground uppercase tracking-widest font-display"
              >
                Return to the Arena
              </Button>
            </section>
          </>
        )}
      </div>

      {/* Create party dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">
              Forge a Party
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label className="uppercase tracking-wider text-xs">Party Name</Label>
              <Input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                minLength={2}
                maxLength={30}
                placeholder="Red Vanguard..."
                className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">2-30 characters</p>
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Aura Bet per Player</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={pBet}
                onChange={(e) => setPBet(Number(e.target.value))}
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">Deducted from each member on join. 0 = friendly match.</p>
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Password (optional)</Label>
              <Input
                value={pPassword}
                onChange={(e) => setPPassword(e.target.value)}
                maxLength={30}
                placeholder="Leave empty for open party..."
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating} className="uppercase tracking-widest font-display">
                {creating ? "Forging..." : "Create Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join party dialog */}
      <Dialog open={!!joinTarget} onOpenChange={(o) => !o && setJoinTarget(null)}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">
              Join "{joinTarget?.name}"
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            {joinTarget && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Users size={14} /> {joinTarget.party_members.length} comrade{joinTarget.party_members.length !== 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Trophy size={14} /> {formatAura(joinTarget.aura_bet)} Aura bet
                </div>
                {joinTarget.aura_bet > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatAura(joinTarget.aura_bet)} Aura will be deducted from your balance.
                  </p>
                )}
              </div>
            )}
            {joinTarget?.password && (
              <div>
                <Label className="uppercase tracking-wider text-xs">Party Password</Label>
                <Input
                  required
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  type="password"
                  placeholder="Enter password..."
                  className="mt-1 border-2 border-primary/30 focus:border-primary"
                />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={joining} className="uppercase tracking-widest font-display">
                {joining ? "Enlisting..." : "Join Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
