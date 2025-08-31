import { App, requestUrl, normalizePath } from 'obsidian';
import { RedditSavedSettings, MediaInfo, RedditItemData } from './types';

export class MediaHandler {
    private app: App;
    private settings: RedditSavedSettings;

    constructor(app: App, settings: RedditSavedSettings) {
        this.app = app;
        this.settings = settings;
    }

    analyzeMedia(data: RedditItemData): MediaInfo {
        const url = data.url || '';
        const domain = data.domain || '';
        
        // Image formats
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
        
        let mediaInfo: MediaInfo = {
            type: 'link',
            mediaType: null,
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

    shouldDownloadMedia(mediaInfo: MediaInfo, url: string): boolean {
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

    generateMediaFilename(data: RedditItemData, url: string, mediaInfo: MediaInfo): string {
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