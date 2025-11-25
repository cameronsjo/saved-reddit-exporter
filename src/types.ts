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
  // Content type toggles
  importSavedPosts: boolean; // Import saved posts (default: true)
  importSavedComments: boolean; // Import saved comments (default: true)
  importUpvoted: boolean; // Import upvoted posts
  importUserPosts: boolean; // Import user's own posts
  importUserComments: boolean; // Import user's own comments
  // Crosspost handling
  importCrosspostOriginal: boolean; // Import original instead of crosspost
  preserveCrosspostMetadata: boolean; // Keep crosspost relationship info
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

// Content origin tracking
export type ContentOrigin = 'saved' | 'upvoted' | 'submitted' | 'commented';

export interface RedditItem {
  kind: string;
  data: RedditItemData;
  contentOrigin?: ContentOrigin; // Track where this item came from
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
  // Crosspost metadata
  crosspost_parent?: string; // Full name of parent post (e.g., "t3_abc123")
  crosspost_parent_list?: RedditItemData[]; // Original post data
}
