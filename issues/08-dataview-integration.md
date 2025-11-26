# [Feature]: Enhanced Obsidian Integration (Dataview, Graph, MOC)

## 📋 Feature Description

Improve integration with Obsidian features like Dataview, Graph View, and automatic Map of Content generation.

### Proposed Features

1. **Dataview-optimized frontmatter** - Structured for easy querying
2. **Auto-generated MOC** - Index file per subreddit
3. **Internal links** - Link related posts together
4. **Graph-friendly tags** - Better tag structure for graph view

## 🎯 Use Case

Users who:

- Use Dataview to query and organize notes
- Want to visualize their saved content in Graph View
- Need index pages for each subreddit
- Want to discover connections between saved content

## 💡 Proposed Implementation

### Enhanced Frontmatter

```yaml
---
type: reddit-post
subreddit: '[[obsidian]]' # Linkified for graph
author: '[[u-username]]' # Optional author pages
tags:
  - reddit
  - obsidian
  - type/post
  - flair/discussion
cssclass: reddit-post
created: 2024-01-15T14:30:00
score: 150
aliases:
  - 'Short version of title'
---
```

### Auto-generated MOC

`Reddit Saved/obsidian/_index.md`:

````markdown
# r/obsidian

## Statistics

- Total posts: 25
- Total comments: 10
- Date range: 2023-01 to 2024-01

## Recent Posts

```dataview
TABLE score, date, num_comments
FROM "Reddit Saved/obsidian"
WHERE type = "reddit-post"
SORT date DESC
LIMIT 10
```
````

## Top Posts

```dataview
TABLE score, date
FROM "Reddit Saved/obsidian"
SORT score DESC
LIMIT 10
```

````

### Settings to Add
```typescript
interface RedditSavedSettings {
  // ... existing settings
  generateMOC: boolean;           // default: false
  linkifySubreddits: boolean;     // default: false
  linkifyAuthors: boolean;        // default: false
  dataviewOptimized: boolean;     // default: true
}
````

## ✅ Acceptance Criteria

- [ ] Frontmatter optimized for Dataview queries
- [ ] Optional MOC generation per subreddit
- [ ] Optional linkified subreddit names
- [ ] Optional linkified author names
- [ ] Tags structured for graph view
- [ ] CSS class added for styling
- [ ] Aliases generated from title

## 🏷️ Labels

`enhancement`, `obsidian-integration`, `dataview`

## 📊 Priority

Medium - Power user feature
