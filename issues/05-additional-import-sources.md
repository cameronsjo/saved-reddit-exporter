# [Feature]: Additional Import Sources

## 📋 Feature Description

Expand import capabilities beyond saved posts to include upvoted content and post history.

### Proposed Sources

1. **Upvoted posts** - Posts you've upvoted
2. **Upvoted comments** - Comments you've upvoted
3. **Your posts** - Posts you've submitted
4. **Your comments** - Comments you've made
5. **Subreddit posts** - Top/hot posts from specific subreddits

## 🎯 Use Case

Users who:

- Use upvotes as a "soft save" and want to export them
- Want to archive their own Reddit contributions
- Want to follow specific subreddits and archive top content
- Are migrating away from Reddit and want full export

## 💡 Proposed Implementation

### Settings to Add

```typescript
interface RedditSavedSettings {
  // ... existing settings
  importSources: {
    saved: boolean; // default: true (current behavior)
    upvoted: boolean; // default: false
    myPosts: boolean; // default: false
    myComments: boolean; // default: false
  };
  watchedSubreddits: string[]; // for subreddit import
}
```

### API Endpoints

- Saved: `/user/{username}/saved` (current)
- Upvoted: `/user/{username}/upvoted`
- My posts: `/user/{username}/submitted`
- My comments: `/user/{username}/comments`
- Subreddit: `/r/{subreddit}/top`

### OAuth Scope Changes

- Current: `identity history read`
- May need additional scopes for some endpoints

### UI Changes

- Checkboxes for each import source
- Subreddit input for watched subreddits
- Source indicator in imported file frontmatter

## ✅ Acceptance Criteria

- [ ] User can toggle each import source
- [ ] Upvoted posts can be imported
- [ ] User's own posts can be imported
- [ ] User's own comments can be imported
- [ ] Source is recorded in frontmatter (`source: upvoted`)
- [ ] Duplicate detection works across sources
- [ ] OAuth scopes updated if needed

## 🏷️ Labels

`enhancement`, `import`, `api`

## 📊 Priority

Medium - Expands use cases significantly
