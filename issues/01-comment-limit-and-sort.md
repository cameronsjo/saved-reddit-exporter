# [Feature]: Comment Limit and Sort Options

## 📋 Feature Description

Add configurable controls for how comments are fetched and displayed when exporting posts.

### Proposed Settings

1. **Max comments per post** - Limit total comments exported (e.g., top 10, 25, 50)
2. **Comment sort order** - Choose between `top`, `best`, `controversial`, `new`
3. **Max comment depth** - Configurable nesting depth (currently hardcoded to 5)

## 🎯 Use Case

Users may want to:

- Keep exports concise by limiting to top 10 comments
- Capture controversial discussions instead of just popular ones
- Control file size for posts with thousands of comments
- Adjust nesting depth based on how threaded discussions typically are in their saved content

## 💡 Proposed Implementation

### Settings to Add

```typescript
interface RedditSavedSettings {
  // ... existing settings
  maxCommentsPerPost: number; // default: 100
  commentSortOrder: 'top' | 'best' | 'controversial' | 'new'; // default: 'top'
  maxCommentDepth: number; // default: 5
}
```

### API Changes

- Update `fetchPostComments()` to accept sort parameter
- Pass `?sort={sortOrder}` to Reddit API
- Slice results to `maxCommentsPerPost`

### UI Changes

- Add dropdown for sort order in Comment Export Settings section
- Add number inputs for max comments and max depth
- Only show when "Export post comments" is enabled

## ✅ Acceptance Criteria

- [ ] User can set maximum comments per post (0 = unlimited, up to API limit)
- [ ] User can choose comment sort order from dropdown
- [ ] User can configure max nesting depth
- [ ] Settings only visible when comment export is enabled
- [ ] Existing functionality unchanged with default values

## 🏷️ Labels

`enhancement`, `comments`, `settings`

## 📊 Priority

Medium - Enhances existing feature
