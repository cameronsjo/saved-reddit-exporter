export interface RedditSavedSettings {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  tokenExpiry: number;
  username: string;
  saveLocation: string;
  autoUnsave: boolean;
  fetchLimit: number;
  importedIds: string[]; // Track imported Reddit IDs
  skipExisting: boolean; // Skip already imported posts
  oauthRedirectPort: number; // OAuth callback port
  showAdvancedSettings: boolean; // Toggle advanced settings visibility
  downloadImages: boolean; // Download linked images
  downloadGifs: boolean; // Download GIF files
  downloadVideos: boolean; // Download video files
  mediaFolder: string; // Folder for downloaded media
  // Templater integration
  useTemplater: boolean; // Enable Templater template processing
  postTemplatePath: string; // Path to template for posts
  commentTemplatePath: string; // Path to template for comments
}

// Context object passed to Templater templates
export interface TemplaterContext {
  // Core data
  item: RedditItemData;
  isComment: boolean;
  // Formatted dates
  created: string; // ISO string
  createdDate: string; // Localized date string
  // Computed values
  type: 'reddit-post' | 'reddit-comment';
  permalink: string; // Full URL
  // Media info (if applicable)
  mediaInfo?: MediaInfo;
  localMediaPath?: string | null;
  // Helper values
  subredditUrl: string;
  authorUrl: string;
  tags: string[];
}

export interface MediaInfo {
  type: string;
  mediaType: string | null;
  isMedia: boolean;
  domain: string;
  canEmbed: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export interface RedditItem {
  kind: string;
  data: RedditItemData;
}

export interface RedditItemData {
  id: string;
  name: string;
  title?: string;
  author: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  score: number;
  url?: string;
  domain?: string;
  is_self?: boolean;
  selftext?: string;
  body?: string;
  num_comments?: number;
  upvote_ratio?: number;
  link_flair_text?: string;
  link_title?: string;
  link_permalink?: string;
  is_submitter?: boolean;
  preview?: {
    images?: Array<{
      source: {
        url: string;
        width: number;
        height: number;
      };
    }>;
  };
}
