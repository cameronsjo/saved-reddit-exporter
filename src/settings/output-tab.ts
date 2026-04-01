import { Setting } from 'obsidian';
import { RedditSavedSettings } from '../types';
import { COMMENT_CONTEXT_MAX, COMMENT_MAX_DEPTH } from '../constants';
import { createCollapsibleSection } from './collapsible-section';

interface OutputTabContext {
  settings: RedditSavedSettings;
  saveSettings: () => Promise<void>;
  expandedSections: Set<string>;
  redisplay: () => void;
}

export function renderOutputTab(containerEl: HTMLElement, ctx: OutputTabContext): void {
  const { settings, saveSettings, expandedSections, redisplay } = ctx;

  // Organization
  new Setting(containerEl).setName('Organization').setHeading();

  new Setting(containerEl)
    .setName('Organize by subreddit')
    .setDesc('Create subfolders for each subreddit')
    .addToggle(toggle =>
      toggle.setValue(settings.organizeBySubreddit).onChange(async value => {
        settings.organizeBySubreddit = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Folder template')
    .setDesc('Custom folder structure using template variables')
    .addText(text =>
      text
        .setPlaceholder('{subreddit}/{year}')
        .setValue(settings.folderTemplate)
        .onChange(async value => {
          settings.folderTemplate = value;
          await saveSettings();
        })
    );

  new Setting(containerEl)
    .setName('Filename template')
    .setDesc('Custom filename format using template variables')
    .addText(text =>
      text
        .setPlaceholder('{title}')
        .setValue(settings.filenameTemplate)
        .onChange(async value => {
          settings.filenameTemplate = value;
          await saveSettings();
        })
    );

  const templateInfo = containerEl.createDiv({ cls: 'settings-info-box compact' });
  templateInfo.createEl('strong', { text: 'Variables: ' });
  templateInfo.createEl('code', {
    text: '{subreddit} {author} {type} {year} {month} {day} {title} {id} {score}',
  });

  // Comments — unified section (previously split across Import and Advanced tabs)
  const commentsContent = createCollapsibleSection(
    containerEl, expandedSections, 'output-comments', 'Comments', true,
  );

  const commentInfo = commentsContent.createDiv({ cls: 'settings-info-box compact' });
  commentInfo.createSpan({
    text: 'Configure how comments appear in exported files. Post comments are appended below the main content.',
  });

  new Setting(commentsContent)
    .setName('Export post comments')
    .setDesc('Include top comments when exporting posts')
    .addToggle(toggle =>
      toggle.setValue(settings.exportPostComments).onChange(async value => {
        settings.exportPostComments = value;
        await saveSettings();
        redisplay();
      })
    );

  if (settings.exportPostComments) {
    new Setting(commentsContent)
      .setName('Comment sort order')
      .setDesc('How comments are sorted when fetching from Reddit')
      .addDropdown(dropdown =>
        dropdown
          .addOption('top', 'Top')
          .addOption('best', 'Best')
          .addOption('new', 'New')
          .addOption('controversial', 'Controversial')
          .addOption('old', 'Old')
          .addOption('qa', 'Q&A')
          .setValue(settings.commentSortOrder)
          .onChange(async value => {
            settings.commentSortOrder = value as 'top' | 'best' | 'new' | 'controversial' | 'old' | 'qa';
            await saveSettings();
          })
      );

    new Setting(commentsContent)
      .setName('Comment upvote threshold')
      .setDesc('Minimum upvotes to include a comment (0 = all)')
      .addText(text =>
        text
          .setPlaceholder('0')
          .setValue(String(settings.commentUpvoteThreshold))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              settings.commentUpvoteThreshold = num;
            } else {
              text.setValue(String(settings.commentUpvoteThreshold));
            }
            await saveSettings();
          })
      );

    new Setting(commentsContent)
      .setName('Max comments per post')
      .setDesc('Maximum number of comments to export (0 = unlimited)')
      .addText(text =>
        text
          .setPlaceholder('100')
          .setValue(String(settings.maxCommentsPerPost))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              settings.maxCommentsPerPost = num;
            } else {
              text.setValue(String(settings.maxCommentsPerPost));
            }
            await saveSettings();
          })
      );

    new Setting(commentsContent)
      .setName('Max comment depth')
      .setDesc('Maximum nesting depth for comment threads')
      .addSlider(slider =>
        slider
          .setLimits(1, 10, 1)
          .setValue(settings.maxCommentDepth)
          .setDynamicTooltip()
          .onChange(async value => {
            settings.maxCommentDepth = value;
            await saveSettings();
          })
      );
  }

  // Comment context (previously in Advanced tab)
  const contextContent = createCollapsibleSection(
    containerEl, expandedSections, 'output-comment-context', 'Comment context',
  );

  const contextInfo = contextContent.createDiv({ cls: 'settings-info-box compact' });
  contextInfo.createSpan({
    text: 'When you save a reply, fetch the comments above it so you can read the full conversation. Requires additional API calls per item.',
  });

  new Setting(contextContent)
    .setName('Fetch parent context')
    .setDesc('Include parent comments above saved replies')
    .addToggle(toggle =>
      toggle.setValue(settings.fetchCommentContext).onChange(async value => {
        settings.fetchCommentContext = value;
        await saveSettings();
        redisplay();
      })
    );

  if (settings.fetchCommentContext) {
    new Setting(contextContent)
      .setName('Context depth')
      .setDesc(`How many levels of parent comments to fetch (1\u2013${COMMENT_CONTEXT_MAX})`)
      .addSlider(slider =>
        slider
          .setLimits(1, COMMENT_CONTEXT_MAX, 1)
          .setValue(settings.commentContextDepth)
          .setDynamicTooltip()
          .onChange(async value => {
            settings.commentContextDepth = value;
            await saveSettings();
          })
      );
  }

  new Setting(contextContent)
    .setName('Include replies')
    .setDesc('Fetch child replies below the saved comment')
    .addToggle(toggle =>
      toggle.setValue(settings.includeCommentReplies).onChange(async value => {
        settings.includeCommentReplies = value;
        await saveSettings();
        redisplay();
      })
    );

  if (settings.includeCommentReplies) {
    new Setting(contextContent)
      .setName('Reply depth')
      .setDesc(`How many levels of replies to include (1\u2013${COMMENT_MAX_DEPTH})`)
      .addSlider(slider =>
        slider
          .setLimits(1, COMMENT_MAX_DEPTH, 1)
          .setValue(settings.commentReplyDepth)
          .setDynamicTooltip()
          .onChange(async value => {
            settings.commentReplyDepth = value;
            await saveSettings();
          })
      );
  }

  // Templates
  const templatesContent = createCollapsibleSection(
    containerEl, expandedSections, 'output-templates', 'Templater integration',
  );

  new Setting(templatesContent)
    .setName('Use Templater')
    .setDesc('Process output through Templater templates for custom formatting')
    .addToggle(toggle =>
      toggle.setValue(settings.useTemplater).onChange(async value => {
        settings.useTemplater = value;
        await saveSettings();
        redisplay();
      })
    );

  if (settings.useTemplater) {
    new Setting(templatesContent)
      .setName('Post template path')
      .setDesc('Path to the Templater template for posts')
      .addText(text =>
        text
          .setPlaceholder('templates/reddit-post.md')
          .setValue(settings.postTemplatePath)
          .onChange(async value => {
            settings.postTemplatePath = value;
            await saveSettings();
          })
      );

    new Setting(templatesContent)
      .setName('Comment template path')
      .setDesc('Path to the Templater template for comments')
      .addText(text =>
        text
          .setPlaceholder('templates/reddit-comment.md')
          .setValue(settings.commentTemplatePath)
          .onChange(async value => {
            settings.commentTemplatePath = value;
            await saveSettings();
          })
      );
  }

  // Media downloads
  const mediaContent = createCollapsibleSection(
    containerEl, expandedSections, 'output-media', 'Media downloads',
  );

  new Setting(mediaContent)
    .setName('Media folder')
    .setDesc('Where to save downloaded images, GIFs, and videos')
    .addText(text =>
      text
        .setPlaceholder('Attachments')
        .setValue(settings.mediaFolder)
        .onChange(async value => {
          settings.mediaFolder = value || 'Attachments';
          await saveSettings();
        })
    );

  new Setting(mediaContent)
    .setName('Download images')
    .addToggle(toggle =>
      toggle.setValue(settings.downloadImages).onChange(async value => {
        settings.downloadImages = value;
        await saveSettings();
      })
    );

  new Setting(mediaContent)
    .setName('Download GIFs')
    .addToggle(toggle =>
      toggle.setValue(settings.downloadGifs).onChange(async value => {
        settings.downloadGifs = value;
        await saveSettings();
      })
    );

  new Setting(mediaContent)
    .setName('Download videos')
    .addToggle(toggle =>
      toggle.setValue(settings.downloadVideos).onChange(async value => {
        settings.downloadVideos = value;
        await saveSettings();
      })
    );

  // Obsidian integration
  const obsidianContent = createCollapsibleSection(
    containerEl, expandedSections, 'output-obsidian', 'Obsidian integration',
  );

  const obsidianInfo = obsidianContent.createDiv({ cls: 'settings-info-box compact' });
  obsidianInfo.createSpan({
    text: 'Enhance graph view, Dataview queries, and custom styling with Reddit metadata.',
  });

  new Setting(obsidianContent)
    .setName('Linkify subreddits')
    .setDesc('Turn subreddit names into [[r/subreddit]] links for graph view')
    .addToggle(toggle =>
      toggle.setValue(settings.linkifySubreddits).onChange(async value => {
        settings.linkifySubreddits = value;
        await saveSettings();
      })
    );

  new Setting(obsidianContent)
    .setName('Linkify authors')
    .setDesc('Turn author names into [[u/author]] links for graph view')
    .addToggle(toggle =>
      toggle.setValue(settings.linkifyAuthors).onChange(async value => {
        settings.linkifyAuthors = value;
        await saveSettings();
      })
    );

  new Setting(obsidianContent)
    .setName('Add CSS class')
    .setDesc('Add cssclass to frontmatter for custom snippet styling')
    .addToggle(toggle =>
      toggle.setValue(settings.addCssClass).onChange(async value => {
        settings.addCssClass = value;
        await saveSettings();
      })
    );

  new Setting(obsidianContent)
    .setName('Tags in frontmatter')
    .setDesc('Include tags array in YAML frontmatter (Dataview-compatible)')
    .addToggle(toggle =>
      toggle.setValue(settings.tagsInFrontmatter).onChange(async value => {
        settings.tagsInFrontmatter = value;
        await saveSettings();
      })
    );

  new Setting(obsidianContent)
    .setName('Generate MOC')
    .setDesc('Create a Map of Content index per subreddit after import')
    .addToggle(toggle =>
      toggle.setValue(settings.generateMOC).onChange(async value => {
        settings.generateMOC = value;
        await saveSettings();
      })
    );
}
