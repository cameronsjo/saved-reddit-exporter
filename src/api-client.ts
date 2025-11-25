import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import {
  RedditSavedSettings,
  RedditItem,
  RedditItemData,
  RedditListingResponse,
  CommentThread,
} from './types';
import {
  REDDIT_USER_AGENT,
  REDDIT_MAX_ITEMS,
  REDDIT_PAGE_SIZE,
  REDDIT_OAUTH_BASE_URL,
  REDDIT_ITEM_TYPE_COMMENT,
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
  COMMENT_MAX_TOP_LEVEL,
  COMMENT_MAX_DEPTH,
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

  /**
   * Fetch a comment with its parent context
   * Uses Reddit's context parameter to get N levels of parent comments
   *
   * @param commentPermalink - The permalink of the comment (e.g., /r/subreddit/comments/postid/title/commentid)
   * @param contextDepth - How many parent levels to fetch (1-10)
   * @returns The comment with parent_comments array populated
   */
  async fetchCommentWithContext(
    commentPermalink: string,
    contextDepth: number = this.settings.commentContextDepth
  ): Promise<RedditItemData | null> {
    await this.ensureValidToken();

    // Clamp context depth to API limits
    const depth = Math.min(Math.max(contextDepth, 1), 10);

    // Reddit API expects .json appended to permalink for JSON response
    const url = `${REDDIT_OAUTH_BASE_URL}${commentPermalink}.json?context=${depth}&limit=1`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await this.makeRateLimitedRequest(params);
      // Reddit returns an array: [post_listing, comments_listing]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.json as any[];

      if (!data || data.length < 2) {
        return null;
      }

      // Extract the comment thread (second element)
      const commentsListing = data[1] as RedditListingResponse;
      if (!commentsListing?.data?.children?.length) {
        return null;
      }

      // The target comment will be at the end of the nested structure
      // Walk through the nested replies to find it and collect parent context
      const parentComments: RedditItemData[] = [];
      let currentComment = commentsListing.data.children[0];

      while (currentComment && currentComment.kind === REDDIT_ITEM_TYPE_COMMENT) {
        const commentData = currentComment.data;

        // Check if this has nested replies (meaning there are more children)
        if (
          commentData.replies &&
          typeof commentData.replies === 'object' &&
          commentData.replies.data?.children?.length > 0
        ) {
          // This is a parent comment - add to context
          parentComments.push(commentData);
          // Move to the first child
          currentComment = commentData.replies.data.children[0];
        } else {
          // This is the target comment (deepest level)
          commentData.parent_comments = parentComments;
          commentData.depth = parentComments.length;
          return commentData;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching comment context:', error);
      return null;
    }
  }

  /**
   * Fetch the full comment thread for a post
   * Returns up to 100 top-level comments with up to 5 levels of replies each
   *
   * @param postId - The post ID (without t3_ prefix)
   * @param subreddit - The subreddit name
   * @param sort - Comment sort order ('confidence', 'top', 'new', 'controversial', 'old', 'qa')
   * @returns CommentThread object with post and flattened comments
   */
  async fetchCommentThread(
    postId: string,
    subreddit: string,
    sort: string = 'confidence'
  ): Promise<CommentThread | null> {
    await this.ensureValidToken();

    const url = `${REDDIT_OAUTH_BASE_URL}/r/${subreddit}/comments/${postId}.json?limit=${COMMENT_MAX_TOP_LEVEL}&depth=${COMMENT_MAX_DEPTH}&sort=${sort}`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await this.makeRateLimitedRequest(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.json as any[];

      if (!data || data.length < 2) {
        return null;
      }

      // First element is the post
      const postListing = data[0] as RedditListingResponse;
      const post = postListing?.data?.children?.[0]?.data;

      if (!post) {
        return null;
      }

      // Second element is the comments
      const commentsListing = data[1] as RedditListingResponse;
      const comments = this.flattenCommentTree(commentsListing?.data?.children || []);

      return {
        post,
        comments,
        totalComments: post.num_comments || 0,
        hasMore: comments.length < (post.num_comments || 0),
      };
    } catch (error) {
      console.error('Error fetching comment thread:', error);
      return null;
    }
  }

  /**
   * Fetch replies to a specific comment
   *
   * @param commentPermalink - The permalink of the comment
   * @param depth - How many levels of replies to fetch (1-5)
   * @returns Array of reply comments
   */
  async fetchCommentReplies(
    commentPermalink: string,
    depth: number = this.settings.commentReplyDepth
  ): Promise<RedditItemData[]> {
    await this.ensureValidToken();

    const replyDepth = Math.min(Math.max(depth, 1), COMMENT_MAX_DEPTH);
    const url = `${REDDIT_OAUTH_BASE_URL}${commentPermalink}.json?depth=${replyDepth}&limit=${COMMENT_MAX_TOP_LEVEL}`;

    const params: RequestUrlParam = {
      url,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
    };

    try {
      const response = await this.makeRateLimitedRequest(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.json as any[];

      if (!data || data.length < 2) {
        return [];
      }

      const commentsListing = data[1] as RedditListingResponse;
      if (!commentsListing?.data?.children?.length) {
        return [];
      }

      // Get the target comment and extract its replies
      const targetComment = commentsListing.data.children[0];
      if (
        targetComment?.kind === REDDIT_ITEM_TYPE_COMMENT &&
        targetComment.data.replies &&
        typeof targetComment.data.replies === 'object'
      ) {
        return this.flattenCommentTree(targetComment.data.replies.data?.children || []);
      }

      return [];
    } catch (error) {
      console.error('Error fetching comment replies:', error);
      return [];
    }
  }

  /**
   * Flatten a nested comment tree into an array
   * Preserves depth information on each comment
   */
  private flattenCommentTree(children: RedditItem[], currentDepth: number = 0): RedditItemData[] {
    const result: RedditItemData[] = [];

    for (const child of children) {
      // Skip "more" items (collapsed comments) - these require additional API calls
      if (child.kind !== REDDIT_ITEM_TYPE_COMMENT) {
        continue;
      }

      const commentData = child.data;
      commentData.depth = currentDepth;

      result.push(commentData);

      // Recursively process replies
      if (
        commentData.replies &&
        typeof commentData.replies === 'object' &&
        commentData.replies.data?.children?.length > 0
      ) {
        const childComments = this.flattenCommentTree(
          commentData.replies.data.children,
          currentDepth + 1
        );
        result.push(...childComments);
      }
    }

    return result;
  }

  /**
   * Determine if a parent_id refers to a comment or a post
   */
  static getParentType(parentId: string): 'comment' | 'post' {
    return parentId.startsWith(REDDIT_ITEM_TYPE_COMMENT) ? 'comment' : 'post';
  }

  /**
   * Extract the ID from a fullname (e.g., t1_abc123 -> abc123)
   */
  static extractIdFromFullname(fullname: string): string {
    return fullname.replace(/^t\d_/, '');
  }
}
