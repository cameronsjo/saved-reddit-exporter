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
  // Filter settings
  filterSettings: FilterSettings;
  showFilterSettings: boolean; // Toggle filter settings visibility
}

export type PostType = 'text' | 'link' | 'image' | 'video';
export type FilterMode = 'include' | 'exclude';
export type DateRangePreset =
  | 'all'
  | 'last_day'
  | 'last_week'
  | 'last_month'
  | 'last_year'
  | 'custom';

export interface FilterSettings {
  // Enable/disable filtering
  enabled: boolean;

  // Subreddit filtering
  subredditFilterMode: FilterMode;
  subredditList: string[]; // List of subreddits to include/exclude
  subredditRegex: string; // Regex pattern for subreddit matching
  useSubredditRegex: boolean;

  // Content filtering
  titleKeywords: string[]; // Keywords to search for in titles
  titleKeywordsMode: FilterMode;
  contentKeywords: string[]; // Keywords to search for in content/body
  contentKeywordsMode: FilterMode;
  flairList: string[]; // Flairs to include/exclude
  flairFilterMode: FilterMode;

  // Score filtering
  minScore: number | null;
  maxScore: number | null;
  minUpvoteRatio: number | null; // 0.0 to 1.0

  // Post type filtering
  includePostTypes: PostType[];
  includeComments: boolean;
  includePosts: boolean;

  // Date range filtering
  dateRangePreset: DateRangePreset;
  dateRangeStart: number | null; // Unix timestamp
  dateRangeEnd: number | null; // Unix timestamp

  // Advanced filters
  authorFilterMode: FilterMode;
  authorList: string[]; // Authors to include/exclude
  minCommentCount: number | null;
  maxCommentCount: number | null;
  domainFilterMode: FilterMode;
  domainList: string[]; // Domains to include/exclude (for link posts)
  excludeNsfw: boolean;
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
  filtered: number;
  filterBreakdown?: FilterBreakdown;
}

export interface FilterBreakdown {
  subreddit: number;
  score: number;
  date: number;
  postType: number;
  content: number;
  author: number;
  domain: number;
  nsfw: number;
  commentCount: number;
}

export interface FilterResult {
  passes: boolean;
  reason?: string;
  filterType?: keyof FilterBreakdown;
}

export interface PreviewResult {
  wouldImport: RedditItem[];
  wouldFilter: Array<{ item: RedditItem; reason: string }>;
  wouldSkip: RedditItem[];
  breakdown: FilterBreakdown;
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
  over_18?: boolean; // NSFW flag
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
