# [Feature]: Additional Export Formats

## 📋 Feature Description

Add support for exporting saved content in formats beyond Markdown, such as JSON backup and HTML.

### Proposed Formats

1. **JSON backup** - Complete data export for portability
2. **HTML** - Readable format with styling
3. **CSV** - Spreadsheet-compatible list of saved items

## 🎯 Use Case

Users who:

- Want a complete backup of their Reddit data
- Need to migrate to other tools
- Want to analyze their saved content in spreadsheets
- Need a printable/shareable version

## 💡 Proposed Implementation

### JSON Export

```json
{
  "exportDate": "2024-01-15T14:30:00Z",
  "username": "user123",
  "totalItems": 500,
  "posts": [
    {
      "id": "abc123",
      "title": "Post Title",
      "subreddit": "obsidian",
      "author": "author1",
      "score": 150,
      "url": "https://...",
      "selftext": "...",
      "comments": [...]
    }
  ],
  "comments": [...]
}
```

### CSV Export

```csv
id,type,subreddit,title,author,score,date,url,permalink
abc123,post,obsidian,"Post Title",author1,150,2024-01-15,https://...,/r/...
```

### Settings/Commands

- Add command: "Export saved items as JSON"
- Add command: "Export saved items as CSV"
- Option to include/exclude comments in JSON
- Option to include media URLs or local paths

## ✅ Acceptance Criteria

- [ ] JSON export command available
- [ ] JSON includes all post/comment data
- [ ] JSON optionally includes fetched comments
- [ ] CSV export command available
- [ ] CSV includes key metadata fields
- [ ] Export location configurable
- [ ] Progress shown during export

## 🏷️ Labels

`enhancement`, `export`, `backup`

## 📊 Priority

Low - Nice to have for data portability
