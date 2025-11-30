import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import {
  RedditSavedSettings,
  RedditItem,
  ContentOrigin,
  RedditComment,
  RedditItemData,
  CommentThread,
} from './types';
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
  COMMENT_MAX_DEPTH,
  REDDIT_ITEM_TYPE_COMMENT,
} from './constants';
import { RequestQueue, CircuitState } from './request-queue';
import { PerformanceMonitor } from './performance-monitor';
import { ImportStateManager, ImportProgress, ProgressCallback } from './import-state';

/**
 * Options for fetch operations
 */
export interface FetchOptions {
  /** Starting cursor for pagination (for resuming) */
  startCursor?: string;
  /** Callback for progress updates */
  onProgress?: ProgressCallback;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult {
  items: RedditItem[];
  cursor: string;
  hasMore: boolean;
  wasCancelled: boolean;
}

export class RedditApiClient {
  private settings: RedditSavedSettings;
  private ensureValidToken: () => Promise<void>;
  private requestQueue: RequestQueue;
  private performanceMonitor: PerformanceMonitor;
  private importStateManager: ImportStateManager | null = null;
  private useEnhancedFeatures: boolean = false;

  constructor(settings: RedditSavedSettings, ensureValidToken: () => Promise<void>) {
    this.settings = settings;
    this.ensureValidToken = ensureValidToken;
    this.requestQueue = new RequestQueue();
    this.performanceMonitor = new PerformanceMonitor();
    this.requestQueue.setPerformanceMonitor(this.performanceMonitor);
  }

  /**
   * Enable enhanced performance and resilience features
   */
  enableEnhancedFeatures(stateManager?: ImportStateManager): void {
    this.useEnhancedFeatures = true;
    this.importStateManager = stateManager || null;
  }

  /**
   * Disable enhanced features (use legacy mode)
   */
  disableEnhancedFeatures(): void {
    this.useEnhancedFeatures = false;
    this.importStateManager = null;
  }

  /**
   * Get performance monitor for metrics access
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Get request queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeRequests: number;
    circuitState: CircuitState;
    availableTokens: number;
    isPaused: boolean;
    isOnline: boolean;
    offlineQueueSize: number;
  } {
    return this.requestQueue.getStatus();
  }

  /**
   * Pause all requests
   */
  pauseRequests(): void {
    this.requestQueue.pause();
  }

  /**
   * Resume request processing
   */
  resumeRequests(): void {
    this.requestQueue.resume();
  }

  /**
   * Set online/offline status
   */
  setOnline(online: boolean): void {
    this.requestQueue.setOnline(online);
  }

  /**
   * Reset circuit breaker after manual intervention
   */
  resetCircuitBreaker(): void {
    this.requestQueue.resetCircuitBreaker();
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

  /**
   * Generic method to fetch user content from various Reddit endpoints
   */
  private async fetchUserContent(
    endpoint: string,
    contentOrigin: ContentOrigin,
    progressLabel: string
  ): Promise<RedditItem[]> {
    const items: RedditItem[] = [];
    let after = '';
    let hasMore = true;
    let pageCount = 0;
    const maxPages = Math.ceil(
      Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS) / REDDIT_PAGE_SIZE
    );

    new Notice(`${progressLabel} (max ${Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS)})...`);

    while (hasMore && items.length < this.settings.fetchLimit && pageCount < maxPages) {
      pageCount++;
      const pageSize = Math.min(REDDIT_PAGE_SIZE, this.settings.fetchLimit - items.length);

      await this.ensureValidToken();

      const params: RequestUrlParam = {
        url: `${REDDIT_OAUTH_BASE_URL}/user/${this.settings.username}/${endpoint}?limit=${pageSize}${after ? `&after=${after}` : ''}`,
        method: 'GET',
        headers: {
          [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
          [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
        },
      };

      const response = await this.makeRateLimitedRequest(params);
      const data = response.json.data;

      if (data.children && data.children.length > 0) {
        // Add content origin to each item
        const itemsWithOrigin = data.children.map((item: RedditItem) => ({
          ...item,
          contentOrigin,
        }));
        items.push(...itemsWithOrigin);
        after = data.after || '';
        hasMore = !!after && items.length < REDDIT_MAX_ITEMS;

        // Update progress
        if (pageCount % PROGRESS_UPDATE_FREQUENCY === 0 || !hasMore) {
          new Notice(`Fetched ${items.length} ${progressLabel.toLowerCase()}...`);
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

  /**
   * Fetch saved posts and comments
   */
  async fetchAllSaved(): Promise<RedditItem[]> {
    return this.fetchUserContent('saved', 'saved', 'Fetching saved items');
  }

  /**
   * Fetch upvoted posts
   */
  async fetchUpvoted(): Promise<RedditItem[]> {
    return this.fetchUserContent('upvoted', 'upvoted', 'Fetching upvoted posts');
  }

  /**
   * Fetch user's own submitted posts
   */
  async fetchUserPosts(): Promise<RedditItem[]> {
    return this.fetchUserContent('submitted', 'submitted', 'Fetching your posts');
  }

  /**
   * Fetch user's own comments
   */
  async fetchUserComments(): Promise<RedditItem[]> {
    return this.fetchUserContent('comments', 'commented', 'Fetching your comments');
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

  /**
   * Enhanced fetch with resumable support and progress tracking
   * This method supports cancellation, resumption, and detailed progress reporting
   */
  async fetchAllSavedEnhanced(options: FetchOptions = {}): Promise<FetchResult> {
    const { startCursor = '', onProgress, signal } = options;

    // Start performance monitoring
    this.performanceMonitor.startSession();

    const items: RedditItem[] = [];
    let after = startCursor;
    let hasMore = true;
    let pageCount = 0;
    let wasCancelled = false;
    const maxPages = Math.ceil(
      Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS) / REDDIT_PAGE_SIZE
    );

    // Update import state if available
    if (this.importStateManager) {
      this.importStateManager.setPhase('fetching');
      if (startCursor) {
        this.importStateManager.setCursor(startCursor);
      }
    }

    new Notice(
      `Fetching saved posts (max ${Math.min(this.settings.fetchLimit, REDDIT_MAX_ITEMS)})...`
    );

    try {
      while (hasMore && items.length < this.settings.fetchLimit && pageCount < maxPages) {
        // Check for cancellation
        if (signal?.aborted) {
          wasCancelled = true;
          break;
        }

        // Check import state for pause/cancel
        if (this.importStateManager && !this.importStateManager.shouldContinue()) {
          wasCancelled = true;
          break;
        }

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

        let response;
        if (this.useEnhancedFeatures) {
          // Use the enhanced request queue
          response = await this.requestQueue.enqueue(params, { priority: 'high' });
        } else {
          // Fall back to legacy method
          response = await this.makeRateLimitedRequest(params);
        }

        const data = response.json.data;

        if (data.children && data.children.length > 0) {
          items.push(...data.children);
          after = data.after || '';
          hasMore = !!after && items.length < REDDIT_MAX_ITEMS;

          // Record metrics
          this.performanceMonitor.recordItemsFetched(data.children.length);

          // Update import state
          if (this.importStateManager) {
            this.importStateManager.setCursor(after);
            this.importStateManager.addFetchedItems(data.children);
          }

          // Update progress
          if (pageCount % PROGRESS_UPDATE_FREQUENCY === 0 || !hasMore) {
            new Notice(`Fetched ${items.length} saved items...`);

            if (onProgress && this.importStateManager) {
              const progress = this.importStateManager.getProgress();
              if (progress) {
                onProgress(progress);
              }
            }
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
    } catch (error) {
      console.error('Error during enhanced fetch:', error);

      // Save state for potential resumption
      if (this.importStateManager) {
        this.importStateManager.pause();
      }

      throw error;
    }

    const finalCount = Math.min(items.length, this.settings.fetchLimit);

    return {
      items: items.slice(0, finalCount),
      cursor: after,
      hasMore,
      wasCancelled,
    };
  }

  /**
   * Get performance summary after fetch operation
   */
  getPerformanceSummary(): string {
    return this.performanceMonitor.formatForDisplay();
  }

  /**
   * Check if there are pending requests in the queue
   */
  hasPendingRequests(): boolean {
    return this.requestQueue.getPendingCount() > 0;
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    this.requestQueue.clear();
  }

  async fetchPostComments(
    permalink: string,
    upvoteThreshold: number = 0
  ): Promise<RedditComment[]> {
    await this.ensureValidToken();

    // Reddit API endpoint for comments: /r/subreddit/comments/article_id
    // The permalink already contains the path, we just need to use it
    const url = `${REDDIT_OAUTH_BASE_URL}${permalink}.json?limit=100&depth=5&sort=top`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await requestUrl(params);

      // Reddit returns an array: [post, comments]
      // The second element contains the comments
      if (!Array.isArray(response.json) || response.json.length < 2) {
        return [];
      }

      const commentsData = response.json[1]?.data?.children || [];
      return this.parseComments(commentsData, upvoteThreshold, 0);
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  }

  private parseComments(
    children: Array<{ kind: string; data: Record<string, unknown> }>,
    upvoteThreshold: number,
    depth: number,
    maxDepth: number = 5
  ): RedditComment[] {
    const comments: RedditComment[] = [];

    for (const child of children) {
      // Skip "more" placeholders (kind: 'more')
      if (child.kind !== 't1') {
        continue;
      }

      const data = child.data;
      const score = (data.score as number) || 0;

      // Filter by upvote threshold
      if (score < upvoteThreshold) {
        continue;
      }

      const comment: RedditComment = {
        id: data.id as string,
        author: (data.author as string) || '[deleted]',
        body: (data.body as string) || '',
        score,
        created_utc: (data.created_utc as number) || 0,
        is_submitter: (data.is_submitter as boolean) || false,
        depth,
      };

      // Parse nested replies if within depth limit
      if (depth < maxDepth && data.replies && typeof data.replies === 'object') {
        const repliesData = data.replies as {
          data?: { children?: Array<{ kind: string; data: Record<string, unknown> }> };
        };
        if (repliesData.data?.children) {
          comment.replies = this.parseComments(
            repliesData.data.children,
            upvoteThreshold,
            depth + 1,
            maxDepth
          );
        }
      }

      comments.push(comment);
    }

    return comments;
  }

  /**
   * Fetch a comment with its parent context
   * Uses the ?context parameter to get parent comments in the thread
   */
  async fetchCommentWithContext(
    commentPermalink: string,
    contextDepth: number = 3
  ): Promise<RedditItemData | null> {
    await this.ensureValidToken();

    // Clamp context depth to valid range (1-10)
    const depth = Math.max(1, Math.min(10, contextDepth));

    // Build the URL with context parameter
    const url = `${REDDIT_OAUTH_BASE_URL}${commentPermalink}.json?context=${depth}`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await requestUrl(params);

      // Reddit returns [post, comments] array
      if (!Array.isArray(response.json) || response.json.length < 2) {
        return null;
      }

      const commentsListing = response.json[1]?.data?.children || [];
      if (commentsListing.length === 0) {
        return null;
      }

      // Find the target comment and extract parent context
      const parentComments: RedditItemData[] = [];
      let targetComment: RedditItemData | null = null;

      // The comments are nested - traverse to find the target
      const findComment = (
        children: RedditItem[],
        parents: RedditItemData[] = []
      ): RedditItemData | null => {
        for (const child of children) {
          if (child.kind !== REDDIT_ITEM_TYPE_COMMENT) continue;

          const data = child.data;
          const currentPermalink = data.permalink;

          // Check if this is our target comment
          if (currentPermalink && commentPermalink.includes(data.id)) {
            // Found it - copy parents to result
            parentComments.push(...parents);
            return data;
          }

          // Check nested replies
          if (data.replies && typeof data.replies === 'object') {
            const repliesData = data.replies as {
              data?: { children?: RedditItem[] };
            };
            if (repliesData.data?.children) {
              const found = findComment(repliesData.data.children, [...parents, data]);
              if (found) return found;
            }
          }
        }
        return null;
      };

      targetComment = findComment(commentsListing);

      if (targetComment) {
        targetComment.parent_comments = parentComments;
        targetComment.depth = parentComments.length;
      }

      return targetComment;
    } catch (error) {
      console.error('Error fetching comment context:', error);
      return null;
    }
  }

  /**
   * Fetch replies to a specific comment
   */
  async fetchCommentReplies(
    commentPermalink: string,
    maxDepth: number = COMMENT_MAX_DEPTH
  ): Promise<RedditItemData[]> {
    await this.ensureValidToken();

    const url = `${REDDIT_OAUTH_BASE_URL}${commentPermalink}.json?depth=${maxDepth}&limit=100`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await requestUrl(params);

      if (!Array.isArray(response.json) || response.json.length < 2) {
        return [];
      }

      const commentsListing = response.json[1]?.data?.children || [];
      if (commentsListing.length === 0) {
        return [];
      }

      // Find the target comment
      const targetComment = commentsListing.find(
        (c: RedditItem) =>
          c.kind === REDDIT_ITEM_TYPE_COMMENT && commentPermalink.includes(c.data.id)
      );

      if (!targetComment) {
        return [];
      }

      // Extract replies
      const repliesData = targetComment.data.replies;
      if (!repliesData || typeof repliesData !== 'object') {
        return [];
      }

      const repliesListing = (repliesData as { data?: { children?: RedditItem[] } }).data?.children;
      if (!repliesListing) {
        return [];
      }

      // Flatten the reply tree
      return this.flattenCommentTree(repliesListing, 1, maxDepth);
    } catch (error) {
      console.error('Error fetching comment replies:', error);
      return [];
    }
  }

  /**
   * Fetch a full comment thread for a post
   */
  async fetchCommentThread(
    postId: string,
    subreddit: string,
    sort: string = 'best'
  ): Promise<CommentThread | null> {
    await this.ensureValidToken();

    const url = `${REDDIT_OAUTH_BASE_URL}/r/${subreddit}/comments/${postId}.json?sort=${sort}&limit=100&depth=${COMMENT_MAX_DEPTH}`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await requestUrl(params);

      if (!Array.isArray(response.json) || response.json.length < 2) {
        return null;
      }

      const postListing = response.json[0]?.data?.children || [];
      const commentsListing = response.json[1]?.data?.children || [];

      if (postListing.length === 0) {
        return null;
      }

      const post = postListing[0].data as RedditItemData;
      const comments = this.flattenCommentTree(commentsListing, 0, COMMENT_MAX_DEPTH);

      // Check if there are "more" comments
      const hasMore = commentsListing.some((c: RedditItem) => c.kind === 'more');

      return {
        post,
        comments,
        totalComments: post.num_comments || 0,
        hasMore,
      };
    } catch (error) {
      console.error('Error fetching comment thread:', error);
      return null;
    }
  }

  /**
   * Flatten a nested comment tree into a flat array with depth info
   */
  private flattenCommentTree(
    children: RedditItem[],
    currentDepth: number,
    maxDepth: number = COMMENT_MAX_DEPTH
  ): RedditItemData[] {
    const result: RedditItemData[] = [];

    for (const child of children) {
      if (child.kind !== REDDIT_ITEM_TYPE_COMMENT) continue;

      const data = { ...child.data, depth: currentDepth };
      result.push(data);

      // Recursively flatten nested replies
      if (currentDepth < maxDepth && data.replies && typeof data.replies === 'object') {
        const repliesData = data.replies as {
          data?: { children?: RedditItem[] };
        };
        if (repliesData.data?.children) {
          result.push(
            ...this.flattenCommentTree(repliesData.data.children, currentDepth + 1, maxDepth)
          );
        }
      }
    }

    return result;
  }

  /**
   * Determine if a parent_id refers to a comment or a post
   */
  static getParentType(parentId: string): 'comment' | 'post' {
    // t1_ = comment, t3_ = post
    return parentId.startsWith('t1_') ? 'comment' : 'post';
  }

  /**
   * Extract the ID from a Reddit fullname (e.g., "t1_abc123" -> "abc123")
   */
  static extractIdFromFullname(fullname: string): string {
    const match = fullname.match(/^t\d_(.+)$/);
    return match ? match[1] : fullname;
  }
}
