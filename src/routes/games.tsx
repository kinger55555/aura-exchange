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
import { Ticket, Sparkles, Users, Lock, Trash2, LogOut, Play, Zap, X, UserX, Search, UserPlus, Mail, Check, Atom } from "lucide-react";

export const Route = createFileRoute("/games")({
  head: () => ({ meta: [{ title: "Games — Absolute Communism" }] }),
  component: GamesPage,
});

type Party = {
  id: string;
  name: string;
  aura_bet: number;
  has_password: boolean | null;
  owner_id: string;
  max_players: number | null;
  current_game: string | null;
  member_count?: number;
};
type Member = { user_id: string; nickname: string | null };
type Seeker = { user_id: string; nickname: string | null; created_at: string };
type Invite = {
  id: string;
  party_id: string;
  from_user_id: string;
  party_name: string;
  aura_bet: number;
  from_nickname: string | null;
};
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
  const [search, setSearch] = useState("");
  const [seekers, setSeekers] = useState<Seeker[]>([]);
  const [iAmSeeking, setIAmSeeking] = useState(false);
  const [incomingInvites, setIncomingInvites] = useState<Invite[]>([]);
  const lastSessionRef = useRef<string | null>(null);
  const seenInvitesRef = useRef<Set<string>>(new Set());

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
      .select("id,name,aura_bet,has_password,owner_id,max_players,current_game,game_week_id")
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

    // Seekers (LFP list)
    const { data: seekRows } = await supabase
      .from("party_seekers")
      .select("user_id, created_at")
      .order("created_at", { ascending: true });
    const seekIds = (seekRows ?? []).map((r: any) => r.user_id);
    let seekProfiles: any[] = [];
    if (seekIds.length) {
      const { data } = await supabase.from("profiles").select("id, nickname").in("id", seekIds);
      seekProfiles = data ?? [];
    }
    setSeekers(
      (seekRows ?? []).map((r: any) => ({
        user_id: r.user_id,
        created_at: r.created_at,
        nickname: seekProfiles.find((p) => p.id === r.user_id)?.nickname ?? null,
      })),
    );
    setIAmSeeking(seekIds.includes(user.id));

    // Incoming invites for me
    const { data: invRows } = await supabase
      .from("party_invites")
      .select("id, party_id, from_user_id, status")
      .eq("to_user_id", user.id)
      .eq("status", "pending");
    const invPartyIds = (invRows ?? []).map((r: any) => r.party_id);
    const fromIds = (invRows ?? []).map((r: any) => r.from_user_id);
    let invParties: any[] = [];
    let invProfiles: any[] = [];
    if (invPartyIds.length) {
      const { data } = await supabase.from("parties").select("id, name, aura_bet").in("id", invPartyIds);
      invParties = data ?? [];
    }
    if (fromIds.length) {
      const { data } = await supabase.from("profiles").select("id, nickname").in("id", fromIds);
      invProfiles = data ?? [];
    }
    const newInvites: Invite[] = (invRows ?? []).map((r: any) => {
      const party = invParties.find((p) => p.id === r.party_id);
      return {
        id: r.id,
        party_id: r.party_id,
        from_user_id: r.from_user_id,
        party_name: party?.name ?? "?",
        aura_bet: Number(party?.aura_bet ?? 0),
        from_nickname: invProfiles.find((p) => p.id === r.from_user_id)?.nickname ?? null,
      };
    });
    // Toast for any genuinely new incoming invite
    newInvites.forEach((inv) => {
      if (!seenInvitesRef.current.has(inv.id)) {
        seenInvitesRef.current.add(inv.id);
        toast(`Invite from ${inv.from_nickname ?? "a comrade"} → ${inv.party_name}`);
      }
    });
    setIncomingInvites(newInvites);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadAll();
    const ch = supabase
      .channel("games-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_seekers" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_invites" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadAll]);

  // Notify members when a shift begins
  useEffect(() => {
    if (!session) { lastSessionRef.current = null; return; }
    const key = `${session.id}:${session.status}`;
    if (lastSessionRef.current === key) return;
    const prev = lastSessionRef.current;
    lastSessionRef.current = key;
    if (session.status === "in_progress" && prev !== key) {
      toast.success("Shift has begun — get to work, comrade!");
    }
  }, [session]);

  async function toggleLfp() {
    const { error } = await supabase.rpc("toggle_lfp", { p_on: !iAmSeeking });
    if (error) return toast.error(error.message);
    toast.success(iAmSeeking ? "Removed from search list" : "Listed as looking for a party");
    loadAll();
  }

  async function invitePlayer(userId: string) {
    if (!myParty) return;
    const { error } = await supabase.rpc("invite_to_party", {
      p_party_id: myParty.id, p_user_id: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Invite sent");
  }

  async function acceptInvite(id: string) {
    const { error } = await supabase.rpc("accept_party_invite", { p_invite_id: id });
    if (error) return toast.error(error.message);
    toast.success("Joined the party");
    loadAll();
  }

  async function declineInvite(id: string) {
    const { error } = await supabase.rpc("decline_party_invite", { p_invite_id: id });
    if (error) return toast.error(error.message);
    loadAll();
  }

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
    if (p.has_password) { setJoinPwd({ id: p.id, pwd: "" }); return; }
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

  async function abandonGhost() {
    if (!confirm("You are stuck in a party that no longer exists. Abandon it?")) return;
    const { error } = await supabase.rpc("abandon_party");
    if (error) return toast.error(error.message);
    toast.success("You escaped the void");
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

        {/* Incoming invites */}
        {incomingInvites.length > 0 && (
          <section className="border-2 border-secondary bg-card p-4 shadow-[4px_4px_0_0_var(--secondary)] space-y-2">
            <h2 className="font-display text-lg uppercase text-secondary-foreground flex items-center gap-2">
              <Mail className="size-4" /> Party Invites
            </h2>
            <ul className="divide-y-2 divide-dashed divide-secondary/30">
              {incomingInvites.map((inv) => (
                <li key={inv.id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display uppercase text-primary truncate">{inv.party_name}</p>
                    <p className="text-xs text-muted-foreground">
                      from {inv.from_nickname ?? "?"} · bet {formatAura(inv.aura_bet)}
                    </p>
                  </div>
                  <Button size="sm" disabled={!!myPartyId} onClick={() => acceptInvite(inv.id)} className="uppercase tracking-widest">
                    <Check className="size-3 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => declineInvite(inv.id)}>
                    <X className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

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

            {session?.status === "in_progress" && session.game_type === "assembly_line" && (
              <AssemblyLinePlay
                session={session}
                userId={user!.id}
                playerCount={Math.max(1, members.length)}
                onDone={loadAll}
              />
            )}
            {session?.status === "in_progress" && session.game_type === "reactor_core" && (
              <ReactorCorePlay
                session={session}
                userId={user!.id}
                members={members}
                onDone={loadAll}
              />
            )}
            {session?.status === "completed" && session.result_data && session.game_type === "assembly_line" && (
              <div className="border-2 border-primary/40 p-3 text-sm">
                <p className="uppercase tracking-widest text-xs text-muted-foreground">Last shift</p>
                <p>Avg {Number(session.result_data.avg).toFixed(1)} clicks · ×{session.result_data.multiplier} · +{formatAura(session.result_data.payout_per_player)} each</p>
              </div>
            )}
            {session?.status === "completed" && session.result_data && session.game_type === "reactor_core" && (
              <div className="border-2 border-primary/40 p-3 text-sm">
                <p className="uppercase tracking-widest text-xs text-muted-foreground">Last reactor run</p>
                <p>
                  {session.result_data.exploded ? "💥 Core exploded after " : "🛡 Stabilised for "}
                  {session.result_data.survived_seconds}s · ×{session.result_data.multiplier} · +{formatAura(session.result_data.payout_per_player)} each
                </p>
              </div>
            )}
          </section>
        ) : myPartyId ? (
          <section className="border-2 border-destructive bg-card p-4 shadow-[4px_4px_0_0_var(--destructive)] space-y-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Ghost party</p>
              <p className="font-display text-xl uppercase text-destructive">
                You are stuck in a party that no longer exists
              </p>
            </div>
            <Button onClick={abandonGhost} variant="destructive" className="w-full uppercase tracking-widest">
              <LogOut className="size-4 mr-1" /> Abandon Ghost Party
            </Button>
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

        {/* Looking-for-party: own toggle (when not in a party) */}
        {!myPartyId && (
          <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-base uppercase text-primary">Search for a party</p>
                <p className="text-xs text-muted-foreground">
                  Owners will see you on the comrades-seeking list and can invite you in.
                </p>
              </div>
              <Button
                onClick={toggleLfp}
                variant={iAmSeeking ? "outline" : "default"}
                className="uppercase tracking-widest"
              >
                {iAmSeeking ? "Stop searching" : "Search"}
              </Button>
            </div>
          </section>
        )}

        {/* Seekers list — only when you own a party */}
        {isOwner && (
          <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)] space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg uppercase text-primary flex items-center gap-2">
                <UserPlus className="size-4" /> Comrades Seeking a Party
              </h2>
              <span className="text-xs text-muted-foreground">{seekers.length}</span>
            </div>
            {seekers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one is searching right now.</p>
            ) : (
              <ul className="divide-y-2 divide-dashed divide-primary/20">
                {seekers.map((s) => (
                  <li key={s.user_id} className="py-2 flex items-center gap-2">
                    <Users className="size-3 text-muted-foreground" />
                    <span className="font-mono flex-1 truncate">{s.nickname ?? "?"}</span>
                    <Button
                      size="sm"
                      onClick={() => invitePlayer(s.user_id)}
                      className="uppercase tracking-widest"
                    >
                      <Mail className="size-3 mr-1" /> Invite
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Open parties list */}
        <section className="border-2 border-primary bg-card p-4 shadow-[4px_4px_0_0_var(--primary)]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-lg uppercase text-primary">Open Parties</h2>
            <span className="text-xs text-muted-foreground">{parties.length} total</span>
          </div>
          <div className="mt-2 relative">
            <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by party name…"
              className="pl-8"
            />
          </div>
          {parties.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">No parties yet. Be the vanguard.</p>
          )}
          <ul className="mt-2 divide-y-2 divide-dashed divide-primary/20">
            {parties
              .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
              .map((p) => {
              const full = p.max_players != null && (p.member_count ?? 0) >= p.max_players;
              return (
                <li key={p.id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display uppercase text-primary truncate">
                      {p.name} {p.has_password && <Lock className="inline size-3 ml-1" />}
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
          {parties.length > 0 &&
            parties.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())).length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">No parties match "{search}".</p>
            )}
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

function AssemblyLinePlay({ session, userId, playerCount, onDone }: { session: Session; userId: string; playerCount: number; onDone: () => void }) {
  const startAt = new Date(session.state.start_at).getTime();
  const endAt = new Date(session.state.end_at).getTime();
  const windows = session.state.windows?.[userId] ?? { surge_start: 0, jam_start: 30 };
  const [now, setNow] = useState(Date.now());
  const [myClicks, setMyClicks] = useState(0);
  const [teamClicks, setTeamClicks] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const finalizing = useRef(false);
  const lastClickAt = useRef(0);
  const recentClicks = useRef<number[]>([]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);

  // Shared tap channel — every member's tap adds to the team counter
  useEffect(() => {
    const ch = supabase.channel(`taps:${session.id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "tap" }, ({ payload }: any) => {
      const inc = Number(payload?.inc ?? 0);
      if (inc > 0) setTeamClicks((c) => c + inc);
    }).subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [session.id]);

  const elapsed = Math.max(0, Math.floor((now - startAt) / 1000));
  const remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
  const inSurge = elapsed >= windows.surge_start && elapsed < windows.surge_start + 10;
  const inJam = elapsed >= windows.jam_start && elapsed < windows.jam_start + 10;
  const ended = now >= endAt;

  function tap(e: React.MouseEvent | React.PointerEvent) {
    if (ended) return;
    // Anti-cheat: only trust real user input
    if (!e.isTrusted) return;
    const t = performance.now();
    // Reject auto-clickers: minimum 40ms between clicks (~25/s ceiling)
    if (t - lastClickAt.current < 40) return;
    // Rolling window: max 15 clicks per second
    recentClicks.current = recentClicks.current.filter((x) => t - x < 1000);
    if (recentClicks.current.length >= 15) return;
    recentClicks.current.push(t);
    lastClickAt.current = t;

    let inc = 1;
    if (inJam) inc = 0;
    else if (inSurge) inc = 2;
    if (inc <= 0) return;
    setMyClicks((c) => c + inc);
    setTeamClicks((c) => c + inc);
    channelRef.current?.send({ type: "broadcast", event: "tap", payload: { inc } });
  }

  // Auto-submit and finalize when the timer ends
  useEffect(() => {
    if (!ended || submittedRef.current) return;
    submittedRef.current = true;
    (async () => {
      const { error } = await supabase.rpc("submit_assembly_clicks", { p_session_id: session.id, p_clicks: myClicks });
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
  const totalSec = Math.max(1, Math.round((endAt - startAt) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const timePct = Math.min(100, ((totalSec - remaining) / totalSec) * 100);

  // Reward tiers — shared pool: per-player target × player count.
  // Each +0.5 mult costs +60 clicks per player. Ladder keeps climbing past ×2.
  const TIERS = [
    { target: 180 * playerCount, mult: 1.0, label: "×1.0" },
    { target: 240 * playerCount, mult: 1.5, label: "×1.5" },
    { target: 300 * playerCount, mult: 2.0, label: "×2.0" },
    { target: 360 * playerCount, mult: 2.5, label: "×2.5" },
    { target: 420 * playerCount, mult: 3.0, label: "×3.0" },
    { target: 480 * playerCount, mult: 3.5, label: "×3.5" },
    { target: 540 * playerCount, mult: 4.0, label: "×4.0" },
    { target: 600 * playerCount, mult: 5.0, label: "×5.0" },
  ];
  const nextTier = TIERS.find((t) => teamClicks < t.target);
  const currentMult = [...TIERS].reverse().find((t) => teamClicks >= t.target)?.label ?? "×0.5";

  return (
    <div className="border-2 border-primary p-4 mt-3 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Shift ends in</p>
          <p className={`font-display text-4xl tabular-nums ${remaining <= 10 ? "text-destructive animate-pulse" : "text-primary"}`}>
            {mm}:{ss}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Current bonus</p>
          <p className="font-display text-2xl text-secondary">{currentMult}</p>
        </div>
      </div>
      {/* Surge / Jam timeline */}
      <div className="relative h-3 bg-primary/10 border border-primary/30">
        {/* Surge window */}
        <div
          className="absolute top-0 bottom-0 bg-secondary"
          style={{
            left: `${(windows.surge_start / totalSec) * 100}%`,
            width: `${(10 / totalSec) * 100}%`,
          }}
        />
        {/* Jam window */}
        <div
          className="absolute top-0 bottom-0 bg-destructive/60"
          style={{
            left: `${(windows.jam_start / totalSec) * 100}%`,
            width: `${(10 / totalSec) * 100}%`,
          }}
        />
        {/* Current position indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-foreground"
          style={{ left: `${Math.min(100, timePct)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className={inSurge ? "text-secondary font-bold" : ""}>Surge ×2</span>
        <span className={inJam ? "text-destructive font-bold" : ""}>Jam ×0</span>
      </div>

      <div className="h-1.5 bg-primary/10 border border-primary/30">
        <div className="h-full bg-primary transition-all" style={{ width: `${timePct}%` }} />
      </div>

      {/* Reward targets */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {TIERS.map((t) => {
          const reached = teamClicks >= t.target;
          return (
            <div key={t.target} className={`border-2 p-2 ${reached ? "border-secondary bg-secondary/20" : "border-primary/30"}`}>
              <p className={`font-display text-lg ${reached ? "text-secondary" : "text-primary"}`}>{t.label}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {reached ? "✓ Locked in" : `${t.target} clicks`}
              </p>
            </div>
          );
        })}
      </div>
      {nextTier && !ended && (
        <p className="text-xs text-center text-muted-foreground uppercase tracking-widest">
          {nextTier.target - teamClicks} more team clicks → {nextTier.label}
        </p>
      )}

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
        {ended ? (submitted ? "Submitted" : "Submitting…") : `TAP · ${teamClicks}`}
      </button>
      <p className="text-xs text-center text-muted-foreground uppercase tracking-widest">
        {totalSec}s shift · Team pool ({playerCount} comrades) · Your taps: {myClicks}
      </p>
    </div>
  );
}

// Reactor Core: hot-potato pass. Holder's personal timer drains; pass to a comrade
// before it hits zero. Drain speeds up every 15 seconds. Survive 90s for ×2.0.
function ReactorCorePlay({
  session,
  userId,
  members,
  onDone,
}: {
  session: Session;
  userId: string;
  members: Member[];
  onDone: () => void;
}) {
  const startAt = new Date(session.state.start_at).getTime();
  const endAt = new Date(session.state.end_at).getTime();
  const totalSec = Math.max(1, Math.round((endAt - startAt) / 1000));
  const PERSONAL_START = 10; // seconds each player starts with
  const memberIds = members.map((m) => m.user_id);

  const [now, setNow] = useState(Date.now());
  const [holderId, setHolderId] = useState<string>(session.state.first_holder ?? memberIds[0]);
  const [holderSinceMs, setHolderSinceMs] = useState<number>(startAt);
  // Frozen remaining-seconds per player at the moment they last released the core.
  const [frozen, setFrozen] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const id of memberIds) init[id] = PERSONAL_START;
    return init;
  });
  const [phase, setPhase] = useState<"playing" | "win" | "boom">("playing");
  const finalizedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Drain multiplier ramps up every 15 seconds of game elapsed time.
  function drainRateAt(elapsedSec: number) {
    if (elapsedSec < 15) return 1.0;
    if (elapsedSec < 30) return 1.4;
    if (elapsedSec < 45) return 1.8;
    if (elapsedSec < 60) return 2.3;
    if (elapsedSec < 75) return 2.9;
    return 3.6;
  }

  // Integrate drain across a span by approximating with a 0.5s step.
  function drainedOver(fromMs: number, toMs: number) {
    if (toMs <= fromMs) return 0;
    let acc = 0;
    const stepMs = 250;
    for (let t = fromMs; t < toMs; t += stepMs) {
      const dt = Math.min(stepMs, toMs - t) / 1000;
      acc += drainRateAt(Math.max(0, (t - startAt) / 1000)) * dt;
    }
    return acc;
  }

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);

  // Realtime channel for pass / explode broadcasts.
  useEffect(() => {
    const ch = supabase.channel(`reactor:${session.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "pass" }, ({ payload }: any) => {
      const to: string = payload?.to;
      const from: string = payload?.from;
      const atMs: number = Number(payload?.at_ms);
      const fromRemaining: number = Number(payload?.from_remaining);
      if (!to || !from || !atMs) return;
      setFrozen((f) => ({ ...f, [from]: Math.max(0, fromRemaining) }));
      setHolderId(to);
      setHolderSinceMs(atMs);
    });
    ch.on("broadcast", { event: "explode" }, () => {
      setPhase("boom");
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [session.id]);

  // Compute holder's live remaining seconds.
  const holderBase = frozen[holderId] ?? PERSONAL_START;
  const holderDrained = phase === "playing" ? drainedOver(holderSinceMs, now) : 0;
  const holderRemaining = Math.max(0, holderBase - holderDrained);
  const elapsedSec = Math.max(0, Math.floor((now - startAt) / 1000));
  const gameRemainingSec = Math.max(0, Math.ceil((endAt - now) / 1000));
  const drainRate = drainRateAt(elapsedSec);
  const isHolder = holderId === userId;

  // Boom detection: holder's timer hit zero.
  useEffect(() => {
    if (phase !== "playing") return;
    if (holderRemaining > 0) return;
    setPhase("boom");
    if (isHolder && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "explode", payload: { at_ms: Date.now() } });
    }
  }, [holderRemaining, phase, isHolder]);

  // Win detection: 90s elapsed without explosion.
  useEffect(() => {
    if (phase !== "playing") return;
    if (now < endAt) return;
    setPhase("win");
  }, [now, endAt, phase]);

  // Finalize once on terminal state.
  useEffect(() => {
    if (phase === "playing" || finalizedRef.current) return;
    finalizedRef.current = true;
    const survived = phase === "win" ? 90 : Math.min(90, elapsedSec);
    (async () => {
      const { error } = await supabase.rpc("finalize_reactor", {
        p_session_id: session.id,
        p_survived_seconds: survived,
      });
      if (error && !/wrong game type|not in progress/i.test(error.message)) {
        // someone else may have finalized first — that's fine
      }
      setTimeout(onDone, 400);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function passTo(targetId: string) {
    if (!isHolder || phase !== "playing") return;
    if (targetId === userId) return;
    const atMs = Date.now();
    const remaining = holderRemaining;
    setFrozen((f) => ({ ...f, [userId]: remaining }));
    setHolderId(targetId);
    setHolderSinceMs(atMs);
    channelRef.current?.send({
      type: "broadcast",
      event: "pass",
      payload: { from: userId, to: targetId, at_ms: atMs, from_remaining: remaining },
    });
  }

  const holderNick = members.find((m) => m.user_id === holderId)?.nickname ?? "?";
  const timePct = Math.min(100, (elapsedSec / totalSec) * 100);
  const holderPct = Math.max(0, Math.min(100, (holderRemaining / PERSONAL_START) * 100));

  return (
    <div className="border-2 border-primary p-4 mt-3 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Reactor stable for</p>
          <p className={`font-display text-4xl tabular-nums ${gameRemainingSec <= 10 ? "text-secondary animate-pulse" : "text-primary"}`}>
            {String(Math.floor(gameRemainingSec / 60)).padStart(2, "0")}:
            {String(gameRemainingSec % 60).padStart(2, "0")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Drain</p>
          <p className="font-display text-2xl text-destructive">×{drainRate.toFixed(1)}</p>
        </div>
      </div>

      <div className="h-1.5 bg-primary/10 border border-primary/30">
        <div className="h-full bg-primary transition-all" style={{ width: `${timePct}%` }} />
      </div>

      {/* Holder display */}
      <div className={`border-4 p-4 text-center ${isHolder ? "border-destructive bg-destructive/10 animate-pulse" : "border-secondary bg-secondary/10"}`}>
        <Atom className={`size-12 mx-auto ${isHolder ? "text-destructive" : "text-secondary"}`} />
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          {isHolder ? "YOU hold the core" : "Held by"}
        </p>
        <p className="font-display text-2xl uppercase text-primary">{isHolder ? "Pass it NOW" : holderNick}</p>
        <div className="h-2 mt-2 bg-primary/10 border border-primary/30">
          <div
            className={`h-full transition-all ${holderPct < 30 ? "bg-destructive" : holderPct < 60 ? "bg-secondary" : "bg-primary"}`}
            style={{ width: `${holderPct}%` }}
          />
        </div>
        <p className="text-xs font-mono tabular-nums mt-1 text-muted-foreground">
          {holderRemaining.toFixed(1)}s left
        </p>
      </div>

      {/* Personal timers — frozen for non-holders, live for holder */}
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {members.map((m) => {
          const isThisHolder = m.user_id === holderId;
          const value = isThisHolder
            ? holderRemaining
            : (frozen[m.user_id] ?? PERSONAL_START);
          const pct = Math.max(0, Math.min(100, (value / PERSONAL_START) * 100));
          const canTarget = isHolder && phase === "playing" && m.user_id !== userId;
          return (
            <li key={m.user_id}>
              <button
                type="button"
                onClick={() => canTarget && passTo(m.user_id)}
                disabled={!canTarget}
                className={`w-full text-left px-2 py-2 border-2 ${
                  isThisHolder
                    ? "border-destructive bg-destructive/10"
                    : canTarget
                      ? "border-secondary bg-secondary/10 hover:bg-secondary/30 active:bg-secondary/40"
                      : "border-primary/30 bg-card"
                } ${canTarget ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono truncate flex items-center gap-1">
                    <Users className="size-3 text-muted-foreground" />
                    {m.nickname ?? "?"}
                    {m.user_id === userId && <span className="text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <span className={`text-xs font-mono tabular-nums ${pct < 30 ? "text-destructive" : "text-muted-foreground"}`}>
                    {value.toFixed(1)}s
                  </span>
                </div>
                <div className="h-1 mt-1 bg-primary/10 border border-primary/30">
                  <div
                    className={`h-full ${pct < 30 ? "bg-destructive" : pct < 60 ? "bg-secondary" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {canTarget && (
                  <p className="text-[10px] uppercase tracking-widest text-secondary mt-1">Tap to pass</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {phase === "boom" && (
        <p className="text-center font-display text-2xl uppercase text-destructive">💥 Core exploded</p>
      )}
      {phase === "win" && (
        <p className="text-center font-display text-2xl uppercase text-secondary">🛡 Reactor stabilised!</p>
      )}
      <p className="text-xs text-center text-muted-foreground uppercase tracking-widest">
        Payout · 30s ×0.5 · 60s ×1.0 · 90s ×2.0
      </p>
    </div>
  );
}