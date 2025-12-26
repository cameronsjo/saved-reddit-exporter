# Saved Reddit Posts - Obsidian Plugin Knowledge Base

## Project Overview

This Obsidian plugin connects to Reddit's API to fetch, import, and optionally unsave posts and comments that a user has saved on Reddit. The imported content is converted to Markdown files with structured frontmatter for easy organization within Obsidian.

## Architecture

### Core Components

#### 1. Main Plugin Class (`RedditSavedPlugin`)

- Entry point for the plugin
- Manages plugin lifecycle (load/unload)
- Handles OAuth authentication flow
- Coordinates fetching and processing of Reddit content
- Manages settings persistence

#### 2. Settings Management

- `RedditSavedSettings` interface defines configuration structure
- Settings include Reddit API credentials, user preferences, and import options
- `RedditSavedSettingTab` provides UI for configuration

#### 3. Authentication System

- OAuth 2.0 flow implementation for Reddit API
- **Dual OAuth flows**: Installed app (mobile) and Script app (desktop legacy)
- Token management with automatic refresh
- Secure credential storage within Obsidian's data system
- Protocol handler callback (`obsidian://saved-reddit-exporter`) for cross-platform support
- HTTP callback fallback (`http://localhost:9638`) for legacy desktop setups

## Reddit API Integration

### Authentication Flows

The plugin supports two OAuth flows, auto-detected based on whether a Client Secret is provided:

#### Installed App Flow (Recommended)

For cross-platform support including mobile devices:

1. User creates "installed app" at reddit.com/prefs/apps
2. User enters only Client ID in settings (no secret)
3. Plugin detects empty secret → uses installed app flow
4. Plugin opens Reddit authorization with `obsidian://saved-reddit-exporter` redirect
5. User approves permissions (identity, history, read, save)
6. Reddit redirects to `obsidian://saved-reddit-exporter?code=...&state=...`
7. Obsidian receives via `registerObsidianProtocolHandler`
8. Plugin validates CSRF state, exchanges code for tokens (empty secret in Basic auth)
9. Tokens stored securely in plugin settings

#### Script App Flow (Legacy Desktop)

For existing desktop-only users:

1. User creates "script" app at reddit.com/prefs/apps
2. User enters Client ID AND Client Secret in settings
3. Plugin detects non-empty secret → uses script app flow
4. Plugin starts local HTTP server on configured port (default: 9638)
5. Plugin opens Reddit authorization with `http://localhost:9638` redirect
6. User approves permissions
7. Reddit redirects to localhost, HTTP server receives callback
8. Plugin validates CSRF state, exchanges code for tokens (secret in Basic auth)
9. Tokens stored, server closed

**Fallback**: If HTTP server fails (port in use, etc.), user can manually copy the auth code from the browser URL.

### API Endpoints Used

- `/api/v1/authorize` - OAuth authorization
- `/api/v1/access_token` - Token exchange/refresh
- `/api/v1/me` - Fetch authenticated user info
- `/user/{username}/saved` - Fetch saved posts/comments
- `/api/unsave` - Remove items from saved

### Rate Limiting & Best Practices

- User-Agent header included in all requests
- Batch fetching with pagination (100 items per request)
- Token refresh handled automatically before expiration
- Configurable fetch limits to respect API constraints
- Exponential backoff retry logic for rate-limited requests
- Respects Reddit's 60 requests/minute and 1000 item limits

## Data Processing

### Content Types

1. **Posts** (kind: t3)
   - Text posts with selftext
   - Link posts with external URLs
   - Media posts (images, videos, GIFs)
   - Rich media content with automatic download support

2. **Comments** (kind: t1)
   - Standalone saved comments
   - Includes parent post context

### Media Processing & Downloads

- **Automatic Media Detection**: Identifies images, videos, GIFs from various platforms
- **Local Media Storage**: Downloads media to configurable vault folder (separate from posts)
- **Format Support**:
  - Images: JPG, PNG, WEBP, BMP, SVG
  - Videos: MP4, WEBM, MOV, AVI, MKV
  - Animations: GIF files
- **Platform Integration**: Support for Imgur, Reddit-hosted media, YouTube, Gfycat, Redgifs
- **Filename Generation**: Sanitized names using post title + Reddit ID for uniqueness
- **Duplicate Prevention**: Checks for existing media files before downloading

### Markdown Conversion

- Reddit markdown preserved with entity decoding
- Spoiler tags converted to Obsidian format (`%%...%%`)
- Frontmatter metadata includes:
  - Type (reddit-post/reddit-comment)
  - Subreddit, author, creation date
  - Permalink, ID, score
  - Post-specific: title, URL, comment count
  - Comment-specific: parent post title/link

### File Organization

- Sanitized filenames (200 char limit)
- Configurable save location folder
- Duplicate detection prevents overwrites
- Structured naming: posts use title, comments use "Comment - {post_title}"

## Features

### Core Functionality

1. **Fetch Saved Posts**
   - Ribbon icon and command palette access
   - Progress notifications
   - Batch import with configurable limits
   - Smart duplicate detection by Reddit ID

2. **Authentication Management**
   - Initial setup wizard
   - Token refresh automation
   - Re-authentication support

3. **Duplicate Prevention**
   - Tracks imported posts by Reddit ID in frontmatter
   - Files can be renamed without being re-downloaded
   - Scans vault metadata cache for existing imports
   - "Rescan vault" command to rebuild ID tracking

4. **Auto-unsave Option**
   - Optional automatic removal from Reddit after import
   - Preserves local copies while cleaning Reddit saved list
   - Only unsaves newly imported items when skip existing is enabled

### User Interface

- Settings tab for configuration
- Ribbon icon for quick access
- Command palette integration
- Status notifications for operations

## Configuration Options

### Authentication Settings

- `clientId` - Reddit app client ID (required)
- `clientSecret` - Reddit app client secret (optional - leave empty for installed app/mobile flow)

**Note**: The presence or absence of `clientSecret` determines which OAuth flow is used:

- Empty → Installed app flow (mobile-compatible)
- Provided → Script app flow (desktop-only)

### Import Settings

- `saveLocation` - Target folder for imports (default: "Reddit Saved")
- `fetchLimit` - Maximum posts to fetch (default: 1000)
- `autoUnsave` - Auto-remove from Reddit after import (default: false)
- `skipExisting` - Skip already imported posts (default: true)

### Advanced Settings

- `mediaFolder` - Folder for downloaded media files (default: "Attachments")
- `downloadImages` - Auto-download linked images (default: false)
- `downloadGifs` - Auto-download GIF animations (default: false)
- `downloadVideos` - Auto-download video files (default: false)
- `oauthRedirectPort` - OAuth callback port for script apps (default: 9638)
- `showAdvancedSettings` - Toggle advanced options visibility (default: false)

### Internal State

- `accessToken` - Current OAuth access token
- `refreshToken` - Long-lived refresh token
- `tokenExpiry` - Access token expiration timestamp
- `username` - Authenticated Reddit username

## Development Setup

### Prerequisites

- Node.js 16+
- npm or yarn
- Obsidian app for testing

### Build Process

1. `npm install` - Install dependencies
2. `npm run dev:watch` - Development build with watch mode and auto-copy to vault
3. `npm run build:local` - One-time build and copy to vault for testing
4. `npm run copy` - Copy existing built files to vault without rebuilding
5. `npm run build` - Production build for releases

### Development Scripts

- `scripts/copy-to-vault.mjs` - Copies plugin files to `.vault/.obsidian/plugins/`
- `scripts/watch-and-copy.mjs` - Watches for file changes and auto-copies

### File Structure

```
saved-reddit-posts/
├── src/
│   └── main.ts          # Plugin source code
├── docs/                # Documentation (if needed)
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── versions.json        # Version compatibility
└── KNOWLEDGE_BASE.md    # This file
```

## Reddit App Setup

### Creating a Reddit App

1. Visit https://www.reddit.com/prefs/apps
2. Click "Create App" or "Create Another App"
3. Choose your app type based on your needs:

#### Option A: Installed App (Recommended for Mobile)

| Setting      | Value                                |
| ------------ | ------------------------------------ |
| Name         | Any name (e.g., "Obsidian Exporter") |
| App type     | **installed app**                    |
| Description  | Optional                             |
| About URL    | Optional                             |
| Redirect URI | `obsidian://saved-reddit-exporter`   |

- Note only the **Client ID** (under app name)
- No secret is provided for installed apps
- Works on iOS, Android, and desktop

#### Option B: Script App (Legacy Desktop)

| Setting      | Value                                |
| ------------ | ------------------------------------ |
| Name         | Any name (e.g., "Obsidian Exporter") |
| App type     | **script**                           |
| Description  | Optional                             |
| About URL    | Optional                             |
| Redirect URI | `http://localhost:9638`              |

- Note both the **Client ID** and **Secret**
- Only works on desktop (requires local HTTP server)

### Required Permissions

Both app types request the same OAuth scopes:

- `identity` - Access user account info
- `history` - Access saved posts/comments
- `read` - Read Reddit content
- `save` - Unsave items after import (optional feature)

### Migration: Script App → Installed App

Existing users with a script app who want mobile support:

1. Create a **new** Reddit app with type "installed app"
2. Set redirect URI to `obsidian://saved-reddit-exporter`
3. In plugin settings, clear the Client Secret field
4. Enter the new Client ID
5. Re-authenticate

Your existing tokens will be replaced. No data loss - just re-auth required.

## Error Handling

### Common Issues

1. **Invalid Client Credentials**
   - Verify Client ID in settings
   - For script apps: verify Client Secret is correct
   - For installed apps: ensure Client Secret is empty

2. **Wrong Redirect URI**
   - Installed app: must be exactly `obsidian://saved-reddit-exporter`
   - Script app: must match your configured port (default `http://localhost:9638`)

3. **Token Expiration**
   - Plugin auto-refreshes tokens
   - Manual re-authentication available in settings

4. **Rate Limiting**
   - Implements pagination for large saved lists
   - Respects Reddit API limits

5. **File Creation Errors**
   - Validates folder existence
   - Sanitizes filenames for OS compatibility

## Platform Support

### Desktop (Full Support)

All features work on desktop platforms (Windows, macOS, Linux).

### Mobile (Full Support with Installed App)

Full mobile support is available using Reddit's "installed app" type with Obsidian's protocol handler.

**Setup for Mobile Users:**

1. Create a Reddit app at reddit.com/prefs/apps
2. Select **"installed app"** type
3. Set redirect URI to: `obsidian://saved-reddit-exporter`
4. Copy the Client ID (leave Client Secret empty in plugin settings)
5. Authenticate directly on mobile!

**Technical Details:**

The plugin supports two OAuth flows:

| Flow          | Reddit App Type | Client Secret | Redirect URI                       | Platforms              |
| ------------- | --------------- | ------------- | ---------------------------------- | ---------------------- |
| Installed App | installed       | Empty         | `obsidian://saved-reddit-exporter` | All (desktop + mobile) |
| Script App    | script          | Required      | `http://localhost:9638`            | Desktop only           |

**Implementation:**

- Uses Obsidian's `registerObsidianProtocolHandler` API for the installed app flow
- Protocol handler registered in `main.ts` during plugin load
- `RedditAuth.getOAuthAppType()` auto-detects flow based on clientSecret presence
- Empty clientSecret = installed app flow, non-empty = script app flow

**Code paths in `auth.ts`:**

- `initiateInstalledAppFlow()` - Stores pending state, opens browser with `obsidian://` redirect
- `handleProtocolCallback()` - Receives callback via protocol handler, validates state, exchanges code
- `initiateScriptAppFlow()` - Legacy HTTP server approach for script apps

**State Management:**

- Installed app flow uses `pendingOAuthState` in settings to track in-flight auth
- 10-minute expiry prevents stale auth attempts
- State validated with CSRF token before token exchange

**Legacy Desktop-Only Setup:**

Desktop users can still use "script" app type:

1. Create Reddit app with type "script"
2. Set redirect URI to `http://localhost:9638`
3. Enter both Client ID and Client Secret
4. The `startOAuthServer()` method uses `window.require('http')` (Electron-only)

## Security Considerations

- Credentials stored locally in Obsidian vault
- No external servers involved
- OAuth tokens never exposed in UI
- Refresh tokens enable long-term access without password storage

## Future Enhancements (Potential)

- Incremental sync (fetch only new saved items)
- Custom frontmatter fields
- Filter by subreddit/date/type
- Bulk operations UI
- Export formats beyond Markdown
- Scheduled auto-fetch
- Search within imported content
- Tag generation from subreddit/flair
- Advanced media processing (thumbnails, metadata extraction)
- Batch media download with progress tracking
- Custom media naming patterns

## Testing Checklist

- [ ] Reddit app creation and configuration
- [ ] OAuth flow completion
- [ ] Token refresh after expiration
- [ ] Fetching posts (text, link, media)
- [ ] Fetching comments
- [ ] Markdown conversion accuracy
- [ ] File creation in correct folder
- [ ] Auto-unsave functionality
- [ ] Error handling for API failures
- [ ] Settings persistence across restarts

## Version History

- 1.0.0 - Initial release with core functionality, media download support, advanced settings
