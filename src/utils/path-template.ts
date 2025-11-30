import { RedditItemData, ContentOrigin } from '../types';
import { sanitizeFileName, sanitizeSubredditName } from './file-sanitizer';

/**
 * Template variables available for folder and filename templates
 */
export interface TemplateVariables {
  /** Subreddit name (sanitized) */
  subreddit: string;
  /** Author username */
  author: string;
  /** Content type: 'post' or 'comment' */
  type: 'post' | 'comment';
  /** Content origin: 'saved', 'upvoted', 'submitted', 'commented' */
  origin: ContentOrigin;
  /** Four-digit year */
  year: string;
  /** Two-digit month (01-12) */
  month: string;
  /** Two-digit day (01-31) */
  day: string;
  /** Post/comment title (sanitized) */
  title: string;
  /** Reddit ID */
  id: string;
  /** Post flair (sanitized, empty if none) */
  flair: string;
  /** Post type for posts: 'text', 'link', 'image', 'video' */
  postType: string;
  /** Score */
  score: string;
}

/**
 * Build template variables from Reddit item data
 */
export function buildTemplateVariables(
  data: RedditItemData,
  isComment: boolean,
  contentOrigin: ContentOrigin
): TemplateVariables {
  const createdDate = new Date(data.created_utc * 1000);

  // Determine post type
  let postType = 'link';
  if (data.is_self) {
    postType = 'text';
  } else if (data.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(data.url || '')) {
    postType = 'image';
  } else if (
    data.is_video ||
    data.post_hint === 'hosted:video' ||
    data.post_hint === 'rich:video'
  ) {
    postType = 'video';
  }

  // Get title - for comments, use the parent post title
  const rawTitle = isComment
    ? data.link_title || `Comment by ${data.author}`
    : data.title || 'Untitled';

  return {
    subreddit: sanitizeSubredditName(data.subreddit || 'unknown'),
    author: sanitizeFileName(data.author || 'unknown'),
    type: isComment ? 'comment' : 'post',
    origin: contentOrigin,
    year: createdDate.getFullYear().toString(),
    month: String(createdDate.getMonth() + 1).padStart(2, '0'),
    day: String(createdDate.getDate()).padStart(2, '0'),
    title: sanitizeFileName(rawTitle),
    id: data.id,
    flair: sanitizeFileName(data.link_flair_text || ''),
    postType,
    score: String(data.score || 0),
  };
}

/**
 * Apply template variables to a template string
 * Supports {variable} syntax
 */
export function applyTemplate(template: string, variables: TemplateVariables): string {
  if (!template) {
    return '';
  }

  let result = template;

  // Replace all {variable} patterns
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, value);
  }

  // Clean up any remaining unreplaced variables (set to empty)
  result = result.replace(/\{[a-zA-Z]+\}/g, '');

  // Clean up double slashes that might result from empty variables
  result = result.replace(/\/+/g, '/');

  // Remove trailing slashes
  result = result.replace(/\/+$/, '');

  return result;
}

/**
 * Generate the full folder path for an item
 */
export function generateFolderPath(
  baseLocation: string,
  folderTemplate: string,
  variables: TemplateVariables,
  legacyOrganizeBySubreddit: boolean
): string {
  // If no template but legacy subreddit organization is on
  if (!folderTemplate && legacyOrganizeBySubreddit) {
    return `${baseLocation}/${variables.subreddit}`;
  }

  // If no template and no legacy setting, use base location
  if (!folderTemplate) {
    return baseLocation;
  }

  // Apply the template
  const templatePath = applyTemplate(folderTemplate, variables);

  // Combine with base location
  if (templatePath) {
    return `${baseLocation}/${templatePath}`;
  }

  return baseLocation;
}

/**
 * Generate the filename for an item (without extension)
 */
export function generateFilename(filenameTemplate: string, variables: TemplateVariables): string {
  // Default to title if no template
  if (!filenameTemplate) {
    return variables.title || variables.id;
  }

  const result = applyTemplate(filenameTemplate, variables);

  // Fallback to ID if template results in empty string
  return result || variables.id;
}

/**
 * Get template variable documentation for settings UI
 */
export function getTemplateVariablesDocs(): Array<{
  variable: string;
  description: string;
  example: string;
}> {
  return [
    { variable: '{subreddit}', description: 'Subreddit name', example: 'programming' },
    { variable: '{author}', description: 'Author username', example: 'spez' },
    { variable: '{type}', description: 'Content type', example: 'post or comment' },
    { variable: '{origin}', description: 'Content origin', example: 'saved, upvoted, submitted' },
    { variable: '{year}', description: 'Year (4 digits)', example: '2024' },
    { variable: '{month}', description: 'Month (2 digits)', example: '01' },
    { variable: '{day}', description: 'Day (2 digits)', example: '15' },
    { variable: '{title}', description: 'Post/comment title', example: 'How to learn Python' },
    { variable: '{id}', description: 'Reddit ID', example: 'abc123' },
    { variable: '{flair}', description: 'Post flair', example: 'Discussion' },
    { variable: '{postType}', description: 'Post media type', example: 'text, link, image, video' },
    { variable: '{score}', description: 'Score/upvotes', example: '1234' },
  ];
}

/**
 * Example folder templates for presets
 */
export const FOLDER_TEMPLATE_PRESETS = {
  flat: '',
  bySubreddit: '{subreddit}',
  byDate: '{year}/{month}',
  bySubredditAndDate: '{subreddit}/{year}/{month}',
  byType: '{type}s',
  byOrigin: '{origin}',
  bySubredditAndType: '{subreddit}/{type}s',
  comprehensive: '{origin}/{subreddit}/{year}',
};

/**
 * Example filename templates for presets
 */
export const FILENAME_TEMPLATE_PRESETS = {
  titleOnly: '{title}',
  titleWithDate: '{year}-{month}-{day} {title}',
  subredditAndTitle: '{subreddit} - {title}',
  idAndTitle: '{id} - {title}',
  dateAndTitle: '{year}{month}{day} - {title}',
};
