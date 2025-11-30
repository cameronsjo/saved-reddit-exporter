import { App, TFile } from 'obsidian';
import { RedditSavedSettings, RedditItemData, MediaInfo, TemplaterContext } from './types';
import {
  REDDIT_BASE_URL,
  FRONTMATTER_TYPE_POST,
  FRONTMATTER_TYPE_COMMENT,
  REDDIT_ITEM_TYPE_COMMENT,
} from './constants';
import { RedditApiClient } from './api-client';

/**
 * Handles Templater plugin integration for custom template processing
 */
export class TemplaterHandler {
  private app: App;
  private settings: RedditSavedSettings;

  constructor(app: App, settings: RedditSavedSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Check if the Templater plugin is available and properly configured
   */
  isTemplaterAvailable(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templaterPlugin = (this.app as any).plugins?.plugins?.['templater-obsidian'];
    if (!templaterPlugin) {
      return false;
    }

    // Check if Templater has a templates folder configured
    const templatesFolder = templaterPlugin.settings?.templates_folder;
    return !!templatesFolder;
  }

  /**
   * Determine if we should use Templater for this content type
   */
  shouldUseTemplater(isComment: boolean): boolean {
    if (!this.settings.useTemplater) {
      return false;
    }

    if (!this.isTemplaterAvailable()) {
      return false;
    }

    const templatePath = isComment
      ? this.settings.commentTemplatePath
      : this.settings.postTemplatePath;

    return !!templatePath;
  }

  /**
   * Get the template path for the given content type
   */
  getTemplatePath(isComment: boolean): string {
    return isComment ? this.settings.commentTemplatePath : this.settings.postTemplatePath;
  }

  /**
   * Build the context object for template variable substitution
   */
  buildContext(
    item: RedditItemData,
    isComment: boolean,
    mediaInfo?: MediaInfo,
    localMediaPath?: string
  ): TemplaterContext {
    const created = new Date(item.created_utc * 1000);
    const tags = this.buildTags(item, isComment);

    // Determine parent type for comments
    let parentType: string | undefined;
    if (isComment && item.parent_id) {
      parentType = RedditApiClient.getParentType(item.parent_id);
    }

    return {
      item,
      isComment,
      type: isComment ? FRONTMATTER_TYPE_COMMENT : FRONTMATTER_TYPE_POST,
      permalink: `${REDDIT_BASE_URL}${item.permalink}`,
      subredditUrl: `${REDDIT_BASE_URL}/r/${item.subreddit}`,
      authorUrl: `${REDDIT_BASE_URL}/u/${item.author}`,
      created: created.toISOString(),
      createdDate: created.toLocaleDateString(),
      tags,
      mediaInfo,
      localMediaPath,
      // Comment tree context
      parentType,
      depth: item.depth,
      parentComments: item.parent_comments,
      childComments: item.child_comments,
      hasParentContext: !!(item.parent_comments && item.parent_comments.length > 0),
      hasReplies: !!(item.child_comments && item.child_comments.length > 0),
    };
  }

  /**
   * Build tags array for the context
   */
  private buildTags(item: RedditItemData, isComment: boolean): string[] {
    const tags: string[] = ['#reddit', `#r-${item.subreddit}`];

    if (isComment) {
      tags.push('#reddit-comment');
    } else {
      tags.push('#reddit-post');
    }

    // Add flair as tag if present
    if (item.link_flair_text) {
      const flairTag = item.link_flair_text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (flairTag) {
        tags.push(`#${flairTag}`);
      }
    }

    return tags;
  }

  /**
   * Process a template file with the given context
   * Returns the processed content or null if processing failed
   */
  async processTemplate(context: TemplaterContext): Promise<string | null> {
    const templatePath = this.getTemplatePath(context.isComment);
    if (!templatePath) {
      return null;
    }

    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!templateFile || !('path' in templateFile)) {
      console.error(`Template file not found: ${templatePath}`);
      return null;
    }

    try {
      // Read the template content
      const templateContent = await this.app.vault.read(templateFile as TFile);

      // Replace our custom variables
      return this.replaceVariables(templateContent, context);
    } catch (error) {
      console.error('Error processing template:', error);
      return null;
    }
  }

  /**
   * Replace {{reddit.variable}} placeholders with actual values
   */
  private replaceVariables(content: string, context: TemplaterContext): string {
    const item = context.item;

    const replacements: Record<string, string> = {
      'reddit.id': item.id,
      'reddit.name': item.name,
      'reddit.title': item.title || '',
      'reddit.author': item.author,
      'reddit.subreddit': item.subreddit,
      'reddit.permalink': context.permalink,
      'reddit.score': String(item.score),
      'reddit.created': context.created,
      'reddit.createdDate': context.createdDate,
      'reddit.type': context.type,
      'reddit.url': item.url || '',
      'reddit.domain': item.domain || '',
      'reddit.selftext': item.selftext || '',
      'reddit.body': item.body || '',
      'reddit.numComments': String(item.num_comments ?? 0),
      'reddit.upvoteRatio': String(item.upvote_ratio ?? 0),
      'reddit.flair': item.link_flair_text || '',
      'reddit.linkTitle': item.link_title || '',
      'reddit.linkPermalink': item.link_permalink ? `${REDDIT_BASE_URL}${item.link_permalink}` : '',
      'reddit.isSubmitter': String(item.is_submitter ?? false),
      'reddit.subredditUrl': context.subredditUrl,
      'reddit.authorUrl': context.authorUrl,
      'reddit.tags': context.tags.join(' '),
      'reddit.isComment': String(context.isComment),
      // Comment tree variables
      'reddit.parentId': item.parent_id || '',
      'reddit.linkId': item.link_id || '',
      'reddit.depth': String(item.depth ?? 0),
      'reddit.parentType': context.parentType || '',
      'reddit.hasParentContext': String(context.hasParentContext ?? false),
      'reddit.hasReplies': String(context.hasReplies ?? false),
      'reddit.parentContextCount': String(context.parentComments?.length ?? 0),
      'reddit.replyCount': String(context.childComments?.length ?? 0),
    };

    // Add media info if available
    if (context.mediaInfo) {
      replacements['reddit.mediaType'] = context.mediaInfo.type;
      replacements['reddit.mediaKind'] = context.mediaInfo.mediaType || '';
      replacements['reddit.isMedia'] = String(context.mediaInfo.isMedia);
      replacements['reddit.canEmbed'] = String(context.mediaInfo.canEmbed);
    }

    if (context.localMediaPath) {
      replacements['reddit.localMediaPath'] = context.localMediaPath;
    }

    // Replace all {{reddit.variable}} patterns
    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(pattern, value);
    }

    return result;
  }

  /**
   * Validate that configured templates exist
   */
  validateTemplates(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.settings.useTemplater) {
      return { valid: true, errors: [] };
    }

    if (!this.isTemplaterAvailable()) {
      errors.push('Templater plugin is not installed or enabled');
      return { valid: false, errors };
    }

    const hasPostTemplate = !!this.settings.postTemplatePath;
    const hasCommentTemplate = !!this.settings.commentTemplatePath;

    if (!hasPostTemplate && !hasCommentTemplate) {
      errors.push('No template paths configured');
      return { valid: false, errors };
    }

    if (hasPostTemplate) {
      const postTemplate = this.app.vault.getAbstractFileByPath(this.settings.postTemplatePath);
      if (!postTemplate) {
        errors.push(`Post template not found: ${this.settings.postTemplatePath}`);
      }
    }

    if (hasCommentTemplate) {
      const commentTemplate = this.app.vault.getAbstractFileByPath(
        this.settings.commentTemplatePath
      );
      if (!commentTemplate) {
        errors.push(`Comment template not found: ${this.settings.commentTemplatePath}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Run Templater's processing on a file after creation
   * This allows Templater's <% %> syntax to be evaluated
   */
  async runTemplaterOnFile(file: TFile): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templaterPlugin = (this.app as any).plugins?.plugins?.['templater-obsidian'];
      if (!templaterPlugin?.templater?.overwrite_file_commands) {
        return;
      }

      await templaterPlugin.templater.overwrite_file_commands(file);
    } catch (error) {
      console.error('Error running Templater on file:', error);
    }
  }
}
