# Absolute Communism — Build Plan

A themed social appreciation app where comrades reward each other with "Aura". Built on TanStack Start + Lovable Cloud (Supabase under the hood) for auth, database, and server-enforced rules.

## 1. Backend (Lovable Cloud)

### Auth

- Enable Lovable Cloud
- Email/password auth (no nickname at signup — picked after first login)
- Auto-create profile row via DB trigger on `auth.users` insert

### Tables (migration)

`profiles`

- `id` uuid PK, FK → `auth.users(id)` on delete cascade
- `nickname` text unique, nullable (set after first login)
- `aura_balance` numeric(12,2) not null default 100
- `created_at` timestamptz default now()

`transactions`

- `id` uuid PK default gen_random_uuid()
- `sender_id` uuid FK → profiles(id)
- `receiver_id` uuid FK → profiles(id)
- `amount_sent` numeric(12,2) not null
- `amount_received` numeric(12,2) not null  (sent * 1.5, stored for ledger clarity)
- `message` text (optional, length-capped)
- `created_at` timestamptz default now() — indexed for 24h window queries

### RLS

- `profiles`: anyone authenticated can SELECT (needed for nickname lookup + ledger display names); only self can UPDATE own nickname (and only if currently null, to enforce uniqueness/immutability of choice — TBD if editable)
- `transactions`: authenticated SELECT (public ledger); no direct INSERT/UPDATE/DELETE from clients — all writes go through a SECURITY DEFINER RPC

### `send_aura` Postgres function (SECURITY DEFINER)

Atomic transfer enforcing all rules server-side:

1. Resolve recipient by nickname (case-insensitive); error if not found or self
2. Validate `amount > 0` and `amount <= 10`
3. Compute sum of `amount_sent` by sender in last 24h; reject if `sum + amount > 0.10 * sender.aura_balance`
4. Reject if sender balance < amount
5. Deduct `amount` from sender, credit `amount * 1.5` to receiver
6. Insert transaction row
7. Return new sender balance

All limit checks live here so the client cannot bypass them.

### Nickname setup

- `set_nickname(nickname text)` RPC: validates uniqueness, format (3–20 chars, alphanumeric/underscore), assigns to current user

## 2. Frontend (TanStack Start)

### Routes

- `/` — landing/login (themed hero + auth form)
- `/onboarding` — nickname picker (shown if profile.nickname is null)
- `/_authenticated/dashboard` — main app
- `_authenticated.tsx` layout guards via `beforeLoad` redirect

### Dashboard sections

- **Comrade card**: nickname, rank badge, current Aura balance (large, gold)
- **Send Aura form**: recipient nickname, amount (1–10), optional message
- **Recent Good Deeds ledger**: live list of recent transactions (`sender → receiver: +X Aura — "message"`), polled or realtime-subscribed

### Rank (client-side helper)

```
< 0       → Absolute Loser
0–99      → Peasant
100–499   → Comrade
500–999   → Commissar
1000+     → Stalin
```

Display next to nickname everywhere it appears (header, ledger entries).

### Error handling

Server RPC errors mapped to thematic toasts via sonner:

- "Transaction denied by the State: limit exceeded"
- "The State does not recognize this comrade"
- "Insufficient Aura, comrade"

### Success animation

Framer Motion: gold star + hammer/sickle motif rises and fades from the send button on successful transfer; balance counter animates down, ledger prepends new row with slide-in.

## 3. Design System

Propaganda aesthetic via tokens in `src/styles.css`:

- **Palette** (oklch): deep crimson red primary, antique gold accent, off-white/cream background, near-black ink
- **Typography**: bold display serif/slab for headings (e.g., Abril Fatface or Bebas Neue), clean sans for body
- **Motifs**: subtle star/hammer-sickle SVG accents, heavy rules, poster-style headings in uppercase with tight tracking
- Card surfaces with cream background, red borders, gold dividers

All colors via semantic tokens — no raw hex in components.

## 4. Technical Notes

- Server enforcement via Postgres SECURITY DEFINER function (not edge functions) — atomic, transactional, race-safe
- Nickname lookup case-insensitive (store original case, compare lowercased)
- Numeric type for balances to handle 1.5x multiplier cleanly
- Realtime subscription on `transactions` table for live ledger updates
- Auth state listener at root invalidates router + query cache on sign-in/out

## 5. Out of Scope (confirm if needed)

- Password reset flow
- Nickname editing after first set
- Pagination on ledger (will show latest 50)
- Leaderboard / top comrades view add this
- Social providers (Google/Apple) — email/password only unless requested add this
  &nbsp;