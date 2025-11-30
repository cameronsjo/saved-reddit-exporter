# Claude Code Instructions

## Project Overview

Obsidian plugin that exports saved Reddit posts and comments as Markdown files.

## Release Process

### Beta Releases (BRAT)

To trigger a beta release for BRAT users, include `[beta]` in the commit message:

```bash
git commit -m "feat: add new feature [beta]"
```

This creates a prerelease like `1.0.0-beta.5+abc123f` that BRAT users will receive.

### Stable Releases (Obsidian Community)

Stable releases go through release-please:

1. Conventional commits (`feat:`, `fix:`) accumulate in a release PR
2. Merge the release-please PR when ready to publish
3. This creates a stable release and cleans up associated beta prereleases

### Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, etc.
- Add `[beta]` to publish a beta prerelease for testing
- Breaking changes: use `feat!:` or `fix!:` (triggers major version bump)

## Development

```bash
npm install        # Install dependencies
npm run dev        # Build in dev mode
npm run build      # Production build
npm test           # Run tests
npm run lint       # Lint code
```

## Testing in Obsidian

```bash
npm run build:local  # Build and copy to local vault
```
