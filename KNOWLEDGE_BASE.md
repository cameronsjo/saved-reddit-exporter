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
- Token management with automatic refresh
- Secure credential storage within Obsidian's data system
- HTTP callback for OAuth (`http://localhost:9638` with manual code input)

## Reddit API Integration

### Authentication Flow

1. User enters Client ID and Client Secret in settings
2. Plugin initiates OAuth flow opening Reddit authorization page
3. User approves permissions (identity, history, read)
4. Reddit redirects to `http://localhost:9638` with authorization code
5. User manually copies authorization code from URL and inputs it
6. Plugin exchanges code for access/refresh tokens
7. Tokens stored securely in plugin settings

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

### Required Settings

- `clientId` - Reddit app client ID
- `clientSecret` - Reddit app client secret

### Optional Settings

- `saveLocation` - Target folder for imports (default: "Reddit Saved")
- `fetchLimit` - Maximum posts to fetch (default: 1000)
- `autoUnsave` - Auto-remove from Reddit after import (default: false)
- `skipExisting` - Skip already imported posts (default: true)

### Advanced Settings

- `mediaFolder` - Folder for downloaded media files (default: "Attachments")
- `downloadImages` - Auto-download linked images (default: false)
- `downloadGifs` - Auto-download GIF animations (default: false)
- `downloadVideos` - Auto-download video files (default: false)
- `oauthRedirectPort` - OAuth callback port (default: 9638)
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
3. Fill in details:
   - Name: Any name for your app
   - App type: Select "script"
   - Redirect URI: `http://localhost:9638` (or your configured port)
4. Save the app
5. Note the Client ID (under app name) and Secret

### Required Permissions

- `identity` - Access user account info
- `history` - Access saved posts/comments
- `read` - Read Reddit content

## Error Handling

### Common Issues

1. **Invalid Client Credentials**
   - Verify Client ID and Secret in settings
   - Ensure app type is "script" on Reddit

2. **Token Expiration**
   - Plugin auto-refreshes tokens
   - Manual re-authentication available in settings

3. **Rate Limiting**
   - Implements pagination for large saved lists
   - Respects Reddit API limits

4. **File Creation Errors**
   - Validates folder existence
   - Sanitizes filenames for OS compatibility

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
