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
  organizeBySubreddit: boolean; // Organize exports into subreddit subfolders (legacy, use folderTemplate)
  folderTemplate: string; // Custom folder template with variables like {subreddit}, {year}, {type}
  filenameTemplate: string; // Custom filename template
  exportPostComments: boolean; // Export comments from saved posts
  commentUpvoteThreshold: number; // Minimum upvotes for comments to be included
  // Filter settings
  filterSettings: FilterSettings;
  showFilterSettings: boolean; // Toggle filter settings visibility
  // Performance and reliability settings
  enableEnhancedMode: boolean; // Enable advanced performance features
  enableCheckpointing: boolean; // Enable resumable imports with checkpoints
  showPerformanceStats: boolean; // Show performance stats after import
  maxConcurrentRequests: number; // Maximum concurrent API requests
  maxRetries: number; // Maximum retry attempts for failed requests
  enableOfflineQueue: boolean; // Queue requests when offline
  // Templater integration
  useTemplater: boolean; // Enable Templater for custom templates
  postTemplatePath: string; // Path to post template file
  commentTemplatePath: string; // Path to comment template file
  // Comment context settings
  fetchCommentContext: boolean; // Fetch parent comments for saved comments
  commentContextDepth: number; // How many parent comments to fetch (1-10)
  includeCommentReplies: boolean; // Include replies to saved comments
  commentReplyDepth: number; // How many levels of replies to fetch (1-5)
  // Link preservation settings
  enableLinkPreservation: boolean; // Enable external link archiving features
  checkWaybackArchive: boolean; // Check if links are already archived
  includeArchiveLinks: boolean; // Include Wayback Machine links in output
  extractExternalLinks: boolean; // Extract and list external links from content
  // Comment formatting settings
  postCommentFormat: CommentFormatStyle; // Format style for comments on posts
  savedCommentFormat: CommentFormatStyle; // Format style for saved comment context/replies
  maxCommentDepth: number; // Maximum visual nesting depth (1-5)
  collapseDeepThreads: boolean; // Collapse threads beyond max depth into callouts
}

export type PostType = 'text' | 'link' | 'image' | 'video';
export type FilterMode = 'include' | 'exclude';

/**
 * Comment formatting style options
 * - nested: Traditional blockquote nesting (current behavior)
 * - flat: Flat list with visual thread indicators (↳)
 * - threaded: Collapsible callouts for deep threads
 */
export type CommentFormatStyle = 'nested' | 'flat' | 'threaded';
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
  importedItems: RedditItem[];
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
  over_18?: boolean; // NSFW flag
  is_video?: boolean; // Whether post is a video
  post_hint?: string; // Content hint: 'image', 'link', 'hosted:video', 'rich:video', etc.
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
  // Comment tree fields
  parent_id?: string; // Full name of parent (t1_ for comment, t3_ for post)
  link_id?: string; // Full name of parent post (t3_...)
  depth?: number; // Comment depth in thread (0 = top-level)
  distinguished?: string | null; // 'moderator', 'admin', or null
  edited?: boolean | number; // false or Unix timestamp
  archived?: boolean; // Whether post/comment is archived
  locked?: boolean; // Whether post/comment is locked
  replies?: RedditListingResponse | string; // Nested replies or empty string
  parent_comments?: RedditItemData[]; // Fetched parent context
  child_comments?: RedditItemData[]; // Fetched replies
  // Gallery post fields
  is_gallery?: boolean; // Whether post is a gallery
  gallery_data?: GalleryData; // Gallery items with order and captions
  media_metadata?: MediaMetadata; // Gallery image metadata keyed by media_id
  // Poll fields
  poll_data?: PollData; // Poll options and vote counts
  // Award fields (legacy - Reddit sunset awards in Sep 2023, but data may still exist)
  gilded?: number; // Number of gold awards received
  all_awardings?: RedditAward[]; // All awards received
  total_awards_received?: number; // Total count of all awards
  // Additional engagement metadata
  stickied?: boolean; // Whether post is stickied by moderators
  spoiler?: boolean; // Whether post is marked as spoiler
  contest_mode?: boolean; // Whether comments are in contest mode
  suggested_sort?: string; // Suggested comment sort order
}

/**
 * Reddit award structure (legacy - sunset Sep 2023 but may exist in data)
 */
export interface RedditAward {
  /** Award name */
  name: string;
  /** Award ID */
  id: string;
  /** Award description */
  description?: string;
  /** Count of this award type received */
  count: number;
  /** Coin price of the award */
  coin_price?: number;
  /** Icon URL */
  icon_url?: string;
  /** Whether this award grants Reddit Premium */
  is_new?: boolean;
  /** Award type (e.g., 'global') */
  award_type?: string;
}

/**
 * Gallery data structure - contains ordered list of gallery items
 */
export interface GalleryData {
  items: GalleryItem[];
}

/**
 * Individual gallery item with caption and media reference
 */
export interface GalleryItem {
  /** Caption for the image (optional) */
  caption?: string;
  /** Media ID that corresponds to a key in media_metadata */
  media_id: string;
  /** Numeric ID for the item */
  id: number;
  /** Outbound URL if the image links somewhere */
  outbound_url?: string;
}

/**
 * Media metadata keyed by media_id
 */
export interface MediaMetadata {
  [mediaId: string]: MediaMetadataItem;
}

/**
 * Individual media metadata item
 */
export interface MediaMetadataItem {
  /** Status of the media (e.g., 'valid') */
  status: string;
  /** Media type (e.g., 'Image', 'AnimatedImage') */
  e: string;
  /** MIME type */
  m?: string;
  /** Source image info */
  s?: {
    /** URL (may contain &amp; that needs decoding) */
    u?: string;
    /** GIF URL (for animated images) */
    gif?: string;
    /** MP4 URL (for animated images) */
    mp4?: string;
    /** Width */
    x?: number;
    /** Height */
    y?: number;
  };
  /** Preview images at different resolutions */
  p?: Array<{
    u: string;
    x: number;
    y: number;
  }>;
  /** Original media ID */
  id?: string;
}

/**
 * Poll data structure for Reddit polls
 */
export interface PollData {
  /** Prediction tournament ID (if applicable) */
  prediction_tournament_id?: string | null;
  /** Total votes across all options */
  total_vote_count: number;
  /** Poll options */
  options: PollOption[];
  /** When the poll ends (ISO timestamp or null) */
  voting_end_timestamp?: number | null;
  /** User's selection (option ID) */
  user_selection?: string | null;
  /** Whether the poll has ended */
  is_prediction?: boolean;
}

/**
 * Individual poll option
 */
export interface PollOption {
  /** Option ID */
  id: string;
  /** Option text */
  text: string;
  /** Number of votes for this option */
  vote_count?: number;
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

// Reddit API Listing Response structure
export interface RedditListingResponse {
  kind: 'Listing';
  data: {
    after?: string | null;
    before?: string | null;
    children: RedditItem[];
    modhash?: string;
  };
}

// Comment thread structure for fetching full threads
export interface CommentThread {
  post: RedditItemData;
  comments: RedditItemData[];
  totalComments: number;
  hasMore: boolean;
}

// Templater context for custom templates
export interface TemplaterContext {
  item: RedditItemData;
  isComment: boolean;
  type: string;
  permalink: string;
  subredditUrl: string;
  authorUrl: string;
  created: string;
  createdDate: string;
  tags: string[];
  mediaInfo?: MediaInfo;
  localMediaPath?: string;
  // Comment tree context
  parentType?: string;
  depth?: number;
  parentComments?: RedditItemData[];
  childComments?: RedditItemData[];
  hasParentContext?: boolean;
  hasReplies?: boolean;
}

// ============================================================================
// Sync Manager Types
// ============================================================================

/**
 * Sync status for a Reddit item relative to the vault
 */
export type SyncStatus =
  | 'imported' // In vault and on Reddit
  | 'pending' // On Reddit, passes filters, not in vault
  | 'filtered' // On Reddit, would be filtered out
  | 'override-pending' // Filtered but user wants to import anyway
  | 'orphaned'; // In vault but NOT on Reddit (deleted/unsaved)

/**
 * Metadata extracted from a vault file's frontmatter
 * Used for displaying orphaned items and identifying items for reprocess
 */
export interface VaultItemInfo {
  /** Path to the vault file */
  path: string;
  /** Primary Reddit item ID (without type prefix, e.g., "abc123") */
  id: string;
  /** Additional Reddit IDs if multiple items were merged into this file */
  additionalIds?: string[];
  /** Post title or comment context */
  title?: string;
  /** Subreddit name */
  subreddit?: string;
  /** Frontmatter type (reddit-post, reddit-comment, reddit-collection, etc.) */
  type?: string;
  /** Author username */
  author?: string;
  /** Score at time of import */
  score?: number;
  /** Content origin (saved, upvoted, etc.) */
  contentOrigin?: string;
  /** Permalink to Reddit */
  permalink?: string;
}

/**
 * Represents a Reddit item with its sync state
 */
export interface SyncItem {
  /** The Reddit item data (undefined for orphaned items) */
  item?: RedditItem;
  /** Current sync status */
  status: SyncStatus;
  /** Filter result if item was evaluated against filters */
  filterResult?: FilterResult;
  /** Whether user has overridden the filter for this item */
  userOverride: boolean;
  /** Path to existing vault file if imported */
  vaultPath?: string;
  /** Metadata from vault file (for orphaned items) */
  vaultInfo?: VaultItemInfo;
}

/**
 * Result of computing sync diff between Reddit and vault
 */
export interface SyncDiffResult {
  /** Items in vault AND on Reddit */
  imported: SyncItem[];
  /** Items on Reddit that pass filters */
  pending: SyncItem[];
  /** Items on Reddit that would be filtered out */
  filtered: SyncItem[];
  /** Items in vault but NOT on Reddit */
  orphaned: SyncItem[];
  /** Summary statistics */
  stats: SyncStats;
}

/**
 * Statistics for sync state
 */
export interface SyncStats {
  totalReddit: number;
  totalVault: number;
  imported: number;
  pending: number;
  filtered: number;
  orphaned: number;
}
