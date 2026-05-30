# Administration & Justice System

A big update. Splitting into clear phases so nothing is left half-built.

## 0. Cleanup
- Remove the Games tab and its routes from the nav (keep DB tables for now; they're inert). Drop nav buttons in dashboard & leaderboard.
- Set **David** as the Owner (looked up by nickname `David`, case-insensitive).
- Full pass to make every screen mobile-first (≤411px). Sticky bottom tab bar for Dashboard / Leaderboard / Reports.

## 1. Roles & Hierarchy
New tables:
- `staff_roles(user_id, role, hired_by, weekly_salary, hired_at)` — role ∈ `owner | admin | moderator`.
- `bans(user_id, issued_by, reason, expires_at, status)` — `status` ∈ `active | lifted | appealed`.
- `reports(id, type, priority, reporter_id, target_user_id, payload, status, assigned_to, resolution, created_at, resolved_at)` — `type` ∈ `player_report | mod_report | auraguard | aura_appeal | ban_appeal | feature_idea | minigame_idea | admin_escalation`.
- `report_actions(report_id, actor_id, action, notes, created_at)` — full audit log; quota = COUNT of these per actor per ISO week.
- `staff_checkins(user_id, day)` — unique per (user_id, day); 2 quota points each.
- `staff_warnings(user_id, week, reason)` — drives auto-demotion after 2 consecutive misses.

`has_role(user_id, role)` security-definer function + RLS scoped via it (no recursion).

## 2. Justice Dashboard `/justice`
Single mobile-first screen, content depends on role.

**Owner queue** strictly sorted:
1. Admin escalations
2. Standard reports about staff + ban appeals + aura appeals about admins
3. Feature / minigame ideas (global floating 💡 button submits here)

**Admin queue:** mod-targeted reports, aura appeals on their own mods, escalate→Owner button, hire/fire mods, set mod salaries.

**Mod queue:** player reports + AuraGuard flags. Actions: deduct Aura, dismiss, escalate to hiring Admin.

Every action writes a `report_actions` row (= 1 quota point).

## 3. Reporting flows
- Replace existing "Denounce" buttons so they open a Report dialog (player_report). Small fee (0.5 Aura) charged via existing balance.
- 🛡️ shield icon next to staff nicknames → mod_report (bypasses Mods, goes to Admins).
- Penalty appeal button on the player's own profile/transactions when penalized.
- Ban appeal screen shown when a banned user logs in; routes to Owner.
- Floating 💡 button (bottom-right, all screens) submits feature/minigame ideas → Owner P3.

## 4. AuraGuard (automated)
Postgres trigger on `transactions` + `profiles`:
- Flag if a user receives > 30 Aura in 1h, or sends ≥ 8 transfers in 5min, or balance jumps > 50 outside known RPCs.
- Inserts `reports` row of type `auraguard`, priority = mod queue.

## 5. Salary & quota
- Weekly cron (`pg_cron`, Sundays 00:05 UTC) `run_weekly_payroll()`:
  - For each staff: count `report_actions` + `staff_checkins*2` for the past ISO week.
  - ≥10 → transfer `weekly_salary` from `hired_by` profile to staff profile (Owner pays admins; Admins pay their mods; Owner's own salary skipped).
  - <10 → insert `staff_warnings`; if previous week also a warning → auto-demote (remove `staff_roles` row).
- Empty-queue check-in button shows only when queue is 0; one per UTC day; +2 points.

## 6. Bans enforcement
- Wrap `__root.tsx` auth flow: if active ban → redirect to `/banned` (appeal form). All other RPCs already gated by RLS auth, but add `is_banned(uid)` guard inside `send_aura`, `report_comrade`, `create_party`, `join_party`, report creation.

## Technical
- All new tables get GRANTs + RLS (`has_role`-based) in one migration.
- New RPCs: `submit_report`, `act_on_report`, `escalate_report`, `hire_staff`, `fire_staff`, `submit_appeal`, `staff_checkin`, `run_weekly_payroll`, `auraguard_scan` (trigger fn).
- Frontend: new routes `/justice`, `/banned`, `/admin/staff` (Owner-only hire panel). Mobile bottom nav component replaces the inline header buttons.
- Keep `dashboard.tsx` aura-send logic untouched; only swap navigation chrome.

## Out of scope (will not do unless you say so)
- Real-time websocket push for new reports (uses Supabase realtime polling on the table).
- Reworking Russian Roulette — Games tab is just hidden.
- Custom moderator chat / DM system.

Approve and I'll ship it in one pass (migration → RPCs → routes → mobile nav).
