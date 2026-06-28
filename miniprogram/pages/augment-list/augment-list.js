// pages/augment-list/augment-list.js - 海克斯列表页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL, PAGE_SIZE, RARITY_LABELS } = require('../../utils/constants')
const { formatWinRate, formatPickRate } = require('../../utils/format')

Page({
  data: {
    augments: [],
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: false,
    // 稀有度筛选（无"全部"tab，默认prismatic）
    activeRarity: 'prismatic',
    rarityTabs: [
      { key: 'prismatic', text: '棱彩' },
      { key: 'gold', text: '黄金' },
      { key: 'silver', text: '白银' }
    ],
    // 搜索
    keyword: '',
    searchTimer: null
  },

  onLoad() {
    this.loadAugments()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, augments: [] })
    this.loadAugments().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.loadMore()
  },

  async loadAugments() {
    this.setData({ loading: true, error: false })
    try {
      const params = {
        page: this.data.page,
        page_size: this.data.pageSize,
        sort_by: 'win_rate',
        order: 'desc'
      }
      if (this.data.activeRarity && !this.data.keyword) {
        params.rarity = this.data.activeRarity
      }
      if (this.data.keyword) params.keyword = this.data.keyword

      const data = await cloud.getAugmentList(params)
      const list = (data.list || data || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        name_zh: a.name_zh || a.name,
        win_rate_display: formatWinRate(a.win_rate),
        pick_rate_display: formatPickRate(a.pick_rate),
        win_rate_value: a.win_rate < 1 ? a.win_rate * 100 : a.win_rate,
        rarity_label: RARITY_LABELS[a.rarity] || a.rarity
      }))
      cache.setCache(CACHE_KEYS.AUGMENT_LIST, list, CACHE_TTL.AUGMENT_LIST)
      this.setData({ augments: list, hasMore: list.length >= this.data.pageSize, loading: false })
    } catch (err) {
      this.setData({ loading: false, error: true })
    }
  },

  async loadMore() {
    if (this.data.loadingMore) return
    this.setData({ loadingMore: true })
    try {
      const nextPage = this.data.page + 1
      const params = { page: nextPage, page_size: this.data.pageSize, sort_by: 'win_rate', order: 'desc' }
      if (this.data.activeRarity && !this.data.keyword) {
        params.rarity = this.data.activeRarity
      }
      if (this.data.keyword) params.keyword = this.data.keyword

      const data = await cloud.getAugmentList(params)
      const newList = (data.list || data || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        name_zh: a.name_zh || a.name,
        win_rate_display: formatWinRate(a.win_rate),
        pick_rate_display: formatPickRate(a.pick_rate),
        win_rate_value: a.win_rate < 1 ? a.win_rate * 100 : a.win_rate,
        rarity_label: RARITY_LABELS[a.rarity] || a.rarity
      }))
      this.setData({
        page: nextPage,
        augments: [...this.data.augments, ...newList],
        hasMore: newList.length >= this.data.pageSize,
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loadingMore: false })
      wx.showToast({ title: '加载更多失败', icon: 'none' })
    }
  },

  onRetry() {
    this.setData({ page: 1, augments: [] })
    this.loadAugments()
  },

  onRarityChange(e) {
    const key = e.currentTarget.dataset.key || e.detail.name
    this.setData({ activeRarity: key, page: 1, augments: [] })
    this.loadAugments()
  },

  // 搜索输入（防抖）
  onSearchInput(e) {
    const keyword = e.detail.value
    if (this.data.searchTimer) clearTimeout(this.data.searchTimer)
    this.setData({ keyword })
    const timer = setTimeout(() => {
      this.setData({ page: 1, augments: [] })
      this.loadAugments()
    }, 400)
    this.setData({ searchTimer: timer })
  },

  onSearchConfirm() {
    this.setData({ page: 1, augments: [] })
    this.loadAugments()
  },

  onAugmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  }
})
