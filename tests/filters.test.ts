import { FilterEngine, createEmptyBreakdown, FILTER_PRESETS } from '../src/filters';
import { DEFAULT_FILTER_SETTINGS } from '../src/constants';
import { FilterSettings, RedditItem, PostType } from '../src/types';

// Helper to create a mock Reddit item
function createMockItem(overrides: Partial<RedditItem['data']> = {}, kind = 't3'): RedditItem {
  return {
    kind,
    data: {
      id: 'test123',
      name: 't3_test123',
      title: 'Test Post Title',
      author: 'testuser',
      subreddit: 'testsubreddit',
      permalink: '/r/testsubreddit/comments/test123/test_post/',
      created_utc: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
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
    },
  };
}

// Helper to create filter settings with overrides
function createFilterSettings(overrides: Partial<FilterSettings> = {}): FilterSettings {
  return {
    ...DEFAULT_FILTER_SETTINGS,
    enabled: true,
    ...overrides,
  };
}

describe('FilterEngine', () => {
  describe('constructor and basic functionality', () => {
    it('should create a filter engine with settings', () => {
      const settings = createFilterSettings();
      const engine = new FilterEngine(settings);
      expect(engine).toBeDefined();
    });

    it('should pass all items when filtering is disabled', () => {
      const settings = createFilterSettings({ enabled: false });
      const engine = new FilterEngine(settings);
      const item = createMockItem();

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(true);
    });
  });

  describe('subreddit filtering', () => {
    it('should include items from whitelisted subreddits', () => {
      const settings = createFilterSettings({
        subredditFilterMode: 'include',
        subredditList: ['testsubreddit', 'other'],
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem({ subreddit: 'testsubreddit' });

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(true);
    });

    it('should exclude items not in whitelist', () => {
      const settings = createFilterSettings({
        subredditFilterMode: 'include',
        subredditList: ['allowedsubreddit'],
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem({ subreddit: 'notallowed' });

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(false);
      expect(result.filterType).toBe('subreddit');
    });

    it('should exclude items from blacklisted subreddits', () => {
      const settings = createFilterSettings({
        subredditFilterMode: 'exclude',
        subredditList: ['banned'],
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem({ subreddit: 'banned' });

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(false);
      expect(result.filterType).toBe('subreddit');
    });

    it('should include items not in blacklist', () => {
      const settings = createFilterSettings({
        subredditFilterMode: 'exclude',
        subredditList: ['banned'],
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem({ subreddit: 'allowed' });

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(true);
    });

    it('should support case-insensitive subreddit matching', () => {
      const settings = createFilterSettings({
        subredditFilterMode: 'include',
        subredditList: ['TestSubreddit'],
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem({ subreddit: 'testsubreddit' });

      const result = engine.shouldIncludeItem(item);
      expect(result.passes).toBe(true);
    });

    it('should support regex pattern matching for subreddits (include mode)', () => {
      const settings = createFilterSettings({
        useSubredditRegex: true,
        subredditRegex: '^programming.*',
        subredditFilterMode: 'include',
      });
      const engine = new FilterEngine(settings);

      const matchItem = createMockItem({ subreddit: 'programming' });
      const matchItem2 = createMockItem({ subreddit: 'programminghumor' });
      const noMatchItem = createMockItem({ subreddit: 'news' });

      expect(engine.shouldIncludeItem(matchItem).passes).toBe(true);
      expect(engine.shouldIncludeItem(matchItem2).passes).toBe(true);
      expect(engine.shouldIncludeItem(noMatchItem).passes).toBe(false);
    });

    it('should support regex pattern matching for subreddits (exclude mode)', () => {
      const settings = createFilterSettings({
        useSubredditRegex: true,
        subredditRegex: '^meme.*',
        subredditFilterMode: 'exclude',
      });
      const engine = new FilterEngine(settings);

      const matchItem = createMockItem({ subreddit: 'memes' });
      const noMatchItem = createMockItem({ subreddit: 'programming' });

      expect(engine.shouldIncludeItem(matchItem).passes).toBe(false);
      expect(engine.shouldIncludeItem(noMatchItem).passes).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      const settings = createFilterSettings({
        useSubredditRegex: true,
        subredditRegex: '[invalid',
        subredditFilterMode: 'include',
      });
      const engine = new FilterEngine(settings);
      const item = createMockItem();

      // Should not throw, just skip regex check
      const result = engine.shouldIncludeItem(item);
      expect(result).toBeDefined();
    });
  });

  describe('score filtering', () => {
    it('should filter items below minimum score', () => {
      const settings = createFilterSettings({ minScore: 50 });
      const engine = new FilterEngine(settings);

      const highScore = createMockItem({ score: 100 });
      const lowScore = createMockItem({ score: 25 });

      expect(engine.shouldIncludeItem(highScore).passes).toBe(true);
      expect(engine.shouldIncludeItem(lowScore).passes).toBe(false);
    });

    it('should filter items above maximum score', () => {
      const settings = createFilterSettings({ maxScore: 500 });
      const engine = new FilterEngine(settings);

      const lowScore = createMockItem({ score: 100 });
      const highScore = createMockItem({ score: 1000 });

      expect(engine.shouldIncludeItem(lowScore).passes).toBe(true);
      expect(engine.shouldIncludeItem(highScore).passes).toBe(false);
    });

    it('should filter by upvote ratio', () => {
      const settings = createFilterSettings({ minUpvoteRatio: 0.9 });
      const engine = new FilterEngine(settings);

      const highRatio = createMockItem({ upvote_ratio: 0.95 });
      const lowRatio = createMockItem({ upvote_ratio: 0.7 });

      expect(engine.shouldIncludeItem(highRatio).passes).toBe(true);
      expect(engine.shouldIncludeItem(lowRatio).passes).toBe(false);
    });
  });

  describe('date filtering', () => {
    it('should filter items older than preset (last_day)', () => {
      const settings = createFilterSettings({ dateRangePreset: 'last_day' });
      const engine = new FilterEngine(settings);

      const now = Math.floor(Date.now() / 1000);
      const recentItem = createMockItem({ created_utc: now - 3600 }); // 1 hour ago
      const oldItem = createMockItem({ created_utc: now - 2 * 24 * 3600 }); // 2 days ago

      expect(engine.shouldIncludeItem(recentItem).passes).toBe(true);
      expect(engine.shouldIncludeItem(oldItem).passes).toBe(false);
    });

    it('should filter items older than preset (last_week)', () => {
      const settings = createFilterSettings({ dateRangePreset: 'last_week' });
      const engine = new FilterEngine(settings);

      const now = Math.floor(Date.now() / 1000);
      const recentItem = createMockItem({ created_utc: now - 3 * 24 * 3600 }); // 3 days ago
      const oldItem = createMockItem({ created_utc: now - 10 * 24 * 3600 }); // 10 days ago

      expect(engine.shouldIncludeItem(recentItem).passes).toBe(true);
      expect(engine.shouldIncludeItem(oldItem).passes).toBe(false);
    });

    it('should handle custom date range', () => {
      const now = Date.now();
      const settings = createFilterSettings({
        dateRangePreset: 'custom',
        dateRangeStart: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        dateRangeEnd: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
      });
      const engine = new FilterEngine(settings);

      const nowSec = Math.floor(now / 1000);
      const inRange = createMockItem({ created_utc: nowSec - 3 * 24 * 3600 }); // 3 days ago
      const tooOld = createMockItem({ created_utc: nowSec - 10 * 24 * 3600 }); // 10 days ago
      const tooNew = createMockItem({ created_utc: nowSec - 3600 }); // 1 hour ago

      expect(engine.shouldIncludeItem(inRange).passes).toBe(true);
      expect(engine.shouldIncludeItem(tooOld).passes).toBe(false);
      expect(engine.shouldIncludeItem(tooNew).passes).toBe(false);
    });

    it('should include all items when date range is "all"', () => {
      const settings = createFilterSettings({ dateRangePreset: 'all' });
      const engine = new FilterEngine(settings);

      const oldItem = createMockItem({ created_utc: 1000000 }); // Very old
      expect(engine.shouldIncludeItem(oldItem).passes).toBe(true);
    });
  });

  describe('post type filtering', () => {
    it('should exclude comments when includeComments is false', () => {
      const settings = createFilterSettings({ includeComments: false });
      const engine = new FilterEngine(settings);

      const comment = createMockItem({ body: 'This is a comment' }, 't1');
      const post = createMockItem();

      expect(engine.shouldIncludeItem(comment).passes).toBe(false);
      expect(engine.shouldIncludeItem(post).passes).toBe(true);
    });

    it('should exclude posts when includePosts is false', () => {
      const settings = createFilterSettings({ includePosts: false });
      const engine = new FilterEngine(settings);

      const comment = createMockItem({ body: 'This is a comment' }, 't1');
      const post = createMockItem();

      expect(engine.shouldIncludeItem(comment).passes).toBe(true);
      expect(engine.shouldIncludeItem(post).passes).toBe(false);
    });

    it('should filter by post type (text only)', () => {
      const settings = createFilterSettings({
        includePostTypes: ['text'] as PostType[],
      });
      const engine = new FilterEngine(settings);

      const textPost = createMockItem({ is_self: true, selftext: 'Content' });
      const linkPost = createMockItem({ is_self: false, url: 'https://example.com' });

      expect(engine.shouldIncludeItem(textPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(linkPost).passes).toBe(false);
    });

    it('should filter by post type (image only)', () => {
      const settings = createFilterSettings({
        includePostTypes: ['image'] as PostType[],
      });
      const engine = new FilterEngine(settings);

      const imagePost = createMockItem({ url: 'https://i.redd.it/image.jpg' });
      const textPost = createMockItem({ is_self: true });

      expect(engine.shouldIncludeItem(imagePost).passes).toBe(true);
      expect(engine.shouldIncludeItem(textPost).passes).toBe(false);
    });

    it('should filter by post type (video only)', () => {
      const settings = createFilterSettings({
        includePostTypes: ['video'] as PostType[],
      });
      const engine = new FilterEngine(settings);

      const videoPost = createMockItem({ url: 'https://v.redd.it/video123' });
      const textPost = createMockItem({ is_self: true });

      expect(engine.shouldIncludeItem(videoPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(textPost).passes).toBe(false);
    });
  });

  describe('content filtering', () => {
    it('should filter by title keywords (include mode)', () => {
      const settings = createFilterSettings({
        titleKeywords: ['tutorial', 'guide'],
        titleKeywordsMode: 'include',
      });
      const engine = new FilterEngine(settings);

      const matchPost = createMockItem({ title: 'Python Tutorial for Beginners' });
      const noMatchPost = createMockItem({ title: 'Random Discussion' });

      expect(engine.shouldIncludeItem(matchPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(noMatchPost).passes).toBe(false);
    });

    it('should filter by title keywords (exclude mode)', () => {
      const settings = createFilterSettings({
        titleKeywords: ['spam', 'clickbait'],
        titleKeywordsMode: 'exclude',
      });
      const engine = new FilterEngine(settings);

      const spamPost = createMockItem({ title: 'SPAM FREE MONEY' });
      const normalPost = createMockItem({ title: 'Interesting Article' });

      expect(engine.shouldIncludeItem(spamPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(normalPost).passes).toBe(true);
    });

    it('should filter by content keywords (include mode)', () => {
      const settings = createFilterSettings({
        contentKeywords: ['python', 'javascript'],
        contentKeywordsMode: 'include',
      });
      const engine = new FilterEngine(settings);

      const matchPost = createMockItem({ is_self: true, selftext: 'Learning Python is fun!' });
      const noMatchPost = createMockItem({ is_self: true, selftext: 'Random content' });

      expect(engine.shouldIncludeItem(matchPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(noMatchPost).passes).toBe(false);
    });

    it('should filter by content keywords for comments', () => {
      const settings = createFilterSettings({
        contentKeywords: ['helpful'],
        contentKeywordsMode: 'include',
      });
      const engine = new FilterEngine(settings);

      const matchComment = createMockItem({ body: 'This is helpful information' }, 't1');
      const noMatchComment = createMockItem({ body: 'Random comment' }, 't1');

      expect(engine.shouldIncludeItem(matchComment).passes).toBe(true);
      expect(engine.shouldIncludeItem(noMatchComment).passes).toBe(false);
    });

    it('should filter by flair (include mode)', () => {
      const settings = createFilterSettings({
        flairList: ['Discussion', 'Question'],
        flairFilterMode: 'include',
      });
      const engine = new FilterEngine(settings);

      const matchPost = createMockItem({ link_flair_text: 'Discussion' });
      const noMatchPost = createMockItem({ link_flair_text: 'Meme' });
      const noFlairPost = createMockItem({ link_flair_text: undefined });

      expect(engine.shouldIncludeItem(matchPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(noMatchPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(noFlairPost).passes).toBe(false);
    });

    it('should filter by flair (exclude mode)', () => {
      const settings = createFilterSettings({
        flairList: ['Meme', 'Shitpost'],
        flairFilterMode: 'exclude',
      });
      const engine = new FilterEngine(settings);

      const excludedPost = createMockItem({ link_flair_text: 'Meme' });
      const allowedPost = createMockItem({ link_flair_text: 'Discussion' });

      expect(engine.shouldIncludeItem(excludedPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(allowedPost).passes).toBe(true);
    });
  });

  describe('author filtering', () => {
    it('should include only whitelisted authors', () => {
      const settings = createFilterSettings({
        authorFilterMode: 'include',
        authorList: ['trusteduser', 'admin'],
      });
      const engine = new FilterEngine(settings);

      const trustedPost = createMockItem({ author: 'trusteduser' });
      const unknownPost = createMockItem({ author: 'randomuser' });

      expect(engine.shouldIncludeItem(trustedPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(unknownPost).passes).toBe(false);
    });

    it('should exclude blacklisted authors', () => {
      const settings = createFilterSettings({
        authorFilterMode: 'exclude',
        authorList: ['spammer', 'bot'],
      });
      const engine = new FilterEngine(settings);

      const spammerPost = createMockItem({ author: 'spammer' });
      const normalPost = createMockItem({ author: 'normaluser' });

      expect(engine.shouldIncludeItem(spammerPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(normalPost).passes).toBe(true);
    });
  });

  describe('NSFW filtering', () => {
    it('should exclude NSFW posts when excludeNsfw is true', () => {
      const settings = createFilterSettings({ excludeNsfw: true });
      const engine = new FilterEngine(settings);

      const nsfwPost = createMockItem({ over_18: true });
      const sfwPost = createMockItem({ over_18: false });

      expect(engine.shouldIncludeItem(nsfwPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(sfwPost).passes).toBe(true);
    });

    it('should include NSFW posts when excludeNsfw is false', () => {
      const settings = createFilterSettings({ excludeNsfw: false });
      const engine = new FilterEngine(settings);

      const nsfwPost = createMockItem({ over_18: true });
      expect(engine.shouldIncludeItem(nsfwPost).passes).toBe(true);
    });
  });

  describe('comment count filtering', () => {
    it('should filter posts below minimum comment count', () => {
      const settings = createFilterSettings({ minCommentCount: 10 });
      const engine = new FilterEngine(settings);

      const popularPost = createMockItem({ num_comments: 50 });
      const quietPost = createMockItem({ num_comments: 5 });

      expect(engine.shouldIncludeItem(popularPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(quietPost).passes).toBe(false);
    });

    it('should filter posts above maximum comment count', () => {
      const settings = createFilterSettings({ maxCommentCount: 100 });
      const engine = new FilterEngine(settings);

      const normalPost = createMockItem({ num_comments: 50 });
      const viralPost = createMockItem({ num_comments: 5000 });

      expect(engine.shouldIncludeItem(normalPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(viralPost).passes).toBe(false);
    });

    it('should not apply comment count filter to comments', () => {
      const settings = createFilterSettings({ minCommentCount: 100 });
      const engine = new FilterEngine(settings);

      const comment = createMockItem({ num_comments: 0 }, 't1');
      expect(engine.shouldIncludeItem(comment).passes).toBe(true);
    });
  });

  describe('domain filtering', () => {
    it('should include only whitelisted domains', () => {
      const settings = createFilterSettings({
        domainFilterMode: 'include',
        domainList: ['github.com', 'stackoverflow.com'],
      });
      const engine = new FilterEngine(settings);

      const githubPost = createMockItem({ domain: 'github.com', is_self: false });
      const otherPost = createMockItem({ domain: 'random.com', is_self: false });

      expect(engine.shouldIncludeItem(githubPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(otherPost).passes).toBe(false);
    });

    it('should exclude blacklisted domains', () => {
      const settings = createFilterSettings({
        domainFilterMode: 'exclude',
        domainList: ['spam.com', 'ads.net'],
      });
      const engine = new FilterEngine(settings);

      const spamPost = createMockItem({ domain: 'spam.com', is_self: false });
      const normalPost = createMockItem({ domain: 'news.com', is_self: false });

      expect(engine.shouldIncludeItem(spamPost).passes).toBe(false);
      expect(engine.shouldIncludeItem(normalPost).passes).toBe(true);
    });

    it('should handle subdomain matching', () => {
      const settings = createFilterSettings({
        domainFilterMode: 'include',
        domainList: ['reddit.com'],
      });
      const engine = new FilterEngine(settings);

      const subdomainPost = createMockItem({ domain: 'old.reddit.com', is_self: false });
      expect(engine.shouldIncludeItem(subdomainPost).passes).toBe(true);
    });

    it('should not apply domain filter to self posts', () => {
      const settings = createFilterSettings({
        domainFilterMode: 'include',
        domainList: ['specific.com'],
      });
      const engine = new FilterEngine(settings);

      const selfPost = createMockItem({ is_self: true, domain: 'self.subreddit' });
      expect(engine.shouldIncludeItem(selfPost).passes).toBe(true);
    });
  });

  describe('filterItems method', () => {
    it('should return passed and filtered items with breakdown', () => {
      const settings = createFilterSettings({ minScore: 50 });
      const engine = new FilterEngine(settings);

      const items = [
        createMockItem({ id: '1', score: 100 }),
        createMockItem({ id: '2', score: 25 }),
        createMockItem({ id: '3', score: 75 }),
        createMockItem({ id: '4', score: 10 }),
      ];

      const result = engine.filterItems(items);

      expect(result.passed.length).toBe(2);
      expect(result.filtered.length).toBe(2);
      expect(result.breakdown.score).toBe(2);
    });
  });

  describe('previewImport method', () => {
    it('should correctly categorize items for preview', () => {
      const settings = createFilterSettings({ minScore: 50 });
      const engine = new FilterEngine(settings);

      const items = [
        createMockItem({ id: '1', score: 100 }),
        createMockItem({ id: '2', score: 25 }),
        createMockItem({ id: '3', score: 75 }),
      ];

      const existingIds = new Set(['3']); // Item 3 already imported

      const result = engine.previewImport(items, existingIds, true);

      expect(result.wouldImport.length).toBe(1); // Only item 1
      expect(result.wouldFilter.length).toBe(1); // Item 2 filtered
      expect(result.wouldSkip.length).toBe(1); // Item 3 skipped
    });
  });

  describe('createEmptyBreakdown', () => {
    it('should create a breakdown with all zeros', () => {
      const breakdown = createEmptyBreakdown();

      expect(breakdown.subreddit).toBe(0);
      expect(breakdown.score).toBe(0);
      expect(breakdown.date).toBe(0);
      expect(breakdown.postType).toBe(0);
      expect(breakdown.content).toBe(0);
      expect(breakdown.author).toBe(0);
      expect(breakdown.domain).toBe(0);
      expect(breakdown.nsfw).toBe(0);
      expect(breakdown.commentCount).toBe(0);
    });
  });

  describe('FILTER_PRESETS', () => {
    it('should have valid preset configurations', () => {
      expect(FILTER_PRESETS.highQualityOnly).toBeDefined();
      expect(FILTER_PRESETS.highQualityOnly.settings.enabled).toBe(true);
      expect(FILTER_PRESETS.highQualityOnly.settings.minScore).toBe(100);

      expect(FILTER_PRESETS.textPostsOnly).toBeDefined();
      expect(FILTER_PRESETS.textPostsOnly.settings.includePostTypes).toEqual(['text']);

      expect(FILTER_PRESETS.noNsfw).toBeDefined();
      expect(FILTER_PRESETS.noNsfw.settings.excludeNsfw).toBe(true);

      expect(FILTER_PRESETS.recentOnly).toBeDefined();
      expect(FILTER_PRESETS.recentOnly.settings.dateRangePreset).toBe('last_month');

      expect(FILTER_PRESETS.discussionsOnly).toBeDefined();
      expect(FILTER_PRESETS.discussionsOnly.settings.minCommentCount).toBe(10);
    });

    it('should apply presets correctly to filter engine', () => {
      const engine = new FilterEngine(FILTER_PRESETS.highQualityOnly.settings);

      const highQualityPost = createMockItem({ score: 200, upvote_ratio: 0.95 });
      const lowQualityPost = createMockItem({ score: 50, upvote_ratio: 0.6 });

      expect(engine.shouldIncludeItem(highQualityPost).passes).toBe(true);
      expect(engine.shouldIncludeItem(lowQualityPost).passes).toBe(false);
    });
  });

  describe('combined filters', () => {
    it('should apply multiple filters correctly', () => {
      const settings = createFilterSettings({
        minScore: 50,
        excludeNsfw: true,
        subredditFilterMode: 'exclude',
        subredditList: ['spam'],
        includeComments: false,
      });
      const engine = new FilterEngine(settings);

      // Should pass - high score, SFW, allowed subreddit, is a post
      const goodPost = createMockItem({
        score: 100,
        over_18: false,
        subreddit: 'programming',
      });
      expect(engine.shouldIncludeItem(goodPost).passes).toBe(true);

      // Should fail - low score
      const lowScorePost = createMockItem({
        score: 25,
        over_18: false,
        subreddit: 'programming',
      });
      expect(engine.shouldIncludeItem(lowScorePost).passes).toBe(false);

      // Should fail - NSFW
      const nsfwPost = createMockItem({
        score: 100,
        over_18: true,
        subreddit: 'programming',
      });
      expect(engine.shouldIncludeItem(nsfwPost).passes).toBe(false);

      // Should fail - banned subreddit
      const spamPost = createMockItem({
        score: 100,
        over_18: false,
        subreddit: 'spam',
      });
      expect(engine.shouldIncludeItem(spamPost).passes).toBe(false);

      // Should fail - is a comment
      const comment = createMockItem(
        {
          score: 100,
          over_18: false,
          subreddit: 'programming',
        },
        't1'
      );
      expect(engine.shouldIncludeItem(comment).passes).toBe(false);
    });

    it('should return the first failing filter reason', () => {
      const settings = createFilterSettings({
        excludeNsfw: true,
        minScore: 100,
      });
      const engine = new FilterEngine(settings);

      // NSFW check happens before score check
      const item = createMockItem({ over_18: true, score: 50 });
      const result = engine.shouldIncludeItem(item);

      expect(result.passes).toBe(false);
      expect(result.filterType).toBe('nsfw');
    });
  });
});
