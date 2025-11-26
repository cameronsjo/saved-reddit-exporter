# [Feature]: Enhanced Progress Tracking and Import Log

## 📋 Feature Description

Add detailed progress indicators during import and maintain an import history log.

### Current Behavior

- Basic notices shown during import
- No ETA or detailed progress
- No persistent history of imports

### Proposed Features

1. **Progress modal** - Shows current item being processed
2. **Progress bar** - Visual indicator with percentage
3. **ETA calculation** - Estimated time remaining
4. **Import log** - Persistent record of all imports
5. **Error summary** - List of any failed items

## 🎯 Use Case

Users who:

- Import large batches and want to see progress
- Need to know how long an import will take
- Want to review what was imported previously
- Need to troubleshoot failed imports

## 💡 Proposed Implementation

### Progress Modal

```typescript
class ImportProgressModal extends Modal {
  totalItems: number;
  processedItems: number;
  currentItem: string;
  startTime: number;
  errors: Array<{ id: string; error: string }>;

  updateProgress(item: RedditItem): void;
  getETA(): string;
  complete(): void;
}
```

### Import Log File

Create `Reddit Saved/_import_log.md`:

```markdown
# Import Log

## 2024-01-15 14:30:00

- **Items fetched:** 150
- **Items imported:** 145
- **Items skipped:** 5 (already imported)
- **Errors:** 0
- **Duration:** 2m 34s

### Imported Items

- [Post Title 1](obsidian://...)
- [Post Title 2](obsidian://...)
  ...
```

### UI Elements

- Modal with progress bar
- Current item name/title
- Processed/Total counter
- ETA display
- Cancel button
- Error list (expandable)

## ✅ Acceptance Criteria

- [ ] Progress modal shows during import
- [ ] Progress bar updates in real-time
- [ ] Current item title displayed
- [ ] ETA calculated and displayed
- [ ] Import can be cancelled mid-process
- [ ] Import log file created/updated
- [ ] Errors collected and displayed
- [ ] Summary shown at completion

## 🏷️ Labels

`enhancement`, `ui`, `user-experience`

## 📊 Priority

Medium - Quality of life improvement
