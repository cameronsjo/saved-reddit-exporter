# feat: support per-subreddit filter rules

**Labels:** `enhancement`, `filtering`
**Priority:** Medium

## Summary

Allow different filter settings for different subreddits.

## Use Case

- r/programming: require 100+ score (high quality only)
- r/askreddit: allow 50+ score (more lenient)
- r/news: only last week, link posts only
- r/personalfinance: all posts regardless of score

## Proposed Solution

Add subreddit-specific overrides:

```typescript
subredditRules: Record<string, Partial<FilterSettings>>;
```

### Priority Order

1. Subreddit-specific rule (if exists)
2. Global filter settings
3. Default (include all)

### UI

- "Subreddit Rules" section in filter settings
- Add rule: select subreddit, configure overrides
- List of configured rules with edit/delete
- Could use modal for rule editing

## Acceptance Criteria

- [ ] Can create subreddit-specific rules
- [ ] Rules override global settings
- [ ] Can edit/delete existing rules
- [ ] Preview shows which rule matched each item
