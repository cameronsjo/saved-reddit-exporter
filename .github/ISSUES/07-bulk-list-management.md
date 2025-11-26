# feat: improve bulk list management for subreddits/authors

**Labels:** `enhancement`, `filtering`, `ux`
**Priority:** Low

## Summary

Better UI for managing large lists of subreddits, authors, and domains.

## Current Problem

- Text areas work but are clunky for large lists
- No way to import from external sources
- No sorting or searching

## Proposed Solution

### Import Options

- Import from text file (one item per line)
- Import subreddits from Reddit subscription list (if API supports)
- Paste from clipboard with smart parsing

### List Management UI

- Searchable/filterable list view
- Bulk select and delete
- Sort alphabetically
- Show count of items
- Drag-and-drop reordering (optional)

### Quick Actions

- "Add all subreddits from last import"
- "Clear all"
- "Import from file"

## Acceptance Criteria

- [ ] Can import list from text file
- [ ] Can search within list
- [ ] Can bulk delete selected items
- [ ] Shows item count
