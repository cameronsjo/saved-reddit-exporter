# Saved Reddit Exporter

## Let's Talk About Your Reddit Saves

Be honest. When's the last time you actually _found_ something you saved on Reddit?

You've got hundreds of saved posts. Maybe thousands. A chaotic museum of "ooh, useful" moments stretching back years. Recipes you'll never cook. Tutorials you'll never follow. That one comment explaining how mortgages actually work that you _desperately_ needed six months later and absolutely could not find.

Reddit's save button is a lie. It's not "save." It's "throw into the void and feel productive."

And here's the fun part nobody tells you: **Reddit caps you at 1000 saves.** Hit that limit and your oldest saves just disappear without so much as a notification. That post you saved three years ago about Kubernetes networking? Gone, bestie. Reddit needed the space.

## Meanwhile, In Your Obsidian Vault

You've got this beautiful, searchable, linked knowledge system. You can find literally anything in milliseconds. It's gorgeous. It sparks joy.

But your Reddit saves? Trapped in Reddit's UX nightmare, completely disconnected from your actual brain system, slowly being deleted by a limit you didn't know existed.

_Make it make sense._

## Enter: This Plugin

We're breaking your content out of Reddit jail.

**Your saves become searchable.** Markdown files in Obsidian. `Cmd+O`, type two words, found it. Revolutionary concept, apparently.

**Grab _all_ your stuff.** Saved posts, saved comments, upvoted posts, your own submissions, your own comments. That mass you wrote explaining regex to a stranger? It's yours now. Export it before Reddit buries it.

**Be picky about it.** Filters! Only import the good subreddits. Only high-scoring posts. Skip NSFW. Filter by date, author, keywords. Leave the shitposts behind, keep the knowledge.

**Stay organized.** Auto-sort into subreddit folders. Include comment threads. Frontmatter for Dataview queries. No more folder of 847 files named variations of "interesting_post.md".

**Never hit the limit again.** Export, unsave, repeat. Keep Reddit under 1000, keep everything in Obsidian. The system _works_.

**Large imports don't flop.** Internet dies at post 300? Resume where you left off. We have checkpoints like a video game because we're not animals.

## The Vibe

1. Connect Reddit (OAuth, very official, very secure, one-time thing)
2. Set your filters (or don't, no judgment, import the chaos)
3. Preview first if you're nervous
4. Hit import, watch the magic
5. Unsave from Reddit if you want (stay under 1000)

---

## Setup

### 1. Create a Reddit App

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Click "Create App" or "Create Another App"
3. Configure:
   - **Name**: Whatever you want (e.g., "Obsidian Exporter")
   - **Type**: Select **"script"**
   - **Description**: Optional
   - **About URL**: Optional
   - **Redirect URI**: `http://localhost:9638` (or your configured port)
4. Click "Create app"
5. Note your **Client ID** (under the app name) and **Client Secret**

### 2. Install the Plugin

**From Obsidian Community Plugins (Recommended):**

1. Open Settings > Community Plugins
2. Search for "Saved Reddit Exporter"
3. Install and enable

**Via BRAT (Beta Testing / Early Access):**

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open command palette → "BRAT: Add a beta plugin for testing"
3. Enter: `cameronsjo/saved-reddit-exporter`
4. Enable the plugin in Settings → Community Plugins

_BRAT lets you get updates before they hit the community plugin list, and test beta features._

**Manual Installation:**

1. Download the latest release from [GitHub Releases](https://github.com/cameronsjo/saved-reddit-exporter/releases)
2. Extract `main.js` and `manifest.json` to `.obsidian/plugins/saved-reddit-exporter/`
3. Enable the plugin in Obsidian settings

### 3. Configure & Connect

1. Open plugin settings
2. Enter your Reddit Client ID and Secret
3. Click "Authenticate with Reddit"
4. Authorize in the browser popup
5. You're in

---

## Settings

### Content Types

Choose what to import:

- **Saved Posts** - Your saved posts (default: on)
- **Saved Comments** - Your saved comments (default: on)
- **Upvoted Posts** - Posts you've upvoted
- **Your Posts** - Posts you've submitted
- **Your Comments** - Comments you've written

### Filtering

When enabled, filter your imports by:

- **Subreddits** - Include or exclude specific subreddits (supports regex)
- **Score** - Minimum/maximum score, upvote ratio
- **Date Range** - Last day/week/month/year or custom range
- **Post Type** - Text, link, image, video
- **Keywords** - Filter by title or content keywords
- **Flair** - Include or exclude specific flairs
- **Authors** - Include or exclude specific users
- **Domains** - Filter link posts by domain
- **NSFW** - Exclude adult content

### Organization

- **Save Location** - Folder for imported posts (default: "Reddit Saved")
- **Organize by Subreddit** - Create subfolders per subreddit
- **Export Post Comments** - Include comment threads on posts
- **Comment Threshold** - Minimum upvotes for included comments

### Unsave Options

- **Off** - Keep everything saved on Reddit
- **Prompt** - Choose which items to unsave after import
- **Auto** - Automatically unsave everything that was imported

### Media Downloads

- **Download Images** - PNG, JPG, WEBP, etc.
- **Download GIFs** - Animated GIFs
- **Download Videos** - MP4, WEBM, etc.
- **Media Folder** - Where to store downloads (default: "Attachments")

### Advanced

- **Fetch Limit** - Maximum items per import (Reddit caps at 1000)
- **Skip Existing** - Don't re-import posts already in vault
- **OAuth Port** - Port for auth callback (default: 9638)
- **Enable Checkpointing** - Resume interrupted imports
- **Show Performance Stats** - Log import metrics

---

## Mobile Support

**Full support** with the right setup.

| Feature               | Desktop | Mobile |
| --------------------- | ------- | ------ |
| Reddit authentication | ✅      | ✅\*   |
| Import posts          | ✅      | ✅     |
| Sync/resume imports   | ✅      | ✅     |
| Media downloads       | ✅      | ✅     |
| All other features    | ✅      | ✅     |

\*Mobile authentication requires using Reddit's "installed app" type (see setup below).

### Mobile-First Setup (Recommended)

For authentication that works everywhere including iOS and Android:

1. Create a Reddit app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Select **"installed app"** as the app type
3. Set redirect URI to: `obsidian://saved-reddit-exporter`
4. In plugin settings, enter only the **Client ID** (leave Client Secret empty)
5. Authenticate directly on any device!

### Desktop-Only Setup (Legacy)

If you only use desktop, you can use the traditional "script" app:

1. Create a Reddit app with type **"script"**
2. Set redirect URI to: `http://localhost:9638`
3. Enter both Client ID and Client Secret in settings

The plugin auto-detects which mode to use based on whether you've entered a Client Secret.

---

## Commands

| Command                         | What it does                                  |
| ------------------------------- | --------------------------------------------- |
| Fetch saved posts from Reddit   | Main import - runs with your current settings |
| Preview import (dry run)        | See what would be imported without doing it   |
| Resume interrupted import       | Continue from last checkpoint                 |
| Cancel current import           | Stop a running import gracefully              |
| Authenticate with Reddit        | (Re)connect your Reddit account               |
| Rescan vault for imported posts | Rebuild the list of already-imported IDs      |

---

## Imported File Format

Each post becomes a searchable markdown file:

```markdown
---
type: reddit-post
reddit_id: abc123
subreddit: learnprogramming
author: helpful_stranger
created: 2024-01-15T14:30:00.000Z
score: 1847
permalink: https://reddit.com/r/learnprogramming/comments/...
url: https://example.com/resource
---

# How to Actually Understand Recursion

Post content here, fully formatted...

## Comments

> **another_user** (425 points)
> This explanation finally made it click for me...
```

Works beautifully with Dataview, search, graph view, and everything else Obsidian does well.

---

## Build from Source

```bash
npm install
npm run dev    # Development with watch mode
npm run build  # Production build
npm test       # Run tests
```

---

## Privacy & Security

- All authentication happens locally through Reddit's official OAuth
- No external servers, no analytics, no tracking
- Credentials stored in your vault's plugin data
- You control what gets imported and when
- Open source - read the code yourself

---

## Support

**Found a bug?** [Open an issue](https://github.com/cameronsjo/saved-reddit-exporter/issues)

**Want a feature?** [Start a discussion](https://github.com/cameronsjo/saved-reddit-exporter/discussions)

**Find this useful?** Consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/cameronsjo)

---

## License

MIT - Do whatever you want with it.

---

_Now go check how many saves you have. I'll wait._
