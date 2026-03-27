import { Notice, Setting } from 'obsidian';
import { DateRangePreset, FilterMode, PostType, RedditSavedSettings } from '../types';
import { DEFAULT_FILTER_SETTINGS } from '../constants';
import { FILTER_PRESETS } from '../filters';
import { createCollapsibleSection } from './collapsible-section';

interface FiltersTabContext {
  settings: RedditSavedSettings;
  saveSettings: () => Promise<void>;
  expandedSections: Set<string>;
  redisplay: () => void;
}

export function renderFiltersTab(containerEl: HTMLElement, ctx: FiltersTabContext): void {
  const { settings, saveSettings, expandedSections, redisplay } = ctx;

  // Ensure filterSettings exists
  if (!settings.filterSettings) {
    settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
  }

  const filters = settings.filterSettings;

  // Quick presets
  new Setting(containerEl).setName('Quick presets').setHeading();

  const presetContainer = containerEl.createDiv({ cls: 'settings-preset-row' });
  for (const [, preset] of Object.entries(FILTER_PRESETS)) {
    const btn = presetContainer.createEl('button', {
      text: preset.name,
      cls: 'settings-preset-btn',
    });
    btn.title = preset.description;
    btn.addEventListener('click', async () => {
      Object.assign(settings.filterSettings, preset.settings);
      await saveSettings();
      redisplay();
      new Notice(`Applied: ${preset.name}`);
    });
  }

  // Enable filtering
  new Setting(containerEl).setName('Basic filters').setHeading();

  new Setting(containerEl)
    .setName('Enable filtering')
    .setDesc('Only import items matching filter criteria')
    .addToggle(toggle =>
      toggle.setValue(filters.enabled).onChange(async value => {
        filters.enabled = value;
        await saveSettings();
        redisplay();
      })
    );

  if (!filters.enabled) {
    const infoDiv = containerEl.createDiv({ cls: 'settings-info-box' });
    infoDiv.createSpan({ text: 'Enable filtering above to configure filters.' });
    return;
  }

  // Date range
  new Setting(containerEl)
    .setName('Date range')
    .setDesc('Import posts from a specific time period')
    .addDropdown(dropdown =>
      dropdown
        .addOption('all', 'All time')
        .addOption('last_day', 'Last 24 hours')
        .addOption('last_week', 'Last week')
        .addOption('last_month', 'Last month')
        .addOption('last_year', 'Last year')
        .addOption('custom', 'Custom range')
        .setValue(filters.dateRangePreset)
        .onChange(async (value: DateRangePreset) => {
          filters.dateRangePreset = value;
          await saveSettings();
          redisplay();
        })
    );

  if (filters.dateRangePreset === 'custom') {
    new Setting(containerEl).setName('Start date').addText(text =>
      text
        .setPlaceholder('YYYY-MM-DD')
        .setValue(
          filters.dateRangeStart
            ? new Date(filters.dateRangeStart).toISOString().split('T')[0]
            : ''
        )
        .onChange(async value => {
          const date = new Date(value);
          filters.dateRangeStart = !isNaN(date.getTime()) ? date.getTime() : null;
          await saveSettings();
        })
    );

    new Setting(containerEl).setName('End date').addText(text =>
      text
        .setPlaceholder('YYYY-MM-DD')
        .setValue(
          filters.dateRangeEnd ? new Date(filters.dateRangeEnd).toISOString().split('T')[0] : ''
        )
        .onChange(async value => {
          const date = new Date(value);
          filters.dateRangeEnd = !isNaN(date.getTime()) ? date.getTime() : null;
          await saveSettings();
        })
    );
  }

  // Post types
  const postTypes: Array<{ type: PostType; label: string }> = [
    { type: 'text', label: 'Text' },
    { type: 'link', label: 'Links' },
    { type: 'image', label: 'Images' },
    { type: 'video', label: 'Videos' },
  ];

  const postTypeContainer = containerEl.createDiv({ cls: 'settings-checkbox-row' });
  postTypeContainer.createSpan({ text: 'Post types: ', cls: 'settings-checkbox-label' });

  for (const { type, label } of postTypes) {
    const checkbox = postTypeContainer.createEl('label', { cls: 'settings-checkbox' });
    const input = checkbox.createEl('input', { type: 'checkbox' });
    input.checked = filters.includePostTypes.includes(type);
    input.addEventListener('change', async () => {
      if (input.checked) {
        if (!filters.includePostTypes.includes(type)) {
          filters.includePostTypes.push(type);
        }
      } else {
        filters.includePostTypes = filters.includePostTypes.filter(t => t !== type);
      }
      await saveSettings();
    });
    checkbox.createSpan({ text: label });
  }

  new Setting(containerEl).setName('Include posts').addToggle(toggle =>
    toggle.setValue(filters.includePosts).onChange(async value => {
      filters.includePosts = value;
      await saveSettings();
    })
  );

  new Setting(containerEl).setName('Include comments').addToggle(toggle =>
    toggle.setValue(filters.includeComments).onChange(async value => {
      filters.includeComments = value;
      await saveSettings();
    })
  );

  new Setting(containerEl)
    .setName('Exclude NSFW')
    .setDesc('Filter out adult content')
    .addToggle(toggle =>
      toggle.setValue(filters.excludeNsfw).onChange(async value => {
        filters.excludeNsfw = value;
        await saveSettings();
      })
    );

  // Advanced filters
  const advancedContent = createCollapsibleSection(
    containerEl, expandedSections, 'filters-advanced', 'Advanced filters',
  );

  // Subreddit filtering
  new Setting(advancedContent).setName('Subreddit filtering').setHeading();

  new Setting(advancedContent).setName('Mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Include only listed')
      .addOption('exclude', 'Exclude listed')
      .setValue(filters.subredditFilterMode)
      .onChange(async (value: FilterMode) => {
        filters.subredditFilterMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent)
    .setName('Subreddits')
    .setDesc('One per line, without r/')
    .addTextArea(text => {
      text
        .setPlaceholder('AskReddit\nprogramming')
        .setValue(filters.subredditList.join('\n'))
        .onChange(async value => {
          filters.subredditList = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await saveSettings();
        });
      text.inputEl.rows = 3;
    });

  new Setting(advancedContent).setName('Use regex').addToggle(toggle =>
    toggle.setValue(filters.useSubredditRegex).onChange(async value => {
      filters.useSubredditRegex = value;
      await saveSettings();
      redisplay();
    })
  );

  if (filters.useSubredditRegex) {
    new Setting(advancedContent).setName('Regex pattern').addText(text =>
      text
        .setPlaceholder('^(programming|coding).*')
        .setValue(filters.subredditRegex)
        .onChange(async value => {
          filters.subredditRegex = value;
          await saveSettings();
        })
    );
  }

  // Score filtering
  new Setting(advancedContent).setName('Score filtering').setHeading();

  new Setting(advancedContent).setName('Minimum score').addText(text =>
    text
      .setPlaceholder('No minimum')
      .setValue(filters.minScore !== null ? String(filters.minScore) : '')
      .onChange(async value => {
        const num = parseInt(value);
        filters.minScore = !isNaN(num) ? num : null;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Maximum score').addText(text =>
    text
      .setPlaceholder('No maximum')
      .setValue(filters.maxScore !== null ? String(filters.maxScore) : '')
      .onChange(async value => {
        const num = parseInt(value);
        filters.maxScore = !isNaN(num) ? num : null;
        await saveSettings();
      })
  );

  new Setting(advancedContent)
    .setName('Min upvote ratio')
    .setDesc('0.0 to 1.0')
    .addText(text =>
      text
        .setPlaceholder('e.g., 0.9')
        .setValue(filters.minUpvoteRatio !== null ? String(filters.minUpvoteRatio) : '')
        .onChange(async value => {
          const num = parseFloat(value);
          if (value === '') {
            filters.minUpvoteRatio = null;
          } else if (!isNaN(num)) {
            filters.minUpvoteRatio = Math.min(1, Math.max(0, num));
          }
          await saveSettings();
        })
    );

  // Content keywords
  new Setting(advancedContent).setName('Content filtering').setHeading();

  new Setting(advancedContent).setName('Title keyword mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Must contain')
      .addOption('exclude', 'Must not contain')
      .setValue(filters.titleKeywordsMode)
      .onChange(async (value: FilterMode) => {
        filters.titleKeywordsMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Title keywords').addTextArea(text => {
    text
      .setPlaceholder('tutorial\nguide')
      .setValue(filters.titleKeywords.join('\n'))
      .onChange(async value => {
        filters.titleKeywords = value
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        await saveSettings();
      });
    text.inputEl.rows = 2;
  });

  new Setting(advancedContent).setName('Content keyword mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Must contain')
      .addOption('exclude', 'Must not contain')
      .setValue(filters.contentKeywordsMode)
      .onChange(async (value: FilterMode) => {
        filters.contentKeywordsMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Content keywords').addTextArea(text => {
    text
      .setPlaceholder('python\njavascript')
      .setValue(filters.contentKeywords.join('\n'))
      .onChange(async value => {
        filters.contentKeywords = value
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        await saveSettings();
      });
    text.inputEl.rows = 2;
  });

  // Flair filtering
  new Setting(advancedContent).setName('Flair filter mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Include only listed')
      .addOption('exclude', 'Exclude listed')
      .setValue(filters.flairFilterMode)
      .onChange(async (value: FilterMode) => {
        filters.flairFilterMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Flair list').addTextArea(text => {
    text
      .setPlaceholder('Discussion\nQuestion')
      .setValue(filters.flairList.join('\n'))
      .onChange(async value => {
        filters.flairList = value
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        await saveSettings();
      });
    text.inputEl.rows = 2;
  });

  // Author filtering
  new Setting(advancedContent).setName('Author & domain').setHeading();

  new Setting(advancedContent).setName('Author filter mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Include only listed')
      .addOption('exclude', 'Exclude listed')
      .setValue(filters.authorFilterMode)
      .onChange(async (value: FilterMode) => {
        filters.authorFilterMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Authors').addTextArea(text => {
    text
      .setPlaceholder('username1\nusername2')
      .setValue(filters.authorList.join('\n'))
      .onChange(async value => {
        filters.authorList = value
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        await saveSettings();
      });
    text.inputEl.rows = 2;
  });

  new Setting(advancedContent).setName('Domain filter mode').addDropdown(dropdown =>
    dropdown
      .addOption('include', 'Include only listed')
      .addOption('exclude', 'Exclude listed')
      .setValue(filters.domainFilterMode)
      .onChange(async (value: FilterMode) => {
        filters.domainFilterMode = value;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Domains').addTextArea(text => {
    text
      .setPlaceholder('youtube.com\ngithub.com')
      .setValue(filters.domainList.join('\n'))
      .onChange(async value => {
        filters.domainList = value
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        await saveSettings();
      });
    text.inputEl.rows = 2;
  });

  // Comment count
  new Setting(advancedContent).setName('Min comment count').addText(text =>
    text
      .setPlaceholder('No minimum')
      .setValue(filters.minCommentCount !== null ? String(filters.minCommentCount) : '')
      .onChange(async value => {
        const num = parseInt(value);
        filters.minCommentCount = !isNaN(num) ? num : null;
        await saveSettings();
      })
  );

  new Setting(advancedContent).setName('Max comment count').addText(text =>
    text
      .setPlaceholder('No maximum')
      .setValue(filters.maxCommentCount !== null ? String(filters.maxCommentCount) : '')
      .onChange(async value => {
        const num = parseInt(value);
        filters.maxCommentCount = !isNaN(num) ? num : null;
        await saveSettings();
      })
  );

  // Reset button
  new Setting(containerEl).addButton(button =>
    button
      .setButtonText('Reset all filters')
      .setWarning()
      .onClick(async () => {
        settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS, enabled: true };
        await saveSettings();
        redisplay();
        new Notice('Filters reset');
      })
  );
}
