import { RedditSavedSettings } from './types';

// OAuth Configuration
export const DEFAULT_REDIRECT_PORT = 9638;
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const OAUTH_SCOPES = 'identity history read';
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

// Backoff Configuration
export const BACKOFF_MAX_DELAY_MS = 30000; // 30 seconds max backoff

export const DEFAULT_SETTINGS: RedditSavedSettings = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  accessToken: '',
  tokenExpiry: 0,
  username: '',
  saveLocation: DEFAULT_SAVE_LOCATION,
  autoUnsave: false,
  fetchLimit: REDDIT_MAX_ITEMS,
  importedIds: [],
  skipExisting: true,
  oauthRedirectPort: DEFAULT_REDIRECT_PORT,
  showAdvancedSettings: false,
  downloadImages: false,
  downloadGifs: false,
  downloadVideos: false,
  mediaFolder: DEFAULT_MEDIA_FOLDER,
};
