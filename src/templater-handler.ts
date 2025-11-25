import { App, TFile, normalizePath } from 'obsidian';
import { RedditSavedSettings, RedditItemData, MediaInfo, TemplaterContext } from './types';
import { TEMPLATER_PLUGIN_ID } from './constants';

// Type definitions for Templater plugin API
interface TemplaterPlugin {
  templater: {
    overwrite_file_commands: (file: TFile, active_file?: TFile) => Promise<void>;
    current_functions_object?: TemplaterContext;
  };
}

export class TemplaterHandler {
  private app: App;
  private settings: RedditSavedSettings;

  constructor(app: App, settings: RedditSavedSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Check if Templater plugin is installed and enabled
   */
  isTemplaterAvailable(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = (this.app as any).plugins;
    return !!plugins?.plugins?.[TEMPLATER_PLUGIN_ID]?.settings?.templates_folder;
  }

  /**
   * Get the Templater plugin instance
   */
  private getTemplaterPlugin(): TemplaterPlugin | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = (this.app as any).plugins;
    return plugins?.plugins?.[TEMPLATER_PLUGIN_ID] || null;
  }

  /**
   * Check if Templater should be used for this import
   */
  shouldUseTemplater(isComment: boolean): boolean {
    if (!this.settings.useTemplater || !this.isTemplaterAvailable()) {
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
   * Build the context object that will be available in templates
   */
  buildContext(
    data: RedditItemData,
    isComment: boolean,
    mediaInfo?: MediaInfo,
    localMediaPath?: string | null
  ): TemplaterContext {
    const created = new Date(data.created_utc * 1000).toISOString();
    const createdDate = new Date(data.created_utc * 1000).toLocaleDateString();

    // Build tags array
    const tags = [`#reddit`, `#r-${data.subreddit.toLowerCase()}`];
    if (data.link_flair_text) {
      tags.push(`#${data.link_flair_text.toLowerCase().replace(/\s+/g, '-')}`);
    }
    tags.push(isComment ? '#reddit-comment' : '#reddit-post');

    return {
      item: data,
      isComment,
      created,
      createdDate,
      type: isComment ? 'reddit-comment' : 'reddit-post',
      permalink: `https://reddit.com${data.permalink}`,
      mediaInfo,
      localMediaPath,
      subredditUrl: `https://reddit.com/r/${data.subreddit}`,
      authorUrl: `https://reddit.com/u/${data.author}`,
      tags,
    };
  }

  /**
   * Read and process a template file, replacing Reddit variables
   */
  async processTemplate(context: TemplaterContext): Promise<string | null> {
    const templatePath = this.getTemplatePath(context.isComment);
    if (!templatePath) {
      return null;
    }

    const normalizedPath = normalizePath(templatePath);
    const templateFile = this.app.vault.getAbstractFileByPath(normalizedPath);

    // Check if file exists and has a path property (indicating it's a file, not a folder)
    if (!templateFile || !('path' in templateFile)) {
      console.warn(`Template file not found: ${normalizedPath}`);
      return null;
    }

    try {
      const templateContent = await this.app.vault.read(templateFile as TFile);
      return this.replaceVariables(templateContent, context);
    } catch (error) {
      console.error('Error reading template file:', error);
      return null;
    }
  }

  /**
   * Replace Reddit-specific variables in template content
   * Variables use the format: {{reddit.variableName}}
   */
  private replaceVariables(content: string, context: TemplaterContext): string {
    const { item, isComment } = context;

    // Map of all available variables
    const variables: Record<string, string> = {
      // Core fields
      'reddit.id': item.id,
      'reddit.name': item.name,
      'reddit.author': item.author,
      'reddit.subreddit': item.subreddit,
      'reddit.permalink': context.permalink,
      'reddit.score': String(item.score),
      'reddit.created': context.created,
      'reddit.createdDate': context.createdDate,
      'reddit.type': context.type,

      // URLs
      'reddit.subredditUrl': context.subredditUrl,
      'reddit.authorUrl': context.authorUrl,

      // Post-specific fields
      'reddit.title': item.title || '',
      'reddit.selftext': item.selftext || '',
      'reddit.url': item.url || '',
      'reddit.domain': item.domain || '',
      'reddit.numComments': String(item.num_comments || 0),
      'reddit.upvoteRatio': String(item.upvote_ratio || 0),
      'reddit.flair': item.link_flair_text || '',
      'reddit.isSelf': String(item.is_self || false),

      // Comment-specific fields
      'reddit.body': item.body || '',
      'reddit.linkTitle': item.link_title || '',
      'reddit.linkPermalink': item.link_permalink ? `https://reddit.com${item.link_permalink}` : '',
      'reddit.isSubmitter': String(item.is_submitter || false),

      // Computed fields
      'reddit.isComment': String(isComment),
      'reddit.isPost': String(!isComment),
      'reddit.tags': context.tags.join(' '),

      // Media fields
      'reddit.hasMedia': String(!!context.mediaInfo?.isMedia),
      'reddit.mediaType': context.mediaInfo?.mediaType || '',
      'reddit.localMediaPath': context.localMediaPath || '',

      // Preview/thumbnail
      'reddit.thumbnail': item.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || '',
      'reddit.thumbnailWidth': String(item.preview?.images?.[0]?.source?.width || 0),
      'reddit.thumbnailHeight': String(item.preview?.images?.[0]?.source?.height || 0),
    };

    // Replace all variables in content
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      // Replace {{variable}} format
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Process a file with Templater after creation
   * This allows Templater syntax (like <% %>) to work alongside Reddit variables
   */
  async runTemplaterOnFile(file: TFile): Promise<void> {
    const templaterPlugin = this.getTemplaterPlugin();
    if (!templaterPlugin) {
      return;
    }

    try {
      await templaterPlugin.templater.overwrite_file_commands(file);
    } catch (error) {
      console.error('Error running Templater on file:', error);
    }
  }

  /**
   * Validate that template files exist
   */
  validateTemplates(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.settings.useTemplater) {
      if (!this.isTemplaterAvailable()) {
        errors.push('Templater plugin is not installed or enabled');
      }

      if (this.settings.postTemplatePath) {
        const postTemplate = this.app.vault.getAbstractFileByPath(
          normalizePath(this.settings.postTemplatePath)
        );
        if (!postTemplate) {
          errors.push(`Post template not found: ${this.settings.postTemplatePath}`);
        }
      }

      if (this.settings.commentTemplatePath) {
        const commentTemplate = this.app.vault.getAbstractFileByPath(
          normalizePath(this.settings.commentTemplatePath)
        );
        if (!commentTemplate) {
          errors.push(`Comment template not found: ${this.settings.commentTemplatePath}`);
        }
      }

      if (!this.settings.postTemplatePath && !this.settings.commentTemplatePath) {
        errors.push('No template paths configured');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
