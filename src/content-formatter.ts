import { RedditItemData, MediaInfo, RedditSavedSettings, ContentOrigin } from './types';
import { MediaHandler } from './media-handler';
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

  constructor(settings: RedditSavedSettings, mediaHandler: MediaHandler) {
    this.settings = settings;
    this.mediaHandler = mediaHandler;
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
    contentOrigin: ContentOrigin = 'saved'
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
    } else {
      content += `post_title: "${(data.link_title || '').replace(/"/g, '\\"')}"\n`;
      content += `score: ${data.score}\n`;
      content += `is_submitter: ${data.is_submitter || false}\n`;
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

  private async formatPostHeader(
    data: RedditItemData,
    mediaInfo: MediaInfo,
    contentOrigin: ContentOrigin = 'saved',
    isCrosspost: boolean = false,
    originalData?: RedditItemData
  ): Promise<string> {
    let content = '';

    // Origin badge
    const originLabel = this.getOriginLabel(contentOrigin);
    content += `> ${this.getOriginEmoji(contentOrigin)} **${originLabel}** • `;

    // Subreddit badge
    content += `**r/${data.subreddit}** `;
    if (data.link_flair_text) {
      content += `• \`${data.link_flair_text}\` `;
    }
    content += `• 👤 u/${data.author} `;
    content += `• ⬆️ ${data.score} `;
    content += `• 💬 ${data.num_comments}\n\n`;

    // Crosspost notice
    if (isCrosspost && this.settings.preserveCrosspostMetadata && originalData) {
      content += `> 🔄 **Crosspost** from r/${originalData.subreddit} by u/${originalData.crosspost_parent_list?.[0]?.author || 'unknown'}\n\n`;
    }

    // Title
    content += `# ${data.title}\n\n`;

    // Media handling
    if (mediaInfo.isMedia) {
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

    // Origin badge
    const originLabel = this.getOriginLabel(contentOrigin);
    content += `> ${this.getOriginEmoji(contentOrigin)} **${originLabel}** • `;

    // Parent post context
    content += `**r/${data.subreddit}** • 👤 u/${data.author} `;
    if (data.is_submitter) {
      content += `👑 **OP** `;
    }
    content += `• ⬆️ ${data.score}\n\n`;

    content += `# 💬 Comment on: ${data.link_title || 'Unknown Post'}\n\n`;
    content += `> 📝 [View original post](https://reddit.com${data.link_permalink || ''})\n\n`;

    return content;
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
    }

    content += `**Tags:** ${tags.join(' ')}\n\n`;
    content += `🔗 [View on Reddit](https://reddit.com${data.permalink})\n`;

    if (!isComment && data.url && !data.is_self) {
      content += `🌐 [Original Source](${data.url})`;
    }

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
