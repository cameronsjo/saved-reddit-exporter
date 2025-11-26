# Feature Request Issues

This folder contains feature request templates ready to be created as GitHub issues.

## Issue Summary

| #   | Feature                                                          | Priority | Category      |
| --- | ---------------------------------------------------------------- | -------- | ------------- |
| 01  | [Comment Limit and Sort Options](./01-comment-limit-and-sort.md) | Medium   | Comments      |
| 02  | [Incremental Sync](./02-incremental-sync.md)                     | High     | Automation    |
| 03  | [Selective Import with Preview](./03-selective-import.md)        | High     | UX            |
| 04  | [Gallery Support](./04-gallery-support.md)                       | Medium   | Media         |
| 05  | [Additional Import Sources](./05-additional-import-sources.md)   | Medium   | Import        |
| 06  | [Saved Comment Context](./06-saved-comment-context.md)           | Medium   | Comments      |
| 07  | [Progress Tracking](./07-progress-tracking.md)                   | Medium   | UX            |
| 08  | [Dataview Integration](./08-dataview-integration.md)             | Medium   | Integration   |
| 09  | [Export Formats](./09-export-formats.md)                         | Low      | Export        |
| 10  | [Crosspost Handling](./10-crosspost-handling.md)                 | Low      | Content       |
| 11  | [Template Customization](./11-template-customization.md)         | Low      | Customization |

## Priority Guide

- **High**: Major workflow improvements, frequently requested
- **Medium**: Enhances existing features, good value
- **Low**: Nice to have, edge cases, power user features

## Creating Issues

To create these as GitHub issues:

1. Go to the repository's Issues tab
2. Click "New Issue"
3. Copy the content from the relevant `.md` file
4. Add appropriate labels
5. Submit

Or use the GitHub CLI:

```bash
gh issue create --title "[Feature]: Comment Limit and Sort Options" --body-file issues/01-comment-limit-and-sort.md --label "enhancement"
```
