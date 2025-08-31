# Development Guide - Saved Reddit Exporter

This guide covers the complete development workflow for the Saved Reddit Exporter Obsidian plugin, including feature branching, automated versioning, and release management.

## Prerequisites

- Node.js 16+ and npm
- Git
- Obsidian app
- Reddit account and app credentials

## 🚀 Quick Start

### Initial Setup
```bash
# Clone and setup
git clone https://github.com/cameronsjo/saved-reddit-exporter.git
cd saved-reddit-exporter
npm install

# Create local test vault
mkdir .vault
# Configure .vault as an Obsidian vault in the Obsidian app
```

### Development Commands
```bash
npm run dev              # Single build
npm run dev:watch        # Auto-build on file changes + copy to vault
npm run build            # Production build
npm run build:local      # Build + copy to test vault
npm run copy             # Copy existing build to test vault
npm run lint             # Check code style
npm run lint:fix         # Auto-fix code style issues
```

## 🌿 Feature Branch Workflow

### Creating a Feature Branch
```bash
# Start from main and pull latest
git checkout main
git pull origin main

# Create and checkout feature branch
git checkout -b feature/oauth-improvements
# OR
git checkout -b fix/media-download-bug
# OR 
git checkout -b chore/update-dependencies
```

### Branch Naming Convention
- `feature/description` - New features
- `fix/description` - Bug fixes
- `chore/description` - Maintenance tasks
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Development on Feature Branch
```bash
# Make your changes
npm run dev:watch        # Start development mode

# Test in Obsidian
# Changes auto-copy to .vault for immediate testing

# Commit changes with conventional commits
git add .
git commit -m "feat: add automatic OAuth token refresh"
git push origin feature/oauth-improvements
```

### Merging Feature Branches
```bash
# Option 1: Merge via GitHub PR (Recommended)
# 1. Create Pull Request on GitHub
# 2. Review and merge via GitHub interface
# 3. Delete branch after merge

# Option 2: Direct merge (for small changes)
git checkout main
git pull origin main
git merge feature/oauth-improvements
git push origin main
git branch -d feature/oauth-improvements  # Delete local branch
```

## 🏷️ Automated Versioning & Releases

### Version Bump Script
We use automated versioning that updates both `manifest.json` and `versions.json`:

```bash
# Patch version (1.0.0 → 1.0.1)
npm run version patch

# Minor version (1.0.0 → 1.1.0)  
npm run version minor

# Major version (1.0.0 → 2.0.0)
npm run version major
```

### What the Version Script Does
1. **Updates `manifest.json`** with new version
2. **Updates `versions.json`** with version history
3. **Stages the changes** for git
4. **Creates a git commit** with version message
5. **Creates a git tag** (without "v" prefix for Obsidian compatibility)
6. **Pushes tag and commit** to trigger release

### Manual Version Control (if needed)
```bash
# Create version manually
git tag -a 1.0.1 -m "Release 1.0.1 - Brief description"
git push origin 1.0.1
```

### Testing

1. Enable the plugin in Obsidian settings
2. Configure Reddit credentials in plugin settings
3. Test authentication flow
4. Test fetching saved posts
5. Verify markdown conversion
6. Test auto-unsave feature

### Hot Reload (Optional)

For faster development, install the Hot Reload plugin:

1. Install from Obsidian Community Plugins
2. Enable Hot Reload
3. The plugin will auto-reload when you make changes

## Project Structure

```
saved-reddit-posts/
├── src/
│   └── main.ts          # Main plugin source
├── docs/                # Documentation
├── manifest.json        # Plugin metadata
├── styles.css          # Plugin styles
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── esbuild.config.mjs  # Build configuration
├── .eslintrc           # Linting rules
└── .editorconfig       # Editor settings
```

## Making Changes

### Adding New Features

1. Update `src/main.ts` with new functionality
2. Add any new settings to `RedditSavedSettings` interface
3. Update settings tab if needed
4. Test thoroughly in development vault

### Updating Dependencies

```bash
npm update
npm audit fix
```

### Version Management

To bump version:
```bash
npm version patch  # or minor/major
```
This automatically updates `manifest.json` and `versions.json`.

## API Reference

### Reddit OAuth Endpoints
- Authorization: `https://www.reddit.com/api/v1/authorize`
- Token: `https://www.reddit.com/api/v1/access_token`
- User info: `https://oauth.reddit.com/api/v1/me`
- Saved posts: `https://oauth.reddit.com/user/{username}/saved`
- Unsave: `https://oauth.reddit.com/api/unsave`

### Obsidian API
Key classes used:
- `Plugin` - Base plugin class
- `PluginSettingTab` - Settings UI
- `Notice` - User notifications
- `requestUrl` - HTTP requests
- `TFile` - File operations

## Debugging

### Console Logging
Open DevTools in Obsidian:
- Windows/Linux: `Ctrl+Shift+I`
- macOS: `Cmd+Option+I`

### Common Issues

**Build Errors:**
- Clear `node_modules` and reinstall
- Check TypeScript errors with `tsc`

**OAuth Issues:**
- Verify redirect URI matches exactly
- Check Client ID/Secret
- Ensure proper URL encoding

**API Rate Limits:**
- Reddit limits: 60 requests/minute
- Implement pagination for large saves
- Add delays if needed

## Release Process

1. Update version in `package.json`
2. Run `npm run version`
3. Build production version: `npm run build`
4. Create GitHub release with:
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. Submit to Obsidian plugin repository (optional)

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## Resources

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [Reddit API Documentation](https://www.reddit.com/dev/api)
- [OAuth 2.0 Guide](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
