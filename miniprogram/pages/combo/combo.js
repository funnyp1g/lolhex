// pages/combo/combo.js - 组合推荐页（海克斯三人组）
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_TTL, PAGE_SIZE, RARITY_LABELS } = require('../../utils/constants')
const { formatWinRate, formatSampleSize } = require('../../utils/format')

Page({
  data: {
    // 组合列表
    trios: [],
    // 英雄筛选
    champions: [],
    selectedChampionId: '',
    // 排序
    sortBy: 'win_rate',
    sortOrder: 'desc',
    sortOptions: [
      { key: 'win_rate', text: '胜率' },
      { key: 'sample_size', text: '热度' }
    ],
    // 分页
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    // 加载状态
    loading: true,
    loadingMore: false,
    error: false
  },

  onLoad() {
    this.loadChampionOptions()
    this.loadTrios()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, trios: [] })
    this.loadTrios().then(() => {
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

  // 加载英雄下拉选项
  async loadChampionOptions() {
    try {
      const data = await cloud.getChampionList({ page: 1, page_size: 50 })
      const list = data.list || data || []
      this.setData({
        champions: [{ _id: '', name_zh: '全部英雄' }, ...list]
      })
    } catch (err) {
      // 降级只保留"全部英雄"选项
      this.setData({
        champions: [{ _id: '', name_zh: '全部英雄' }]
      })
    }
  },

  // 加载组合数据
  async loadTrios() {
    this.setData({ loading: true, error: false })

    try {
      const params = {
        page: this.data.page,
        page_size: this.data.pageSize,
        sort_by: this.data.sortBy,
        order: this.data.sortOrder
      }
      if (this.data.selectedChampionId) {
        params.champion_id = Number(this.data.selectedChampionId)
      }

      const data = await cloud.getTrioRank(params)
      const list = (data.list || data || []).map(t => this._processTrio(t))

      this.setData({
        trios: list,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('[组合推荐] 加载失败:', err)
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
      if (this.data.selectedChampionId) {
        params.champion_id = Number(this.data.selectedChampionId)
      }

      const data = await cloud.getTrioRank(params)
      const newList = (data.list || data || []).map(t => this._processTrio(t))

      this.setData({
        page: nextPage,
        trios: [...this.data.trios, ...newList],
        hasMore: newList.length >= this.data.pageSize,
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loadingMore: false })
      wx.showToast({ title: '加载更多失败', icon: 'none' })
    }
  },

  // 处理单个组合数据
  _processTrio(trio) {
    const augments = (trio.augment_ids || []).map((id, idx) => ({
      id,
      name_zh: (trio.augment_names_zh || [])[idx] || '',
      icon_url: image.resolveImageUrl((trio.augment_icons || [])[idx] || ''),
      rarity: (trio.augment_rarities || [])[idx] || '',
      rarity_label: RARITY_LABELS[(trio.augment_rarities || [])[idx]] || ''
    }))

    return {
      ...trio,
      win_rate_display: formatWinRate(trio.win_rate),
      sample_display: formatSampleSize(trio.sample_size || 0),
      win_rate_value: trio.win_rate < 1 ? trio.win_rate * 100 : trio.win_rate,
      augments,
      // 降级：组合名用中文，没有则用英文
      _comboName: trio.augment_names_zh ? trio.augment_names_zh.join(' + ') : ''
    }
  },

  // 重试
  onRetry() {
    this.setData({ page: 1, trios: [] })
    this.loadTrios()
  },

  // 英雄筛选
  onChampionChange(e) {
    const idx = e.detail.value
    const selectedChampionId = this.data.champions[idx]._id || ''
    this.setData({ selectedChampionId, page: 1, trios: [] })
    this.loadTrios()
  },

  // 排序切换
  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.key
    this.setData({ sortBy, page: 1, trios: [] })
    this.loadTrios()
  },

  // 海克斯点击
  onAugmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  }
})
