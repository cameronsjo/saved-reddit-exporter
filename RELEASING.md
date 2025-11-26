# Releasing

This project uses **automated releases**. You almost never need to manually version anything.

## TL;DR

| I want to...          | Do this                                  |
| --------------------- | ---------------------------------------- |
| Release a new feature | Just merge your PR with a `feat:` commit |
| Release a bug fix     | Just merge your PR with a `fix:` commit  |
| Test a beta version   | Run `npm run release:beta`               |
| Check version status  | Run `npm run release:check`              |

That's it. The automation handles everything else.

---

## How Releases Work

### Production Releases (Automatic)

1. **You make changes** with conventional commit messages:

   ```bash
   git commit -m "feat: add cool new feature"
   git commit -m "fix: resolve crash on startup"
   ```

2. **Push to main** (or merge a PR)

3. **release-please creates a Release PR** automatically:
   - Bumps version based on commit types
   - Updates CHANGELOG.md
   - Updates manifest.json and package.json

4. **Merge the Release PR** when ready

5. **GitHub Actions builds and publishes** the release automatically

**That's it.** Users get the update through Obsidian's plugin updater.

### Beta Releases (Manual)

Want to test something before a full release?

```bash
npm run release:beta
```

This will:

1. Ask you for a beta version (e.g., `1.2.0-beta.1`)
2. Trigger GitHub Actions to build it
3. Create a pre-release on GitHub
4. BRAT users can install it immediately

---

## Commit Message Format

Your commits control what kind of release happens:

| Prefix                            | What it does    | Version bump          |
| --------------------------------- | --------------- | --------------------- |
| `feat:`                           | New feature     | Minor (1.0.0 → 1.1.0) |
| `fix:`                            | Bug fix         | Patch (1.0.0 → 1.0.1) |
| `feat!:` or `BREAKING CHANGE:`    | Breaking change | Major (1.0.0 → 2.0.0) |
| `docs:`, `chore:`, `style:`, etc. | No release      | None                  |

**Examples:**

```bash
git commit -m "feat: add subreddit filtering"
git commit -m "fix: handle rate limiting correctly"
git commit -m "feat!: change settings format (migration required)"
git commit -m "docs: update README"  # No release triggered
```

The commit hook will **reject invalid commit messages**, so you can't mess this up.

---

## Common Scenarios

### "I want to release what I just built"

Just use the right commit prefix. If you used `feat:` or `fix:`, a release PR will be created automatically.

### "I want to test before releasing"

```bash
npm run release:beta
```

### "I want to see what version we're on"

```bash
npm run release:check
```

### "I need to do a major version bump"

Add `!` after the type or include `BREAKING CHANGE:` in the commit body:

```bash
git commit -m "feat!: redesign settings (old settings will be migrated)"
```

### "My commit was rejected"

Your commit message didn't follow the conventional format. Use one of:

- `feat: description`
- `fix: description`
- `docs: description`
- `chore: description`
- `refactor: description`
- `test: description`
- `style: description`
- `perf: description`
- `ci: description`
- `build: description`

---

## What NOT to Do

1. **Don't manually edit version numbers** - release-please handles this
2. **Don't create tags manually** - the automation does this
3. **Don't use `v` prefix on versions** - Obsidian doesn't want them
4. **Don't worry about CHANGELOG** - it's auto-generated

---

## Files You Should Know About

| File            | What it is                            | Who updates it             |
| --------------- | ------------------------------------- | -------------------------- |
| `manifest.json` | Obsidian plugin metadata              | release-please (automatic) |
| `package.json`  | npm package info                      | release-please (automatic) |
| `versions.json` | Plugin version → min Obsidian version | release-please (automatic) |
| `CHANGELOG.md`  | Release notes                         | release-please (automatic) |

---

## Troubleshooting

### "Release PR wasn't created"

- Make sure you used a `feat:` or `fix:` commit
- Check GitHub Actions for errors
- The PR might already exist - check open PRs

### "Version numbers don't match"

Run `npm run release:check`. If they differ, there's probably a pending release PR.

### "Beta release failed"

- Make sure you have `gh` CLI installed: `brew install gh`
- Make sure you're authenticated: `gh auth login`
- Check the version format: must be `X.Y.Z-beta.N`

### "Obsidian says no update available"

- Version in `manifest.json` must match the GitHub release tag exactly
- Release must have `main.js` and `manifest.json` as assets
- No `v` prefix on the tag

---

## Manual Override (Emergency Only)

If automation completely fails and you need to release manually:

```bash
# 1. Update versions
npm version patch  # or minor/major

# 2. Push with tag
git push origin main --tags

# 3. GitHub Actions will build the release
```

But seriously, just use the automation. It's there so you don't mess things up.
