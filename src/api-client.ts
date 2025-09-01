import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import { RedditSavedSettings, RedditItem } from './types';
import { REDDIT_USER_AGENT } from './auth';

// Constants
const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit
const REDDIT_PAGE_SIZE = 100; // Max items per request
const DEFAULT_RATE_LIMIT_DELAY = 2000; // 2 seconds default delay

export class RedditApiClient {
  private settings: RedditSavedSettings;
  private ensureValidToken: () => Promise<void>;

  constructor(settings: RedditSavedSettings, ensureValidToken: () => Promise<void>) {
    this.settings = settings;
    this.ensureValidToken = ensureValidToken;
  }

  private async handleRateLimit(response: any): Promise<number> {
    const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
    const reset = parseInt(response.headers['x-ratelimit-reset'] || '0');
    const used = response.headers['x-ratelimit-used'] || 'unknown';

    // If we're getting close to the limit or hit it
    if (remaining <= 10) {
      const resetTime = reset * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const waitTime = Math.max(resetTime - currentTime, DEFAULT_RATE_LIMIT_DELAY);

      if (remaining === 0) {
        new Notice(`Rate limited! Waiting ${Math.round(waitTime / 1000)}s before continuing...`);
        console.warn(`Reddit API rate limit hit. Waiting ${waitTime}ms`);
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
        if (error.status === 429) {
          // Too Many Requests
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
        console.warn(
          `Request failed (attempt ${attempt + 1}/${retries}), retrying in ${backoffDelay}ms:`,
          error.message
        );
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async fetchAllSaved(): Promise<RedditItem[]> {
    const items: RedditItem[] = [];
    let after = '';
    let hasMore = true;
    let pageCount = 0;
    const maxPages = Math.ceil(
      Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS) / REDDIT_PAGE_SIZE
    );

    new Notice(
      `Fetching saved posts (max ${Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS)})...`
    );

    while (hasMore && items.length < this.settings.fetchLimit && pageCount < maxPages) {
      pageCount++;
      const pageSize = Math.min(REDDIT_PAGE_SIZE, this.settings.fetchLimit - items.length);

      await this.ensureValidToken();

      const params: RequestUrlParam = {
        url: `https://oauth.reddit.com/user/${this.settings.username}/saved?limit=${pageSize}${after ? `&after=${after}` : ''}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.settings.accessToken}`,
          'User-Agent': REDDIT_USER_AGENT,
        },
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
      }

      // Prevent infinite loops
      if (pageCount >= 50) {
        // Safety limit
        console.warn('Reached safety limit of 50 pages');
        break;
      }
    }

    const finalCount = Math.min(items.length, this.settings.fetchLimit);

    return items.slice(0, finalCount);
  }

  async unsaveItems(items: RedditItem[]): Promise<void> {
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

  private async unsaveItem(fullname: string): Promise<void> {
    await this.ensureValidToken();

    const params: RequestUrlParam = {
      url: 'https://oauth.reddit.com/api/unsave',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.settings.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT,
      },
      body: `id=${fullname}`,
    };

    await this.makeRateLimitedRequest(params);
  }
}
