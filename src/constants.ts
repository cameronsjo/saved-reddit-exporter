import { RedditSavedSettings } from './types';

export const DEFAULT_REDIRECT_PORT = 9638;
export const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit

export const DEFAULT_SETTINGS: RedditSavedSettings = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  accessToken: '',
  tokenExpiry: 0,
  username: '',
  saveLocation: 'Reddit Saved',
  autoUnsave: false,
  fetchLimit: REDDIT_MAX_ITEMS,
  importedIds: [],
  skipExisting: true,
  oauthRedirectPort: DEFAULT_REDIRECT_PORT,
  showAdvancedSettings: false,
  downloadImages: false,
  downloadGifs: false,
  downloadVideos: false,
  mediaFolder: 'Attachments',
};
