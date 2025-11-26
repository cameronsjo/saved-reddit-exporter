# [Feature]: Selective Import with Preview

## 📋 Feature Description

Add the ability to preview saved items before importing and selectively choose which ones to import.

### Proposed Features

1. **Preview modal** - Show list of saved items before importing
2. **Selective import** - Checkbox to include/exclude items
3. **Filters** - Filter by subreddit, date range, content type
4. **Batch actions** - Select all, deselect all, invert selection

## 🎯 Use Case

Users who:

- Have accumulated many saved items and want to curate
- Only want specific subreddits imported
- Want to review before committing to import
- Need to import items from a specific time period

## 💡 Proposed Implementation

### New Modal Component

```typescript
class ImportPreviewModal extends Modal {
  items: RedditItem[];
  selectedIds: Set<string>;
  filters: {
    subreddit: string | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    type: 'all' | 'posts' | 'comments';
  };
}
```

### UI Elements

- Search/filter bar at top
- List of items with checkboxes
- Item preview (title, subreddit, score, date)
- "Import Selected" and "Cancel" buttons
- Selection count indicator

### Workflow

1. User clicks "Fetch saved posts"
2. Modal opens showing fetched items
3. User filters/selects items
4. User clicks "Import Selected"
5. Only selected items are processed

## ✅ Acceptance Criteria

- [ ] Preview modal shows all fetched items
- [ ] Items can be individually selected/deselected
- [ ] Filter by subreddit works
- [ ] Filter by date range works
- [ ] Filter by type (posts/comments) works
- [ ] "Select All" and "Deselect All" buttons work
- [ ] Selection count is displayed
- [ ] Only selected items are imported
- [ ] Modal can be cancelled without importing

## 🏷️ Labels

`enhancement`, `ui`, `user-experience`

## 📊 Priority

High - Major usability improvement
