import { App, Notice, Plugin, PluginSettingTab, requestUrl, RequestUrlParam, Setting, Modal, TextComponent, TFile, TFolder, normalizePath } from 'obsidian';

// Constants
const REDDIT_OAUTH_SCOPES = 'identity history read';
const REDDIT_USER_AGENT = 'Obsidian:saved-reddit-posts:v1.0.0';
const DEFAULT_REDIRECT_PORT = 9638;
const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit
const REDDIT_PAGE_SIZE = 100; // Max items per request
const DEFAULT_RATE_LIMIT_DELAY = 2000; // 2 seconds default delay

interface RedditSavedSettings {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken: string;
    tokenExpiry: number;
    username: string;
    saveLocation: string;
    autoUnsave: boolean;
    fetchLimit: number;
    importedIds: string[]; // Track imported Reddit IDs
    skipExisting: boolean; // Skip already imported posts
    oauthRedirectPort: number; // OAuth callback port
    showAdvancedSettings: boolean; // Toggle advanced settings visibility
    downloadImages: boolean; // Download linked images
    downloadGifs: boolean; // Download GIF files
    downloadVideos: boolean; // Download video files
    mediaFolder: string; // Folder for downloaded media
}

const DEFAULT_SETTINGS: RedditSavedSettings = {
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    accessToken: '',
    tokenExpiry: 0,
    username: '',
    saveLocation: 'Reddit Saved',
    autoUnsave: false,
    fetchLimit: REDDIT_MAX_ITEMS,
    importedIds: [],
    skipExisting: true,
    oauthRedirectPort: DEFAULT_REDIRECT_PORT,
    showAdvancedSettings: false,
    downloadImages: false,
    downloadGifs: false,
    downloadVideos: false,
    mediaFolder: 'Attachments'
}

export default class RedditSavedPlugin extends Plugin {
    settings: RedditSavedSettings;
    private authorizationInProgress = false;

    async onload() {
        await this.loadSettings();

        // Add ribbon icon
        this.addRibbonIcon('download', 'Fetch Reddit Saved Posts', async () => {
            await this.fetchSavedPosts();
        });

        // Add commands
        this.addCommand({
            id: 'fetch-reddit-saved',
            name: 'Fetch saved posts from Reddit',
            callback: async () => {
                await this.fetchSavedPosts();
            }
        });

        this.addCommand({
            id: 'authenticate-reddit',
            name: 'Authenticate with Reddit',
            callback: async () => {
                await this.initiateOAuth();
            }
        });

        this.addCommand({
            id: 'rescan-reddit-ids',
            name: 'Rescan vault for imported Reddit posts',
            callback: async () => {
                await this.rescanImportedIds();
            }
        });

        // Add settings tab
        this.addSettingTab(new RedditSavedSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async initiateOAuth() {
        if (this.authorizationInProgress) {
            new Notice('Authorization already in progress');
            return;
        }

        if (!this.settings.clientId || !this.settings.clientSecret) {
            new Notice('Please enter your Client ID and Client Secret in plugin settings first');
            return;
        }

        this.authorizationInProgress = true;

        const state = Math.random().toString(36).substring(2, 15);
        const redirectUri = `http://localhost:${this.settings.oauthRedirectPort}`;

        const authUrl = `https://www.reddit.com/api/v1/authorize?` +
            `client_id=${this.settings.clientId}` +
            `&response_type=code` +
            `&state=${state}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&duration=permanent` +
            `&scope=${encodeURIComponent(REDDIT_OAUTH_SCOPES)}`;

        // Store state for verification
        await this.saveData({ ...await this.loadData(), oauthState: state });

        new Notice('Copy the authorization code from the URL after approving...');
        window.open(authUrl);

        // Show input modal for the user to paste the code
        this.showAuthCodeInput(state);
    }

    showAuthCodeInput(state: string) {
        const modal = new AuthCodeModal(this.app, 
            // Success callback
            async (code: string) => {
                try {
                    await this.handleManualAuthCode(code, state);
                    new Notice('Successfully authenticated with Reddit!');
                } catch (error) {
                    new Notice(`Failed to authenticate: ${error.message}`);
                } finally {
                    this.authorizationInProgress = false;
                }
            },
            // Cancel callback
            () => {
                this.authorizationInProgress = false;
                new Notice('Reddit authentication cancelled');
            }
        );
        modal.open();
    }

    async handleManualAuthCode(code: string, expectedState: string) {
        const savedData = await this.loadData();
        
        if (expectedState !== savedData.oauthState) {
            throw new Error('Invalid authorization state');
        }

        await this.exchangeCodeForToken(code);
    }


    async exchangeCodeForToken(code: string) {
        const auth = btoa(`${this.settings.clientId}:${this.settings.clientSecret}`);

        const params: RequestUrlParam = {
            url: 'https://www.reddit.com/api/v1/access_token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(`http://localhost:${this.settings.oauthRedirectPort}`)}`
        };

        const response = await requestUrl(params);

        if (response.json.error) {
            throw new Error(response.json.error);
        }

        this.settings.accessToken = response.json.access_token;
        this.settings.refreshToken = response.json.refresh_token;
        this.settings.tokenExpiry = Date.now() + (response.json.expires_in * 1000);

        await this.saveSettings();
        await this.fetchUsername();
    }

    async refreshAccessToken() {
        if (!this.settings.refreshToken) {
            throw new Error('No refresh token available. Please authenticate first.');
        }

        const auth = btoa(`${this.settings.clientId}:${this.settings.clientSecret}`);

        const params: RequestUrlParam = {
            url: 'https://www.reddit.com/api/v1/access_token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=refresh_token&refresh_token=${this.settings.refreshToken}`
        };

        const response = await requestUrl(params);

        if (response.json.error) {
            throw new Error(response.json.error);
        }

        this.settings.accessToken = response.json.access_token;
        this.settings.tokenExpiry = Date.now() + (response.json.expires_in * 1000);

        await this.saveSettings();
    }

    async ensureValidToken() {
        if (!this.settings.accessToken || Date.now() >= this.settings.tokenExpiry) {
            await this.refreshAccessToken();
        }
    }

    async handleRateLimit(response: any): Promise<number> {
        const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
        const reset = parseInt(response.headers['x-ratelimit-reset'] || '0');
        const used = response.headers['x-ratelimit-used'] || 'unknown';
        
        console.log(`Reddit API: ${remaining} requests remaining, used: ${used}`);
        
        // If we're getting close to the limit or hit it
        if (remaining <= 10) {
            const resetTime = reset * 1000; // Convert to milliseconds
            const currentTime = Date.now();
            const waitTime = Math.max(resetTime - currentTime, DEFAULT_RATE_LIMIT_DELAY);
            
            if (remaining === 0) {
                new Notice(`Rate limited! Waiting ${Math.round(waitTime / 1000)}s before continuing...`);
                console.warn(`Reddit API rate limit hit. Waiting ${waitTime}ms`);
            } else {
                console.log(`Reddit API rate limit close (${remaining} remaining). Adding delay.`);
            }
            
            return waitTime;
        }
        
        // Add small delay between requests to be respectful
        return remaining > 50 ? 100 : 500;
    }

    async makeRateLimitedRequest(params: RequestUrlParam, retries = 3): Promise<any> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await requestUrl(params);
                
                // Handle rate limiting
                const delay = await this.handleRateLimit(response);
                if (delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                return response;
            } catch (error) {
                if (error.status === 429) { // Too Many Requests
                    const retryAfter = parseInt(error.headers?.['retry-after'] || '60') * 1000;
                    new Notice(`Rate limited! Retrying in ${retryAfter / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }
                
                if (attempt === retries - 1) {
                    throw error;
                }
                
                // Exponential backoff for other errors
                const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
                console.warn(`Request failed (attempt ${attempt + 1}/${retries}), retrying in ${backoffDelay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
        
        throw new Error('Max retries exceeded');
    }

    async fetchUsername() {
        await this.ensureValidToken();

        const params: RequestUrlParam = {
            url: 'https://oauth.reddit.com/api/v1/me',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.settings.accessToken}`,
                'User-Agent': REDDIT_USER_AGENT
            }
        };

        const response = await this.makeRateLimitedRequest(params);
        this.settings.username = response.json.name;
        await this.saveSettings();
    }

    async fetchSavedPosts() {
        if (!this.settings.refreshToken) {
            new Notice('Please authenticate with Reddit first');
            await this.initiateOAuth();
            return;
        }

        try {
            await this.ensureValidToken();

            new Notice('Fetching saved posts...');

            const savedItems = await this.fetchAllSaved();

            if (savedItems.length === 0) {
                new Notice('No saved posts found');
                return;
            }

            const result = await this.createMarkdownFiles(savedItems);

            // Provide detailed feedback
            if (result.skipped > 0) {
                new Notice(`Imported ${result.imported} new items, skipped ${result.skipped} already imported items`);
            } else {
                new Notice(`Successfully imported ${result.imported} saved items`);
            }

            if (this.settings.autoUnsave) {
                // Only unsave newly imported items
                const itemsToUnsave = savedItems.filter(item => {
                    return !this.settings.skipExisting || result.imported > 0;
                });
                if (itemsToUnsave.length > 0) {
                    await this.unsaveItems(itemsToUnsave);
                }
            }
        } catch (error) {
            console.error('Error fetching saved posts:', error);
            new Notice(`Error: ${error.message}`);
        }
    }

    async fetchAllSaved(): Promise<any[]> {
        const items: any[] = [];
        let after = '';
        let hasMore = true;
        let pageCount = 0;
        const maxPages = Math.ceil(Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS) / REDDIT_PAGE_SIZE);

        new Notice(`Fetching saved posts (max ${Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS)})...`);

        while (hasMore && items.length < this.settings.fetchLimit && pageCount < maxPages) {
            pageCount++;
            const pageSize = Math.min(REDDIT_PAGE_SIZE, this.settings.fetchLimit - items.length);
            
            console.log(`Fetching page ${pageCount}/${maxPages}, items so far: ${items.length}`);
            
            const params: RequestUrlParam = {
                url: `https://oauth.reddit.com/user/${this.settings.username}/saved?limit=${pageSize}${after ? `&after=${after}` : ''}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.accessToken}`,
                    'User-Agent': REDDIT_USER_AGENT
                }
            };

            const response = await this.makeRateLimitedRequest(params);
            const data = response.json.data;

            if (data.children && data.children.length > 0) {
                items.push(...data.children);
                after = data.after;
                hasMore = !!after && items.length < REDDIT_MAX_ITEMS; // Reddit's hard limit
                
                // Update progress
                if (pageCount % 3 === 0 || !hasMore) {
                    new Notice(`Fetched ${items.length} saved items...`);
                }
            } else {
                hasMore = false;
                console.log('No more items returned from Reddit API');
            }

            // Prevent infinite loops
            if (pageCount >= 50) { // Safety limit
                console.warn('Reached safety limit of 50 pages');
                break;
            }
        }

        const finalCount = Math.min(items.length, this.settings.fetchLimit);
        console.log(`Fetch complete: ${finalCount} items (${pageCount} pages requested)`);
        
        return items.slice(0, finalCount);
    }

    async scanExistingRedditIds(): Promise<Set<string>> {
        const existingIds = new Set<string>();
        
        // Scan all markdown files in the vault for Reddit IDs
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            try {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.id && cache?.frontmatter?.type?.startsWith('reddit-')) {
                    existingIds.add(cache.frontmatter.id);
                }
            } catch (error) {
                console.error(`Error reading frontmatter from ${file.path}:`, error);
            }
        }
        
        return existingIds;
    }

    async rescanImportedIds() {
        new Notice('Rescanning vault for Reddit posts...');
        
        const existingIds = await this.scanExistingRedditIds();
        
        // Update the imported IDs list with what's actually in the vault
        this.settings.importedIds = Array.from(existingIds);
        await this.saveSettings();
        
        new Notice(`Found ${existingIds.size} imported Reddit posts in vault`);
    }

    async createMarkdownFiles(items: any[]) {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.saveLocation);

        if (!folder) {
            await this.app.vault.createFolder(this.settings.saveLocation);
        }

        // Scan for existing Reddit IDs if skip existing is enabled
        let existingIds: Set<string> = new Set();
        if (this.settings.skipExisting) {
            existingIds = await this.scanExistingRedditIds();
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const item of items) {
            const data = item.data;
            const redditId = data.id;
            
            // Check if this post has already been imported
            if (this.settings.skipExisting && existingIds.has(redditId)) {
                skippedCount++;
                console.log(`Skipping already imported post: ${redditId}`);
                continue;
            }

            const isComment = item.kind === 't1';

            const fileName = this.sanitizeFileName(
                isComment ?
                    `Comment - ${data.link_title || 'Unknown'}` :
                    data.title
            );

            // Generate unique filename if it already exists
            let filePath = `${this.settings.saveLocation}/${fileName}.md`;
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${this.settings.saveLocation}/${fileName} ${counter}.md`;
                counter++;
            }

            const content = await this.formatRedditContent(data, isComment);
            await this.app.vault.create(filePath, content);
            
            // Add to imported IDs
            if (!this.settings.importedIds.includes(redditId)) {
                this.settings.importedIds.push(redditId);
            }
            
            importedCount++;
        }

        // Save updated imported IDs
        await this.saveSettings();

        // Return counts for better user feedback
        return { imported: importedCount, skipped: skippedCount };
    }

    async formatRedditContent(data: any, isComment: boolean): Promise<string> {
        const created = new Date(data.created_utc * 1000).toISOString();
        const createdDate = new Date(data.created_utc * 1000).toLocaleDateString();
        const mediaInfo = this.analyzeMedia(data);

        let content = `---\n`;
        content += `type: ${isComment ? 'reddit-comment' : 'reddit-post'}\n`;
        content += `subreddit: ${data.subreddit}\n`;
        content += `author: ${data.author}\n`;
        content += `created: ${created}\n`;
        content += `date: ${createdDate}\n`;
        content += `permalink: https://reddit.com${data.permalink}\n`;
        content += `id: ${data.id}\n`;
        content += `saved: true\n`;

        if (!isComment) {
            content += `title: "${data.title.replace(/"/g, '\\"')}"\n`;
            content += `score: ${data.score}\n`;
            content += `num_comments: ${data.num_comments}\n`;
            content += `upvote_ratio: ${data.upvote_ratio || 'unknown'}\n`;

            if (data.link_flair_text) {
                content += `flair: "${data.link_flair_text.replace(/"/g, '\\"')}"\n`;
            }
            
            if (data.is_self) {
                content += `post_type: text\n`;
            } else if (data.url) {
                content += `post_type: ${mediaInfo.type}\n`;
                content += `url: ${data.url}\n`;
                if (mediaInfo.domain) {
                    content += `domain: ${mediaInfo.domain}\n`;
                }
            }

            // Add media-specific metadata
            if (mediaInfo.isMedia) {
                content += `media_type: ${mediaInfo.mediaType}\n`;
                if (data.preview?.images?.[0]?.source?.url) {
                    content += `thumbnail: ${data.preview.images[0].source.url.replace(/&amp;/g, '&')}\n`;
                }
            }
        } else {
            content += `post_title: "${(data.link_title || '').replace(/"/g, '\\"')}"\n`;
            content += `score: ${data.score}\n`;
            content += `is_submitter: ${data.is_submitter || false}\n`;
        }

        content += `---\n\n`;

        if (isComment) {
            content += this.formatCommentHeader(data);
        } else {
            content += await this.formatPostHeader(data, mediaInfo);
        }

        if (data.selftext || data.body) {
            content += this.convertRedditMarkdown(data.selftext || data.body);
        }

        content += this.formatFooter(data, isComment);

        return content;
    }

    analyzeMedia(data: any): any {
        const url = data.url || '';
        const domain = data.domain || '';
        
        // Image formats
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
        
        let mediaInfo = {
            type: 'link' as string,
            mediaType: null as string | null,
            isMedia: false,
            domain: domain,
            canEmbed: false
        };

        if (!url) return mediaInfo;

        // Direct image/video links
        const urlLower = url.toLowerCase();
        if (imageExtensions.some(ext => urlLower.includes(ext))) {
            mediaInfo.type = 'image';
            mediaInfo.mediaType = 'image';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = true;
        } else if (videoExtensions.some(ext => urlLower.includes(ext))) {
            mediaInfo.type = 'video';
            mediaInfo.mediaType = 'video';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = true;
        }
        // Reddit-hosted media
        else if (domain.includes('i.redd.it')) {
            mediaInfo.type = 'image';
            mediaInfo.mediaType = 'reddit-image';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = true;
        }
        else if (domain.includes('v.redd.it')) {
            mediaInfo.type = 'video';
            mediaInfo.mediaType = 'reddit-video';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = false; // Reddit videos need special handling
        }
        // Popular media platforms
        else if (domain.includes('imgur.com')) {
            mediaInfo.type = 'image';
            mediaInfo.mediaType = 'imgur';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = true;
        }
        else if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            mediaInfo.type = 'video';
            mediaInfo.mediaType = 'youtube';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = false;
        }
        else if (domain.includes('gfycat.com') || domain.includes('redgifs.com')) {
            mediaInfo.type = 'gif';
            mediaInfo.mediaType = 'gif-platform';
            mediaInfo.isMedia = true;
            mediaInfo.canEmbed = false;
        }

        return mediaInfo;
    }

    async formatPostHeader(data: any, mediaInfo: any): Promise<string> {
        let content = '';
        
        // Subreddit badge
        content += `> **r/${data.subreddit}** `;
        if (data.link_flair_text) {
            content += `• \`${data.link_flair_text}\` `;
        }
        content += `• 👤 u/${data.author} `;
        content += `• ⬆️ ${data.score} `;
        content += `• 💬 ${data.num_comments}\n\n`;

        // Title
        content += `# ${data.title}\n\n`;

        // Media handling
        if (mediaInfo.isMedia) {
            content += await this.formatMediaContent(data, mediaInfo);
        } else if (data.url && !data.is_self) {
            content += `🔗 **External Link:** [${mediaInfo.domain}](${data.url})\n\n`;
        }

        return content;
    }

    formatCommentHeader(data: any): string {
        let content = '';
        
        // Parent post context
        content += `> **r/${data.subreddit}** • 👤 u/${data.author} `;
        if (data.is_submitter) {
            content += `👑 **OP** `;
        }
        content += `• ⬆️ ${data.score}\n\n`;
        
        content += `# 💬 Comment on: ${data.link_title || 'Unknown Post'}\n\n`;
        content += `> 📝 [View original post](https://reddit.com${data.link_permalink || ''})\n\n`;

        return content;
    }

    async formatMediaContent(data: any, mediaInfo: any): Promise<string> {
        let content = '';
        const url = data.url;

        // Download media if enabled
        let localPath: string | null = null;
        if (this.shouldDownloadMedia(mediaInfo, url)) {
            try {
                const filename = this.generateMediaFilename(data, url, mediaInfo);
                localPath = await this.downloadMediaFile(url, filename);
            } catch (error) {
                console.error('Error downloading media:', error);
            }
        }

        switch (mediaInfo.mediaType) {
            case 'image':
            case 'reddit-image':
            case 'imgur':
                content += `📸 **Image**\n\n`;
                if (localPath) {
                    content += `![${data.title}](./${localPath})\n\n`;
                    content += `*Downloaded locally: ${localPath}*\n\n`;
                } else {
                    content += `![${data.title}](${url})\n\n`;
                }
                if (data.preview?.images?.[0]?.source) {
                    const preview = data.preview.images[0].source;
                    content += `*Resolution: ${preview.width}×${preview.height}*\n\n`;
                }
                break;

            case 'video':
                content += `🎥 **Video**\n\n`;
                if (localPath) {
                    content += `<video controls>\n  <source src="./${localPath}" type="video/mp4">\n  Your browser does not support the video tag.\n</video>\n\n`;
                    content += `*Downloaded locally: ${localPath}*\n\n`;
                } else {
                    content += `[📹 Watch Video](${url})\n\n`;
                }
                if (data.preview?.images?.[0]?.source?.url) {
                    const thumbnail = data.preview.images[0].source.url.replace(/&amp;/g, '&');
                    content += `![Video Thumbnail](${thumbnail})\n\n`;
                }
                break;

            case 'reddit-video':
                content += `🎥 **Reddit Video**\n\n`;
                content += `> ⚠️ Reddit-hosted video - view on Reddit for best experience\n\n`;
                content += `[📹 Watch on Reddit](https://reddit.com${data.permalink})\n\n`;
                if (data.preview?.images?.[0]?.source?.url) {
                    const thumbnail = data.preview.images[0].source.url.replace(/&amp;/g, '&');
                    content += `![Video Thumbnail](${thumbnail})\n\n`;
                }
                break;

            case 'youtube':
                content += `🎬 **YouTube Video**\n\n`;
                content += `[▶️ Watch on YouTube](${url})\n\n`;
                // Try to extract video ID for embedding
                const youtubeId = this.extractYouTubeId(url);
                if (youtubeId) {
                    content += `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeId}" frameborder="0" allowfullscreen></iframe>\n\n`;
                }
                break;

            case 'gif-platform':
                content += `🎞️ **GIF/Animation**\n\n`;
                if (localPath) {
                    content += `![GIF Animation](./${localPath})\n\n`;
                    content += `*Downloaded locally: ${localPath}*\n\n`;
                } else {
                    content += `[🎭 View Animation](${url})\n\n`;
                }
                break;

            default:
                content += `🔗 **Media Link:** [${mediaInfo.domain}](${url})\n\n`;
        }

        return content;
    }

    formatFooter(data: any, isComment: boolean): string {
        let content = '\n\n---\n\n';
        
        // Tags for organization
        const tags = [`#reddit`, `#r-${data.subreddit.toLowerCase()}`];
        if (data.link_flair_text) {
            tags.push(`#${data.link_flair_text.toLowerCase().replace(/\s+/g, '-')}`);
        }
        if (isComment) {
            tags.push('#reddit-comment');
        } else {
            tags.push('#reddit-post');
        }
        
        content += `**Tags:** ${tags.join(' ')}\n\n`;
        content += `🔗 [View on Reddit](https://reddit.com${data.permalink})\n`;
        
        if (!isComment && data.url && !data.is_self) {
            content += `🌐 [Original Source](${data.url})`;
        }

        return content;
    }

    async downloadMediaFile(url: string, filename: string): Promise<string | null> {
        try {
            const mediaFolder = normalizePath(this.settings.mediaFolder);
            
            // Ensure media folder exists
            const folder = this.app.vault.getAbstractFileByPath(mediaFolder);
            if (!folder) {
                await this.app.vault.createFolder(mediaFolder);
            }

            // Download the media file
            const response = await requestUrl({
                url: url,
                method: 'GET'
            });

            if (response.status !== 200) {
                console.warn(`Failed to download media: ${url} (Status: ${response.status})`);
                return null;
            }

            // Create the file path
            const filePath = normalizePath(`${mediaFolder}/${filename}`);
            
            // Check if file already exists
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile) {
                console.log(`Media file already exists: ${filePath}`);
                return filePath;
            }

            // Save the file
            await this.app.vault.createBinary(filePath, response.arrayBuffer);
            console.log(`Downloaded media: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error(`Error downloading media from ${url}:`, error);
            return null;
        }
    }

    shouldDownloadMedia(mediaInfo: any, url: string): boolean {
        const { mediaType } = mediaInfo;
        
        // Check if media type should be downloaded based on settings
        switch (mediaType) {
            case 'image':
            case 'reddit-image':
            case 'imgur':
                return this.settings.downloadImages;
            
            case 'gif-platform':
                return this.settings.downloadGifs;
            
            case 'video':
                return this.settings.downloadVideos;
            
            default:
                // For other media types, check file extension
                const urlLower = url.toLowerCase();
                if (this.settings.downloadImages && /\.(jpg|jpeg|png|webp|bmp|svg)(\?|$)/i.test(urlLower)) {
                    return true;
                }
                if (this.settings.downloadGifs && /\.gif(\?|$)/i.test(urlLower)) {
                    return true;
                }
                if (this.settings.downloadVideos && /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(urlLower)) {
                    return true;
                }
                return false;
        }
    }

    generateMediaFilename(data: any, url: string, mediaInfo: any): string {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = pathname.split('.').pop() || 'unknown';
        
        // Create a base filename from the Reddit post title
        const baseTitle = this.sanitizeFileName(data.title || 'reddit-media');
        const shortTitle = baseTitle.substring(0, 50); // Keep filename reasonable length
        
        // Add Reddit ID for uniqueness
        const redditId = data.id || 'unknown';
        
        return `${shortTitle}-${redditId}.${extension}`;
    }

    extractYouTubeId(url: string): string | null {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    convertRedditMarkdown(text: string): string {
        if (!text) return '';

        // Decode HTML entities
        text = text.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#x27;/g, "'")
                  .replace(/&#x2F;/g, '/');

        // Convert Reddit spoilers to Obsidian format
        text = text.replace(/&gt;!([^!]+)!&lt;/g, '%%$1%%');

        // Convert Reddit superscript
        text = text.replace(/\^(\w+)/g, '<sup>$1</sup>');

        // Convert Reddit strikethrough
        text = text.replace(/~~([^~]+)~~/g, '~~$1~~');

        // Convert Reddit code blocks
        text = text.replace(/```([^`]+)```/g, '```\n$1\n```');
        text = text.replace(/`([^`]+)`/g, '`$1`');

        // Convert u/ and r/ mentions to links
        text = text.replace(/\b(u\/\w+)/g, '[$1](https://reddit.com/$1)');
        text = text.replace(/\b(r\/\w+)/g, '[$1](https://reddit.com/$1)');

        // Better quote formatting
        text = text.replace(/^&gt;(.+)$/gm, '> $1');

        // Convert Reddit tables (basic support)
        const lines = text.split('\n');
        let inTable = false;
        const processedLines = lines.map(line => {
            if (line.includes('|') && line.split('|').length > 2) {
                if (!inTable) {
                    inTable = true;
                    return line; // First table row
                } else {
                    return line; // Subsequent rows
                }
            } else if (inTable && line.trim() === '') {
                inTable = false;
            }
            return line;
        });

        return processedLines.join('\n');
    }

    sanitizeFileName(name: string): string {
        if (!name || name.trim() === '') {
            return 'Untitled';
        }

        // Start with the original name
        let sanitized = name;

        // Remove/replace characters that are invalid on Windows, macOS, and Linux
        sanitized = sanitized
            // Windows forbidden characters: < > : " | ? * \ /
            .replace(/[<>:"\/\\|?*]/g, '-')
            // Control characters (0-31) and DEL (127)
            .replace(/[\x00-\x1f\x7f]/g, '')
            // Zero-width characters and other problematic Unicode
            .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
            // Multiple spaces to single space
            .replace(/\s+/g, ' ')
            // Remove leading/trailing spaces and dots (Windows issue)
            .replace(/^[\s.]+|[\s.]+$/g, '');

        // Handle Windows reserved names (case insensitive)
        const windowsReserved = [
            'CON', 'PRN', 'AUX', 'NUL',
            'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
            'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
        ];
        
        if (windowsReserved.includes(sanitized.toUpperCase())) {
            sanitized = sanitized + '_file';
        }

        // Ensure filename isn't empty after sanitization
        if (sanitized.length === 0) {
            sanitized = 'Untitled';
        }

        // Limit filename length (leaving room for extension and counter)
        // Windows has 255 character limit, but we'll be conservative
        const maxLength = 200;
        if (sanitized.length > maxLength) {
            // Try to cut at word boundary
            const truncated = sanitized.substring(0, maxLength);
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > maxLength * 0.7) { // Only if we're not cutting too much
                sanitized = truncated.substring(0, lastSpace);
            } else {
                sanitized = truncated;
            }
        }

        // Final trim in case we introduced trailing spaces
        sanitized = sanitized.trim();
        
        // One more check for empty result
        if (sanitized.length === 0) {
            sanitized = 'Untitled';
        }

        return sanitized;
    }

    async unsaveItems(items: any[]) {
        new Notice(`Unsaving ${items.length} items...`);

        for (const item of items) {
            try {
                await this.unsaveItem(item.data.name);
            } catch (error) {
                console.error(`Failed to unsave ${item.data.name}:`, error);
            }
        }

        new Notice('Finished unsaving items');
    }

    async unsaveItem(fullname: string) {
        await this.ensureValidToken();

        const params: RequestUrlParam = {
            url: 'https://oauth.reddit.com/api/unsave',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': REDDIT_USER_AGENT
            },
            body: `id=${fullname}`
        };

        await this.makeRateLimitedRequest(params);
    }
}

class RedditSavedSettingTab extends PluginSettingTab {
    plugin: RedditSavedPlugin;

    constructor(app: App, plugin: RedditSavedPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Reddit Saved Posts Settings' });

        const setupInstructions = containerEl.createDiv();
        setupInstructions.innerHTML = `
            <p>To use this plugin, you need to create a Reddit app at 
            <a href="https://www.reddit.com/prefs/apps" target="_blank">Reddit Apps</a></p>
            <p><strong>Important:</strong> Set the redirect URI to <code>http://localhost:${this.plugin.settings.oauthRedirectPort}</code></p>
        `;

        new Setting(containerEl)
            .setName('Client ID')
            .setDesc('Your Reddit app client ID')
            .addText(text => text
                .setPlaceholder('Enter client ID')
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Client Secret')
            .setDesc('Your Reddit app client secret')
            .addText(text => text
                .setPlaceholder('Enter client secret')
                .setValue(this.plugin.settings.clientSecret)
                .onChange(async (value) => {
                    this.plugin.settings.clientSecret = value;
                    await this.plugin.saveSettings();
                }));

        if (this.plugin.settings.username) {
            new Setting(containerEl)
                .setName('Authenticated User')
                .setDesc(`Currently authenticated as: ${this.plugin.settings.username}`)
                .addButton(button => button
                    .setButtonText('Re-authenticate')
                    .onClick(async () => {
                        await this.plugin.initiateOAuth();
                    }));
        } else {
            new Setting(containerEl)
                .setName('Authentication')
                .setDesc('Authenticate with Reddit to access your saved posts')
                .addButton(button => button
                    .setButtonText('Authenticate')
                    .setCta()
                    .onClick(async () => {
                        await this.plugin.initiateOAuth();
                    }));
        }

        containerEl.createEl('h3', { text: 'Import Settings' });

        // Rate limiting info
        const rateLimitInfo = containerEl.createDiv();
        rateLimitInfo.style.backgroundColor = 'var(--background-secondary)';
        rateLimitInfo.style.padding = '10px';
        rateLimitInfo.style.borderRadius = '4px';
        rateLimitInfo.style.marginBottom = '15px';
        rateLimitInfo.innerHTML = `
            <strong>ℹ️ Reddit API Limits:</strong><br>
            • Maximum 1,000 saved items can be fetched<br>
            • Rate limiting applies (60 requests/minute)<br>
            • Large fetches may take several minutes<br>
            • Progress will be shown during import
        `;

        new Setting(containerEl)
            .setName('Save Location')
            .setDesc('Folder where Reddit posts will be saved')
            .addText(text => text
                .setPlaceholder('Reddit Saved')
                .setValue(this.plugin.settings.saveLocation)
                .onChange(async (value) => {
                    this.plugin.settings.saveLocation = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Fetch Limit')
            .setDesc(`Maximum saved posts to fetch (Reddit's hard limit: ${REDDIT_MAX_ITEMS}. Higher numbers may take longer due to rate limiting)`)
            .addText(text => text
                .setPlaceholder(String(REDDIT_MAX_ITEMS))
                .setValue(String(this.plugin.settings.fetchLimit))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        const finalLimit = Math.min(num, REDDIT_MAX_ITEMS);
                        if (finalLimit !== num) {
                            new Notice(`Limit capped at Reddit's maximum: ${REDDIT_MAX_ITEMS}`);
                        }
                        this.plugin.settings.fetchLimit = finalLimit;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Skip Existing')
            .setDesc('Skip posts that have already been imported (checks by Reddit ID in frontmatter)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.skipExisting)
                .onChange(async (value) => {
                    this.plugin.settings.skipExisting = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-unsave')
            .setDesc('Automatically unsave posts from Reddit after importing')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUnsave)
                .onChange(async (value) => {
                    this.plugin.settings.autoUnsave = value;
                    await this.plugin.saveSettings();
                }));

        // Advanced Settings Section
        containerEl.createEl('h3', { text: 'Advanced Settings' });

        new Setting(containerEl)
            .setName('Show Advanced Settings')
            .setDesc('Toggle advanced configuration options')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showAdvancedSettings)
                .onChange(async (value) => {
                    this.plugin.settings.showAdvancedSettings = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh the settings page
                }));

        if (this.plugin.settings.showAdvancedSettings) {
            new Setting(containerEl)
                .setName('OAuth Redirect Port')
                .setDesc('Port for OAuth callback (must match Reddit app redirect URI)')
                .addText(text => text
                    .setPlaceholder('9638')
                    .setValue(String(this.plugin.settings.oauthRedirectPort))
                    .onChange(async (value) => {
                        const port = parseInt(value);
                        if (!isNaN(port) && port > 1000 && port < 65536) {
                            this.plugin.settings.oauthRedirectPort = port;
                            await this.plugin.saveSettings();
                            this.display(); // Refresh to update the redirect URI display
                        }
                    }));

            // Media Download Settings
            containerEl.createEl('h4', { text: 'Media Download Options' });

            new Setting(containerEl)
                .setName('Media Folder')
                .setDesc('Folder where downloaded media files will be saved (relative to vault root, separate from posts folder)')
                .addText(text => text
                    .setPlaceholder('Attachments')
                    .setValue(this.plugin.settings.mediaFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.mediaFolder = value || 'Attachments';
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Download Images')
                .setDesc('Automatically download linked images (PNG, JPG, WEBP, etc.)')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.downloadImages)
                    .onChange(async (value) => {
                        this.plugin.settings.downloadImages = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Download GIFs')
                .setDesc('Automatically download GIF animations')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.downloadGifs)
                    .onChange(async (value) => {
                        this.plugin.settings.downloadGifs = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Download Videos')
                .setDesc('Automatically download video files (MP4, WEBM, etc.)')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.downloadVideos)
                    .onChange(async (value) => {
                        this.plugin.settings.downloadVideos = value;
                        await this.plugin.saveSettings();
                    }));
        }
    }
}

class AuthCodeModal extends Modal {
    private callback: (code: string) => void;
    private cancelCallback: () => void;
    private codeInput: TextComponent;
    private wasSubmitted = false;

    constructor(app: App, callback: (code: string) => void, cancelCallback?: () => void) {
        super(app);
        this.callback = callback;
        this.cancelCallback = cancelCallback || (() => {});
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Reddit Authorization' });
        
        const instructions = contentEl.createDiv();
        instructions.innerHTML = `
            <p>1. After approving the Reddit authorization, you'll be redirected to a page that cannot load</p>
            <p>2. Copy the authorization code from the URL in your browser address bar</p>
            <p>3. The code appears after "code=" in the URL</p>
            <p>4. Paste it below:</p>
        `;

        const inputContainer = contentEl.createDiv();
        inputContainer.style.margin = '20px 0';
        
        inputContainer.createEl('label', { text: 'Authorization Code:' });
        this.codeInput = new TextComponent(inputContainer);
        this.codeInput.inputEl.style.width = '100%';
        this.codeInput.inputEl.style.margin = '10px 0';
        this.codeInput.inputEl.placeholder = 'Paste authorization code here...';

        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.onclick = () => {
            this.wasSubmitted = true;
            this.cancelCallback();
            this.close();
        };

        const submitButton = buttonContainer.createEl('button', { text: 'Authenticate' });
        submitButton.classList.add('mod-cta');
        submitButton.onclick = () => {
            const code = this.codeInput.getValue().trim();
            if (code) {
                this.wasSubmitted = true;
                this.callback(code);
                this.close();
            } else {
                new Notice('Please enter the authorization code');
            }
        };

        // Focus the input
        this.codeInput.inputEl.focus();
        
        // Allow Enter to submit
        this.codeInput.inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitButton.click();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        // Call cancel callback if modal is closed without being submitted
        if (!this.wasSubmitted && this.cancelCallback) {
            this.cancelCallback();
        }
    }
}
