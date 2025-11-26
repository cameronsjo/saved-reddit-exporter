import {
  FilterSettings,
  FilterResult,
  FilterBreakdown,
  PreviewResult,
  RedditItem,
  RedditItemData,
  PostType,
  DateRangePreset,
} from './types';
import {
  REDDIT_ITEM_TYPE_COMMENT,
  REDDIT_ITEM_TYPE_POST,
  DEFAULT_FILTER_SETTINGS,
} from './constants';

/**
 * Creates an empty filter breakdown for tracking filtered items
 */
export function createEmptyBreakdown(): FilterBreakdown {
  return {
    subreddit: 0,
    score: 0,
    date: 0,
    postType: 0,
    content: 0,
    author: 0,
    domain: 0,
    nsfw: 0,
    commentCount: 0,
  };
}

/**
 * FilterEngine - Handles all filtering logic for Reddit items
 */
export class FilterEngine {
  private settings: FilterSettings;

  constructor(settings: FilterSettings) {
    this.settings = settings;
  }

  /**
   * Main entry point - checks if an item passes all filters
   */
  shouldIncludeItem(item: RedditItem): FilterResult {
    // If filtering is disabled, include everything
    if (!this.settings.enabled) {
      return { passes: true };
    }

    const data = item.data;
    const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;

    // Check each filter in order of performance (cheapest first)
    const filters: Array<() => FilterResult> = [
      () => this.checkPostTypeFilter(item, isComment),
      () => this.checkNsfwFilter(data),
      () => this.checkSubredditFilter(data),
      () => this.checkAuthorFilter(data),
      () => this.checkScoreFilter(data),
      () => this.checkDateFilter(data),
      () => this.checkCommentCountFilter(data, isComment),
      () => this.checkDomainFilter(data, isComment),
      () => this.checkFlairFilter(data, isComment),
      () => this.checkTitleKeywordsFilter(data, isComment),
      () => this.checkContentKeywordsFilter(data, isComment),
    ];

    for (const filter of filters) {
      const result = filter();
      if (!result.passes) {
        return result;
      }
    }

    return { passes: true };
  }

  /**
   * Filters an array of items and returns detailed results
   */
  filterItems(items: RedditItem[]): {
    passed: RedditItem[];
    filtered: Array<{ item: RedditItem; reason: string; filterType: keyof FilterBreakdown }>;
    breakdown: FilterBreakdown;
  } {
    const passed: RedditItem[] = [];
    const filtered: Array<{ item: RedditItem; reason: string; filterType: keyof FilterBreakdown }> =
      [];
    const breakdown = createEmptyBreakdown();

    for (const item of items) {
      const result = this.shouldIncludeItem(item);
      if (result.passes) {
        passed.push(item);
      } else {
        filtered.push({
          item,
          reason: result.reason || 'Unknown filter',
          filterType: result.filterType || 'content',
        });
        if (result.filterType) {
          breakdown[result.filterType]++;
        }
      }
    }

    return { passed, filtered, breakdown };
  }

  /**
   * Preview mode - shows what would be imported without actually importing
   */
  previewImport(
    items: RedditItem[],
    existingIds: Set<string>,
    skipExisting: boolean
  ): PreviewResult {
    const wouldImport: RedditItem[] = [];
    const wouldFilter: Array<{ item: RedditItem; reason: string }> = [];
    const wouldSkip: RedditItem[] = [];
    const breakdown = createEmptyBreakdown();

    for (const item of items) {
      // Check if already imported
      if (skipExisting && existingIds.has(item.data.id)) {
        wouldSkip.push(item);
        continue;
      }

      // Check filters
      const filterResult = this.shouldIncludeItem(item);
      if (!filterResult.passes) {
        wouldFilter.push({ item, reason: filterResult.reason || 'Filtered' });
        if (filterResult.filterType) {
          breakdown[filterResult.filterType]++;
        }
        continue;
      }

      wouldImport.push(item);
    }

    return { wouldImport, wouldFilter, wouldSkip, breakdown };
  }

  // === Individual Filter Methods ===

  private checkPostTypeFilter(item: RedditItem, isComment: boolean): FilterResult {
    // Check if comments/posts are included
    if (isComment && !this.settings.includeComments) {
      return {
        passes: false,
        reason: 'Comments excluded',
        filterType: 'postType',
      };
    }

    if (!isComment && !this.settings.includePosts) {
      return {
        passes: false,
        reason: 'Posts excluded',
        filterType: 'postType',
      };
    }

    // For posts, check post type
    if (!isComment && item.kind === REDDIT_ITEM_TYPE_POST) {
      const postType = this.determinePostType(item.data);
      if (!this.settings.includePostTypes.includes(postType)) {
        return {
          passes: false,
          reason: `Post type '${postType}' excluded`,
          filterType: 'postType',
        };
      }
    }

    return { passes: true };
  }

  private checkNsfwFilter(data: RedditItemData): FilterResult {
    if (this.settings.excludeNsfw && data.over_18) {
      return {
        passes: false,
        reason: 'NSFW content excluded',
        filterType: 'nsfw',
      };
    }
    return { passes: true };
  }

  private checkSubredditFilter(data: RedditItemData): FilterResult {
    const subreddit = data.subreddit.toLowerCase();

    // Check regex pattern first if enabled
    if (this.settings.useSubredditRegex && this.settings.subredditRegex) {
      try {
        const regex = new RegExp(this.settings.subredditRegex, 'i');
        const matches = regex.test(subreddit);

        if (this.settings.subredditFilterMode === 'include' && !matches) {
          return {
            passes: false,
            reason: `Subreddit 'r/${data.subreddit}' doesn't match regex pattern`,
            filterType: 'subreddit',
          };
        }

        if (this.settings.subredditFilterMode === 'exclude' && matches) {
          return {
            passes: false,
            reason: `Subreddit 'r/${data.subreddit}' matches excluded regex pattern`,
            filterType: 'subreddit',
          };
        }
      } catch {
        // Invalid regex - ignore and continue
        console.warn('Invalid subreddit regex pattern:', this.settings.subredditRegex);
      }
    }

    // Check subreddit list
    if (this.settings.subredditList.length > 0) {
      const normalizedList = this.settings.subredditList.map(s => s.toLowerCase().trim());
      const isInList = normalizedList.includes(subreddit);

      if (this.settings.subredditFilterMode === 'include' && !isInList) {
        return {
          passes: false,
          reason: `Subreddit 'r/${data.subreddit}' not in include list`,
          filterType: 'subreddit',
        };
      }

      if (this.settings.subredditFilterMode === 'exclude' && isInList) {
        return {
          passes: false,
          reason: `Subreddit 'r/${data.subreddit}' in exclude list`,
          filterType: 'subreddit',
        };
      }
    }

    return { passes: true };
  }

  private checkAuthorFilter(data: RedditItemData): FilterResult {
    if (this.settings.authorList.length === 0) {
      return { passes: true };
    }

    const author = data.author.toLowerCase();
    const normalizedList = this.settings.authorList.map(a => a.toLowerCase().trim());
    const isInList = normalizedList.includes(author);

    if (this.settings.authorFilterMode === 'include' && !isInList) {
      return {
        passes: false,
        reason: `Author 'u/${data.author}' not in include list`,
        filterType: 'author',
      };
    }

    if (this.settings.authorFilterMode === 'exclude' && isInList) {
      return {
        passes: false,
        reason: `Author 'u/${data.author}' in exclude list`,
        filterType: 'author',
      };
    }

    return { passes: true };
  }

  private checkScoreFilter(data: RedditItemData): FilterResult {
    const score = data.score;

    if (this.settings.minScore !== null && score < this.settings.minScore) {
      return {
        passes: false,
        reason: `Score ${score} below minimum ${this.settings.minScore}`,
        filterType: 'score',
      };
    }

    if (this.settings.maxScore !== null && score > this.settings.maxScore) {
      return {
        passes: false,
        reason: `Score ${score} above maximum ${this.settings.maxScore}`,
        filterType: 'score',
      };
    }

    // Check upvote ratio
    if (
      this.settings.minUpvoteRatio !== null &&
      data.upvote_ratio !== undefined &&
      data.upvote_ratio < this.settings.minUpvoteRatio
    ) {
      return {
        passes: false,
        reason: `Upvote ratio ${(data.upvote_ratio * 100).toFixed(0)}% below minimum ${(this.settings.minUpvoteRatio * 100).toFixed(0)}%`,
        filterType: 'score',
      };
    }

    return { passes: true };
  }

  private checkDateFilter(data: RedditItemData): FilterResult {
    const itemDate = data.created_utc * 1000; // Convert to milliseconds
    const now = Date.now();

    // Handle preset date ranges
    if (this.settings.dateRangePreset !== 'all' && this.settings.dateRangePreset !== 'custom') {
      const cutoffDate = this.getPresetCutoffDate(this.settings.dateRangePreset, now);
      if (itemDate < cutoffDate) {
        return {
          passes: false,
          reason: `Post from ${new Date(itemDate).toLocaleDateString()} is older than ${this.settings.dateRangePreset.replace('_', ' ')}`,
          filterType: 'date',
        };
      }
    }

    // Handle custom date range
    if (this.settings.dateRangePreset === 'custom') {
      if (this.settings.dateRangeStart !== null && itemDate < this.settings.dateRangeStart) {
        return {
          passes: false,
          reason: `Post from ${new Date(itemDate).toLocaleDateString()} is before start date`,
          filterType: 'date',
        };
      }

      if (this.settings.dateRangeEnd !== null && itemDate > this.settings.dateRangeEnd) {
        return {
          passes: false,
          reason: `Post from ${new Date(itemDate).toLocaleDateString()} is after end date`,
          filterType: 'date',
        };
      }
    }

    return { passes: true };
  }

  private checkCommentCountFilter(data: RedditItemData, isComment: boolean): FilterResult {
    // Comment count filter only applies to posts
    if (isComment) {
      return { passes: true };
    }

    const commentCount = data.num_comments ?? 0;

    if (this.settings.minCommentCount !== null && commentCount < this.settings.minCommentCount) {
      return {
        passes: false,
        reason: `Comment count ${commentCount} below minimum ${this.settings.minCommentCount}`,
        filterType: 'commentCount',
      };
    }

    if (this.settings.maxCommentCount !== null && commentCount > this.settings.maxCommentCount) {
      return {
        passes: false,
        reason: `Comment count ${commentCount} above maximum ${this.settings.maxCommentCount}`,
        filterType: 'commentCount',
      };
    }

    return { passes: true };
  }

  private checkDomainFilter(data: RedditItemData, isComment: boolean): FilterResult {
    // Domain filter only applies to link posts
    if (isComment || data.is_self || !data.domain || this.settings.domainList.length === 0) {
      return { passes: true };
    }

    const domain = data.domain.toLowerCase();
    const normalizedList = this.settings.domainList.map(d => d.toLowerCase().trim());

    // Check if domain matches any in the list (includes subdomain matching)
    const isInList = normalizedList.some(
      listDomain => domain === listDomain || domain.endsWith('.' + listDomain)
    );

    if (this.settings.domainFilterMode === 'include' && !isInList) {
      return {
        passes: false,
        reason: `Domain '${data.domain}' not in include list`,
        filterType: 'domain',
      };
    }

    if (this.settings.domainFilterMode === 'exclude' && isInList) {
      return {
        passes: false,
        reason: `Domain '${data.domain}' in exclude list`,
        filterType: 'domain',
      };
    }

    return { passes: true };
  }

  private checkFlairFilter(data: RedditItemData, isComment: boolean): FilterResult {
    // Flair filter primarily applies to posts
    if (isComment || this.settings.flairList.length === 0) {
      return { passes: true };
    }

    const flair = data.link_flair_text?.toLowerCase() ?? '';
    const normalizedList = this.settings.flairList.map(f => f.toLowerCase().trim());
    const hasFlair = flair.length > 0;
    const isInList = hasFlair && normalizedList.some(f => flair.includes(f));

    if (this.settings.flairFilterMode === 'include') {
      if (!hasFlair || !isInList) {
        return {
          passes: false,
          reason: hasFlair
            ? `Flair '${data.link_flair_text}' not in include list`
            : 'Post has no flair (flair filter active)',
          filterType: 'content',
        };
      }
    }

    if (this.settings.flairFilterMode === 'exclude' && isInList) {
      return {
        passes: false,
        reason: `Flair '${data.link_flair_text}' in exclude list`,
        filterType: 'content',
      };
    }

    return { passes: true };
  }

  private checkTitleKeywordsFilter(data: RedditItemData, isComment: boolean): FilterResult {
    if (this.settings.titleKeywords.length === 0) {
      return { passes: true };
    }

    const title = (isComment ? data.link_title : data.title)?.toLowerCase() ?? '';
    const normalizedKeywords = this.settings.titleKeywords.map(k => k.toLowerCase().trim());
    const hasMatch = normalizedKeywords.some(keyword => title.includes(keyword));

    if (this.settings.titleKeywordsMode === 'include' && !hasMatch) {
      return {
        passes: false,
        reason: 'Title does not contain required keywords',
        filterType: 'content',
      };
    }

    if (this.settings.titleKeywordsMode === 'exclude' && hasMatch) {
      return {
        passes: false,
        reason: 'Title contains excluded keywords',
        filterType: 'content',
      };
    }

    return { passes: true };
  }

  private checkContentKeywordsFilter(data: RedditItemData, isComment: boolean): FilterResult {
    if (this.settings.contentKeywords.length === 0) {
      return { passes: true };
    }

    // Get content based on item type
    const content = isComment ? data.body?.toLowerCase() : data.selftext?.toLowerCase();

    if (!content) {
      // If no content and we're in include mode, fail
      if (this.settings.contentKeywordsMode === 'include') {
        return {
          passes: false,
          reason: 'No content to search for keywords',
          filterType: 'content',
        };
      }
      return { passes: true };
    }

    const normalizedKeywords = this.settings.contentKeywords.map(k => k.toLowerCase().trim());
    const hasMatch = normalizedKeywords.some(keyword => content.includes(keyword));

    if (this.settings.contentKeywordsMode === 'include' && !hasMatch) {
      return {
        passes: false,
        reason: 'Content does not contain required keywords',
        filterType: 'content',
      };
    }

    if (this.settings.contentKeywordsMode === 'exclude' && hasMatch) {
      return {
        passes: false,
        reason: 'Content contains excluded keywords',
        filterType: 'content',
      };
    }

    return { passes: true };
  }

  // === Helper Methods ===

  /**
   * Determines the post type based on Reddit item data
   */
  private determinePostType(data: RedditItemData): PostType {
    // Text/self post
    if (data.is_self) {
      return 'text';
    }

    // Check for media
    if (data.url) {
      const url = data.url.toLowerCase();

      // Video patterns
      if (
        url.includes('v.redd.it') ||
        url.includes('youtube.com') ||
        url.includes('youtu.be') ||
        url.includes('vimeo.com') ||
        /\.(mp4|webm|mov)(\?|$)/i.test(url)
      ) {
        return 'video';
      }

      // Image patterns
      if (
        url.includes('i.redd.it') ||
        url.includes('i.imgur.com') ||
        /\.(jpg|jpeg|png|webp|bmp|svg)(\?|$)/i.test(url)
      ) {
        return 'image';
      }

      // GIF patterns (counted as image)
      if (url.includes('gfycat.com') || url.includes('redgifs.com') || /\.gif(\?|$)/i.test(url)) {
        return 'image';
      }
    }

    // Default to link for external links
    return 'link';
  }

  /**
   * Gets the cutoff timestamp for a date range preset
   */
  private getPresetCutoffDate(preset: DateRangePreset, now: number): number {
    switch (preset) {
      case 'last_day':
        return now - 24 * 60 * 60 * 1000;
      case 'last_week':
        return now - 7 * 24 * 60 * 60 * 1000;
      case 'last_month':
        return now - 30 * 24 * 60 * 60 * 1000;
      case 'last_year':
        return now - 365 * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }
}

/**
 * Filter preset templates for common use cases
 */
export const FILTER_PRESETS = {
  highQualityOnly: {
    name: 'High Quality Only',
    description: 'Only import posts with 100+ upvotes and 90%+ upvote ratio',
    settings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      minScore: 100,
      minUpvoteRatio: 0.9,
    } as FilterSettings,
  },
  textPostsOnly: {
    name: 'Text Posts Only',
    description: 'Only import self/text posts, no links or media',
    settings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      includePostTypes: ['text'] as PostType[],
      includeComments: false,
    } as FilterSettings,
  },
  noNsfw: {
    name: 'SFW Only',
    description: 'Exclude all NSFW content',
    settings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      excludeNsfw: true,
    } as FilterSettings,
  },
  recentOnly: {
    name: 'Recent Posts',
    description: 'Only import posts from the last month',
    settings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      dateRangePreset: 'last_month' as DateRangePreset,
    } as FilterSettings,
  },
  discussionsOnly: {
    name: 'Discussions Only',
    description: 'Only import posts with significant discussion (10+ comments)',
    settings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      includePostTypes: ['text'] as PostType[],
      minCommentCount: 10,
    } as FilterSettings,
  },
};
