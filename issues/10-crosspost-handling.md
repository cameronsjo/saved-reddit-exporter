# [Feature]: Improved Crosspost Handling

## 📋 Feature Description

Better handling of crossposted content, including linking to original posts and avoiding duplicates.

### Current Behavior

- Crossposts treated as regular posts
- Original post context not captured
- May create duplicates if both original and crosspost are saved

### Proposed Behavior

- Detect crossposts and link to original
- Option to import original instead of crosspost
- Deduplicate based on original post ID

## 🎯 Use Case

Users who:

- Save crossposts and want to know the original source
- Have both original and crosspost saved
- Want complete attribution chain

## 💡 Proposed Implementation

### Crosspost Detection

```typescript
interface CrosspostInfo {
  isCrosspost: boolean;
  originalSubreddit?: string;
  originalAuthor?: string;
  originalPermalink?: string;
  originalId?: string;
}
```

### Frontmatter Addition

```yaml
---
type: reddit-post
is_crosspost: true
original_subreddit: originalsubreddit
original_author: original_author
original_permalink: /r/original/...
original_id: xyz789
---
```

### Markdown Output

```markdown
> 🔄 **Crosspost** from [r/originalsubreddit](/r/original/...)
> Originally posted by u/original_author
```

### Settings

```typescript
interface RedditSavedSettings {
  // ... existing settings
  crosspostBehavior: 'import_crosspost' | 'import_original' | 'import_both';
  deduplicateCrossposts: boolean; // default: true
}
```

## ✅ Acceptance Criteria

- [ ] Crossposts detected correctly
- [ ] Original post info captured in frontmatter
- [ ] Visual indicator in markdown content
- [ ] Option to import original instead
- [ ] Deduplication based on original ID
- [ ] Graceful handling if original is deleted

## 🏷️ Labels

`enhancement`, `content`, `deduplication`

## 📊 Priority

Low - Edge case improvement
