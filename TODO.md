# Dragon Gem Chart — TODO List

> Last updated: 2026-03-26 (v0.9.0)

## Bugs / Incomplete

_(none)_

## Features — Short Term
- [x] ~~**Text size scaling**~~ — Done (v0.9.1)
- [ ] **Google OAuth** — Supabase client and AuthContext are wired for OAuth. Add Google sign-in button to LoginPage.
- [x] ~~**Data export/import**~~ — Done (v0.9.0)

## Features — Medium Term

- [ ] **Parental controls** — Store access not restricted. Add optional PIN for redemptions and settings changes.
- [ ] **Admin role separation** — Currently any authenticated user can edit everything. Add parent vs. child roles.
- [ ] **RLS policy tightening** — Current `auth_all` policy is too permissive for multi-family use. Scope policies per family/household.
- [ ] **Task reminders / notifications** — Push notifications or in-app reminders for incomplete daily tasks.

## Features — Long Term

- [ ] **Photo/evidence attachments** — Attach photos to completed tasks or bonus awards as proof.
- [ ] **Streak tracking** — Track consecutive days of task completion, award streak bonuses.
- [ ] **Gem jar themes** — Let kids pick treasure chest style (jar, chest, dragon hoard).
- [ ] **Sound effects** — Gem clink on earn, chest pour sound, celebration on store redeem.
- [ ] **Multi-family support** — Household grouping so multiple families can share a Supabase instance safely.

## Completed (v0.9.0)

- [x] Daily task management (hierarchical, subtask bonuses, CRUD, reorder)
- [x] Weekly task management (flat list, per-weekday tracking, day tabs)
- [x] Gem earning & ledger (5 source types, full transaction history)
- [x] Treasure chest (SVG gem jar, fill animation, pour/collect, pending badge)
- [x] Reward store (40 seeded rewards, affordability check, redemption history)
- [x] Bonus listening (free-form awards, delete with reversal)
- [x] Child management (add/edit/remove, 100+ avatars, 8 colors)
- [x] Multi-child support (tab switching, per-child isolation)
- [x] Offline-first sync (localStorage + write queue + Supabase push)
- [x] Supabase auth (email/password, session persistence, demo mode fallback)
- [x] Mobile-first UI (bottom tabs, gem animations, toast system)
- [x] History page (full ledger, source icons, ungiven gems banner)
- [x] Settings page (children manager, task manager, auth info)
- [x] Login page (sign in/up, error handling, dragon mascot)
- [x] Active days persistence — `active_days` column added to `supabase-schema.sql`
- [x] Weekly task edit modal — was already complete (title + gem value + save/cancel)
- [x] Manual gem adjustments — add/remove gems with note from History page
- [x] Data export/import — backup download + restore from JSON in Settings > Backup & Restore
- [x] Weekly page redesign — goal-based targets, progress bars, summary card, target bonuses
- [x] Text size scaling — Normal/Medium/Large/XL, rem-based, device-aware (phone 14px base, tablet 16px)
