# Claude Code Instructions

## Project Overview

Obsidian plugin that exports saved Reddit posts and comments as Markdown files.

## Release Process

This project uses a three-stage release pipeline: **Beta → RC → Stable**

### Release Flow Diagram

```
feat/fix commits ──────────────────────────────────────┐
        │                                              │
        ▼                                              ▼
   Add [beta] to commit              release-please creates/updates PR
        │                                              │
        ▼                                              │
  Beta prerelease created                              │
  (e.g., 1.1.0-beta.3+abc123)                         │
        │                                              │
        │◄─────── repeat as needed ────────┐          │
        │                                   │          │
        ▼                                   │          │
   Ready to ship?                           │          │
        │                                   │          │
        ▼                                   │          │
   Add [rc] to commit                       │          │
        │                                   │          │
        ▼                                   │          │
  RC created, betas deleted                 │          │
  (e.g., 1.1.0-rc.1)                       │          │
        │                                   │          │
        ▼                                   │          │
   Issues found? ──── yes ──────────────────┘          │
        │                                              │
        no                                             │
        │                                              │
        ▼                                              ▼
   Merge release-please PR ◄───────────────────────────┘
        │
        ▼
   Stable release created
   (e.g., 1.1.0)
   RCs cleaned up
        │
        ▼
   Obsidian community users get update
```

### Commit Keywords

| Keyword  | When to Use                           | What Happens                                           |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| `[beta]` | Testing new features with BRAT users  | Creates `X.Y.Z-beta.N+sha` prerelease                  |
| `[rc]`   | Feature complete, final testing phase | Creates `X.Y.Z-rc.N`, deletes all betas                |
| _(none)_ | Normal development                    | No prerelease, changes accumulate in release-please PR |

### Usage Examples

```bash
# Normal commit - no release
git commit -m "feat: add export filtering"

# Beta release for BRAT testing
git commit -m "feat: add export filtering [beta]"

# Release candidate - ready for final testing
git commit -m "chore: prepare for release [rc]"

# Fix found during RC testing, new RC
git commit -m "fix: handle edge case in filtering [rc]"
```

### BRAT Installation

Users install via BRAT with: `cameronsjo/saved-reddit-exporter`

- Beta/RC users get the latest prerelease automatically
- Stable users get updates through Obsidian's community plugins

### Version Numbering

| Stage  | Format             | Example                |
| ------ | ------------------ | ---------------------- |
| Beta   | `X.Y.Z-beta.N+sha` | `1.1.0-beta.3+abc123f` |
| RC     | `X.Y.Z-rc.N`       | `1.1.0-rc.1`           |
| Stable | `X.Y.Z`            | `1.1.0`                |

The version number (X.Y.Z) comes from the release-please PR if one exists, otherwise uses the current package.json version.

### When to Use Each Stage

**Use `[beta]` when:**

- Adding a new feature that needs user testing
- Making changes you want feedback on before committing to release
- You want BRAT users to test something specific

**Use `[rc]` when:**

- All planned features for the release are complete
- You believe the code is ready for stable release
- You want one final round of testing before publishing

**Merge release-please PR when:**

- RC testing passed with no issues
- You're confident the release is ready for all users

## Development

```bash
npm install          # Install dependencies
npm run dev          # Build in dev mode
npm run build        # Production build
npm test             # Run tests
npm run lint         # Lint code
npm run lint:fix     # Fix lint issues
npm run type-check   # TypeScript check
```

## Testing in Obsidian

```bash
npm run build:local  # Build and copy to local vault
npm run dev:watch    # Watch mode with auto-copy
```

## Code Style

- TypeScript with strict type checking
- ESLint + Prettier for formatting
- Jest for testing
- Conventional commits required
