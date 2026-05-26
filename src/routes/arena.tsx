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
import { Lock, Users, Trophy, Ticket } from "lucide-react";

export const Route = createFileRoute("/arena")({
  head: () => ({ meta: [{ title: "Arena — Absolute Communism" }] }),
  component: ArenaPage,
});

type GameWeek = {
  id: string;
  week_label: string;
  game_name: string;
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
  party_members: { user_id: string }[];
};

type TicketInfo = { used: number; total: number };

function ArenaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [gameWeek, setGameWeek] = useState<GameWeek | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [tickets, setTickets] = useState<TicketInfo>({ used: 0, total: 0 });
  const [busy, setBusy] = useState(true);

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

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      // Ensure game week + tickets exist
      const { data: gw } = await supabase.rpc("get_or_create_game_week");
      if (gw) setGameWeek(gw as GameWeek);

      await supabase.rpc("ensure_tickets");

      // Load today's tickets
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

      // Load parties
      const { data: pData } = await supabase
        .from("parties")
        .select("id, name, aura_bet, password, owner_id, owner:owner_id(nickname), party_members(user_id)")
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, user, navigate, loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { error } = await supabase.rpc("create_party", {
        p_name: pName.trim(),
        p_aura_bet: pBet,
        p_password: pPassword.trim() || null,
      });
      if (error) throw error;
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
      const { error } = await supabase.rpc("join_party", {
        p_party_id: joinTarget.id,
        p_password: joinPassword || null,
      });
      if (error) throw error;
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

  const ticketsLeft = tickets.total - tickets.used;
  const myPartyIds = parties
    .filter((p) => p.party_members.some((m) => m.user_id === user?.id))
    .map((p) => p.id);

  const weekEnd = gameWeek ? new Date(gameWeek.ends_at) : null;
  const timeLeft = weekEnd
    ? (() => {
        const diff = weekEnd.getTime() - Date.now();
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        return `${days}d ${hours}h`;
      })()
    : "--";

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
        {/* Hero: current game week */}
        <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">This Week's Minigame</p>
              <h1 className="font-display text-5xl uppercase text-primary mt-1">
                {gameWeek?.game_name ?? "Loading..."}
              </h1>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
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
                        <p className="font-mono font-bold text-primary text-lg truncate">{p.name}</p>
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
                        </span>
                        <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                          <Trophy size={12} /> {formatAura(p.aura_bet)} Aura bet
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {p.owner?.nickname ?? "Unknown"}
                        </span>
                      </div>
                    </div>
                    {!isMember && (
                      <Button
                        onClick={() => { setJoinTarget(p); setJoinPassword(""); }}
                        variant="outline"
                        className="uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        Join
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>
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
