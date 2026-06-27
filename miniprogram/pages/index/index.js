// pages/index/index.js - 首页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants')
const { formatWinRate, formatSampleSize } = require('../../utils/format')

Page({
  data: {
    currentPatch: '',
    // 版本调整数据（模拟数据，后续可从 API 获取）
    patchAdjustments: null,
    showAdjustmentsDetail: false,
    hotAugments: [],
    hotChampions: [],
    loading: true,
    error: false,
    // 英雄排行表
    rankList: [],
    rankLoading: false,
    rankError: false,
    rankSortBy: 'win_rate',
    rankSortOrder: 'desc',
    rankPage: 1,
    rankHasMore: true,
    quickEntries: [
      { icon: '🦸', text: '英雄查询', path: '/pages/champion-list/champion-list', isTab: true, tabPath: 1 },
      { icon: '⚡', text: '海克斯查询', path: '/pages/augment-list/augment-list', isTab: true, tabPath: 2 },
      { icon: '🎯', text: '组合推荐', path: '/pages/combo/combo', isTab: true, tabPath: 3 }
    ]
  },

  onLoad() {
    this.loadPageData()
  },

  onShow() {
    this.loadPatchVersion()
  },

  onPullDownRefresh() {
    cache.removeCache(CACHE_KEYS.AUGMENT_LIST)
    cache.removeCache(CACHE_KEYS.CHAMPION_LIST)
    this.loadPageData().then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载页面数据
  async loadPageData() {
    this.setData({ loading: true, error: false })

    await Promise.allSettled([
      this.loadPatchVersion(),
      this.loadPatchAdjustments(),
      this.loadHotAugments(),
      this.loadChampionRankTable()
    ])

    const hasData = this.data.currentPatch || this.data.hotAugments.length > 0 || this.data.rankList.length > 0
    this.setData({ loading: false, error: !hasData })
  },

  // 加载版本号
  async loadPatchVersion() {
    try {
      const data = await cloud.getCurrentPatch()
      if (data && data.version) {
        this.setData({ currentPatch: data.version })
        cache.setCache(CACHE_KEYS.CURRENT_PATCH, data.version, CACHE_TTL.PATCH)
      }
    } catch (err) {
      console.warn('[首页] 获取版本失败:', err.message)
      const cached = cache.getCache(CACHE_KEYS.CURRENT_PATCH)
      if (cached) {
        this.setData({ currentPatch: cached })
      }
    }
  },

  // 加载版本调整数据（模拟数据）
  async loadPatchAdjustments() {
    const cached = cache.getCache('patch_adjustments')
    if (cached) {
      this.setData({ patchAdjustments: cached })
      return
    }

    // 模拟数据：当前版本的海克斯调整
    const patchVer = this.data.currentPatch || '26.12'
    const mock = {
      version: patchVer,
      buffs: [
        { name: '毁坏仪式', icon: '📈', desc: '基础伤害提升' },
        { name: '无限循环', icon: '📈', desc: '冷却缩减加成增加' },
        { name: '会心治疗', icon: '📈', desc: '治疗量提升' }
      ],
      nerfs: [
        { name: '坦克引擎', icon: '📉', desc: '护甲加成降低' },
        { name: '重量打击', icon: '📉', desc: '移速加成减少' }
      ],
      balance: [
        { name: '适应性防御', icon: '🔄', desc: '效果重做' }
      ]
    }

    this.setData({ patchAdjustments: mock })
    cache.setCache('patch_adjustments', mock, 3600)
  },

  // 展开/收起版本调整详情
  toggleAdjustmentsDetail() {
    this.setData({
      showAdjustmentsDetail: !this.data.showAdjustmentsDetail
    })
  },

  // 加载热门海克斯
  async loadHotAugments() {
    try {
      const data = await cloud.getAugmentList({
        sort_by: 'win_rate',
        order: 'desc',
        page_size: 5,
        page: 1
      })

      const list = (data.list || data || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        name_display: a.name_zh || a.name || '未知',
        win_rate_display: formatWinRate(a.win_rate),
        sample_display: formatSampleSize(a.sample_size || 0),
        win_rate_value: a.win_rate < 1 ? a.win_rate * 100 : a.win_rate
      }))

      this.setData({ hotAugments: list })
    } catch (err) {
      console.warn('[首页] 获取热门海克斯失败:', err.message)
    }
  },

  // 重试
  onRetry() {
    this.loadPageData()
  },

  // 点击搜索栏
  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  // 快速入口跳转
  onQuickEntryTap(e) {
    const { path, istab } = e.currentTarget.dataset
    if (istab) {
      wx.switchTab({ url: path })
    } else {
      wx.navigateTo({ url: path })
    }
  },

  // 热门海克斯点击
  onAugmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  },

  // 加载英雄排行表
  async loadChampionRankTable() {
    if (this.data.rankLoading) return
    this.setData({ rankLoading: true })

    try {
      const data = await cloud.getChampionRankTable({
        sort_by: this.data.rankSortBy,
        order: this.data.rankSortOrder,
        page: this.data.rankPage,
        page_size: 20
      })

      const list = (data.list || []).map(function (c) {
        return {
          ...c,
          icon_url: image.resolveImageUrl(c.icon_url),
          win_rate: c.win_rate < 1 ? (c.win_rate * 100).toFixed(1) : c.win_rate.toFixed(1),
          pick_rate: c.pick_rate < 1 ? (c.pick_rate * 100).toFixed(1) : c.pick_rate.toFixed(1),
          sample_size: formatSampleSize(c.sample_size || 0)
        }
      })

      const newList = this.data.rankPage === 1 ? list : [...this.data.rankList, ...list]
      this.setData({
        rankList: newList,
        rankLoading: false,
        rankHasMore: list.length >= 20,
        rankError: false
      })
    } catch (err) {
      console.warn('[首页] 获取英雄排行失败:', err.message)
      this.setData({ rankLoading: false, rankError: this.data.rankList.length === 0 })
    }
  },

  // 排行表排序
  onRankSort(e) {
    const { sortBy, order } = e.detail
    this.setData({ rankSortBy: sortBy, rankSortOrder: order, rankPage: 1, rankList: [] })
    this.loadChampionRankTable()
  },

  // 排行表加载更多
  onRankLoadMore() {
    if (!this.data.rankHasMore || this.data.rankLoading) return
    this.setData({ rankPage: this.data.rankPage + 1 })
    this.loadChampionRankTable()
  },

  // 排行表英雄点击
  onRankChampionTap(e) {
    const { championId } = e.detail
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${championId}` })
  }
})
