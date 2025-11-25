# feat: add minimum/maximum content length filters

**Labels:** `enhancement`, `filtering`
**Priority:** Low

## Summary

Filter posts based on the length of their text content.

## Use Case

- Filter out low-effort posts (short titles, minimal content)
- Exclude overly long posts that are hard to process
- Focus on substantial discussions

## Proposed Solution

Add to FilterSettings:

- `minTitleLength: number | null`
- `maxTitleLength: number | null`
- `minContentLength: number | null` (for selftext/body)
- `maxContentLength: number | null`

## UI

- Add "Content length filtering" section
- Four number inputs with "No limit" placeholder
- Character count display

## Acceptance Criteria

- [ ] Can set min/max title length
- [ ] Can set min/max body content length
- [ ] Works for both posts and comments
- [ ] Tests cover edge cases (null content, zero length)
