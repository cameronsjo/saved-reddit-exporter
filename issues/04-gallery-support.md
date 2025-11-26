# [Feature]: Reddit and Imgur Gallery Support

## 📋 Feature Description

Add support for downloading and displaying multi-image posts from Reddit galleries and Imgur albums.

### Current Behavior

- Gallery URLs are detected but skipped for download
- Only the gallery URL is shown, not individual images

### Proposed Behavior

- Detect gallery posts and fetch all images
- Download each image in the gallery
- Display images in sequence in the markdown

## 🎯 Use Case

Users who:

- Save image-heavy posts with multiple photos
- Want complete archives of visual content
- Save Imgur albums that contain tutorials or guides
- Need all images for reference, not just the first one

## 💡 Proposed Implementation

### Gallery Detection

```typescript
interface GalleryInfo {
  isGallery: boolean;
  platform: 'reddit' | 'imgur' | null;
  imageUrls: string[];
}

function detectGallery(data: RedditItemData): GalleryInfo;
```

### Reddit Gallery API

- Use `gallery_data.items` from post data
- Each item has `media_id` that maps to `media_metadata`
- Extract full-resolution URLs from metadata

### Imgur Gallery API

- Parse album ID from URL
- Fetch album info from Imgur API (may need API key)
- Extract image URLs from response

### Markdown Output

```markdown
📸 **Gallery** (5 images)

![[post-id-1.jpg]]
![[post-id-2.jpg]]
![[post-id-3.jpg]]
...
```

## ✅ Acceptance Criteria

- [ ] Reddit galleries detected correctly
- [ ] All images from Reddit galleries downloaded
- [ ] Imgur albums detected correctly
- [ ] Imgur album images downloaded (with API key if needed)
- [ ] Images displayed in order in markdown
- [ ] Gallery count shown in post
- [ ] Graceful fallback if gallery fetch fails

## 🏷️ Labels

`enhancement`, `media`, `galleries`

## 📊 Priority

Medium - Completes media handling
