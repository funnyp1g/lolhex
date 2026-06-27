// pages/augment-list/augment-list.js - 海克斯列表页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL, PAGE_SIZE, RARITY, RARITY_LABELS, SORT_OPTIONS, SORT_LABELS } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatSampleSize } = require('../../utils/format')

Page({
  data: {
    augments: [],
    // 分页
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    // 加载状态
    loading: true,
    loadingMore: false,
    error: false,
    // 稀有度筛选
    activeRarity: '',
    rarityTabs: [
      { key: '', text: '全部' },
      { key: 'prismatic', text: '💎 棱彩' },
      { key: 'gold', text: '🥇 黄金' },
      { key: 'silver', text: '🥈 白银' }
    ],
    // 排序
    sortBy: 'win_rate',
    sortOrder: 'desc',
    sortOptions: [
      { key: 'win_rate', text: '胜率' },
      { key: 'pick_rate', text: '选取率' }
    ]
  },

  onLoad() {
    this.loadAugments()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, augments: [] })
    this.loadAugments().then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  // 加载海克斯列表
  async loadAugments() {
    this.setData({ loading: true, error: false })

    try {
      const params = {
        page: this.data.page,
        page_size: this.data.pageSize,
        sort_by: this.data.sortBy,
        order: this.data.sortOrder
      }

      if (this.data.activeRarity) {
        params.rarity = this.data.activeRarity
      }

      const data = await cloud.getAugmentList(params)
      const list = (data.list || data || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        name_zh: a.name_zh || a.name,   // 降级：name_zh 为空时使用英文名
        win_rate_display: formatWinRate(a.win_rate),
        pick_rate_display: formatPickRate(a.pick_rate),
        sample_display: formatSampleSize(a.sample_size || 0),
        win_rate_value: a.win_rate < 1 ? a.win_rate * 100 : a.win_rate,
        rarity_label: RARITY_LABELS[a.rarity] || a.rarity
      }))

      cache.setCache(CACHE_KEYS.AUGMENT_LIST, list, CACHE_TTL.AUGMENT_LIST)

      this.setData({
        augments: list,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('[海克斯列表] 加载失败:', err)
      this.setData({ loading: false, error: true })
    }
  },

  // 加载更多
  async loadMore() {
    if (this.data.loadingMore) return
    this.setData({ loadingMore: true })

    try {
      const nextPage = this.data.page + 1
      const params = {
        page: nextPage,
        page_size: this.data.pageSize,
        sort_by: this.data.sortBy,
        order: this.data.sortOrder
      }
      if (this.data.activeRarity) params.rarity = this.data.activeRarity

      const data = await cloud.getAugmentList(params)
      const newList = (data.list || data || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        win_rate_display: formatWinRate(a.win_rate),
        pick_rate_display: formatPickRate(a.pick_rate),
        sample_display: formatSampleSize(a.sample_size || 0),
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

  // 重试
  onRetry() {
    this.setData({ page: 1, augments: [] })
    this.loadAugments()
  },

  // 稀有度筛选
  onRarityChange(e) {
    const key = e.currentTarget.dataset.key || e.detail.name
    this.setData({ activeRarity: key, page: 1, augments: [] })
    this.loadAugments()
  },

  // 排序切换
  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.key
    if (sortBy === this.data.sortBy) {
      this.setData({ sortOrder: this.data.sortOrder === 'desc' ? 'asc' : 'desc' })
    } else {
      this.setData({ sortBy, sortOrder: 'desc' })
    }
    this.setData({ page: 1, augments: [] })
    this.loadAugments()
  },

  // 海克斯点击
  onAugmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  }
})
