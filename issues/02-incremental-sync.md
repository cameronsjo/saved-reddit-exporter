# [Feature]: Incremental Sync and Auto-Refresh

## 📋 Feature Description

Add the ability to automatically sync new saved items and optionally refresh existing posts with updated scores/comments.

### Proposed Features

1. **Scheduled sync** - Automatically check for new saved items on a schedule
2. **Sync on startup** - Option to sync when Obsidian opens
3. **Re-fetch existing** - Update scores and comment counts on already-imported posts
4. **Sync status indicator** - Show last sync time and status

## 🎯 Use Case

Users who:

- Regularly save Reddit content want automatic imports
- Want to keep scores/comment counts current
- Don't want to manually trigger imports
- Need to know when the last successful sync occurred

## 💡 Proposed Implementation

### Settings to Add

```typescript
interface RedditSavedSettings {
  // ... existing settings
  autoSyncEnabled: boolean; // default: false
  autoSyncInterval: number; // minutes, default: 60
  syncOnStartup: boolean; // default: false
  refreshExistingPosts: boolean; // default: false
  lastSyncTime: number; // timestamp
}
```

### Core Changes

- Add background sync timer using Obsidian's `registerInterval`
- Create `syncNewItems()` method that only fetches items newer than last sync
- Create `refreshExistingPosts()` to update frontmatter on existing files
- Store sync state in settings

### UI Changes

- Add "Auto-sync" section in settings
- Show last sync time
- Add manual "Sync now" button
- Status bar indicator showing sync status

## ✅ Acceptance Criteria

- [ ] User can enable/disable automatic sync
- [ ] User can set sync interval (15 min to 24 hours)
- [ ] User can enable sync on Obsidian startup
- [ ] Last sync time displayed in settings
- [ ] Manual sync button available
- [ ] Sync respects rate limits
- [ ] Sync continues where it left off if interrupted

## 🏷️ Labels

`enhancement`, `sync`, `automation`

## 📊 Priority

High - Major workflow improvement
