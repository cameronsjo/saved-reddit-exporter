export type UnsaveMode = 'off' | 'prompt' | 'auto';

export interface RedditSavedSettings {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  tokenExpiry: number;
  username: string;
  saveLocation: string;
  autoUnsave: boolean; // Deprecated: use unsaveMode instead
  unsaveMode: UnsaveMode; // 'off' | 'prompt' | 'auto'
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
  // Organization
  organizeBySubreddit: boolean; // Organize exports into subreddit subfolders
  exportPostComments: boolean; // Export comments from saved posts
  commentUpvoteThreshold: number; // Minimum upvotes for comments to be included
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
  importedItems: RedditItem[];
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

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  is_submitter: boolean;
  depth: number;
  replies?: RedditComment[];
}
