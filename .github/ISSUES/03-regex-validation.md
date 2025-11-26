# feat: add real-time regex validation with live preview

**Labels:** `enhancement`, `filtering`, `ux`
**Priority:** Medium

## Summary

Provide immediate feedback when users enter regex patterns, showing validation status and example matches.

## Problem

Users currently have no way to know if their regex is valid until they run an import. Invalid patterns silently fail.

## Proposed Solution

- Show validation indicator next to regex input (valid / invalid)
- Display regex error message if invalid
- Show sample matches from a test dataset
- Optional: test against already-imported posts in vault

## UI Mockup

```
Subreddit regex: [programming.*        ] Valid
                  Matches: programming, programminghumor, programmingjokes
```

## Acceptance Criteria

- [ ] Real-time validation as user types
- [ ] Clear error messages for invalid patterns
- [ ] Sample match preview (optional)
