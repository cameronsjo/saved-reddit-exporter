import {
  buildTemplateVariables,
  applyTemplate,
  generateFolderPath,
  generateFilename,
  getTemplateVariablesDocs,
  TemplateVariables,
  FOLDER_TEMPLATE_PRESETS,
  FILENAME_TEMPLATE_PRESETS,
} from '../src/utils/path-template';
import { RedditItemData, ContentOrigin } from '../src/types';

// Helper to create mock Reddit item data
function createMockItemData(overrides: Partial<RedditItemData> = {}): RedditItemData {
  return {
    id: 'test123',
    name: 't3_test123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'programming',
    permalink: '/r/programming/comments/test123/test_post/',
    created_utc: 1704067200, // 2024-01-01 00:00:00 UTC
    score: 100,
    url: 'https://example.com/link',
    domain: 'example.com',
    is_self: false,
    selftext: '',
    num_comments: 50,
    upvote_ratio: 0.95,
    link_flair_text: 'Discussion',
    over_18: false,
    ...overrides,
  };
}

describe('buildTemplateVariables', () => {
  it('should build variables from post data', () => {
    const data = createMockItemData({
      title: 'My Awesome Post',
      subreddit: 'programming',
      author: 'developer',
      created_utc: 1704067200, // 2024-01-01
      score: 500,
      link_flair_text: 'Tutorial',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables).toMatchObject({
      subreddit: 'programming',
      author: 'developer',
      type: 'post',
      origin: 'saved',
      year: '2024',
      month: '01',
      day: '01',
      title: 'My Awesome Post',
      id: 'test123',
      flair: 'Tutorial',
      score: '500',
    });
  });

  it('should build variables for comment', () => {
    const data = createMockItemData({
      link_title: 'Parent Post Title',
      author: 'commenter',
    });

    const variables = buildTemplateVariables(data, true, 'saved');

    expect(variables.type).toBe('comment');
    expect(variables.title).toContain('Parent Post Title');
  });

  it('should handle comment without link_title', () => {
    const data = createMockItemData({
      author: 'commenter',
    });
    delete (data as Partial<RedditItemData>).link_title;

    const variables = buildTemplateVariables(data, true, 'saved');

    expect(variables.title).toContain('Comment by commenter');
  });

  it('should detect text post type', () => {
    const data = createMockItemData({
      is_self: true,
      selftext: 'Some text content',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('text');
  });

  it('should detect image post type from post_hint', () => {
    const data = createMockItemData({
      post_hint: 'image',
      url: 'https://i.redd.it/image.png',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('image');
  });

  it('should detect image post type from URL extension', () => {
    const data = createMockItemData({
      url: 'https://example.com/photo.jpg',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('image');
  });

  it('should detect video post type', () => {
    const data = createMockItemData({
      is_video: true,
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('video');
  });

  it('should detect video from post_hint hosted:video', () => {
    const data = createMockItemData({
      post_hint: 'hosted:video',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('video');
  });

  it('should detect video from post_hint rich:video', () => {
    const data = createMockItemData({
      post_hint: 'rich:video',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('video');
  });

  it('should default to link post type', () => {
    const data = createMockItemData({
      is_self: false,
      url: 'https://example.com/article',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.postType).toBe('link');
  });

  it('should handle different content origins', () => {
    const data = createMockItemData();

    expect(buildTemplateVariables(data, false, 'upvoted').origin).toBe('upvoted');
    expect(buildTemplateVariables(data, false, 'submitted').origin).toBe('submitted');
    expect(buildTemplateVariables(data, false, 'commented').origin).toBe('commented');
  });

  it('should sanitize subreddit name', () => {
    const data = createMockItemData({
      subreddit: 'Test/Subreddit',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    // sanitizeSubredditName should handle special characters
    expect(variables.subreddit).not.toContain('/');
  });

  it('should sanitize title for filename', () => {
    const data = createMockItemData({
      title: 'Title: With "Special" Characters?',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    // sanitizeFileName should remove or replace special characters
    expect(variables.title).not.toContain(':');
    expect(variables.title).not.toContain('"');
    expect(variables.title).not.toContain('?');
  });

  it('should handle empty flair', () => {
    const data = createMockItemData({
      link_flair_text: '',
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    // sanitizeFileName returns 'Untitled' for empty strings (prevents empty filenames)
    expect(variables.flair).toBe('Untitled');
  });

  it('should handle missing author', () => {
    const data = createMockItemData();
    delete (data as Partial<RedditItemData>).author;

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.author).toBe('unknown');
  });

  it('should handle missing subreddit', () => {
    const data = createMockItemData();
    delete (data as Partial<RedditItemData>).subreddit;

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.subreddit).toBe('unknown');
  });

  it('should format date components correctly', () => {
    // Test single digit month and day
    const data = createMockItemData({
      created_utc: 1675209600, // 2023-02-01 00:00:00 UTC
    });

    const variables = buildTemplateVariables(data, false, 'saved');

    expect(variables.year).toBe('2023');
    expect(variables.month).toBe('02');
    expect(variables.day).toBe('01');
  });
});

describe('applyTemplate', () => {
  const mockVariables: TemplateVariables = {
    subreddit: 'programming',
    author: 'developer',
    type: 'post',
    origin: 'saved',
    year: '2024',
    month: '01',
    day: '15',
    title: 'Test Post',
    id: 'abc123',
    flair: 'Discussion',
    postType: 'text',
    score: '100',
  };

  it('should replace single variable', () => {
    expect(applyTemplate('{subreddit}', mockVariables)).toBe('programming');
  });

  it('should replace multiple variables', () => {
    expect(applyTemplate('{subreddit}/{year}/{month}', mockVariables)).toBe('programming/2024/01');
  });

  it('should be case-insensitive', () => {
    expect(applyTemplate('{SUBREDDIT}', mockVariables)).toBe('programming');
    expect(applyTemplate('{Subreddit}', mockVariables)).toBe('programming');
  });

  it('should handle template with static text', () => {
    expect(applyTemplate('posts/{subreddit}/archive', mockVariables)).toBe(
      'posts/programming/archive'
    );
  });

  it('should remove unreplaced variables', () => {
    // Note: trailing slash is also removed, so programming/ becomes programming
    expect(applyTemplate('{subreddit}/{unknownvar}', mockVariables)).toBe('programming');
  });

  it('should clean up double slashes', () => {
    const varsWithEmpty = { ...mockVariables, flair: '' };
    expect(applyTemplate('{subreddit}/{flair}/posts', varsWithEmpty)).toBe('programming/posts');
  });

  it('should remove trailing slashes', () => {
    expect(applyTemplate('{subreddit}/', mockVariables)).toBe('programming');
  });

  it('should return empty string for empty template', () => {
    expect(applyTemplate('', mockVariables)).toBe('');
  });

  it('should handle all variables', () => {
    const template =
      '{subreddit}-{author}-{type}-{origin}-{year}-{month}-{day}-{title}-{id}-{flair}-{postType}-{score}';
    const result = applyTemplate(template, mockVariables);

    expect(result).toBe(
      'programming-developer-post-saved-2024-01-15-Test Post-abc123-Discussion-text-100'
    );
  });

  it('should handle multiple occurrences of same variable', () => {
    expect(applyTemplate('{year}/{year}/{month}', mockVariables)).toBe('2024/2024/01');
  });
});

describe('generateFolderPath', () => {
  const mockVariables: TemplateVariables = {
    subreddit: 'programming',
    author: 'developer',
    type: 'post',
    origin: 'saved',
    year: '2024',
    month: '01',
    day: '15',
    title: 'Test Post',
    id: 'abc123',
    flair: 'Discussion',
    postType: 'text',
    score: '100',
  };

  it('should use base location when no template and no legacy setting', () => {
    const result = generateFolderPath('Reddit', '', mockVariables, false);

    expect(result).toBe('Reddit');
  });

  it('should use legacy subreddit organization when enabled', () => {
    const result = generateFolderPath('Reddit', '', mockVariables, true);

    expect(result).toBe('Reddit/programming');
  });

  it('should apply folder template', () => {
    const result = generateFolderPath('Reddit', '{subreddit}/{year}', mockVariables, false);

    expect(result).toBe('Reddit/programming/2024');
  });

  it('should override legacy setting when template is provided', () => {
    const result = generateFolderPath('Reddit', '{type}s', mockVariables, true);

    expect(result).toBe('Reddit/posts');
  });

  it('should handle complex template', () => {
    const result = generateFolderPath(
      'Reddit',
      '{origin}/{subreddit}/{year}/{month}',
      mockVariables,
      false
    );

    expect(result).toBe('Reddit/saved/programming/2024/01');
  });

  it('should fall back to base location when template results in empty string', () => {
    const varsWithEmpty = { ...mockVariables, flair: '' };
    const result = generateFolderPath('Reddit', '{flair}', varsWithEmpty, false);

    expect(result).toBe('Reddit');
  });
});

describe('generateFilename', () => {
  const mockVariables: TemplateVariables = {
    subreddit: 'programming',
    author: 'developer',
    type: 'post',
    origin: 'saved',
    year: '2024',
    month: '01',
    day: '15',
    title: 'My Test Post',
    id: 'abc123',
    flair: 'Discussion',
    postType: 'text',
    score: '100',
  };

  it('should use title when no template', () => {
    const result = generateFilename('', mockVariables);

    expect(result).toBe('My Test Post');
  });

  it('should fall back to id when no template and no title', () => {
    const varsNoTitle = { ...mockVariables, title: '' };
    const result = generateFilename('', varsNoTitle);

    expect(result).toBe('abc123');
  });

  it('should apply filename template', () => {
    const result = generateFilename('{year}-{month}-{day} {title}', mockVariables);

    expect(result).toBe('2024-01-15 My Test Post');
  });

  it('should fall back to id when template results in empty string', () => {
    const varsWithEmpty = { ...mockVariables, flair: '' };
    const result = generateFilename('{flair}', varsWithEmpty);

    expect(result).toBe('abc123');
  });

  it('should handle title-only template', () => {
    const result = generateFilename('{title}', mockVariables);

    expect(result).toBe('My Test Post');
  });

  it('should handle id and title template', () => {
    const result = generateFilename('{id} - {title}', mockVariables);

    expect(result).toBe('abc123 - My Test Post');
  });

  it('should handle subreddit and title template', () => {
    const result = generateFilename('{subreddit} - {title}', mockVariables);

    expect(result).toBe('programming - My Test Post');
  });
});

describe('getTemplateVariablesDocs', () => {
  it('should return documentation for all variables', () => {
    const docs = getTemplateVariablesDocs();

    expect(docs.length).toBeGreaterThan(0);

    const variableNames = docs.map(d => d.variable);
    expect(variableNames).toContain('{subreddit}');
    expect(variableNames).toContain('{author}');
    expect(variableNames).toContain('{type}');
    expect(variableNames).toContain('{origin}');
    expect(variableNames).toContain('{year}');
    expect(variableNames).toContain('{month}');
    expect(variableNames).toContain('{day}');
    expect(variableNames).toContain('{title}');
    expect(variableNames).toContain('{id}');
    expect(variableNames).toContain('{flair}');
    expect(variableNames).toContain('{postType}');
    expect(variableNames).toContain('{score}');
  });

  it('should have description and example for each variable', () => {
    const docs = getTemplateVariablesDocs();

    for (const doc of docs) {
      expect(doc.description).toBeTruthy();
      expect(doc.example).toBeTruthy();
    }
  });
});

describe('FOLDER_TEMPLATE_PRESETS', () => {
  it('should have expected presets', () => {
    expect(FOLDER_TEMPLATE_PRESETS.flat).toBe('');
    expect(FOLDER_TEMPLATE_PRESETS.bySubreddit).toBe('{subreddit}');
    expect(FOLDER_TEMPLATE_PRESETS.byDate).toBe('{year}/{month}');
    expect(FOLDER_TEMPLATE_PRESETS.bySubredditAndDate).toBe('{subreddit}/{year}/{month}');
    expect(FOLDER_TEMPLATE_PRESETS.byType).toBe('{type}s');
    expect(FOLDER_TEMPLATE_PRESETS.byOrigin).toBe('{origin}');
  });
});

describe('FILENAME_TEMPLATE_PRESETS', () => {
  it('should have expected presets', () => {
    expect(FILENAME_TEMPLATE_PRESETS.titleOnly).toBe('{title}');
    expect(FILENAME_TEMPLATE_PRESETS.titleWithDate).toBe('{year}-{month}-{day} {title}');
    expect(FILENAME_TEMPLATE_PRESETS.subredditAndTitle).toBe('{subreddit} - {title}');
    expect(FILENAME_TEMPLATE_PRESETS.idAndTitle).toBe('{id} - {title}');
  });
});

describe('Integration: Full path generation', () => {
  it('should generate complete file path from Reddit data', () => {
    const data = createMockItemData({
      title: 'How to Learn Programming',
      subreddit: 'learnprogramming',
      author: 'helpfuluser',
      created_utc: 1704067200, // 2024-01-01
      score: 500,
    });

    const variables = buildTemplateVariables(data, false, 'saved');
    const folderPath = generateFolderPath('Reddit', '{subreddit}/{year}', variables, false);
    const filename = generateFilename('{year}-{month}-{day} {title}', variables);

    expect(folderPath).toBe('Reddit/learnprogramming/2024');
    expect(filename).toBe('2024-01-01 How to Learn Programming');
  });

  it('should handle comment path generation', () => {
    const data = createMockItemData({
      link_title: 'Discussion Thread',
      author: 'commenter',
    });

    const variables = buildTemplateVariables(data, true, 'saved');
    const folderPath = generateFolderPath('Reddit', '{type}s/{subreddit}', variables, false);

    expect(folderPath).toBe('Reddit/comments/programming');
    expect(variables.type).toBe('comment');
  });
});
