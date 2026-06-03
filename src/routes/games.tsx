import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { MobileNav } from "@/components/MobileNav";
import { IdeaButton } from "@/components/IdeaButton";
import { formatAura } from "@/lib/rank";
import { Ticket, Sparkles, Users, Lock, Trash2, LogOut, Play, Zap, X, UserX } from "lucide-react";

export const Route = createFileRoute("/games")({
  head: () => ({ meta: [{ title: "Games — Absolute Communism" }] }),
  component: GamesPage,
});

type Party = {
  id: string;
  name: string;
  aura_bet: number;
  password: string | null;
  owner_id: string;
  max_players: number | null;
  current_game: string | null;
  member_count?: number;
};
type Member = { user_id: string; nickname: string | null };
type Session = {
  id: string;
  party_id: string;
  status: string;
  game_type: string;
  state: any;
  result_data: any;
};

const GAME_LABELS: Record<string, string> = {
  assembly_line: "The Assembly Line",
  reactor_core: "The Reactor Core",
  synchronized_march: "Synchronized March",
};

function GamesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [myPartyId, setMyPartyId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [tickets, setTickets] = useState({ regular: 0, special: 0 });
  const [weeklyGame, setWeeklyGame] = useState("assembly_line");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinPwd, setJoinPwd] = useState<{ id: string; pwd: string } | null>(null);

  // Create form
  const [pName, setPName] = useState("");
  const [pBet, setPBet] = useState(0);
  const [pMax, setPMax] = useState<number | "">("");
  const [pPwd, setPPwd] = useState("");

  const myParty = parties.find((p) => p.id === myPartyId) ?? null;
  const isOwner = !!user && myParty?.owner_id === user.id;

  // Auth + claim daily/monthly tickets
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    supabase.rpc("claim_tickets").then(({ data }: any) => {
      const r = Number(data?.regular_granted ?? 0);
      const s = Number(data?.special_granted ?? 0);
      if (r || s) toast.success(`Tickets granted: ${r} regular${s ? `, ${s} special` : ""}`);
    });
  }, [loading, user, navigate]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    // Current week
    const { data: weekArr } = await supabase
      .from("game_weeks")
      .select("id, game_type, game_name, starts_at")
      .order("starts_at", { ascending: false })
      .limit(1);
    const week = weekArr?.[0] as any;
    if (week) setWeeklyGame(week.game_type);

    // Parties for this week + counts
    const { data: pData } = await supabase
      .from("parties")
      .select("id,name,aura_bet,password,owner_id,max_players,current_game,game_week_id")
      .eq("game_week_id", week?.id ?? "00000000-0000-0000-0000-000000000000");
    const ps = (pData ?? []) as Party[];

    const { data: pmData } = await supabase
      .from("party_members")
      .select("party_id, user_id");
    const counts = new Map<string, number>();
    (pmData ?? []).forEach((r: any) => counts.set(r.party_id, (counts.get(r.party_id) ?? 0) + 1));
    const mine = (pmData ?? []).find((r: any) => r.user_id === user.id)?.party_id ?? null;

    setParties(ps.map((p) => ({ ...p, member_count: counts.get(p.id) ?? 0 })));
    setMyPartyId(mine);

    // My party members + nicknames
    if (mine) {
      const ids = (pmData ?? []).filter((r: any) => r.party_id === mine).map((r: any) => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, nickname").in("id", ids);
      setMembers(ids.map((uid: string) => ({
        user_id: uid,
        nickname: profs?.find((p: any) => p.id === uid)?.nickname ?? null,
      })));
      // Active session
      const { data: sess } = await supabase
        .from("game_sessions")
        .select("id, party_id, status, game_type, state, result_data")
        .eq("party_id", mine)
        .order("created_at", { ascending: false })
        .limit(1);
      setSession((sess?.[0] as any) ?? null);
    } else {
      setMembers([]);
      setSession(null);
    }

    // Tickets
    const { data: tix } = await supabase
      .from("tickets")
      .select("id, kind")
      .eq("user_id", user.id)
      .is("used_at", null);
    setTickets({
      regular: (tix ?? []).filter((t: any) => t.kind === "regular").length,
      special: (tix ?? []).filter((t: any) => t.kind === "special").length,
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadAll();
    const ch = supabase
      .channel("games-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadAll]);

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("create_party", {
      p_name: pName.trim(),
      p_aura_bet: pBet,
      p_password: pPwd || undefined,
      p_max_players: pMax === "" ? null : Number(pMax),
    });
    if (error) return toast.error(error.message);
    toast.success("Party formed");
    setCreateOpen(false);
    setPName(""); setPBet(0); setPMax(""); setPPwd("");
    loadAll();
  }

  async function joinParty(p: Party) {
    if (p.password) { setJoinPwd({ id: p.id, pwd: "" }); return; }
    const { error } = await supabase.rpc("join_party", { p_party_id: p.id });
    if (error) return toast.error(error.message);
    toast.success("Enlisted");
    loadAll();
  }

  async function submitJoinPwd(e: React.FormEvent) {
    e.preventDefault();
    if (!joinPwd) return;
    const { error } = await supabase.rpc("join_party", { p_party_id: joinPwd.id, p_password: joinPwd.pwd });
    if (error) return toast.error(error.message);
    setJoinPwd(null);
    loadAll();
  }

  async function destroy() {
    if (!myParty) return;
    if (!confirm("Destroy the party and refund everyone?")) return;
    const { error } = await supabase.rpc("destroy_party", { p_party_id: myParty.id });
    if (error) return toast.error(error.message);
    toast.success("Party disbanded");
    loadAll();
  }

  async function leave() {
    if (!myParty) return;
    const { error } = await supabase.rpc("leave_party", { p_party_id: myParty.id });
    if (error) return toast.error(error.message);
    toast.success("You left");
    loadAll();
  }

  async function kickMember(userId: string) {
    if (!myParty) return;
    if (!confirm("Remove this comrade from the party?")) return;
    const { error } = await supabase.rpc("kick_member", { p_party_id: myParty.id, p_user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Comrade removed");
    loadAll();
  }

  async function kickAllMembers() {
    if (!myParty) return;
    if (!confirm("Remove everyone except you from the party?")) return;
    const { error } = await supabase.rpc("kick_all_members", { p_party_id: myParty.id });
    if (error) return toast.error(error.message);
    toast.success("All comrades removed");
    loadAll();
  }

  async function startSession() {
    if (!myParty) return;
    const { error } = await supabase.rpc("start_game_session", { p_party_id: myParty.id });
    if (error) return toast.error(error.message);
    toast.success("Shift begins!");
    loadAll();
  }

  async function swapGame(gameType: string) {
    if (!myParty) return;
    const { error } = await supabase.rpc("swap_party_game", { p_party_id: myParty.id, p_game_type: gameType });
    if (error) return toast.error(error.message);
    toast.success(`Game switched to ${GAME_LABELS[gameType]}`);
    loadAll();
  }

  return (
    <main className="min-h-screen pb-32 bg-background">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-secondary text-2xl">★</span>
          <h1 className="font-display text-xl uppercase tracking-wider">Games</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Weekly game + tickets */}
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">This week's game</p>
          <p className="font-display text-2xl text-primary uppercase">{GAME_LABELS[weeklyGame] ?? weeklyGame}</p>
          <div className="mt-3 flex gap-3 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 border-2 border-primary/30">
              <Ticket className="size-4" /> {tickets.regular} regular
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 border-2 border-secondary/60 text-secondary-foreground bg-secondary/20">
              <Sparkles className="size-4" /> {tickets.special} special
            </span>
          </div>
        </section>

        {/* My party */}
        {myParty ? (
          <section className="border-2 border-secondary bg-card p-4 shadow-[4px_4px_0_0_var(--secondary)] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Your party</p>
                <p className="font-display text-2xl uppercase text-primary">{myParty.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bet {formatAura(myParty.aura_bet)} · {myParty.member_count}/{myParty.max_players ?? "∞"} comrades
                </p>
                <p className="text-xs uppercase mt-1">
                  Playing: <span className="text-primary font-bold">{GAME_LABELS[myParty.current_game ?? weeklyGame]}</span>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {isOwner ? (
                  <>
                    <Button onClick={destroy} variant="destructive" size="sm" className="uppercase tracking-widest">
                      <Trash2 className="size-4 mr-1" /> Destroy
                    </Button>
                    <Button onClick={kickAllMembers} variant="outline" size="sm" className="uppercase tracking-widest text-destructive border-destructive hover:bg-destructive/10">
                      <UserX className="size-4 mr-1" /> Kick All
                    </Button>
                  </>
                ) : (
                  <Button onClick={leave} variant="outline" size="sm" className="uppercase tracking-widest">
                    <LogOut className="size-4 mr-1" /> Leave
                  </Button>
                )}
              </div>
            </div>

            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-sm">
              {members.map((m) => (
                <li key={m.user_id} className="font-mono px-2 py-1 border border-dashed border-primary/30 flex items-center gap-1">
                  <Users className="size-3 text-muted-foreground" />
                  {m.nickname ?? "?"}
                  {m.user_id === myParty.owner_id && <span className="text-secondary">★</span>}
                  {isOwner && m.user_id !== user!.id && (
                    <button
                      type="button"
                      onClick={() => kickMember(m.user_id)}
                      className="ml-auto text-destructive hover:text-destructive/80"
                      title="Remove comrade"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isOwner && session?.status !== "in_progress" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-dashed border-primary/20">
                <Button onClick={startSession} className="bg-primary text-primary-foreground uppercase tracking-widest">
                  <Play className="size-4 mr-1" /> Start shift (1 ticket)
                </Button>
                {tickets.special > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => swapGame("assembly_line")}>Use special → Assembly Line</Button>
                    <Button variant="outline" size="sm" onClick={() => swapGame("reactor_core")}>Reactor Core</Button>
                    <Button variant="outline" size="sm" onClick={() => swapGame("synchronized_march")}>Synchronized March</Button>
                  </>
                )}
              </div>
            )}

            {session?.status === "in_progress" && (
              <AssemblyLinePlay session={session} userId={user!.id} onDone={loadAll} />
            )}
            {session?.status === "completed" && session.result_data && (
              <div className="border-2 border-primary/40 p-3 text-sm">
                <p className="uppercase tracking-widest text-xs text-muted-foreground">Last shift</p>
                <p>Avg {Number(session.result_data.avg).toFixed(1)} clicks · ×{session.result_data.multiplier} · +{formatAura(session.result_data.payout_per_player)} each</p>
              </div>
            )}
          </section>
        ) : (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="w-full h-12 bg-primary text-primary-foreground font-display uppercase tracking-widest">
                <Zap className="size-4 mr-2" /> Form a Party
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2 border-primary">
              <DialogHeader><DialogTitle className="font-display uppercase text-primary">New Party</DialogTitle></DialogHeader>
              <form onSubmit={createParty} className="space-y-3">
                <div>
                  <Label className="uppercase tracking-wider text-xs">Name</Label>
                  <Input required minLength={2} maxLength={30} value={pName} onChange={(e) => setPName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="uppercase tracking-wider text-xs">Aura bet</Label>
                    <Input type="number" min={0} max={100} step={0.01} value={pBet} onChange={(e) => setPBet(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="uppercase tracking-wider text-xs">Max (≥3, blank=∞)</Label>
                    <Input type="number" min={3} value={pMax} onChange={(e) => setPMax(e.target.value === "" ? "" : Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <Label className="uppercase tracking-wider text-xs">Password (optional)</Label>
                  <Input value={pPwd} onChange={(e) => setPPwd(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-primary text-primary-foreground uppercase tracking-widest font-display">Form party</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Open parties list */}
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
          <h2 className="font-display text-lg uppercase text-primary">Open Parties</h2>
          {parties.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">No parties yet. Be the vanguard.</p>
          )}
          <ul className="mt-2 divide-y-2 divide-dashed divide-primary/20">
            {parties.map((p) => {
              const full = p.max_players != null && (p.member_count ?? 0) >= p.max_players;
              return (
                <li key={p.id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display uppercase text-primary truncate">
                      {p.name} {p.password && <Lock className="inline size-3 ml-1" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bet {formatAura(p.aura_bet)} · {p.member_count}/{p.max_players ?? "∞"} · {GAME_LABELS[p.current_game ?? weeklyGame]}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!!myPartyId || full}
                    onClick={() => joinParty(p)}
                    className="uppercase tracking-widest"
                  >
                    {full ? "Full" : "Join"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <Dialog open={!!joinPwd} onOpenChange={(o) => !o && setJoinPwd(null)}>
        <DialogContent className="border-2 border-primary">
          <DialogHeader><DialogTitle className="font-display uppercase text-primary">Party Password</DialogTitle></DialogHeader>
          <form onSubmit={submitJoinPwd} className="space-y-3">
            <Input required value={joinPwd?.pwd ?? ""} onChange={(e) => setJoinPwd((j) => j && { ...j, pwd: e.target.value })} />
            <DialogFooter>
              <Button type="submit" className="bg-primary text-primary-foreground uppercase tracking-widest font-display">Enter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <IdeaButton />
      <MobileNav />
    </main>
  );
}

function AssemblyLinePlay({ session, userId, onDone }: { session: Session; userId: string; onDone: () => void }) {
  const startAt = new Date(session.state.start_at).getTime();
  const endAt = new Date(session.state.end_at).getTime();
  const windows = session.state.windows?.[userId] ?? { surge_start: 0, jam_start: 30 };
  const [now, setNow] = useState(Date.now());
  const [clicks, setClicks] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const finalizing = useRef(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(i);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startAt) / 1000));
  const remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
  const inSurge = elapsed >= windows.surge_start && elapsed < windows.surge_start + 10;
  const inJam = elapsed >= windows.jam_start && elapsed < windows.jam_start + 10;
  const ended = now >= endAt;

  function tap() {
    if (ended) return;
    let inc = 1;
    if (inJam) inc = 0;
    else if (inSurge) inc = 2;
    setClicks((c) => c + inc);
  }

  // Auto-submit and finalize when the timer ends
  useEffect(() => {
    if (!ended || submittedRef.current) return;
    submittedRef.current = true;
    (async () => {
      const { error } = await supabase.rpc("submit_assembly_clicks", { p_session_id: session.id, p_clicks: clicks });
      if (error) toast.error(error.message);
      setSubmitted(true);
      // Anyone may attempt finalize; first one wins
      if (!finalizing.current) {
        finalizing.current = true;
        const { error: e2 } = await supabase.rpc("finalize_assembly", { p_session_id: session.id });
        if (e2 && !/has not ended|already/i.test(e2.message)) toast.error(e2.message);
      }
      onDone();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  const status = inJam ? "JAMMED" : inSurge ? "STAKHANOVITE SURGE" : "WORK";

  return (
    <div className="border-2 border-primary p-4 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Assembly Line</span>
        <span className="font-mono text-lg text-primary">{remaining}s</span>
      </div>
      <p className={`text-center font-display text-3xl uppercase ${inJam ? "text-destructive" : inSurge ? "text-secondary" : "text-primary"}`}>
        {status}
      </p>
      <button
        type="button"
        onClick={tap}
        disabled={ended}
        className={`w-full h-40 font-display text-4xl uppercase tracking-widest border-4 ${
          inJam
            ? "border-destructive bg-destructive/10 text-destructive cursor-not-allowed"
            : inSurge
              ? "border-secondary bg-secondary/20 text-secondary-foreground"
              : "border-primary bg-primary text-primary-foreground active:bg-primary/80"
        }`}
      >
        {ended ? (submitted ? "Submitted" : "Submitting…") : `TAP · ${clicks}`}
      </button>
      <p className="text-xs text-center text-muted-foreground uppercase tracking-widest">
        60s shift · Surge ×2 · Jam ×0
      </p>
    </div>
  );
}