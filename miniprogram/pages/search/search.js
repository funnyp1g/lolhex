// pages/search/search.js - 搜索页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, MAX_SEARCH_HISTORY, RARITY_LABELS } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatSampleSize } = require('../../utils/format')

Page({
  data: {
    keyword: '',
    results: [],
    championResults: [],
    augmentResults: [],
    searchHistory: [],
    isSearching: false,
    hasSearched: false,
    searchError: false
  },

  onLoad() {
    this.loadSearchHistory()
  },

  // 加载搜索历史
  loadSearchHistory() {
    const history = cache.getCache(CACHE_KEYS.SEARCH_HISTORY) || []
    this.setData({ searchHistory: history })
  },

  // 保存搜索历史
  saveSearchHistory(keyword) {
    let history = this.data.searchHistory.filter(k => k !== keyword)
    history.unshift(keyword)
    if (history.length > MAX_SEARCH_HISTORY) {
      history = history.slice(0, MAX_SEARCH_HISTORY)
    }
    this.setData({ searchHistory: history })
    cache.setCache(CACHE_KEYS.SEARCH_HISTORY, history, 0)
  },

  // 输入事件
  onInput(e) {
    const keyword = (e.detail || '').trim()
    this.setData({ keyword, hasSearched: false })

    if (keyword.length >= 1) {
      this.debounceSearch(keyword)
    } else {
      this.setData({ results: [], championResults: [], augmentResults: [], isSearching: false })
    }
  },

  // 防抖搜索
  debounceTimer: null,
  debounceSearch(keyword) {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.doSearch(keyword)
    }, 300)
  },

  // 执行搜索
  async doSearch(keyword) {
    if (!keyword) return
    this.setData({ isSearching: true, hasSearched: true, searchError: false })

    try {
      const data = await cloud.search({ keyword, limit: 20 })
      const results = data.results || data || []

      // 分类结果
      const championResults = results
        .filter(r => r.type === 'champion')
        .map(c => ({
          ...c,
          icon_url: image.resolveImageUrl(c.icon_url),
          win_rate_display: formatWinRate(c.win_rate),
          pick_rate_display: formatPickRate(c.pick_rate)
        }))

      const augmentResults = results
        .filter(r => r.type === 'augment')
        .map(a => ({
          ...a,
          icon_url: image.resolveImageUrl(a.icon_url),
          win_rate_display: formatWinRate(a.win_rate),
          rarity_label: RARITY_LABELS[a.rarity] || ''
        }))

      this.setData({
        results: [...championResults, ...augmentResults],
        championResults,
        augmentResults,
        isSearching: false
      })
    } catch (err) {
      console.error('[搜索] 失败:', err)
      this.setData({
        results: [],
        championResults: [],
        augmentResults: [],
        isSearching: false,
        searchError: true
      })
    }
  },

  // 搜索确认（回车）
  onConfirm() {
    const { keyword } = this.data
    if (!keyword) return
    this.saveSearchHistory(keyword)
    this.doSearch(keyword)
  },

  // 点击历史记录
  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.saveSearchHistory(keyword)
    this.doSearch(keyword)
  },

  // 清空历史
  onClearHistory() {
    wx.showModal({
      title: '提示',
      content: '确认清空搜索历史？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ searchHistory: [] })
          cache.setCache(CACHE_KEYS.SEARCH_HISTORY, [], 0)
        }
      }
    })
  },

  // 点击结果
  onResultTap(e) {
    const { type, id } = e.currentTarget.dataset
    if (type === 'champion') {
      wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
    } else if (type === 'augment') {
      wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
    }
  }
})
