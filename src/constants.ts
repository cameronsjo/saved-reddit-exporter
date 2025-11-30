import { RedditSavedSettings, FilterSettings, PostType } from './types';

// OAuth Configuration
export const DEFAULT_REDIRECT_PORT = 9638;
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const OAUTH_SCOPES = 'identity history read save';
export const OAUTH_DURATION = 'permanent';
export const OAUTH_RESPONSE_TYPE = 'code';

// Reddit API Configuration
export const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit
export const REDDIT_PAGE_SIZE = 100; // Max items per request
export const REDDIT_USER_AGENT = 'Obsidian:saved-reddit-exporter:v1.0.0';
export const REDDIT_BASE_URL = 'https://www.reddit.com';
export const REDDIT_OAUTH_BASE_URL = 'https://oauth.reddit.com';
export const REDDIT_OAUTH_AUTHORIZE_URL = 'https://www.reddit.com/api/v1/authorize';
export const REDDIT_OAUTH_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';

// Rate Limiting
export const DEFAULT_RATE_LIMIT_DELAY_MS = 2000; // 2 seconds
export const RATE_LIMIT_WARNING_THRESHOLD = 10; // Remaining requests before warning
export const RATE_LIMIT_SAFE_THRESHOLD = 50; // Requests remaining for minimal delay
export const RATE_LIMIT_MIN_DELAY_MS = 100; // Minimum delay between requests
export const RATE_LIMIT_NORMAL_DELAY_MS = 500; // Normal delay between requests
export const MAX_REQUEST_RETRIES = 3;
export const RETRY_AFTER_DEFAULT_SECONDS = 60;

// Pagination
export const MAX_PAGES_SAFETY_LIMIT = 50; // Prevent infinite loops
export const PROGRESS_UPDATE_FREQUENCY = 3; // Show progress every N pages

// File Extensions
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'] as const;
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'] as const;
export const GIF_EXTENSION = '.gif';

// Image Extensions Regex Pattern
export const IMAGE_PATTERN = /\.(jpg|jpeg|png|webp|bmp|svg)(\?|$)/i;
export const GIF_PATTERN = /\.gif(\?|$)/i;
export const VIDEO_PATTERN = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i;

// Media Domains
export const REDDIT_IMAGE_DOMAIN = 'i.redd.it';
export const REDDIT_VIDEO_DOMAIN = 'v.redd.it';
export const IMGUR_DOMAIN = 'imgur.com';
export const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be'] as const;
export const GIF_PLATFORMS = ['gfycat.com', 'redgifs.com'] as const;

// Gallery URL Patterns
export const GALLERY_URL_PATTERNS = [
  '/gallery/',
  '/album/',
  'imgur.com/gallery/',
  'imgur.com/a/',
  'reddit.com/gallery/',
] as const;

// Media Filename Configuration
export const MEDIA_FILENAME_MAX_TITLE_LENGTH = 50;
export const MEDIA_FILENAME_MAX_URL_PART_LENGTH = 20;

// Default Folders
export const DEFAULT_SAVE_LOCATION = 'Reddit Saved';
export const DEFAULT_MEDIA_FOLDER = 'Attachments';

// UI Messages
export const MSG_AUTH_IN_PROGRESS = 'Authorization already in progress';
export const MSG_AUTH_REQUIRED = 'Please authenticate with Reddit first';
export const MSG_ENTER_CREDENTIALS =
  'Please enter your client ID and client secret in plugin settings first';
export const MSG_NO_POSTS_FOUND = 'No saved posts found';
export const MSG_FETCHING_POSTS = 'Fetching saved posts...';
export const MSG_AUTH_SUCCESS = 'Successfully authenticated with Reddit!';
export const MSG_AUTH_CANCELLED = 'Reddit authentication cancelled';
export const MSG_OAUTH_TIMEOUT = 'OAuth server timed out. Please try authenticating again.';
export const MSG_RESCAN_VAULT = 'Rescanning vault for Reddit posts...';
export const MSG_UNSAVING_ITEMS = 'Unsaving items...';
export const MSG_FINISHED_UNSAVING = 'Finished unsaving items';
export const MSG_FETCHING_UPVOTED = 'Fetching upvoted posts...';
export const MSG_FETCHING_USER_POSTS = 'Fetching your submitted posts...';
export const MSG_FETCHING_USER_COMMENTS = 'Fetching your comments...';
export const MSG_NO_CONTENT_TYPES =
  'No content types enabled. Enable at least one content type in settings.';

// HTTP Headers
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_USER_AGENT = 'User-Agent';
export const HEADER_RETRY_AFTER = 'retry-after';

// Content Types
export const CONTENT_TYPE_HTML = 'text/html';
export const CONTENT_TYPE_FORM_URLENCODED = 'application/x-www-form-urlencoded';

// Reddit Item Types
export const REDDIT_ITEM_TYPE_COMMENT = 't1';
export const REDDIT_ITEM_TYPE_POST = 't3';

// Frontmatter Types
export const FRONTMATTER_TYPE_POST = 'reddit-post';
export const FRONTMATTER_TYPE_COMMENT = 'reddit-comment';
export const FRONTMATTER_TYPE_UPVOTED = 'reddit-upvoted';
export const FRONTMATTER_TYPE_USER_POST = 'reddit-user-post';
export const FRONTMATTER_TYPE_USER_COMMENT = 'reddit-user-comment';
export const FRONTMATTER_TYPE_COLLECTION = 'reddit-collection';

// Frontmatter Keys for Multi-ID Support
// Users can add `reddit_ids: [id1, id2, id3]` to merged files
// The sync manager will recognize all listed IDs as "imported"
export const FRONTMATTER_KEY_REDDIT_IDS = 'reddit_ids';

// Content Origin Labels
export const CONTENT_ORIGIN_SAVED = 'saved';
export const CONTENT_ORIGIN_UPVOTED = 'upvoted';
export const CONTENT_ORIGIN_SUBMITTED = 'submitted';
export const CONTENT_ORIGIN_COMMENTED = 'commented';

// Backoff Configuration
export const BACKOFF_MAX_DELAY_MS = 30000; // 30 seconds max backoff

// Default Filter Settings
export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  enabled: false,

  // Subreddit filtering
  subredditFilterMode: 'exclude',
  subredditList: [],
  subredditRegex: '',
  useSubredditRegex: false,

  // Content filtering
  titleKeywords: [],
  titleKeywordsMode: 'include',
  contentKeywords: [],
  contentKeywordsMode: 'include',
  flairList: [],
  flairFilterMode: 'include',

  // Score filtering
  minScore: null,
  maxScore: null,
  minUpvoteRatio: null,

  // Post type filtering
  includePostTypes: ['text', 'link', 'image', 'video'] as PostType[],
  includeComments: true,
  includePosts: true,

  // Date range filtering
  dateRangePreset: 'all',
  dateRangeStart: null,
  dateRangeEnd: null,

  // Advanced filters
  authorFilterMode: 'exclude',
  authorList: [],
  minCommentCount: null,
  maxCommentCount: null,
  domainFilterMode: 'exclude',
  domainList: [],
  excludeNsfw: false,
};

export const DEFAULT_SETTINGS: RedditSavedSettings = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  accessToken: '',
  tokenExpiry: 0,
  username: '',
  saveLocation: DEFAULT_SAVE_LOCATION,
  autoUnsave: false,
  unsaveMode: 'off',
  fetchLimit: REDDIT_MAX_ITEMS,
  importedIds: [],
  skipExisting: true,
  oauthRedirectPort: DEFAULT_REDIRECT_PORT,
  showAdvancedSettings: false,
  downloadImages: false,
  downloadGifs: false,
  downloadVideos: false,
  mediaFolder: DEFAULT_MEDIA_FOLDER,
  // Content type defaults
  importSavedPosts: true,
  importSavedComments: true,
  importUpvoted: false,
  importUserPosts: false,
  importUserComments: false,
  // Crosspost defaults
  importCrosspostOriginal: false,
  preserveCrosspostMetadata: true,
  // Organization defaults
  organizeBySubreddit: false,
  exportPostComments: false,
  commentUpvoteThreshold: 0,
  // Filter defaults
  filterSettings: DEFAULT_FILTER_SETTINGS,
  showFilterSettings: false,
  // Performance and reliability defaults
  enableEnhancedMode: true,
  enableCheckpointing: true,
  showPerformanceStats: false,
  maxConcurrentRequests: 2,
  maxRetries: 3,
  enableOfflineQueue: true,
  // Templater defaults
  useTemplater: false,
  postTemplatePath: '',
  commentTemplatePath: '',
  // Comment context defaults
  fetchCommentContext: false,
  commentContextDepth: 3,
  includeCommentReplies: false,
  commentReplyDepth: 2,
};

// Comment export defaults
export const DEFAULT_COMMENT_UPVOTE_THRESHOLD = 0;
export const MAX_COMMENT_DEPTH = 10; // Maximum depth of nested comments to fetch

// Comment tree/context configuration
export const COMMENT_MAX_TOP_LEVEL = 100; // Reddit API limit for top-level comments
export const COMMENT_MAX_DEPTH = 5; // Reddit API limit for reply depth per request
export const COMMENT_CONTEXT_MAX = 10; // Maximum context depth parameter
export const COMMENT_CONTEXT_DEFAULT = 3; // Default number of parent comments to fetch
export const COMMENT_REPLY_DEPTH_DEFAULT = 2; // Default reply depth to fetch

// Filter-related messages
export const MSG_FILTER_PREVIEW = 'Preview mode: showing what would be imported...';
export const MSG_FILTER_RESULTS = (imported: number, filtered: number, skipped: number) =>
  `Would import ${imported}, filter ${filtered}, skip ${skipped} items`;
export const MSG_INVALID_REGEX = 'Invalid regex pattern in filter settings';
