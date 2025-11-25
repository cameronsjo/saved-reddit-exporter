import { RedditItemData, MediaInfo, RedditSavedSettings } from './types';
import { MediaHandler } from './media-handler';
import { RedditApiClient } from './api-client';

export class ContentFormatter {
  private settings: RedditSavedSettings;
  private mediaHandler: MediaHandler;

  constructor(settings: RedditSavedSettings, mediaHandler: MediaHandler) {
    this.settings = settings;
    this.mediaHandler = mediaHandler;
  }

  async formatRedditContent(data: RedditItemData, isComment: boolean): Promise<string> {
    const created = new Date(data.created_utc * 1000).toISOString();
    const createdDate = new Date(data.created_utc * 1000).toLocaleDateString();
    const mediaInfo = this.mediaHandler.analyzeMedia(data);

    let content = `---\n`;
    content += `type: ${isComment ? 'reddit-comment' : 'reddit-post'}\n`;
    content += `subreddit: ${data.subreddit}\n`;
    content += `author: ${data.author}\n`;
    content += `created: ${created}\n`;
    content += `date: ${createdDate}\n`;
    content += `permalink: https://reddit.com${data.permalink}\n`;
    content += `id: ${data.id}\n`;
    content += `saved: true\n`;

    if (!isComment) {
      content += `title: "${data.title!.replace(/"/g, '\\"')}"\n`;
      content += `score: ${data.score}\n`;
      content += `num_comments: ${data.num_comments}\n`;
      content += `upvote_ratio: ${data.upvote_ratio || 'unknown'}\n`;

      if (data.link_flair_text) {
        content += `flair: "${data.link_flair_text.replace(/"/g, '\\"')}"\n`;
      }

      if (data.is_self) {
        content += `post_type: text\n`;
      } else if (data.url) {
        content += `post_type: ${mediaInfo.type}\n`;
        content += `url: ${data.url}\n`;
        if (mediaInfo.domain) {
          content += `domain: ${mediaInfo.domain}\n`;
        }
      }

      // Add media-specific metadata
      if (mediaInfo.isMedia) {
        content += `media_type: ${mediaInfo.mediaType}\n`;
        if (data.preview?.images?.[0]?.source?.url) {
          content += `thumbnail: ${data.preview.images[0].source.url.replace(/&amp;/g, '&')}\n`;
        }
      }
    } else {
      content += `post_title: "${(data.link_title || '').replace(/"/g, '\\"')}"\n`;
      content += `score: ${data.score}\n`;
      content += `is_submitter: ${data.is_submitter || false}\n`;

      // Add comment tree metadata
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
      if (data.edited && data.edited !== false) {
        const editedTime =
          typeof data.edited === 'number' ? new Date(data.edited * 1000).toISOString() : 'true';
        content += `edited: ${editedTime}\n`;
      }
      if (data.archived) {
        content += `archived: true\n`;
      }
      if (data.locked) {
        content += `locked: true\n`;
      }
      // Track context presence
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
      content += this.formatCommentHeader(data);

      // Add parent context if available
      if (data.parent_comments && data.parent_comments.length > 0) {
        content += this.formatParentContext(data.parent_comments);
      }
    } else {
      content += await this.formatPostHeader(data, mediaInfo);
    }

    if (data.selftext || data.body) {
      content += this.convertRedditMarkdown(data.selftext || data.body || '');
    }

    // Add replies section if available
    if (isComment && data.child_comments && data.child_comments.length > 0) {
      content += this.formatReplies(data.child_comments);
    }

    content += this.formatFooter(data, isComment);

    return content;
  }

  private async formatPostHeader(data: RedditItemData, mediaInfo: MediaInfo): Promise<string> {
    let content = '';

    // Subreddit badge
    content += `> **r/${data.subreddit}** `;
    if (data.link_flair_text) {
      content += `• \`${data.link_flair_text}\` `;
    }
    content += `• 👤 u/${data.author} `;
    content += `• ⬆️ ${data.score} `;
    content += `• 💬 ${data.num_comments}\n\n`;

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

  private formatCommentHeader(data: RedditItemData): string {
    let content = '';

    // Parent post context
    content += `> **r/${data.subreddit}** • 👤 u/${data.author} `;
    if (data.is_submitter) {
      content += `👑 **OP** `;
    }
    if (data.distinguished) {
      const badge = data.distinguished === 'moderator' ? '🛡️ **MOD**' : '⭐ **ADMIN**';
      content += `${badge} `;
    }
    content += `• ⬆️ ${data.score}`;
    if (typeof data.depth === 'number') {
      content += ` • 📊 Depth: ${data.depth}`;
    }
    content += `\n\n`;

    content += `# 💬 Comment on: ${data.link_title || 'Unknown Post'}\n\n`;
    content += `> 📝 [View original post](https://reddit.com${data.link_permalink || ''})\n\n`;

    // Show parent type indicator
    if (data.parent_id) {
      const parentType = RedditApiClient.getParentType(data.parent_id);
      if (parentType === 'comment') {
        content += `> ↩️ *This is a reply to another comment*\n\n`;
      } else {
        content += `> 💬 *This is a top-level comment on the post*\n\n`;
      }
    }

    return content;
  }

  /**
   * Format parent comment context as a quoted thread
   */
  private formatParentContext(parentComments: RedditItemData[]): string {
    if (!parentComments || parentComments.length === 0) {
      return '';
    }

    let content = '## 📜 Parent Context\n\n';
    content += '*The conversation leading to this comment:*\n\n';

    // Show parent comments in order (oldest first)
    for (let i = 0; i < parentComments.length; i++) {
      const parent = parentComments[i];
      const indent = '> '.repeat(i + 1);

      content += `${indent}**u/${parent.author}**`;
      if (parent.is_submitter) {
        content += ' 👑 OP';
      }
      if (parent.distinguished) {
        content += parent.distinguished === 'moderator' ? ' 🛡️ MOD' : ' ⭐ ADMIN';
      }
      content += ` • ⬆️ ${parent.score}\n`;

      // Add a truncated version of the comment body
      const body = this.truncateText(parent.body || '', 300);
      const bodyLines = body.split('\n');
      for (const line of bodyLines) {
        content += `${indent}${line}\n`;
      }
      content += '\n';
    }

    content += '---\n\n';
    content += '## 💬 Your Saved Comment\n\n';

    return content;
  }

  /**
   * Format replies to the comment
   */
  private formatReplies(childComments: RedditItemData[]): string {
    if (!childComments || childComments.length === 0) {
      return '';
    }

    let content = '\n\n---\n\n';
    content += `## 💬 Replies (${childComments.length})\n\n`;

    for (const reply of childComments) {
      const indent = '> '.repeat((reply.depth || 0) + 1);

      content += `${indent}**u/${reply.author}**`;
      if (reply.is_submitter) {
        content += ' 👑 OP';
      }
      if (reply.distinguished) {
        content += reply.distinguished === 'moderator' ? ' 🛡️ MOD' : ' ⭐ ADMIN';
      }
      content += ` • ⬆️ ${reply.score}\n`;

      // Add comment body
      const body = this.convertRedditMarkdown(reply.body || '');
      const bodyLines = body.split('\n');
      for (const line of bodyLines) {
        content += `${indent}${line}\n`;
      }
      content += '\n';
    }

    return content;
  }

  /**
   * Truncate text to a maximum length, adding ellipsis if truncated
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Find the last space before maxLength to avoid cutting words
    const truncateAt = text.lastIndexOf(' ', maxLength);
    const cutPoint = truncateAt > 0 ? truncateAt : maxLength;

    return text.substring(0, cutPoint) + '...';
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

  private formatFooter(data: RedditItemData, isComment: boolean): string {
    let content = '\n\n---\n\n';

    // Tags for organization
    const tags = [`#reddit`, `#r-${data.subreddit.toLowerCase()}`];
    if (data.link_flair_text) {
      tags.push(`#${data.link_flair_text.toLowerCase().replace(/\s+/g, '-')}`);
    }
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
