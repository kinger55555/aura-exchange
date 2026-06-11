# Plan: Suitcase + Bunker (Title Gambling)

## Overview

A new shop item — **The Suitcase** (5 Aura) — runs 5 independent spins. Each spin has a **1-in-5** chance of being "good" (✓) vs "bad" (✗). The total number of good spins determines what you win:


| Good spins | Reward                                                 |
| ---------- | ------------------------------------------------------ |
| 0          | Nothing (Aura is gone)                                 |
| 1          | Random buyable **Common** title                        |
| 2          | Random buyable **Rare** title                          |
| 3          | Random buyable **Epic** title                          |
| 4          | Random buyable **Legendary** title                     |
| 5          | Random buyable **Godlike** title + **Bunker** unlocked |


Hitting 5/5 reveals a button: **Enter the Bunker**. The Bunker is a single 1-in-5 roll. On success it grants a unique **glitch title** — its text continually scrambles into random unreadable characters wherever the name appears. The Bunker can only be entered once per 5/5 suitcase, and the glitch title is one-of-a-kind per player (you can only ever own one copy).

If the randomly-rolled title is one you already own, the system picks another unowned buyable title from that tier; if you own them all in that tier, the Aura cost is refunded as **Aura** (consistent with existing duplicate handling patterns).

## User flow

1. In **Shop → Ranks & Tickets**, a new "Suitcase" card sits below Tickets, showing the cost (5 Aura), the odds, and a big **Open Suitcase** button.
2. Click → animation reveals 5 slots one-by-one (s each) flipping to ✓ or ✗ with sound-free Soviet-styled visuals (red star = good, black skull = bad). The numbers (1–5) are shown above each slot, but the actual result icon is what matters — never a number.
3. After the 5th slot, the awarded title appears with the same tier styling already used in `src/lib/rank.ts` (`tierTone`).
4. If 5/5: a sealed bunker door image appears with an **Enter the Bunker** button. Clicking runs one spin; on success the glitch title is awarded and rendered with the live scrambling effect; on failure you see "The bunker is empty."
5. Toasts confirm each award; the shop's owned titles list refreshes.

## Glitch title rendering

Currently `formatDisplayName(nickname, titleText, position)` returns a plain string used directly inside JSX in `dashboard.tsx`, `leaderboard.tsx`, `profile.$nickname.tsx`, `shop.tsx`, and the ledger rows. To support an animated title we will:

- Add a new column `titles.is_glitch BOOLEAN DEFAULT false`.
- Add a `<DisplayName>` React component (`src/components/DisplayName.tsx`) that takes `{ nickname, titleText, titlePosition, isGlitch }`. It renders the title segment as a `<GlitchText>` child when `isGlitch` is true, otherwise plain text. `<GlitchText>` keeps the real text length and replaces each character every ~80 ms with a random one from a Unicode soup (`!@#$%&*<>?/\|≡░▒▓█▄▀◊⚡` plus zalgo combiners) using `requestAnimationFrame` with throttling.
- Replace the string usages of `formatDisplayName` at the rendering call-sites with `<DisplayName>`. `formatDisplayName` stays for places that genuinely need a string (e.g. dialog titles).
- Every Supabase select that pulls `equipped_title_id` joins also pulls `is_glitch` (one extra field, minor change to existing `select` strings).

## Database changes (single migration)

1. `ALTER TABLE public.titles ADD COLUMN is_glitch BOOLEAN NOT NULL DEFAULT false;`
2. Insert one new title: tier=`Godlike`, text=`THE GLITCH`, buyable=`false`, cost=`null`, unlock_condition=`'Survive the Bunker.'`, `is_glitch=true`.
3. `CREATE FUNCTION public.open_suitcase()` — SECURITY DEFINER:
  - Locks profile row, checks balance ≥ 25, debits 25 Aura.
  - Generates 5 booleans via `random() < 0.2` each.
  - Counts successes → tier (`Common`..`Godlike`) or no-tier on 0.
  - On tier hit: picks a random row from `titles` where `tier = chosen AND buyable = true AND id NOT IN (user's owned)`. If none available, refunds 25 Gray Aura. Otherwise inserts into `user_titles`.
  - If 5 successes: sets `profiles.bunker_pending = true` (new column, default false).
  - Returns JSONB `{ spins: bool[], tier: text|null, title: {id,text,tier}|null, bunker_unlocked: bool, refunded_gray: numeric }`.
4. `CREATE FUNCTION public.enter_bunker()` — SECURITY DEFINER:
  - Checks `bunker_pending = true`, clears it atomically.
  - Rolls one `random() < 0.2`.
  - On success: grants the glitch title (skip if already owned, no double-award).
  - Returns JSONB `{ success: bool, title: {id,text,tier}|null }`.
5. `GRANT EXECUTE ON FUNCTION public.open_suitcase(), public.enter_bunker() TO authenticated;`
6. `ALTER TABLE public.profiles ADD COLUMN bunker_pending BOOLEAN NOT NULL DEFAULT false;`

All RNG happens server-side, so the client cannot influence outcomes. The functions follow the project's existing pattern (SECURITY DEFINER + balance lock + `gen_random_uuid()` selection) already used by `purchase_title` / `buy_ticket`.

## Frontend changes

- `src/routes/shop.tsx`: new `<SuitcaseCard>` section inside the Ranks tab. Local state for: `spinning`, `revealed: (boolean|null)[]`, `awarded`, `bunkerUnlocked`, `bunkerResult`. Calls `supabase.rpc('open_suitcase')` then sequentially reveals each spin from the returned array with a 400 ms timer. Uses Framer Motion for the flip animations and Soviet-styled iconography (`★` for good, `✗` for bad). After reveal, calls `loadProfile()`/`load()` to refresh balances and owned titles.
- `src/components/DisplayName.tsx` (new) + `src/components/GlitchText.tsx` (new).
- Update `src/routes/dashboard.tsx`, `src/routes/leaderboard.tsx`, `src/routes/profile.$nickname.tsx`, `src/routes/shop.tsx` (header preview), and ledger rows to fetch `is_glitch` alongside title joins and render `<DisplayName>` where they currently call `formatDisplayName`.

## Out of scope / explicit non-goals

- No leaderboard for biggest losers, no streak bonuses, no animations on the bunker beyond the single spin reveal.
- No daily limit on suitcase opens — purely Aura-gated (matches the existing economy).
- No new tier of glitch titles; just the one unique title.