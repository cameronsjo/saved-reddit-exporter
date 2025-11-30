import { App, requestUrl, normalizePath } from 'obsidian';
import {
  RedditSavedSettings,
  MediaInfo,
  RedditItemData,
  GalleryItem,
  MediaMetadataItem,
} from './types';
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  IMAGE_PATTERN,
  GIF_PATTERN,
  VIDEO_PATTERN,
  REDDIT_IMAGE_DOMAIN,
  REDDIT_VIDEO_DOMAIN,
  IMGUR_DOMAIN,
  YOUTUBE_DOMAINS,
  GIF_PLATFORMS,
  GALLERY_URL_PATTERNS,
  MEDIA_FILENAME_MAX_TITLE_LENGTH,
  MEDIA_FILENAME_MAX_URL_PART_LENGTH,
} from './constants';
import { sanitizeFileName as sanitizeFileNameUtil, isPathSafe } from './utils/file-sanitizer';

/**
 * Extracted gallery image with URL and metadata
 */
export interface GalleryImage {
  /** Media ID */
  mediaId: string;
  /** Direct URL to the image (decoded) */
  url: string;
  /** Caption if provided */
  caption?: string;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Whether this is an animated image */
  isAnimated: boolean;
  /** MP4 URL for animated images */
  mp4Url?: string;
  /** Order index in the gallery */
  index: number;
  /** Outbound link if provided */
  outboundUrl?: string;
}

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

    const mediaInfo: MediaInfo = {
      type: 'link',
      mediaType: null,
      isMedia: false,
      domain: domain,
      canEmbed: false,
    };

    if (!url) return mediaInfo;

    const urlLower = url.toLowerCase();

    // Check platform-specific domains first (before generic file extensions)
    if (domain.includes(REDDIT_IMAGE_DOMAIN)) {
      mediaInfo.type = 'image';
      mediaInfo.mediaType = 'reddit-image';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = true;
    } else if (domain.includes(REDDIT_VIDEO_DOMAIN)) {
      mediaInfo.type = 'video';
      mediaInfo.mediaType = 'reddit-video';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = false; // Reddit videos need special handling
    }
    // Popular media platforms
    else if (domain.includes(IMGUR_DOMAIN)) {
      mediaInfo.type = 'image';
      mediaInfo.mediaType = 'imgur';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = true;
    } else if (YOUTUBE_DOMAINS.some(ytDomain => domain.includes(ytDomain))) {
      mediaInfo.type = 'video';
      mediaInfo.mediaType = 'youtube';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = false;
    } else if (GIF_PLATFORMS.some(gifPlatform => domain.includes(gifPlatform))) {
      mediaInfo.type = 'gif';
      mediaInfo.mediaType = 'gif-platform';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = false;
    }
    // Fallback: check for direct file extensions when no platform match
    else if (IMAGE_EXTENSIONS.some(ext => urlLower.includes(ext))) {
      mediaInfo.type = 'image';
      mediaInfo.mediaType = 'image';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = true;
    } else if (VIDEO_EXTENSIONS.some(ext => urlLower.includes(ext))) {
      mediaInfo.type = 'video';
      mediaInfo.mediaType = 'video';
      mediaInfo.isMedia = true;
      mediaInfo.canEmbed = true;
    }

    return mediaInfo;
  }

  shouldDownloadMedia(mediaInfo: MediaInfo, url: string): boolean {
    const { mediaType } = mediaInfo;

    // Don't try to download gallery pages or non-direct media URLs
    if (this.isGalleryUrl(url)) {
      return false;
    }

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

      default: {
        // For other media types, check file extension
        const urlLower = url.toLowerCase();
        if (this.settings.downloadImages && IMAGE_PATTERN.test(urlLower)) {
          return true;
        }
        if (this.settings.downloadGifs && GIF_PATTERN.test(urlLower)) {
          return true;
        }
        if (this.settings.downloadVideos && VIDEO_PATTERN.test(urlLower)) {
          return true;
        }
        return false;
      }
    }
  }

  private isGalleryUrl(url: string): boolean {
    const urlLower = url.toLowerCase();
    return GALLERY_URL_PATTERNS.some(pattern => urlLower.includes(pattern));
  }

  generateMediaFilename(data: RedditItemData, url: string, mediaInfo: MediaInfo): string {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Extract just the filename part, handling gallery URLs
    const pathParts = pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    // For URLs without file extensions (like gallery URLs), use a default
    let extension = 'unknown';
    if (lastPart.includes('.')) {
      extension = lastPart.split('.').pop() || 'unknown';
    } else if (mediaInfo.mediaType) {
      // Use media type to guess extension
      switch (mediaInfo.mediaType) {
        case 'image':
        case 'reddit-image':
        case 'imgur':
          extension = 'jpg';
          break;
        case 'gif-platform':
          extension = 'gif';
          break;
        case 'video':
          extension = 'mp4';
          break;
        default:
          extension = 'unknown';
      }
    }

    const title = data.title || 'reddit-media';

    // Validate path safety
    if (!isPathSafe(title)) {
      console.warn(`Unsafe media filename detected: ${title}`);
      return `media-${data.id || 'unknown'}.${extension}`;
    }

    // Create a base filename from the Reddit post title
    const baseTitle = sanitizeFileNameUtil(title);
    const shortTitle = baseTitle.substring(0, MEDIA_FILENAME_MAX_TITLE_LENGTH);

    // Add Reddit ID for uniqueness
    const redditId = data.id || 'unknown';

    // Also include last part of URL for uniqueness (sanitized)
    const urlPart = sanitizeFileNameUtil(lastPart).substring(0, MEDIA_FILENAME_MAX_URL_PART_LENGTH);

    return `${shortTitle}-${redditId}-${urlPart}.${extension}`;
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
        method: 'GET',
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
        return filePath;
      }

      // Save the file
      await this.app.vault.createBinary(filePath, response.arrayBuffer);
      return filePath;
    } catch (error) {
      console.error(`Error downloading media from ${url}:`, error);
      return null;
    }
  }

  extractYouTubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Check if a post is a Reddit gallery
   */
  isGalleryPost(data: RedditItemData): boolean {
    return !!(data.is_gallery && data.gallery_data?.items && data.media_metadata);
  }

  /**
   * Check if a post has poll data
   */
  isPollPost(data: RedditItemData): boolean {
    return !!(data.poll_data && data.poll_data.options?.length > 0);
  }

  /**
   * Extract gallery images from a Reddit gallery post
   * Returns images in the correct order as specified by gallery_data.items
   */
  extractGalleryImages(data: RedditItemData): GalleryImage[] {
    if (!this.isGalleryPost(data)) {
      return [];
    }

    const galleryItems = data.gallery_data!.items;
    const mediaMetadata = data.media_metadata!;
    const images: GalleryImage[] = [];

    for (let i = 0; i < galleryItems.length; i++) {
      const item = galleryItems[i];
      const metadata = mediaMetadata[item.media_id];

      if (!metadata || metadata.status !== 'valid') {
        console.warn(`Gallery item ${item.media_id} has invalid status or missing metadata`);
        continue;
      }

      const galleryImage = this.extractImageFromMetadata(metadata, item, i);
      if (galleryImage) {
        images.push(galleryImage);
      }
    }

    return images;
  }

  /**
   * Extract a single image from media metadata
   */
  private extractImageFromMetadata(
    metadata: MediaMetadataItem,
    item: GalleryItem,
    index: number
  ): GalleryImage | null {
    // Determine if this is an animated image
    const isAnimated = metadata.e === 'AnimatedImage';

    // Get the source URL - decode HTML entities (amp; -> &)
    let url: string | undefined;
    let mp4Url: string | undefined;

    if (metadata.s) {
      if (isAnimated && metadata.s.mp4) {
        // Prefer MP4 for animated images
        mp4Url = this.decodeRedditUrl(metadata.s.mp4);
        url = metadata.s.gif ? this.decodeRedditUrl(metadata.s.gif) : mp4Url;
      } else if (metadata.s.u) {
        url = this.decodeRedditUrl(metadata.s.u);
      }
    }

    if (!url) {
      console.warn(`No URL found for gallery item ${item.media_id}`);
      return null;
    }

    return {
      mediaId: item.media_id,
      url,
      caption: item.caption,
      width: metadata.s?.x,
      height: metadata.s?.y,
      isAnimated,
      mp4Url,
      index,
      outboundUrl: item.outbound_url,
    };
  }

  /**
   * Decode Reddit's encoded URLs (replace &amp; with &)
   */
  private decodeRedditUrl(url: string): string {
    return url.replace(/&amp;/g, '&');
  }

  /**
   * Generate a filename for a gallery image
   */
  generateGalleryImageFilename(
    data: RedditItemData,
    image: GalleryImage,
    totalImages: number
  ): string {
    const title = data.title || 'reddit-gallery';
    const baseTitle = sanitizeFileNameUtil(title).substring(0, MEDIA_FILENAME_MAX_TITLE_LENGTH);
    const redditId = data.id || 'unknown';

    // Pad index for proper sorting (e.g., 01, 02, ... 10, 11)
    const padLength = String(totalImages).length;
    const paddedIndex = String(image.index + 1).padStart(padLength, '0');

    // Determine extension from URL or type
    let extension = 'jpg';
    if (image.isAnimated) {
      extension = image.mp4Url ? 'mp4' : 'gif';
    } else {
      const urlMatch = image.url.match(/\.(\w+)(?:\?|$)/);
      if (urlMatch) {
        extension = urlMatch[1].toLowerCase();
      }
    }

    return `${baseTitle}-${redditId}-${paddedIndex}.${extension}`;
  }

  /**
   * Download all images from a gallery post
   * Returns array of local file paths
   */
  async downloadGalleryImages(
    data: RedditItemData,
    onProgress?: (current: number, total: number) => void
  ): Promise<string[]> {
    const images = this.extractGalleryImages(data);
    if (images.length === 0) {
      return [];
    }

    const downloadedPaths: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      onProgress?.(i + 1, images.length);

      try {
        // Use MP4 for animated images if available and video downloads enabled
        const downloadUrl =
          image.isAnimated && image.mp4Url && this.settings.downloadVideos
            ? image.mp4Url
            : image.url;

        // Check if we should download based on type
        const shouldDownload =
          (image.isAnimated && (this.settings.downloadGifs || this.settings.downloadVideos)) ||
          (!image.isAnimated && this.settings.downloadImages);

        if (!shouldDownload) {
          continue;
        }

        const filename = this.generateGalleryImageFilename(data, image, images.length);
        const localPath = await this.downloadMediaFile(downloadUrl, filename);

        if (localPath) {
          downloadedPaths.push(localPath);
        }
      } catch (error) {
        console.error(`Error downloading gallery image ${image.mediaId}:`, error);
      }
    }

    return downloadedPaths;
  }
}
