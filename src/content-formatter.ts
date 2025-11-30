import {
  RedditItemData,
  MediaInfo,
  RedditSavedSettings,
  ContentOrigin,
  RedditComment,
} from './types';
import { MediaHandler, GalleryImage } from './media-handler';
import { RedditApiClient } from './api-client';
import { LinkPreservationService, ExternalLink } from './link-preservation';
import {
  FRONTMATTER_TYPE_POST,
  FRONTMATTER_TYPE_COMMENT,
  FRONTMATTER_TYPE_UPVOTED,
  FRONTMATTER_TYPE_USER_POST,
  FRONTMATTER_TYPE_USER_COMMENT,
} from './constants';

export class ContentFormatter {
  private settings: RedditSavedSettings;
  private mediaHandler: MediaHandler;
  private linkPreservation: LinkPreservationService;

  constructor(settings: RedditSavedSettings, mediaHandler: MediaHandler) {
    this.settings = settings;
    this.mediaHandler = mediaHandler;
    this.linkPreservation = new LinkPreservationService();
  }

  /**
   * Determine the frontmatter type based on content origin and item type
   */
  private getFrontmatterType(isComment: boolean, contentOrigin: ContentOrigin): string {
    switch (contentOrigin) {
      case 'upvoted':
        return FRONTMATTER_TYPE_UPVOTED;
      case 'submitted':
        return isComment ? FRONTMATTER_TYPE_USER_COMMENT : FRONTMATTER_TYPE_USER_POST;
      case 'commented':
        return FRONTMATTER_TYPE_USER_COMMENT;
      case 'saved':
      default:
        return isComment ? FRONTMATTER_TYPE_COMMENT : FRONTMATTER_TYPE_POST;
    }
  }

  /**
   * Get a human-readable label for the content origin
   */
  private getOriginLabel(contentOrigin: ContentOrigin): string {
    switch (contentOrigin) {
      case 'upvoted':
        return 'Upvoted';
      case 'submitted':
        return 'Your Post';
      case 'commented':
        return 'Your Comment';
      case 'saved':
      default:
        return 'Saved';
    }
  }

  /**
   * Check if the item should be treated as saved (for compatibility)
   */
  private isSavedContent(contentOrigin: ContentOrigin): boolean {
    return contentOrigin === 'saved';
  }

  async formatRedditContent(
    data: RedditItemData,
    isComment: boolean,
    contentOrigin: ContentOrigin = 'saved',
    comments: RedditComment[] = []
  ): Promise<string> {
    const created = new Date(data.created_utc * 1000).toISOString();
    const createdDate = new Date(data.created_utc * 1000).toLocaleDateString();
    const mediaInfo = this.mediaHandler.analyzeMedia(data);

    // Handle crosspost - use original if enabled
    const effectiveData = this.getEffectiveData(data);
    const isCrosspost = this.isCrosspost(data);

    let content = `---\n`;
    content += `type: ${this.getFrontmatterType(isComment, contentOrigin)}\n`;
    content += `content_origin: ${contentOrigin}\n`;
    content += `subreddit: ${effectiveData.subreddit}\n`;
    content += `author: ${effectiveData.author}\n`;
    content += `created: ${created}\n`;
    content += `date: ${createdDate}\n`;
    content += `permalink: https://reddit.com${effectiveData.permalink}\n`;
    content += `id: ${data.id}\n`;

    // Only add saved: true for saved content
    if (this.isSavedContent(contentOrigin)) {
      content += `saved: true\n`;
    }

    // Add crosspost metadata if enabled and applicable
    if (isCrosspost && this.settings.preserveCrosspostMetadata) {
      content += `is_crosspost: true\n`;
      content += `crosspost_subreddit: ${data.subreddit}\n`;
      content += `original_subreddit: ${data.crosspost_parent_list![0].subreddit}\n`;
      content += `original_author: ${data.crosspost_parent_list![0].author}\n`;
      content += `original_id: ${data.crosspost_parent_list![0].id}\n`;
    }

    if (!isComment) {
      content += `title: "${effectiveData.title!.replace(/"/g, '\\"')}"\n`;
      content += `score: ${data.score}\n`;
      content += `num_comments: ${data.num_comments}\n`;
      content += `upvote_ratio: ${data.upvote_ratio || 'unknown'}\n`;

      if (effectiveData.link_flair_text) {
        content += `flair: "${effectiveData.link_flair_text.replace(/"/g, '\\"')}"\n`;
      }

      if (effectiveData.is_self) {
        content += `post_type: text\n`;
      } else if (effectiveData.url) {
        content += `post_type: ${mediaInfo.type}\n`;
        content += `url: ${effectiveData.url}\n`;
        if (mediaInfo.domain) {
          content += `domain: ${mediaInfo.domain}\n`;
        }
      }

      // Add media-specific metadata
      if (mediaInfo.isMedia) {
        content += `media_type: ${mediaInfo.mediaType}\n`;
        if (effectiveData.preview?.images?.[0]?.source?.url) {
          content += `thumbnail: ${effectiveData.preview.images[0].source.url.replace(/&amp;/g, '&')}\n`;
        }
      }

      // Add gallery metadata
      if (this.mediaHandler.isGalleryPost(effectiveData)) {
        const galleryImages = this.mediaHandler.extractGalleryImages(effectiveData);
        content += `post_type: gallery\n`;
        content += `gallery_count: ${galleryImages.length}\n`;
      }

      // Add poll metadata
      if (this.mediaHandler.isPollPost(effectiveData)) {
        const pollData = effectiveData.poll_data!;
        content += `post_type: poll\n`;
        content += `poll_total_votes: ${pollData.total_vote_count}\n`;
        content += `poll_options_count: ${pollData.options.length}\n`;
        if (pollData.voting_end_timestamp) {
          const endDate = new Date(pollData.voting_end_timestamp).toISOString();
          content += `poll_ends: ${endDate}\n`;
        }
      }

      // Add comments metadata if comments were exported
      if (comments.length > 0) {
        content += `exported_comments: ${this.countTotalComments(comments)}\n`;
      }

      // Content enrichment metadata
      content += this.formatEnrichmentMetadata(effectiveData);
    } else {
      content += `post_title: "${(data.link_title || '').replace(/"/g, '\\"')}"\n`;
      content += `score: ${data.score}\n`;
      content += `is_submitter: ${data.is_submitter || false}\n`;

      // Comment tree metadata
      if (data.parent_id) {
        content += `parent_id: ${data.parent_id}\n`;
        content += `parent_type: ${RedditApiClient.getParentType(data.parent_id)}\n`;
      }
      if (data.link_id) {
        content += `link_id: ${data.link_id}\n`;
      }
      if (typeof data.depth === 'number') {
        content += `depth: ${data.depth}\n`;
      }
      if (data.distinguished) {
        content += `distinguished: ${data.distinguished}\n`;
      }
      if (data.edited) {
        const editedDate =
          typeof data.edited === 'number' ? new Date(data.edited * 1000).toISOString() : 'true';
        content += `edited: ${editedDate}\n`;
      }
      if (data.archived) {
        content += `archived: true\n`;
      }
      if (data.locked) {
        content += `locked: true\n`;
      }

      // Parent context and replies metadata
      if (data.parent_comments && data.parent_comments.length > 0) {
        content += `has_parent_context: true\n`;
        content += `parent_context_count: ${data.parent_comments.length}\n`;
      }
      if (data.child_comments && data.child_comments.length > 0) {
        content += `has_replies: true\n`;
        content += `reply_count: ${data.child_comments.length}\n`;
      }
    }

    content += `---\n\n`;

    if (isComment) {
      content += this.formatCommentHeader(data, contentOrigin);
    } else {
      content += await this.formatPostHeader(
        effectiveData,
        mediaInfo,
        contentOrigin,
        isCrosspost,
        data
      );
    }

    if (effectiveData.selftext || data.body) {
      content += this.convertRedditMarkdown(effectiveData.selftext || data.body || '');
    }

    // Add comments section if comments were exported
    if (!isComment && comments.length > 0) {
      content += this.formatCommentsSection(comments, data.author);
    }

    // Add replies section for comments with child comments
    if (isComment && data.child_comments && data.child_comments.length > 0) {
      content += this.formatReplies(data.child_comments, data.author);
    }

    // Add external links section if enabled
    if (this.settings.enableLinkPreservation && this.settings.extractExternalLinks) {
      const externalLinksSection = await this.formatExternalLinksSection(effectiveData);
      if (externalLinksSection) {
        content += externalLinksSection;
      }
    }

    content += this.formatFooter(effectiveData, isComment, contentOrigin);

    return content;
  }

  /**
   * Check if the item is a crosspost
   */
  private isCrosspost(data: RedditItemData): boolean {
    return !!(
      data.crosspost_parent &&
      data.crosspost_parent_list &&
      data.crosspost_parent_list.length > 0
    );
  }

  /**
   * Get the effective data to use (original post for crossposts if enabled)
   */
  private getEffectiveData(data: RedditItemData): RedditItemData {
    if (
      this.settings.importCrosspostOriginal &&
      data.crosspost_parent_list &&
      data.crosspost_parent_list.length > 0
    ) {
      return data.crosspost_parent_list[0];
    }
    return data;
  }

  private countTotalComments(comments: RedditComment[]): number {
    let count = comments.length;
    for (const comment of comments) {
      if (comment.replies) {
        count += this.countTotalComments(comment.replies);
      }
    }
    return count;
  }

  private formatCommentsSection(comments: RedditComment[], postAuthor: string): string {
    const totalComments = this.countTotalComments(comments);
    let content = `\n\n---\n\n## Comments (${totalComments})\n\n`;

    for (const comment of comments) {
      content += this.formatSingleComment(comment, postAuthor);
    }

    return content;
  }

  private formatSingleComment(
    comment: RedditComment,
    postAuthor: string,
    indent: number = 0
  ): string {
    const indentStr = '> '.repeat(indent);
    const isOP = comment.author === postAuthor;
    const opBadge = isOP ? ' [OP]' : '';
    const date = new Date(comment.created_utc * 1000).toLocaleDateString();

    let content = `${indentStr}**u/${comment.author}**${opBadge} · ${comment.score} points · ${date}\n`;
    content += `${indentStr}\n`;

    // Format comment body with proper indentation
    const bodyLines = this.convertRedditMarkdown(comment.body).split('\n');
    for (const line of bodyLines) {
      content += `${indentStr}${line}\n`;
    }
    content += '\n';

    // Format nested replies
    if (comment.replies && comment.replies.length > 0) {
      for (const reply of comment.replies) {
        content += this.formatSingleComment(reply, postAuthor, indent + 1);
      }
    }

    return content;
  }

  private async formatPostHeader(
    data: RedditItemData,
    mediaInfo: MediaInfo,
    contentOrigin: ContentOrigin = 'saved',
    isCrosspost: boolean = false,
    originalData?: RedditItemData
  ): Promise<string> {
    let content = '';

    // Build status badges array
    const badges: string[] = [];
    if (data.stickied) badges.push('📌 Stickied');
    if (data.locked) badges.push('🔒 Locked');
    if (data.archived) badges.push('📦 Archived');
    if (data.spoiler) badges.push('⚠️ Spoiler');
    if (data.over_18) badges.push('🔞 NSFW');
    if (data.total_awards_received && data.total_awards_received > 0) {
      badges.push(`🏆 ${data.total_awards_received} awards`);
    }

    // Build metadata line
    const originLabel = this.getOriginLabel(contentOrigin);
    const metadataParts = [
      `**r/${data.subreddit}**`,
      data.link_flair_text ? `\`${data.link_flair_text}\`` : null,
      `u/${data.author}`,
      `${data.score} points`,
      `${data.num_comments} comments`,
    ].filter(Boolean);

    // Format as info callout
    content += `> [!info] ${this.getOriginEmoji(contentOrigin)} ${originLabel}\n`;
    content += `> ${metadataParts.join(' · ')}\n`;
    if (badges.length > 0) {
      content += `> \n> ${badges.join(' · ')}\n`;
    }
    content += `\n`;

    // Crosspost notice
    if (isCrosspost && this.settings.preserveCrosspostMetadata && originalData) {
      const originalSubreddit =
        originalData.crosspost_parent_list?.[0]?.subreddit || originalData.subreddit;
      const originalAuthor = originalData.crosspost_parent_list?.[0]?.author || 'unknown';
      content += `> [!tip] Crosspost\n> Original: r/${originalSubreddit} by u/${originalAuthor}\n\n`;
    }

    // Title
    content += `# ${data.title}\n\n`;

    // Gallery handling (check first as galleries have special formatting)
    if (this.mediaHandler.isGalleryPost(data)) {
      content += await this.formatGalleryContent(data);
    }
    // Poll handling
    else if (this.mediaHandler.isPollPost(data)) {
      content += this.formatPollContent(data);
    }
    // Regular media handling
    else if (mediaInfo.isMedia) {
      content += await this.formatMediaContent(data, mediaInfo);
    } else if (data.url && !data.is_self) {
      content += `🔗 **External Link:** [${mediaInfo.domain}](${data.url})\n\n`;
    }

    return content;
  }

  /**
   * Get emoji for content origin
   */
  private getOriginEmoji(contentOrigin: ContentOrigin): string {
    switch (contentOrigin) {
      case 'upvoted':
        return '👍';
      case 'submitted':
        return '📝';
      case 'commented':
        return '💬';
      case 'saved':
      default:
        return '🔖';
    }
  }

  private formatCommentHeader(
    data: RedditItemData,
    contentOrigin: ContentOrigin = 'saved'
  ): string {
    let content = '';

    // Build metadata
    const originLabel = this.getOriginLabel(contentOrigin);
    const opBadge = data.is_submitter ? ' · OP' : '';
    const depthInfo =
      typeof data.depth === 'number' && data.depth > 0 ? ` · Depth ${data.depth}` : '';

    // Determine context type
    let contextNote = '';
    if (data.parent_id) {
      const parentType = RedditApiClient.getParentType(data.parent_id);
      contextNote = parentType === 'comment' ? 'Reply to comment' : 'Top-level comment';
    }

    // Format as quote callout
    content += `> [!quote] ${this.getOriginEmoji(contentOrigin)} ${originLabel}\n`;
    content += `> r/${data.subreddit} · u/${data.author}${opBadge} · ${data.score} points${depthInfo}\n`;
    if (contextNote) {
      content += `> \n> ${contextNote}\n`;
    }
    content += `\n`;

    content += `# Comment on: ${data.link_title || 'Unknown Post'}\n\n`;
    content += `[View original post →](https://reddit.com${data.link_permalink || ''})\n\n`;

    // Add parent context section if available
    if (data.parent_comments && data.parent_comments.length > 0) {
      content += this.formatParentContext(data.parent_comments);
      content += `## Your Comment\n\n`;
    }

    return content;
  }

  /**
   * Format parent comments as a collapsible context section
   */
  private formatParentContext(parentComments: RedditItemData[]): string {
    const plural = parentComments.length === 1 ? '' : 's';
    let content = `> [!note]- Parent Context (${parentComments.length} comment${plural})\n`;

    for (let i = 0; i < parentComments.length; i++) {
      const parent = parentComments[i];
      const date = new Date(parent.created_utc * 1000).toLocaleDateString();
      const indent = '> ' + '> '.repeat(i);

      // Build badges
      const badges: string[] = [];
      if (parent.is_submitter) badges.push('OP');
      if (parent.distinguished === 'moderator') badges.push('MOD');
      else if (parent.distinguished === 'admin') badges.push('ADMIN');
      const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

      // Author line
      content += `${indent}\n`;
      content += `${indent}**u/${parent.author}**${badgeStr} · ${parent.score} points · ${date}\n`;
      content += `${indent}\n`;

      // Body
      const bodyText = this.truncateText(parent.body || '', 500);
      const bodyLines = this.convertRedditMarkdown(bodyText).split('\n');
      for (const line of bodyLines) {
        content += `${indent}${line}\n`;
      }
    }

    content += `\n`;
    return content;
  }

  /**
   * Format reply comments section
   */
  private formatReplies(childComments: RedditItemData[], postAuthor: string): string {
    let content = `\n\n---\n\n## Replies (${childComments.length})\n\n`;

    for (const reply of childComments) {
      const date = new Date(reply.created_utc * 1000).toLocaleDateString();
      const indent = '> '.repeat(reply.depth || 0);

      // Build badges
      const badges: string[] = [];
      if (reply.author === postAuthor || reply.is_submitter) badges.push('OP');
      if (reply.distinguished === 'moderator') badges.push('MOD');
      else if (reply.distinguished === 'admin') badges.push('ADMIN');
      const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

      content += `${indent}**u/${reply.author}**${badgeStr} · ${reply.score} points · ${date}\n`;
      content += `${indent}\n`;

      // Format body
      const bodyLines = this.convertRedditMarkdown(reply.body || '').split('\n');
      for (const line of bodyLines) {
        content += `${indent}${line}\n`;
      }
      content += '\n';
    }

    return content;
  }

  /**
   * Truncate text to a maximum length with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  private async formatMediaContent(data: RedditItemData, mediaInfo: MediaInfo): Promise<string> {
    let content = '';
    const url = data.url!;

    // Download media if enabled
    let localPath: string | null = null;
    if (this.mediaHandler.shouldDownloadMedia(mediaInfo, url)) {
      try {
        const filename = this.mediaHandler.generateMediaFilename(data, url, mediaInfo);
        localPath = await this.mediaHandler.downloadMediaFile(url, filename);
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
          const filename = this.extractFilename(localPath);
          content += `![[${filename}]]\n\n`;
          content += `*Downloaded locally: ${filename}*\n\n`;
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
          const filename = this.extractFilename(localPath);
          content += `![[${filename}]]\n\n`;
          content += `*Downloaded locally: ${filename}*\n\n`;
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

      case 'youtube': {
        content += `🎬 **YouTube Video**\n\n`;
        content += `[▶️ Watch on YouTube](${url})\n\n`;
        // Try to extract video ID for embedding
        const youtubeId = this.mediaHandler.extractYouTubeId(url);
        if (youtubeId) {
          content += `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeId}" frameborder="0" allowfullscreen></iframe>\n\n`;
        }
        break;
      }

      case 'gif-platform':
        content += `🎞️ **GIF/Animation**\n\n`;
        if (localPath) {
          const filename = this.extractFilename(localPath);
          content += `![[${filename}]]\n\n`;
          content += `*Downloaded locally: ${filename}*\n\n`;
        } else {
          content += `[🎭 View Animation](${url})\n\n`;
        }
        break;

      default:
        content += `🔗 **Media Link:** [${mediaInfo.domain}](${url})\n\n`;
    }

    return content;
  }

  /**
   * Format content enrichment metadata for frontmatter
   * Includes awards, status flags, and engagement metrics
   */
  private formatEnrichmentMetadata(data: RedditItemData): string {
    let content = '';

    // Awards information (legacy but may still exist in data)
    if (data.total_awards_received && data.total_awards_received > 0) {
      content += `total_awards: ${data.total_awards_received}\n`;

      // List individual award types
      if (data.all_awardings && data.all_awardings.length > 0) {
        const awardNames = data.all_awardings.map(
          a => `${a.name}${a.count > 1 ? ` (${a.count})` : ''}`
        );
        content += `awards: [${awardNames.join(', ')}]\n`;
      }
    }

    // Gilded count (gold awards specifically)
    if (data.gilded && data.gilded > 0) {
      content += `gilded: ${data.gilded}\n`;
    }

    // Status flags
    if (data.stickied) {
      content += `stickied: true\n`;
    }
    if (data.spoiler) {
      content += `spoiler: true\n`;
    }
    if (data.archived) {
      content += `archived: true\n`;
    }
    if (data.locked) {
      content += `locked: true\n`;
    }
    if (data.over_18) {
      content += `nsfw: true\n`;
    }
    if (data.contest_mode) {
      content += `contest_mode: true\n`;
    }

    // Edit tracking
    if (data.edited) {
      const editedDate =
        typeof data.edited === 'number' ? new Date(data.edited * 1000).toISOString() : 'true';
      content += `edited: ${editedDate}\n`;
    }

    // Suggested sort if specified
    if (data.suggested_sort) {
      content += `suggested_sort: ${data.suggested_sort}\n`;
    }

    return content;
  }

  /**
   * Format Reddit gallery posts with multiple images
   */
  private async formatGalleryContent(data: RedditItemData): Promise<string> {
    const galleryImages = this.mediaHandler.extractGalleryImages(data);
    if (galleryImages.length === 0) {
      return `> [!warning] Gallery post with no accessible images\n\n`;
    }

    const plural = galleryImages.length === 1 ? '' : 's';
    let content = `> [!example] Gallery (${galleryImages.length} image${plural})\n\n`;

    // Download gallery images if enabled
    const shouldDownload =
      this.settings.downloadImages || this.settings.downloadGifs || this.settings.downloadVideos;

    let downloadedPaths: string[] = [];
    if (shouldDownload) {
      try {
        downloadedPaths = await this.mediaHandler.downloadGalleryImages(data);
      } catch (error) {
        console.error('Error downloading gallery images:', error);
      }
    }

    // Format each gallery image
    for (let i = 0; i < galleryImages.length; i++) {
      const image = galleryImages[i];
      const imageNumber = i + 1;

      // Check if we have a downloaded version
      const downloadedPath = downloadedPaths[i];

      // Image header with number
      content += `### ${imageNumber}/${galleryImages.length}`;
      if (image.caption) {
        content += `: ${image.caption}`;
      }
      content += `\n\n`;

      // Display the image
      if (downloadedPath) {
        const filename = this.extractFilename(downloadedPath);
        content += `![[${filename}]]\n\n`;

        // Metadata line
        const metadata: string[] = [];
        if (image.isAnimated) metadata.push('Animated');
        if (image.width && image.height) metadata.push(`${image.width}×${image.height}`);
        if (metadata.length > 0) {
          content += `*${metadata.join(' · ')}*\n\n`;
        }
      } else {
        // Use external URL
        if (image.isAnimated && image.mp4Url) {
          content += `[View animation →](${image.mp4Url})\n\n`;
        } else {
          content += `![Image ${imageNumber}](${image.url})\n\n`;
        }
        if (image.width && image.height) {
          content += `*${image.width}×${image.height}*\n\n`;
        }
      }

      // Add outbound link if present
      if (image.outboundUrl) {
        content += `[External link →](${image.outboundUrl})\n\n`;
      }
    }

    return content;
  }

  /**
   * Format Reddit poll content as a markdown table
   */
  private formatPollContent(data: RedditItemData): string {
    const pollData = data.poll_data!;

    // Poll status
    const isEnded = pollData.voting_end_timestamp
      ? Date.now() > pollData.voting_end_timestamp
      : false;

    const votedNote = pollData.user_selection ? ' · You voted' : '';

    let content = '';
    if (isEnded) {
      content += `> [!success] Poll (Ended)${votedNote}\n`;
      content += `> ${pollData.total_vote_count.toLocaleString()} total votes\n\n`;
    } else if (pollData.voting_end_timestamp) {
      const endDate = new Date(pollData.voting_end_timestamp).toLocaleString();
      content += `> [!info] Poll (Ends ${endDate})${votedNote}\n`;
      content += `> ${pollData.total_vote_count.toLocaleString()} total votes\n\n`;
    } else {
      content += `> [!info] Poll${votedNote}\n`;
      content += `> ${pollData.total_vote_count.toLocaleString()} total votes\n\n`;
    }

    // Options table
    content += `| Option | Votes | % |\n`;
    content += `|--------|-------:|----:|\n`;

    for (const option of pollData.options) {
      const voteCount = option.vote_count ?? 0;
      const percentage =
        pollData.total_vote_count > 0
          ? ((voteCount / pollData.total_vote_count) * 100).toFixed(1)
          : '0.0';

      // Add indicator for user's selection
      const isUserSelection = pollData.user_selection === option.id;
      const selectionMarker = isUserSelection ? ' ✓' : '';

      content += `| ${option.text}${selectionMarker} | ${voteCount.toLocaleString()} | ${percentage}% |\n`;
    }

    content += `\n`;

    // Visual bar chart representation
    if (pollData.total_vote_count > 0) {
      content += `### Results\n\n`;

      for (const option of pollData.options) {
        const voteCount = option.vote_count ?? 0;
        const percentage = (voteCount / pollData.total_vote_count) * 100;
        const barLength = Math.round(percentage / 5); // 20 chars = 100%
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);

        content += `**${option.text}**\n`;
        content += `\`${bar}\` ${percentage.toFixed(1)}%\n\n`;
      }
    }

    return content;
  }

  /**
   * Format external links section with optional Wayback Machine archive links
   */
  private async formatExternalLinksSection(data: RedditItemData): Promise<string | null> {
    const externalLinks = this.linkPreservation.extractExternalLinks(data);

    if (externalLinks.length === 0) {
      return null;
    }

    let content = `\n\n---\n\n> [!abstract]- External Links (${externalLinks.length})\n`;

    for (const link of externalLinks) {
      let archiveUrl: string | undefined;

      // Check Wayback archive if enabled
      if (this.settings.checkWaybackArchive) {
        try {
          const archiveResult = await this.linkPreservation.checkWaybackArchive(link.url);
          if (archiveResult.isArchived) {
            archiveUrl = archiveResult.archivedUrl;
          }
        } catch {
          // Silently fail archive checks
        }
      }

      // Format the link entry
      content += `> - [${link.domain}](${link.url}) *(${link.source})*\n`;

      if (this.settings.includeArchiveLinks) {
        if (archiveUrl) {
          content += `>   - [Archived version →](${archiveUrl})\n`;
        } else {
          // Provide a "save to archive" link
          const saveUrl = `https://web.archive.org/save/${link.url}`;
          content += `>   - [Save to archive →](${saveUrl})\n`;
        }
      }
    }

    content += '\n';
    return content;
  }

  private formatFooter(
    data: RedditItemData,
    isComment: boolean,
    contentOrigin: ContentOrigin = 'saved'
  ): string {
    let content = '\n\n---\n\n';

    // Tags for organization
    const tags = [`#reddit`, `#r-${data.subreddit.toLowerCase()}`];
    if (data.link_flair_text) {
      tags.push(`#${data.link_flair_text.toLowerCase().replace(/\s+/g, '-')}`);
    }

    // Add content origin tag
    tags.push(`#reddit-${contentOrigin}`);

    // Add type tag
    if (isComment) {
      tags.push('#reddit-comment');
    } else {
      tags.push('#reddit-post');
      // Add gallery/poll tags
      if (this.mediaHandler.isGalleryPost(data)) {
        tags.push('#reddit-gallery');
      }
      if (this.mediaHandler.isPollPost(data)) {
        tags.push('#reddit-poll');
      }
    }

    // Tags without prefix label
    content += `${tags.join(' ')}\n\n`;

    // Links on one line with arrow format and separator
    const links: string[] = [`[View on Reddit →](https://reddit.com${data.permalink})`];
    if (!isComment && data.url && !data.is_self) {
      links.push(`[Original source →](${data.url})`);
    }
    content += links.join(' · ');

    return content;
  }

  private extractFilename(filePath: string): string {
    // Extract just the filename from the full path
    const pathParts = filePath.split('/');
    return pathParts[pathParts.length - 1];
  }

  private convertRedditMarkdown(text: string): string {
    if (!text) return '';

    // Convert Reddit spoilers to Obsidian format (before HTML decoding)
    text = text.replace(/&gt;!([^!]+)!&lt;/g, '%%$1%%');

    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');

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

    // Better quote formatting - add space after >
    text = text.replace(/^>([^ ])/gm, '> $1');

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
}
