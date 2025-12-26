import { App, TFile, Notice } from 'obsidian';
import { VaultItemInfo, RedditSavedSettings } from './types';

/**
 * Export format for vault Reddit items
 */
export interface ExportedItem {
  /** Reddit item ID */
  id: string;
  /** Additional merged IDs if applicable */
  additionalIds?: string[];
  /** Vault file path */
  vaultPath: string;
  /** Frontmatter metadata */
  metadata: {
    type?: string;
    title?: string;
    subreddit?: string;
    author?: string;
    score?: number;
    created?: string;
    permalink?: string;
    contentOrigin?: string;
  };
  /** Full file content (optional) */
  content?: string;
}

/**
 * Full export package
 */
export interface ExportPackage {
  /** Export metadata */
  exportInfo: {
    exportedAt: string;
    pluginVersion: string;
    itemCount: number;
    includesContent: boolean;
  };
  /** Exported items */
  items: ExportedItem[];
}

/**
 * Exporter handles exporting vault Reddit items to various formats
 */
export class Exporter {
  private app: App;
  private settings: RedditSavedSettings;

  constructor(app: App, settings: RedditSavedSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Scan vault for Reddit items and export to JSON
   */
  async exportToJson(
    options: {
      includeContent?: boolean;
      subredditFilter?: string[];
      outputPath?: string;
    } = {}
  ): Promise<ExportPackage> {
    const { includeContent = false, subredditFilter } = options;

    const items: ExportedItem[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // Only process Reddit-type files
        if (!frontmatter?.type?.startsWith('reddit-')) {
          continue;
        }

        // Apply subreddit filter if provided
        if (subredditFilter && subredditFilter.length > 0) {
          const subreddit = frontmatter.subreddit?.toLowerCase();
          if (!subreddit || !subredditFilter.some(s => s.toLowerCase() === subreddit)) {
            continue;
          }
        }

        // Collect all IDs
        const allIds: string[] = [];
        if (frontmatter.id) {
          allIds.push(frontmatter.id);
        }
        if (Array.isArray(frontmatter.reddit_ids)) {
          for (const id of frontmatter.reddit_ids) {
            if (typeof id === 'string' && !allIds.includes(id)) {
              allIds.push(id);
            }
          }
        }

        if (allIds.length === 0) {
          continue;
        }

        const exportedItem: ExportedItem = {
          id: allIds[0],
          additionalIds: allIds.length > 1 ? allIds.slice(1) : undefined,
          vaultPath: file.path,
          metadata: {
            type: frontmatter.type,
            title: frontmatter.title,
            subreddit: frontmatter.subreddit,
            author: frontmatter.author,
            score: frontmatter.score,
            created: frontmatter.created,
            permalink: frontmatter.permalink,
            contentOrigin: frontmatter.content_origin,
          },
        };

        // Include full content if requested
        if (includeContent) {
          exportedItem.content = await this.app.vault.read(file);
        }

        items.push(exportedItem);
      } catch (error) {
        console.error(`Error processing ${file.path} for export:`, error);
      }
    }

    const exportPackage: ExportPackage = {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        pluginVersion: this.getPluginVersion(),
        itemCount: items.length,
        includesContent: includeContent,
      },
      items,
    };

    return exportPackage;
  }

  /**
   * Export to JSON and save to vault
   */
  async exportToJsonFile(
    options: {
      includeContent?: boolean;
      subredditFilter?: string[];
      outputPath?: string;
    } = {}
  ): Promise<string> {
    const { outputPath = `${this.settings.saveLocation}/reddit-export.json` } = options;

    const exportPackage = await this.exportToJson(options);
    const jsonContent = JSON.stringify(exportPackage, null, 2);

    // Check if file exists and handle accordingly
    const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (existingFile) {
      await this.app.vault.modify(existingFile as TFile, jsonContent);
    } else {
      // Ensure parent folder exists
      const folderPath = outputPath.substring(0, outputPath.lastIndexOf('/'));
      if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      await this.app.vault.create(outputPath, jsonContent);
    }

    new Notice(`Exported ${exportPackage.exportInfo.itemCount} items to ${outputPath}`);
    return outputPath;
  }

  /**
   * Export to CSV format (metadata only)
   */
  async exportToCsv(
    options: {
      subredditFilter?: string[];
      outputPath?: string;
    } = {}
  ): Promise<string> {
    const { outputPath = `${this.settings.saveLocation}/reddit-export.csv` } = options;

    const exportPackage = await this.exportToJson({ ...options, includeContent: false });

    // CSV header
    const headers = [
      'id',
      'title',
      'subreddit',
      'author',
      'score',
      'created',
      'type',
      'permalink',
      'vaultPath',
    ];
    const rows = [headers.join(',')];

    for (const item of exportPackage.items) {
      const row = [
        this.escapeCsvField(item.id),
        this.escapeCsvField(item.metadata.title || ''),
        this.escapeCsvField(item.metadata.subreddit || ''),
        this.escapeCsvField(item.metadata.author || ''),
        String(item.metadata.score || 0),
        this.escapeCsvField(item.metadata.created || ''),
        this.escapeCsvField(item.metadata.type || ''),
        this.escapeCsvField(item.metadata.permalink || ''),
        this.escapeCsvField(item.vaultPath),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');

    const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (existingFile) {
      await this.app.vault.modify(existingFile as TFile, csvContent);
    } else {
      const folderPath = outputPath.substring(0, outputPath.lastIndexOf('/'));
      if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      await this.app.vault.create(outputPath, csvContent);
    }

    new Notice(`Exported ${exportPackage.exportInfo.itemCount} items to ${outputPath}`);
    return outputPath;
  }

  /**
   * Escape a field for CSV format
   */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get plugin version from manifest
   */
  private getPluginVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Obsidian's internal plugin API is not typed
      const manifest = (this.app as any).plugins?.plugins?.['saved-reddit-exporter']?.manifest;
      return manifest?.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get export statistics
   */
  async getExportStats(): Promise<{
    totalItems: number;
    bySubreddit: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const exportPackage = await this.exportToJson({ includeContent: false });

    const bySubreddit: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const item of exportPackage.items) {
      const subreddit = item.metadata.subreddit || 'unknown';
      const type = item.metadata.type || 'unknown';

      bySubreddit[subreddit] = (bySubreddit[subreddit] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalItems: exportPackage.items.length,
      bySubreddit,
      byType,
    };
  }
}
