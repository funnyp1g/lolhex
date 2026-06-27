// utils/cache.js - Cache utilities with TTL support

const CACHE_PREFIX = 'lol_hex_'

/**
 * Set cache with optional TTL (time-to-live in seconds)
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} [ttl=3600] - TTL in seconds, default 1 hour
 */
const setCache = (key, value, ttl = 3600) => {
  const cacheKey = CACHE_PREFIX + key
  const data = {
    value,
    expireAt: ttl > 0 ? Date.now() + ttl * 1000 : 0,
    createdAt: Date.now()
  }
  try {
    wx.setStorageSync(cacheKey, JSON.stringify(data))
  } catch (err) {
    console.error(`[Cache] setCache error for key "${key}":`, err)
  }
}

/**
 * Get cached value, returns null if expired or not found
 * @param {string} key - Cache key
 * @returns {*} Cached value or null
 */
const getCache = (key) => {
  const cacheKey = CACHE_PREFIX + key
  try {
    const raw = wx.getStorageSync(cacheKey)
    if (!raw) return null

    const data = JSON.parse(raw)
    // Check if expired
    if (data.expireAt > 0 && Date.now() > data.expireAt) {
      removeCache(key)
      return null
    }
    return data.value
  } catch (err) {
    console.error(`[Cache] getCache error for key "${key}":`, err)
    return null
  }
}

/**
 * Remove a specific cache entry
 * @param {string} key - Cache key
 */
const removeCache = (key) => {
  const cacheKey = CACHE_PREFIX + key
  try {
    wx.removeStorageSync(cacheKey)
  } catch (err) {
    console.error(`[Cache] removeCache error for key "${key}":`, err)
  }
}

/**
 * Clear all app caches
 */
const clearAllCache = () => {
  try {
    const res = wx.getStorageInfoSync()
    const keys = res.keys || []
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (err) {
    console.error('[Cache] clearAllCache error:', err)
  }
}

/**
 * Check if cache exists and is valid (not expired)
 * @param {string} key - Cache key
 * @returns {boolean}
 */
const hasCache = (key) => {
  return getCache(key) !== null
}

/**
 * Get cache age in seconds
 * @param {string} key - Cache key
 * @returns {number} Age in seconds, or -1 if not found
 */
const getCacheAge = (key) => {
  const cacheKey = CACHE_PREFIX + key
  try {
    const raw = wx.getStorageSync(cacheKey)
    if (!raw) return -1
    const data = JSON.parse(raw)
    return Math.floor((Date.now() - data.createdAt) / 1000)
  } catch (err) {
    return -1
  }
}

module.exports = {
  setCache,
  getCache,
  removeCache,
  clearAllCache,
  hasCache,
  getCacheAge
}
