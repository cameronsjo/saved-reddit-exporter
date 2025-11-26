# Proposed Feature Issues

Create these issues on GitHub by going to the repository's Issues tab and clicking "New Issue".

---

## Issue 1: MCP Server Mode for AI Assistant Integration

**Title:** `[Feature]: MCP Server Mode - Expose vault content for AI assistants`

**Labels:** `enhancement`, `ai-integration`

**Feature Type:** New functionality

**Problem Description:**
AI assistants like Claude, ChatGPT, and Cursor are increasingly being used alongside Obsidian for knowledge management. Currently, there's no way for these AI tools to access imported Reddit content semantically. Users have to manually copy-paste content when asking AI assistants about their saved posts.

**Proposed Solution:**
Implement an MCP (Model Context Protocol) server mode that exposes imported Reddit content as resources. This would allow AI assistants to:

- Search across saved Reddit posts by topic, subreddit, or content
- Retrieve full post content and metadata
- Understand the user's saved content knowledge base

Implementation could leverage the existing Local REST API plugin pattern or implement a standalone MCP server following the [MCP specification](https://modelcontextprotocol.io/).

**Alternatives Considered:**

- Relying on third-party MCP servers (less integrated, requires separate setup)
- Using Dataview queries piped to AI (manual, not real-time)

**Priority:** Important

**Implementation Complexity:** Complex (new component/system)

**Use Case:**
Users who use AI assistants for research can ask questions like "What did I save about TypeScript best practices?" and get relevant results from their imported Reddit posts. The AI can reference specific saved posts when answering questions.

---

## Issue 2: Bases View Plugin for Reddit Content

**Title:** `[Feature]: Custom Bases view type for Reddit content visualization`

**Labels:** `enhancement`, `obsidian-integration`

**Feature Type:** New functionality

**Problem Description:**
Obsidian 1.10 introduced Bases - a powerful database-like view for notes. While imported Reddit posts have rich frontmatter metadata (subreddit, score, date, type), users must manually create Bases views to visualize this data. There's no purpose-built view optimized for Reddit content.

**Proposed Solution:**
Create a custom Bases view plugin using the new [Bases API](https://docs.obsidian.md/plugins/guides/bases-view) that provides:

- Reddit-optimized card/table/timeline layouts
- Pre-configured columns for Reddit metadata (score, subreddit, author)
- Subreddit grouping with icons/colors
- Score-based sorting and filtering
- Thumbnail previews for media posts

Reference implementation: [obsidian-maps](https://github.com/obsidianmd/obsidian-maps) demonstrates Bases API usage.

**Alternatives Considered:**

- Providing Dataview query examples (less visual, requires user setup)
- Using standard Bases views (works but not optimized for Reddit metadata)

**Priority:** Would be helpful

**Implementation Complexity:** Complex (new component/system)

**Use Case:**
Users can open a dedicated "Reddit Feed" view showing all their saved content in a visual, filterable format similar to Reddit itself but within Obsidian. They can quickly scan by subreddit, sort by score, or filter by content type.

---

## Issue 3: AI-Powered Semantic Tagging

**Title:** `[Feature]: AI-powered semantic tagging and categorization`

**Labels:** `enhancement`, `ai-integration`

**Feature Type:** New functionality

**Problem Description:**
Currently, posts are only tagged by subreddit and flair. However, content often spans multiple topics that aren't captured by subreddit alone. A post in r/programming about machine learning won't be connected to a post in r/MachineLearning about the same topic.

**Proposed Solution:**
Integrate with Obsidian AI plugins (Smart Connections, Copilot, or local LLMs) to:

- Generate semantic tags based on actual content
- Create topic clusters across subreddits
- Suggest connections to existing vault notes
- Generate concise titles for posts with overly long/vague titles

Configuration options:

- Choose AI provider (OpenAI, Ollama, existing Obsidian AI plugin)
- Custom prompt templates for categorization
- Tag prefix to distinguish AI-generated tags

**Alternatives Considered:**

- Keyword extraction (less accurate, no semantic understanding)
- Manual tagging (time-consuming, inconsistent)

**Priority:** Nice to have

**Implementation Complexity:** Complex (new component/system)

**Use Case:**
When importing saved posts, the plugin automatically analyzes content and adds tags like `#topic/rust`, `#topic/web-development`, `#topic/career-advice` regardless of which subreddit they came from. Posts about similar topics get connected automatically.

---

## Issue 4: Browser Extension / Web Clipper Companion

**Title:** `[Feature]: Browser extension for direct Reddit saving to Obsidian`

**Labels:** `enhancement`, `new-platform`

**Feature Type:** New functionality

**Problem Description:**
The current workflow requires users to: 1) Save on Reddit, 2) Open Obsidian, 3) Run the import. This multi-step process means content sits in Reddit's saved list until the next sync. Users may forget to import, or want immediate capture.

**Proposed Solution:**
Create a companion browser extension that:

- Adds a "Save to Obsidian" button on Reddit posts/comments
- Sends content directly to Obsidian via URI scheme or Local REST API
- Works alongside Reddit's native save (optional)
- Shows sync status for already-imported posts
- Supports bulk selection and export

Platforms: Chrome, Firefox, Safari (via WebExtension APIs)

**Alternatives Considered:**

- Obsidian Web Clipper (generic, not Reddit-optimized)
- Bookmarklet approach (limited functionality)
- Mobile share sheet integration (iOS/Android only)

**Priority:** Would be helpful

**Implementation Complexity:** Very complex (major architecture change)

**Use Case:**
While browsing Reddit, users click the extension icon on any post to immediately save it to their Obsidian vault. No need to use Reddit's save feature or remember to sync later. The extension shows a checkmark on posts already in the vault.

---

## Issue 5: AI-Powered Title Summarization

**Title:** `[Feature]: AI-generated summary titles for long/vague post titles`

**Labels:** `enhancement`, `ai-integration`

**Feature Type:** Enhancement to existing feature

**Problem Description:**
Many Reddit posts have titles that are:

- Too long (100+ characters, truncated in file explorers)
- Vague or clickbait ("This is amazing", "Help please")
- Questions that don't summarize the actual answer/content

This makes it hard to find content later when browsing the vault.

**Proposed Solution:**
Add an option to generate concise, descriptive titles using AI:

- Integrate with existing Obsidian AI plugins (Smart Connections, Text Generator, Copilot)
- Provide fallback to OpenAI/Ollama API directly
- Store original title in frontmatter, use summary as filename
- Configurable max length (default: 60 chars)
- Option to run on import or batch-process existing imports

Example:

- Original: "I've been programming for 15 years and here's what I wish someone told me when I started, especially about debugging and code reviews"
- Summary: "15-Year Dev Advice - Debugging and Code Reviews"

**Alternatives Considered:**

- Simple truncation (loses meaning)
- Keyword extraction (not human-readable)
- Manual renaming (time-consuming)

**Priority:** Would be helpful

**Implementation Complexity:** Moderate (new function/method)

**Use Case:**
Users enable "Summarize long titles" in settings. When importing a post with a 150-character title, the plugin calls the configured AI to generate a 50-character summary. The file is named with the summary, making it easy to scan in the file explorer.

---

## Issue 6: Automatic Semantic Versioning via GitHub Actions

**Title:** `[Chore]: Implement automatic semantic versioning with release-please`

**Labels:** `chore`, `ci-cd`, `developer-experience`

**Feature Type:** Developer experience

**Problem Description:**
Currently, releases require manual version bumping in `package.json`, `manifest.json`, and `versions.json`. This is error-prone and requires developers to remember conventional commit formats for changelogs.

**Proposed Solution:**
Implement [release-please](https://github.com/google-github-actions/release-please-action) GitHub Action to:

- Automatically detect version bumps from conventional commits
- Generate changelogs from commit messages
- Create release PRs with version updates
- Trigger releases on PR merge
- Update all version files automatically

**Priority:** Important

**Implementation Complexity:** Moderate (new function/method)

**Use Case:**
Developers make commits using conventional commit format (`feat:`, `fix:`, `chore:`). Release-please automatically creates a PR with version bump and changelog. Merging the PR triggers the release workflow.
