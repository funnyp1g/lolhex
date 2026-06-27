// utils/image.js - Image URL utility
//
// Handles icon URL resolution for all image elements.
// Key issue: WeChat Mini Program native <image> tags CANNOT load cloud:// protocol URLs.
// Even if they could, the images may not exist in cloud storage yet.
//
// This utility ensures:
// 1. cloud:// URLs are stripped (returns '') to avoid 500 errors
// 2. Empty/missing URLs are handled gracefully
// 3. Valid HTTP(S) URLs pass through
//
// Note: To enable CDN images, add the CDN domain to the WeChat Mini Program's
// domain whitelist (weixin.qq.com, communitydragon.org) in the Mini Program admin console.

/**
 * Check if a URL is a cloud:// protocol URL
 * @param {string} url
 * @returns {boolean}
 */
function isCloudUrl(url) {
  return typeof url === 'string' && url.startsWith('cloud://')
}

/**
 * Resolve an image URL, stripping invalid cloud:// URLs
 * - cloud:// URLs → '' (causes 500 errors in native <image> tags)
 * - Valid HTTP/HTTPS URLs → return as-is
 * - Data URIs → return as-is
 * - Empty/undefined → ''
 *
 * @param {string} [iconUrl] - The icon URL from database
 * @returns {string} Resolved image URL (may be empty)
 */
function resolveImageUrl(iconUrl) {
  if (!iconUrl) return ''

  // Strip cloud:// URLs — native <image> can't load them
  if (isCloudUrl(iconUrl)) {
    return ''
  }

  // Valid external URLs pass through
  if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://') || iconUrl.startsWith('data:')) {
    return iconUrl
  }

  // Return as-is for relative paths or other formats
  return iconUrl
}

/**
 * Process an array of items to resolve their icon URLs
 * @param {Array} items - Array of items with icon_url property
 * @returns {Array} New array with resolved icon_urls
 */
function resolveImageUrls(items) {
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    ...item,
    icon_url: resolveImageUrl(item.icon_url)
  }))
}

module.exports = {
  isCloudUrl,
  resolveImageUrl,
  resolveImageUrls
}
