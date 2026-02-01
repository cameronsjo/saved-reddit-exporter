# Sync Manager as Primary UI

**Date:** 2026-01-31
**Status:** Approved

## Overview

Make the Sync Manager the **only** way to pull/select Reddit items for import. This changes the UX from "one-click import everything" to "review and select before importing."

## Core Changes

### Entry Points

| Entry Point          | Before                | After              |
| -------------------- | --------------------- | ------------------ |
| Ribbon icon          | Direct fetch + import | Opens Sync Manager |
| `fetch-reddit-saved` | Direct fetch + import | Opens Sync Manager |
| `open-sync-manager`  | Opens Sync Manager    | _(unchanged)_      |

### Removed Commands

- `preview-reddit-import` - Redundant; Sync Manager IS the preview
- `resume-reddit-import` - Handled by checkpoint banner in Sync Manager

### Removed Code

- `PreviewModal` class in `main.ts`

## Sync Manager Enhancements

### Refresh Behavior

- **Manual refresh only** - User clicks "Refresh from Reddit" to fetch latest
- **Instant open** - Modal opens immediately with cached/last-known state
- **Last updated timestamp** - Shows when data was last fetched

### Header Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Sync Manager                          [Refresh from Reddit]│
│  Last updated: 5 minutes ago                                │
└─────────────────────────────────────────────────────────────┘
```

### Empty State

When no cached data exists:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│        Click "Refresh from Reddit" to fetch your           │
│               saved posts and comments                      │
│                                                             │
│                   [Refresh from Reddit]                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Checkpoint Resume Banner

When an interrupted import is detected:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Interrupted import detected                             │
│  23 of 87 items imported before interruption                │
│  [Resume Import]  [Discard & Start Fresh]                   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Caching

- **What's cached:** Last fetched Reddit items, last refresh timestamp
- **Storage:** Plugin's `data.json` via `loadData`/`saveData`
- **Invalidation:** Manual only (user clicks refresh)

### Flow

```
User clicks ribbon/command
        │
        ▼
   Open Sync Manager
        │
        ▼
   Has cached Reddit items?
        │
   ┌────┴────┐
   no       yes
   │         │
   ▼         ▼
 Show      Scan vault
 empty     for current state
 state           │
   │             ▼
   │      Compute sync diff
   │      (cached items vs vault)
   │             │
   │             ▼
   │      Display results
   │             │
   └──────►──────┘
               │
   User clicks "Refresh from Reddit"
               │
               ▼
         Fetch from Reddit API
               │
               ▼
         Update cache + timestamp
               │
               ▼
         Re-scan vault, recompute diff
               │
               ▼
         Update display
```

## Files to Modify

| File                  | Changes                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`         | Remove `PreviewModal`, change ribbon to open Sync Manager, redirect `fetch-reddit-saved` command, remove `preview-reddit-import` and `resume-reddit-import` commands |
| `src/sync-modal.ts`   | Add refresh button, last-updated timestamp, empty state, checkpoint resume banner, loading states                                                                    |
| `src/sync-manager.ts` | Add cache load/save methods, checkpoint detection                                                                                                                    |
| `src/types.ts`        | Add `SyncCache` interface to settings                                                                                                                                |

## Implementation Order

1. Add caching to SyncManager - Store/load Reddit items from plugin data
2. Enhance Sync Manager modal - Refresh button, timestamp, empty state, loading
3. Add checkpoint banner - Detect and display interrupted imports
4. Rewire entry points - Ribbon and commands open Sync Manager
5. Remove dead code - PreviewModal, removed commands
