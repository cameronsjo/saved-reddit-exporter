# feat: add import history tracking and rollback capability

**Labels:** `enhancement`, `filtering`, `ux`
**Priority:** Medium

## Summary

Track import history with timestamps and provide ability to undo/rollback recent imports.

## Use Case

- "I accidentally imported with wrong filters, want to undo"
- "What did I import last week?"
- Audit trail of all imports

## Proposed Solution

### History Tracking

Store in settings:

```typescript
importHistory: Array<{
  timestamp: number;
  itemCount: number;
  filtered: number;
  skipped: number;
  filterSettings: FilterSettings;
  importedIds: string[];
}>;
```

### Rollback Feature

- "Undo last import" command
- Deletes files created in last import
- Removes IDs from importedIds list
- Shows confirmation with file count

### UI

- Import history view (modal or settings section)
- Shows last N imports with stats
- "Undo" button for each entry

## Acceptance Criteria

- [ ] Each import creates history entry
- [ ] Can view import history
- [ ] Can rollback last import (delete files)
- [ ] History limited to prevent storage bloat (last 20?)
