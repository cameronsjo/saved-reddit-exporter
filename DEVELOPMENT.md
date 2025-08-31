# Development Guide

This guide covers development setup and workflow for the Saved Reddit Posts Obsidian plugin.

## Prerequisites

- Node.js 16+ and npm
- Git
- Obsidian app
- Reddit account and app credentials

## Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/cameronsjo/saved-reddit-extractor.git
   cd saved-reddit-extractor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a development vault**
   - Create a new Obsidian vault for testing
   - Navigate to `.obsidian/plugins/` in your vault
   - Create a symbolic link to your development folder:
     ```bash
     # Windows (run as Administrator)
     mklink /D saved-reddit-posts "C:\path\to\saved-reddit-posts"

     # macOS/Linux
     ln -s /path/to/saved-reddit-posts saved-reddit-posts
     ```

4. **Create Reddit App**
   - Go to https://www.reddit.com/prefs/apps
   - Create a new app with type "script"
   - Set redirect URI to `obsidian://reddit-saved`
   - Note your Client ID and Secret

## Development Workflow

### Building the Plugin

**Development build with auto-copy to vault:**
```bash
npm run dev:watch
```
This watches for changes, rebuilds automatically, and copies files to `.vault` folder.

**One-time build and copy:**
```bash
npm run build:local
```
Builds once and copies files to vault for testing.

**Copy existing files to vault:**
```bash
npm run copy
```
Just copies the current built files without rebuilding.

**Production build:**
```bash
npm run build
```
Creates optimized build without sourcemaps (for releases).

### Code Quality

**Run linter:**
```bash
npm run lint
```

**Fix linting issues:**
```bash
npm run lint:fix
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
