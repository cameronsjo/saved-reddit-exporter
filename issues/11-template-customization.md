# [Feature]: Customizable Export Templates

## 📋 Feature Description

Allow users to customize the markdown template used for exported posts and comments.

### Current Behavior

- Fixed template structure
- Users cannot modify frontmatter fields
- Fixed content layout

### Proposed Behavior

- User-defined templates using variables
- Customizable frontmatter
- Optional sections (comments, media, footer)

## 🎯 Use Case

Users who:

- Have specific frontmatter requirements for their vault
- Want different layouts for posts vs comments
- Need to match existing note templates
- Want to exclude certain sections

## 💡 Proposed Implementation

### Template Variables

```
{{id}} - Reddit post/comment ID
{{title}} - Post title
{{author}} - Author username
{{subreddit}} - Subreddit name
{{score}} - Current score
{{date}} - Created date
{{date_iso}} - ISO formatted date
{{permalink}} - Reddit permalink
{{url}} - External URL (if link post)
{{content}} - Post body or comment text
{{comments}} - Formatted comments section
{{media}} - Media embed/link
{{tags}} - Generated tags
```

### Template File

`Reddit Saved/_templates/post.md`:

```markdown
---
type: reddit
source: r/{{subreddit}}
author: '{{author}}'
created: { { date_iso } }
reddit_id: { { id } }
---

# {{title}}

{{content}}

{{#if comments}}

## Comments

{{comments}}
{{/if}}

---

[View on Reddit]({{permalink}})
```

### Settings

```typescript
interface RedditSavedSettings {
  // ... existing settings
  useCustomTemplate: boolean;
  postTemplatePath: string;
  commentTemplatePath: string;
}
```

## ✅ Acceptance Criteria

- [ ] Custom templates can be defined
- [ ] All variables are documented
- [ ] Conditional sections work ({{#if}})
- [ ] Fallback to default if template missing
- [ ] Template errors shown clearly
- [ ] Separate templates for posts and comments

## 🏷️ Labels

`enhancement`, `customization`, `templates`

## 📊 Priority

Low - Power user feature
