// utils/format.js - Format utilities

/**
 * Format win_rate or pick_rate as percentage string
 * Accepts decimal (0.523) or already-percentage (52.3)
 * @param {number} value - Rate value
 * @param {number} [decimals=1] - Decimal places
 * @returns {string} Formatted percentage string, e.g. "52.3%"
 */
const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined) return '--'
  // If value is a decimal like 0.523, convert to percentage
  const pct = value < 1 ? value * 100 : value
  return pct.toFixed(decimals) + '%'
}

/**
 * Format win_rate - alias for formatPercent
 * @param {number} value - Win rate value
 * @param {number} [decimals=1]
 * @returns {string}
 */
const formatWinRate = (value, decimals = 1) => {
  return formatPercent(value, decimals)
}

/**
 * Format pick_rate - alias for formatPercent
 * @param {number} value - Pick rate value
 * @param {number} [decimals=1]
 * @returns {string}
 */
const formatPickRate = (value, decimals = 1) => {
  return formatPercent(value, decimals)
}

/**
 * Format sample_size with K/W (千/万) suffixes
 * @param {number} value - Sample size number
 * @returns {string} Formatted string, e.g. "2.3K", "1.5W"
 */
const formatSampleSize = (value) => {
  if (value === null || value === undefined) return '--'
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + 'W'
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K'
  }
  return String(value)
}

/**
 * Format a number with thousand separators
 * @param {number} value
 * @returns {string}
 */
const formatNumber = (value) => {
  if (value === null || value === undefined) return '--'
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format date to readable string
 * @param {Date|string|number} date
 * @returns {string} YYYY-MM-DD
 */
const formatDate = (date) => {
  if (!date) return '--'
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format date-time to readable string
 * @param {Date|string|number} date
 * @returns {string} YYYY-MM-DD HH:mm
 */
const formatDateTime = (date) => {
  if (!date) return '--'
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * Format relative time (e.g. "3小时前")
 * @param {Date|string|number} date
 * @returns {string}
 */
const formatRelativeTime = (date) => {
  if (!date) return '--'
  const now = Date.now()
  const d = new Date(date).getTime()
  const diff = now - d

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return formatDate(date)
}

module.exports = {
  formatPercent,
  formatWinRate,
  formatPickRate,
  formatSampleSize,
  formatNumber,
  formatDate,
  formatDateTime,
  formatRelativeTime
}
