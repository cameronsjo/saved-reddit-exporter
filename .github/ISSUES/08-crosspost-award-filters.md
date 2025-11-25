# feat: add crosspost and award-based filters

**Labels:** `enhancement`, `filtering`
**Priority:** Low

## Summary

Filter posts based on crosspost status and whether they have Reddit awards.

## Proposed Filters

### Crosspost Filtering

- `crosspostFilter: 'all' | 'original_only' | 'crossposts_only'`
- Original posts only (exclude crossposts)
- Crossposts only
- All (default)

### Award Filtering

- `minAwards: number | null` - minimum total awards
- `requireGilded: boolean` - must have gold/platinum
- `excludeAwarded: boolean` - exclude posts with any awards

## Use Case

- Focus on original content only
- Find high-quality gilded posts
- Avoid reposted content

## API Fields Needed

- `is_crosspostable`
- `crosspost_parent`
- `gilded`
- `all_awardings`

## Acceptance Criteria

- [ ] Can filter by crosspost status
- [ ] Can require minimum awards
- [ ] Can filter gilded posts
- [ ] Update RedditItemData interface for new fields
