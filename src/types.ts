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
  // Comment tree options
  fetchCommentContext: boolean; // Fetch parent comment context for saved comments
  commentContextDepth: number; // How many parent levels to fetch (1-10)
  includeCommentReplies: boolean; // Include replies to saved comments
  commentReplyDepth: number; // How deep to fetch replies (1-5)
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
  // Comment tree context (for comments only)
  parentType?: 'post' | 'comment'; // What this comment replies to
  depth?: number; // Nesting level
  parentComments?: RedditItemData[]; // Chain of parent comments
  childComments?: RedditItemData[]; // Replies to this comment
  hasParentContext?: boolean; // Whether parent context was fetched
  hasReplies?: boolean; // Whether replies were fetched
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
  // Comment tree fields (available from Reddit API)
  parent_id?: string; // Fullname of parent (t1_xxx for comment, t3_xxx for post)
  link_id?: string; // Fullname of the post (t3_xxx)
  depth?: number; // Nesting level (0 = top-level comment)
  distinguished?: string | null; // 'moderator', 'admin', or null
  edited?: boolean | number; // false or timestamp if edited
  archived?: boolean;
  locked?: boolean;
  score_hidden?: boolean;
  collapsed?: boolean;
  collapsed_reason?: string;
  // Populated when fetching comment tree
  replies?: RedditListingResponse;
  // Context: parent comments leading to this comment
  parent_comments?: RedditItemData[];
  // Replies to this comment (flattened)
  child_comments?: RedditItemData[];
}

// Reddit API listing response structure
export interface RedditListingResponse {
  kind: 'Listing';
  data: {
    after?: string | null;
    before?: string | null;
    children: RedditItem[];
    modhash?: string;
  };
}

// Comment tree structure for a post
export interface CommentThread {
  post: RedditItemData;
  comments: RedditItemData[];
  totalComments: number;
  hasMore: boolean; // Indicates if there are more comments not fetched
}
