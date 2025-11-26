# feat: add saved filter profiles for quick switching

**Labels:** `enhancement`, `filtering`
**Priority:** Medium

## Summary

Allow users to save multiple named filter configurations and switch between them quickly.

## Use Case

Users often have different import needs:

- "Work Research" - programming subreddits, high score, text posts only
- "Personal Reading" - entertainment subreddits, all post types
- "News Only" - news subreddits, last week, link posts

Currently they must manually reconfigure all filters each time.

## Proposed Solution

- Add "Save current filters as profile" button
- Profile name input with save/delete functionality
- Dropdown to quickly switch between saved profiles
- Store profiles in settings as `savedFilterProfiles: Record<string, FilterSettings>`
- Add command palette integration for profile switching

## Acceptance Criteria

- [ ] Can save current filter configuration with a name
- [ ] Can load a saved profile with one click
- [ ] Can delete saved profiles
- [ ] Profiles persist between sessions
- [ ] Command palette: "Switch to filter profile: {name}"
