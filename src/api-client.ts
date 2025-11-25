import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import { RedditSavedSettings, RedditItem } from './types';
import {
  REDDIT_USER_AGENT,
  REDDIT_MAX_ITEMS,
  REDDIT_PAGE_SIZE,
  REDDIT_OAUTH_BASE_URL,
  DEFAULT_RATE_LIMIT_DELAY_MS,
  RATE_LIMIT_WARNING_THRESHOLD,
  RATE_LIMIT_SAFE_THRESHOLD,
  RATE_LIMIT_MIN_DELAY_MS,
  RATE_LIMIT_NORMAL_DELAY_MS,
  MAX_REQUEST_RETRIES,
  RETRY_AFTER_DEFAULT_SECONDS,
  MAX_PAGES_SAFETY_LIMIT,
  PROGRESS_UPDATE_FREQUENCY,
  BACKOFF_MAX_DELAY_MS,
  MSG_UNSAVING_ITEMS,
  MSG_FINISHED_UNSAVING,
  HEADER_AUTHORIZATION,
  HEADER_USER_AGENT,
  HEADER_CONTENT_TYPE,
  CONTENT_TYPE_FORM_URLENCODED,
  HEADER_RETRY_AFTER,
} from './constants';

export class RedditApiClient {
  private settings: RedditSavedSettings;
  private ensureValidToken: () => Promise<void>;

  constructor(settings: RedditSavedSettings, ensureValidToken: () => Promise<void>) {
    this.settings = settings;
    this.ensureValidToken = ensureValidToken;
  }

  private handleRateLimit(response: { headers: Record<string, string> }): number {
    const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
    const reset = parseInt(response.headers['x-ratelimit-reset'] || '0');

    // If we're getting close to the limit or hit it
    if (remaining <= RATE_LIMIT_WARNING_THRESHOLD) {
      const resetTime = reset * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const waitTime = Math.max(resetTime - currentTime, DEFAULT_RATE_LIMIT_DELAY_MS);

      if (remaining === 0) {
        new Notice(`Rate limited! Waiting ${Math.round(waitTime / 1000)}s before continuing...`);
        console.warn(`Reddit API rate limit hit. Waiting ${waitTime}ms`);
      }

      return waitTime;
    }

    // Add small delay between requests to be respectful
    return remaining > RATE_LIMIT_SAFE_THRESHOLD
      ? RATE_LIMIT_MIN_DELAY_MS
      : RATE_LIMIT_NORMAL_DELAY_MS;
  }

  async makeRateLimitedRequest(
    params: RequestUrlParam,
    retries: number = MAX_REQUEST_RETRIES
  ): Promise<{
    json: { data: { children: RedditItem[]; after?: string } };
    headers: Record<string, string>;
  }> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await requestUrl(params);

        // Handle rate limiting
        const delay = this.handleRateLimit(response);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        return response;
      } catch (error) {
        if (error.status === 429) {
          // Too Many Requests
          const retryAfter =
            parseInt(error.headers?.[HEADER_RETRY_AFTER] || String(RETRY_AFTER_DEFAULT_SECONDS)) *
            1000;
          new Notice(`Rate limited! Retrying in ${retryAfter / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue;
        }

        if (attempt === retries - 1) {
          throw error;
        }

        // Exponential backoff for other errors
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt), BACKOFF_MAX_DELAY_MS);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `Request failed (attempt ${attempt + 1}/${retries}), retrying in ${backoffDelay}ms:`,
          errorMessage
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
        url: `${REDDIT_OAUTH_BASE_URL}/user/${this.settings.username}/saved?limit=${pageSize}${after ? `&after=${after}` : ''}`,
        method: 'GET',
        headers: {
          [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
          [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
        },
      };

      const response = await this.makeRateLimitedRequest(params);
      const data = response.json.data;

      if (data.children && data.children.length > 0) {
        items.push(...data.children);
        after = data.after || '';
        hasMore = !!after && items.length < REDDIT_MAX_ITEMS;

        // Update progress
        if (pageCount % PROGRESS_UPDATE_FREQUENCY === 0 || !hasMore) {
          new Notice(`Fetched ${items.length} saved items...`);
        }
      } else {
        hasMore = false;
      }

      // Prevent infinite loops
      if (pageCount >= MAX_PAGES_SAFETY_LIMIT) {
        console.warn(`Reached safety limit of ${MAX_PAGES_SAFETY_LIMIT} pages`);
        break;
      }
    }

    const finalCount = Math.min(items.length, this.settings.fetchLimit);

    return items.slice(0, finalCount);
  }

  async unsaveItems(items: RedditItem[]): Promise<void> {
    new Notice(`${MSG_UNSAVING_ITEMS} ${items.length} items...`);

    for (const item of items) {
      try {
        await this.unsaveItem(item.data.name);
      } catch (error) {
        console.error(`Failed to unsave ${item.data.name}:`, error);
      }
    }

    new Notice(MSG_FINISHED_UNSAVING);
  }

  private async unsaveItem(fullname: string): Promise<void> {
    await this.ensureValidToken();

    const params: RequestUrlParam = {
      url: `${REDDIT_OAUTH_BASE_URL}/api/unsave`,
      method: 'POST',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM_URLENCODED,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
      body: `id=${fullname}`,
    };

    await this.makeRateLimitedRequest(params);
  }
}
