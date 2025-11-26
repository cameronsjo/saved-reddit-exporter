# [Feature]: Context for Saved Comments

## 📋 Feature Description

When exporting a saved comment, include the parent comment chain and original post content for full context.

### Current Behavior

- Saved comments only include the comment text
- Parent post title is shown but not content
- No parent comments in the chain are included

### Proposed Behavior

- Fetch and include original post content
- Fetch parent comment chain up to the saved comment
- Show thread context in a collapsible or quoted format

## 🎯 Use Case

Users who:

- Save insightful comments that only make sense in context
- Want to understand what the comment was replying to
- Need the full discussion thread for reference
- Save comments in Q&A threads where the question matters

## 💡 Proposed Implementation

### Settings to Add

```typescript
interface RedditSavedSettings {
  // ... existing settings
  includeCommentContext: boolean; // default: true
  includeParentPost: boolean; // default: true
  parentCommentDepth: number; // how many parents to fetch, default: 3
}
```

### API Changes

- Fetch full comment thread using permalink
- Walk up parent chain using `parent_id`
- Fetch post content if `includeParentPost` is true

### Markdown Output

```markdown
---
type: reddit-comment
# ... existing frontmatter
has_context: true
---

## 📝 Original Post

> **Post Title**
>
> Post content here...

---

## 💬 Comment Thread

> **u/parent_commenter** • ⬆️ 50
>
> Parent comment that was replied to...

> > **u/saved_commenter** ⭐ (Saved)
> >
> > The comment you saved...

---

**Tags:** ...
```

## ✅ Acceptance Criteria

- [ ] Original post content included when enabled
- [ ] Parent comments shown in chain
- [ ] Configurable depth for parent chain
- [ ] Saved comment clearly marked
- [ ] Context fetching can be disabled
- [ ] Graceful handling if parent is deleted

## 🏷️ Labels

`enhancement`, `comments`, `context`

## 📊 Priority

Medium - Improves saved comment usefulness
