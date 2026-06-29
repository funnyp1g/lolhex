// utils/augment-icons.js
// Converts hexdata augment icon URLs to cdn.dtodo.cn URLs (dark gray background style)
//
// hexdata URLs:  /assets/augments/icons/16.13/drawyoursword_small.png
// cdn.dtodo.cn:  https://cdn.dtodo.cn/hextech/augment-icons/drawyoursword_large.png

const CDTODO_CDN = 'https://cdn.dtodo.cn/hextech/augment-icons'
const HEXDATA_CDN = 'https://hexdata.com.cn'

/**
 * Get the cdn.dtodo.cn icon URL for an augment, derived from its hexdata icon URL.
 * Falls back to the original hexdata URL if conversion fails.
 *
 * @param {string} hexdataIconUrl - Relative icon URL from hexdata API (e.g. "/assets/augments/icons/16.13/drawyoursword_small.png")
 * @returns {string} Full cdn.dtodo.cn URL, or hexdata CDN URL as fallback
 */
function getAugmentIconUrl(hexdataIconUrl) {
  if (!hexdataIconUrl) return ''
  try {
    const filename = hexdataIconUrl.split('/').pop().replace('_small', '_large')
    if (filename) return CDTODO_CDN + '/' + filename
  } catch (e) { /* fall through */ }
  return HEXDATA_CDN + (hexdataIconUrl.startsWith('/') ? '' : '/') + hexdataIconUrl
}

module.exports = { getAugmentIconUrl }
