# UTC Date Sync Bug — Post-Mortem

**Date:** April 5, 2026
**Versions:** v1.5.2 through v1.5.16
**Status:** Resolved in v1.5.16

## The Problem

Task completions checked off on one device were not syncing to other devices, even though gem counts synced correctly. The issue only manifested in evening hours (after 8 PM EDT / midnight UTC).

## Root Cause

Two different date functions were used across the app:

| Location | Function | Method | Result at 9 PM EDT |
|----------|----------|--------|---------------------|
| `DailyPage.js:14` | `toDateStr()` | `toISOString().split('T')[0]` | `2026-04-06` (UTC) |
| `offlineFirst.js:20` | `todayStr()` | `getFullYear/getMonth/getDate` | `2026-04-05` (local) |

`DailyPage` stored and read completions using the UTC date key (`2026-04-06`), but `offlineFirst.js` queried Supabase and stored data using the local date key (`2026-04-05`). After 8 PM EDT (midnight UTC), these disagreed.

### Why gems synced but completions didn't

The gem ledger is not filtered by date — it pulls ALL entries for a child. Completions are filtered by `completion_date`, so the date mismatch caused queries to return 0 results.

### Why it worked during the day

Before 8 PM EDT (midnight UTC), both functions returned the same date string. The bug only appeared when UTC rolled over to the next day while local time was still on the current day.

## The Fix

One-line change in `offlineFirst.js`:

```javascript
// BEFORE (local time)
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// AFTER (UTC — matches DailyPage and Supabase)
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
```

## Other Fixes Applied During Investigation

These were secondary issues discovered during debugging:

1. **Foreground re-sync (v1.5.3):** Added `visibilitychange` handler in `AppContext.js` to run `backgroundSync()` when the app returns from background. Without this, the phone relied on a 60-second interval timer that browsers pause for backgrounded tabs.

2. **Stale pending ops (v1.5.8):** Added 30-second TTL to pending operation tracking. Previously, if a `tryPush()` callback never fired (app backgrounded mid-request), the pending flag stayed forever and blocked both Realtime events and background sync merges.

3. **Sync debug panel (v1.5.2):** Added to Settings page for diagnosing sync issues on devices without dev tools access. Shows: sync status, write queue, pending ops, last server pull results, and today's local completions.

## The Rule

**All date keys, queries, and comparisons must use UTC (`toISOString().split('T')[0]`).**

Supabase stores dates in UTC. The DailyPage reads dates in UTC. The sync layer must match.

This applies to any future date-keyed data:
- Daily completions
- Weekly completions (less sensitive since it uses Monday-of-week)
- Any new date-filtered tables

## Applicability to CapitalCurrent Inventory

When adding Supabase sync to the inventory/jobs app, the same rule applies:

- **Job clock shifts** — shift start/end times crossing midnight UTC
- **Purchase order dates** — created/received date filtering
- **Inventory timestamps** — `modifiedAt` comparisons during sync conflict resolution
- **Any "today" queries** — "today's jobs", "this week's POs", daily reports

**Never mix `getDate()` (local) with `toISOString()` (UTC) for date keys or Supabase queries.**

## Debugging Timeline

| Version | Change | Result |
|---------|--------|--------|
| v1.5.2 | Added sync debug panel | Showed 0 completions on server |
| v1.5.3 | Foreground re-sync + stale pending cleanup | Partial improvement |
| v1.5.5 | Added sync timestamps to debug panel | Confirmed backgroundSync running |
| v1.5.7 | Race condition fix (await queue before sync) | 3/4 synced |
| v1.5.8 | 30s TTL on pending ops | 2/4 synced |
| v1.5.9 | Trust server on foreground (clear all pending) | Broke active sync |
| v1.5.12 | Added server pull logging | Confirmed server returning 0 |
| v1.5.13 | Date range queries + Realtime normalization | Broke wife's phone |
| v1.5.15 | Reverted over-engineering | Still broken |
| **v1.5.16** | **`todayStr()` → UTC** | **4/4 sync, all scenarios** |

Key lesson: The PC console log showing `key=..._2026-04-06, today=2026-04-05, match=false` was the breakthrough that identified the root cause.
