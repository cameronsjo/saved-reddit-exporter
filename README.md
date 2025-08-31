# Saved Reddit Posts - Obsidian Plugin

Import and manage your saved Reddit posts and comments directly in Obsidian.

## Features

- 🔐 Secure OAuth authentication with Reddit
- 📥 Import saved posts and comments as Markdown files
- 🗂️ Organized with structured frontmatter metadata
- 🔄 Optional auto-unsave from Reddit after import
- 📝 Preserves Reddit markdown formatting
- 🏷️ Automatic categorization by type (post/comment)
- 🔍 Smart duplicate detection - won't re-download renamed files
- 📊 Tracks imported posts by Reddit ID in frontmatter
- 📸 **Media Downloads**: Automatically download images, GIFs, and videos
- 🎨 **Rich Media Support**: Images, videos, YouTube embeds, and GIF animations
- ⚙️ **Configurable Storage**: Separate folders for posts and media attachments

## Setup

### 1. Create a Reddit App

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Click "Create App" or "Create Another App"
3. Configure:
   - **Name**: Choose any name
   - **Type**: Select "script"
   - **Redirect URI**: `http://localhost:9638` (or your configured port)
4. Save and note your Client ID and Secret

### 2. Install the Plugin

1. Download the latest release
2. Extract to your vault's `.obsidian/plugins/saved-reddit-posts/` folder
3. Enable the plugin in Obsidian settings

### 3. Configure

1. Open plugin settings
2. Enter your Reddit Client ID and Secret
3. Click "Authenticate" to connect your Reddit account
4. Configure import preferences

## Usage

### Import Saved Posts

- Click the download icon in the ribbon, or
- Use command palette: "Fetch saved posts from Reddit"

### Settings

- **Save Location**: Folder for imported posts (default: "Reddit Saved")
- **Fetch Limit**: Maximum posts to import per session
- **Skip Existing**: Skip posts already in vault (prevents duplicates)
- **Auto-unsave**: Remove from Reddit after importing

#### Advanced Settings

- **Media Folder**: Folder for downloaded media files (default: "Attachments")
- **Download Images**: Automatically download linked images (PNG, JPG, WEBP, etc.)
- **Download GIFs**: Automatically download GIF animations
- **Download Videos**: Automatically download video files (MP4, WEBM, etc.)
- **OAuth Port**: Port for authentication callback (default: 9638)

## Imported File Format

Each post/comment becomes a Markdown file with:

```markdown
---
type: reddit-post
subreddit: AskReddit
author: username
created: 2024-01-01T00:00:00.000Z
permalink: https://reddit.com/r/...
score: 1234
---

# Post Title

Post content here...
```

## Build from Source

```bash
npm install
npm run dev    # Development build
npm run build  # Production build
```

## Privacy & Security

- All authentication happens locally through Reddit's OAuth
- No external servers involved
- Credentials stored securely in your vault
- You control what gets imported and when

## Support

Report issues at: [GitHub Issues](https://github.com/cameronsjo/saved-reddit-extractor/issues)

## Support the Project

If you find this plugin helpful, consider supporting its development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/cameronsjo)

## License

MIT