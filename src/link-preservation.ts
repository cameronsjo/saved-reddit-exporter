import { requestUrl, RequestUrlResponse } from 'obsidian';
import { RedditItemData } from './types';

/**
 * Result of checking if a URL is archived in the Wayback Machine
 */
export interface WaybackCheckResult {
  /** Whether the URL is archived */
  isArchived: boolean;
  /** The archived URL if available */
  archivedUrl?: string;
  /** Timestamp of the archive */
  timestamp?: string;
  /** Error message if check failed */
  error?: string;
}

/**
 * Result of saving a URL to the Wayback Machine
 */
export interface WaybackSaveResult {
  /** Whether the save was successful */
  success: boolean;
  /** The archived URL */
  archivedUrl?: string;
  /** Job ID for async saves */
  jobId?: string;
  /** Error message if save failed */
  error?: string;
}

/**
 * Result of checking link health
 */
export interface LinkHealthResult {
  /** The URL that was checked */
  url: string;
  /** HTTP status code */
  status: number;
  /** Whether the link is alive (2xx or 3xx) */
  isAlive: boolean;
  /** Whether the link returns content */
  hasContent: boolean;
  /** Redirect URL if redirected */
  redirectUrl?: string;
  /** Error message if check failed */
  error?: string;
  /** Wayback archive URL if available */
  archiveUrl?: string;
}

/**
 * External link extracted from Reddit content
 */
export interface ExternalLink {
  /** The URL */
  url: string;
  /** Where the link was found (title, body, url field) */
  source: 'url' | 'body' | 'title';
  /** Domain of the URL */
  domain: string;
}

/**
 * Service for link preservation and Wayback Machine integration
 */
export class LinkPreservationService {
  private readonly WAYBACK_AVAILABLE_API = 'https://archive.org/wayback/available';
  private readonly WAYBACK_SAVE_URL = 'https://web.archive.org/save/';
  private readonly REQUEST_TIMEOUT_MS = 10000;

  /**
   * Check if a URL is archived in the Wayback Machine
   */
  async checkWaybackArchive(url: string): Promise<WaybackCheckResult> {
    try {
      const response = await requestUrl({
        url: `${this.WAYBACK_AVAILABLE_API}?url=${encodeURIComponent(url)}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status !== 200) {
        return {
          isArchived: false,
          error: `API returned status ${response.status}`,
        };
      }

      const data = response.json;

      if (data?.archived_snapshots?.closest) {
        const snapshot = data.archived_snapshots.closest;
        return {
          isArchived: snapshot.available === true,
          archivedUrl: snapshot.url,
          timestamp: snapshot.timestamp,
        };
      }

      return { isArchived: false };
    } catch (error) {
      return {
        isArchived: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Save a URL to the Wayback Machine
   * Note: This uses the simple web.archive.org/save/ endpoint
   * For full API access, users need archive.org credentials
   */
  async saveToWayback(url: string): Promise<WaybackSaveResult> {
    try {
      // The simple save endpoint redirects to the archived page
      const saveUrl = `${this.WAYBACK_SAVE_URL}${url}`;

      // Make a HEAD request to trigger the save
      const response = await requestUrl({
        url: saveUrl,
        method: 'GET',
        headers: {
          'User-Agent': 'Obsidian-Reddit-Saved-Exporter/1.0',
        },
      });

      // Check if we got a successful response
      if (response.status >= 200 && response.status < 400) {
        // The URL in the response headers or the final URL is the archived version
        return {
          success: true,
          archivedUrl: saveUrl,
        };
      }

      return {
        success: false,
        error: `Save returned status ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if a link is alive (returns 2xx or 3xx)
   */
  async checkLinkHealth(url: string): Promise<LinkHealthResult> {
    const result: LinkHealthResult = {
      url,
      status: 0,
      isAlive: false,
      hasContent: false,
    };

    try {
      const response = await requestUrl({
        url,
        method: 'HEAD',
        throw: false,
      });

      result.status = response.status;
      result.isAlive = response.status >= 200 && response.status < 400;
      result.hasContent = response.status === 200;

      // Check for redirects (Obsidian's requestUrl follows redirects automatically)
      // The final URL might differ from the original

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Request failed';
      return result;
    }
  }

  /**
   * Extract external links from Reddit item data
   */
  extractExternalLinks(data: RedditItemData): ExternalLink[] {
    const links: ExternalLink[] = [];
    const seenUrls = new Set<string>();

    // Main URL field (for link posts)
    if (data.url && !data.is_self) {
      const domain = this.extractDomain(data.url);
      if (domain && !this.isRedditDomain(domain)) {
        links.push({ url: data.url, source: 'url', domain });
        seenUrls.add(data.url);
      }
    }

    // Extract links from selftext/body
    const textContent = data.selftext || data.body || '';
    const urlRegex = /https?:\/\/[^\s\)\]]+/g;
    const matches = textContent.match(urlRegex) || [];

    for (const url of matches) {
      // Clean up URL (remove trailing punctuation)
      const cleanUrl = url.replace(/[.,;:!?]+$/, '');
      if (!seenUrls.has(cleanUrl)) {
        const domain = this.extractDomain(cleanUrl);
        if (domain && !this.isRedditDomain(domain)) {
          links.push({ url: cleanUrl, source: 'body', domain });
          seenUrls.add(cleanUrl);
        }
      }
    }

    return links;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Check if domain is a Reddit domain
   */
  private isRedditDomain(domain: string): boolean {
    const redditDomains = [
      'reddit.com',
      'www.reddit.com',
      'old.reddit.com',
      'new.reddit.com',
      'i.redd.it',
      'v.redd.it',
      'preview.redd.it',
    ];
    return redditDomains.some(rd => domain === rd || domain.endsWith(`.${rd}`));
  }

  /**
   * Generate Wayback Machine URL for a given URL and optional timestamp
   */
  generateWaybackUrl(url: string, timestamp?: string): string {
    if (timestamp) {
      return `https://web.archive.org/web/${timestamp}/${url}`;
    }
    // Use wildcard timestamp to get latest
    return `https://web.archive.org/web/*/${url}`;
  }

  /**
   * Format link preservation info for markdown output
   */
  formatLinkPreservation(link: ExternalLink, archiveResult?: WaybackCheckResult): string {
    let content = `- [${link.domain}](${link.url})`;

    if (archiveResult?.isArchived && archiveResult.archivedUrl) {
      content += ` • [📚 Archive](${archiveResult.archivedUrl})`;
    } else {
      content += ` • [📚 Save to Archive](${this.WAYBACK_SAVE_URL}${encodeURIComponent(link.url)})`;
    }

    return content;
  }
}
