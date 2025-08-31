import { App, Notice, Plugin } from 'obsidian';
import { RedditSavedSettings, ImportResult, RedditItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { RedditAuth } from './auth';
import { RedditApiClient } from './api-client';
import { MediaHandler } from './media-handler';
import { ContentFormatter } from './content-formatter';
import { RedditSavedSettingTab } from './settings';

export default class RedditSavedPlugin extends Plugin {
    settings: RedditSavedSettings;
    private auth: RedditAuth;
    private apiClient: RedditApiClient;
    private mediaHandler: MediaHandler;
    private contentFormatter: ContentFormatter;

    async onload() {
        await this.loadSettings();

        // Initialize modules
        this.auth = new RedditAuth(this.app, this.settings, () => this.saveSettings());
        this.apiClient = new RedditApiClient(this.settings, () => this.auth.ensureValidToken());
        this.mediaHandler = new MediaHandler(this.app, this.settings);
        this.contentFormatter = new ContentFormatter(this.settings, this.mediaHandler);

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
                await this.auth.initiateOAuth();
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
        this.addSettingTab(new RedditSavedSettingTab(
            this.app, 
            this, 
            this.settings,
            () => this.saveSettings(),
            () => this.auth.initiateOAuth()
        ));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async fetchSavedPosts() {
        if (!this.auth.isAuthenticated()) {
            new Notice('Please authenticate with Reddit first');
            await this.auth.initiateOAuth();
            return;
        }

        try {
            await this.auth.ensureValidToken();

            new Notice('Fetching saved posts...');

            const savedItems = await this.apiClient.fetchAllSaved();

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
                    await this.apiClient.unsaveItems(itemsToUnsave);
                }
            }
        } catch (error) {
            console.error('Error fetching saved posts:', error);
            new Notice(`Error: ${error.message}`);
        }
    }

    private async scanExistingRedditIds(): Promise<Set<string>> {
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

    private async rescanImportedIds() {
        new Notice('Rescanning vault for Reddit posts...');
        
        const existingIds = await this.scanExistingRedditIds();
        
        // Update the imported IDs list with what's actually in the vault
        this.settings.importedIds = Array.from(existingIds);
        await this.saveSettings();
        
        new Notice(`Found ${existingIds.size} imported Reddit posts in vault`);
    }

    private async createMarkdownFiles(items: RedditItem[]): Promise<ImportResult> {
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
                continue;
            }

            const isComment = item.kind === 't1';

            const fileName = this.sanitizeFileName(
                isComment ?
                    `Comment - ${data.link_title || 'Unknown'}` :
                    data.title!
            );

            // Generate unique filename if it already exists
            let filePath = `${this.settings.saveLocation}/${fileName}.md`;
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${this.settings.saveLocation}/${fileName} ${counter}.md`;
                counter++;
            }

            const content = await this.contentFormatter.formatRedditContent(data, isComment);
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

    private sanitizeFileName(name: string): string {
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
}