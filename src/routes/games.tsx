import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/games")({
  head: () => ({ meta: [{ title: "People's Games — Absolute Communism" }] }),
  component: GamesPage,
});

type Week = {
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
  game_week_id: string;
  members: { user_id: string; profiles: { nickname: string | null } | null }[];
};

function GamesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [week, setWeek] = useState<Week | null>(null);
  const [ticketsLeft, setTicketsLeft] = useState<number>(0);
  const [parties, setParties] = useState<Party[]>([]);
  const [busy, setBusy] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pBet, setPBet] = useState<number>(0);
  const [pPwd, setPPwd] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinTarget, setJoinTarget] = useState<Party | null>(null);
  const [joinPwd, setJoinPwd] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    // ensure the week exists + tickets seeded for today
    await supabase.rpc("ensure_tickets");
    const wk = await supabase.rpc("get_or_create_game_week");
    const weekRow = (wk.data as Week | null) ?? null;
    setWeek(weekRow);

    if (weekRow) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data: tix } = await supabase
        .from("tickets")
        .select("id")
        .eq("user_id", user.id)
        .eq("game_week_id", weekRow.id)
        .is("used_at", null)
        .gte("created_at", startOfDay.toISOString());
      setTicketsLeft(tix?.length ?? 0);

      const { data: pData } = await supabase
        .from("parties")
        .select("id, name, aura_bet, password, owner_id, game_week_id, members:party_members(user_id, profiles(nickname))")
        .eq("game_week_id", weekRow.id)
        .order("created_at", { ascending: false });
      setParties(((pData as any) ?? []) as Party[]);
    }
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    load();
  }, [loading, user, navigate, load]);

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const { error } = await supabase.rpc("create_party", {
      p_name: pName,
      p_aura_bet: pBet,
      p_password: pPwd.trim() ? pPwd.trim() : undefined,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Party formed, comrade.");
    setCreateOpen(false);
    setPName(""); setPBet(0); setPPwd("");
    load();
  }

  async function joinParty(party: Party, pwd: string) {
    setJoining(true);
    const { error } = await supabase.rpc("join_party", {
      p_party_id: party.id,
      p_password: pwd || undefined,
    });
    setJoining(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Joined ${party.name}.`);
    setJoinTarget(null);
    setJoinPwd("");
    load();
  }

  const myId = user?.id;

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
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">Dashboard</Button>
            </Link>
            <Link to="/leaderboard">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 uppercase tracking-wider text-xs">Leaderboard</Button>
            </Link>
            <Link to="/games">
              <Button variant="ghost" className="text-primary-foreground bg-primary-foreground/10 uppercase tracking-wider text-xs">Games</Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="border-2 border-primary bg-card p-6 shadow-[6px_6px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">This week's labor competition</p>
          <h1 className="font-display text-4xl uppercase text-primary mt-1">
            {week?.game_name ?? "Awaiting decree…"}
          </h1>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Daily tickets remaining</p>
              <p className="font-display text-5xl text-primary tabular-nums">{ticketsLeft}<span className="text-2xl text-muted-foreground"> / 3</span></p>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-widest font-display"
            >
              Form a Party
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The State grants 3 tickets each day. A ticket is consumed when your party begins the labor.
          </p>
        </section>

        <section className="border-2 border-primary bg-card shadow-[6px_6px_0_0_var(--primary)]">
          <div className="p-4 border-b-2 border-dashed border-primary/30">
            <h2 className="font-display text-2xl uppercase text-primary">Active Parties</h2>
          </div>
          {busy ? (
            <p className="p-8 text-center font-display text-xl uppercase text-primary">Mustering comrades…</p>
          ) : parties.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground uppercase tracking-wider text-sm">
              No parties yet — be the first to form one.
            </p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-primary/20">
              {parties.map((p) => {
                const isMember = p.members?.some((m) => m.user_id === myId);
                const isOwner = p.owner_id === myId;
                const count = p.members?.length ?? 0;
                return (
                  <li key={p.id} className="p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold text-primary truncate flex items-center gap-2">
                        {p.name}
                        {p.password && <span title="Password protected" className="text-xs">🔒</span>}
                        {isOwner && <span className="text-[10px] uppercase tracking-widest bg-secondary text-secondary-foreground px-1.5 py-0.5">Owner</span>}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                        Bet {Number(p.aura_bet).toFixed(2)} Aura · {count} comrade{count === 1 ? "" : "s"}
                      </p>
                      {count > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {p.members.map((m) => m.profiles?.nickname ?? "?").join(", ")}
                        </p>
                      )}
                    </div>
                    <div>
                      {isMember ? (
                        <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-primary/40 text-primary">
                          Joined
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (p.password) {
                              setJoinTarget(p);
                            } else {
                              joinParty(p, "");
                            }
                          }}
                          className="uppercase tracking-widest font-display"
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">Form a Party</DialogTitle>
          </DialogHeader>
          <form onSubmit={createParty} className="space-y-4">
            <div>
              <Label className="uppercase tracking-wider text-xs">Party name</Label>
              <Input
                required minLength={2} maxLength={30}
                value={pName} onChange={(e) => setPName(e.target.value)}
                placeholder="The Red Brigade"
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Aura bet (0 – 100)</Label>
              <Input
                required type="number" min={0} max={100} step={0.01}
                value={pBet} onChange={(e) => setPBet(Number(e.target.value))}
                className="mt-1 border-2 border-primary/30 focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
                Each joining comrade locks the same bet.
              </p>
            </div>
            <div>
              <Label className="uppercase tracking-wider text-xs">Password (optional)</Label>
              <Input
                value={pPwd} onChange={(e) => setPPwd(e.target.value)}
                maxLength={40} placeholder="Leave blank for open party"
                className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating} className="uppercase tracking-widest font-display">
                {creating ? "Forming…" : "Form Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join (password) dialog */}
      <Dialog open={!!joinTarget} onOpenChange={(o) => { if (!o) { setJoinTarget(null); setJoinPwd(""); } }}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-primary text-2xl">
              Join {joinTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (joinTarget) joinParty(joinTarget, joinPwd); }}
            className="space-y-4"
          >
            <div>
              <Label className="uppercase tracking-wider text-xs">Party password</Label>
              <Input
                required autoFocus
                value={joinPwd} onChange={(e) => setJoinPwd(e.target.value)}
                className="mt-1 border-2 border-primary/30 focus:border-primary font-mono"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={joining} className="uppercase tracking-widest font-display">
                {joining ? "Joining…" : "Join Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}