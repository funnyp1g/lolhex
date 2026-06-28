// pages/index/index.js - 首页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatNumber, formatPercent } = require('../../utils/format')

Page({
  data: {
    currentPatch: '',
    patchAdjustments: null,
    showAdjustmentsDetail: false,
    loading: true,
    error: false,
    // 英雄排行
    champRankList: [],
    champRankLoading: false,
    champRankError: false,
    // 海克斯排行
    augRankList: [],
    augRankLoading: false,
    augRankError: false,
    // 热门搭配
    hotCombos: [],
    comboLoading: false
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
    this.loadPageData().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },

  async loadPageData() {
    this.setData({ loading: true, error: false })
    await Promise.allSettled([
      this.loadPatchVersion(),
      this.loadPatchAdjustments(),
      this.loadChampRank(),
      this.loadAugRank(),
      this.loadHotCombos()
    ])
    this.setData({ loading: false })
  },

  async loadPatchVersion() {
    try {
      const data = await cloud.getCurrentPatch()
      if (data && data.version) {
        this.setData({ currentPatch: data.version })
        cache.setCache(CACHE_KEYS.CURRENT_PATCH, data.version, CACHE_TTL.PATCH)
      }
    } catch (err) {
      const cached = cache.getCache(CACHE_KEYS.CURRENT_PATCH)
      if (cached) this.setData({ currentPatch: cached })
    }
  },

  async loadPatchAdjustments() {
    const mock = {
      version: this.data.currentPatch || '26.12',
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
  },

  toggleAdjustmentsDetail() {
    this.setData({ showAdjustmentsDetail: !this.data.showAdjustmentsDetail })
  },

  // 加载英雄排行 TOP10
  async loadChampRank() {
    this.setData({ champRankLoading: true })
    try {
      const data = await cloud.getChampionRankTable({
        sort_by: 'win_rate', order: 'desc', page: 1, page_size: 10
      })
      const list = (data.list || []).map(c => ({
        ...c,
        icon_url: image.resolveImageUrl(c.icon_url),
        win_rate: c.win_rate < 1 ? (c.win_rate * 100).toFixed(1) : Number(c.win_rate).toFixed(1)
      }))
      this.setData({ champRankList: list, champRankLoading: false, champRankError: false })
    } catch (err) {
      this.setData({ champRankLoading: false, champRankError: true })
    }
  },

  // 加载海克斯排行 TOP10
  async loadAugRank() {
    this.setData({ augRankLoading: true })
    try {
      const data = await cloud.getAugmentList({
        sort_by: 'win_rate', order: 'desc', page: 1, page_size: 10
      })
      const list = (data.list || []).map(a => ({
        ...a,
        icon_url: image.resolveImageUrl(a.icon_url),
        win_rate: a.win_rate < 1 ? (a.win_rate * 100).toFixed(1) : Number(a.win_rate).toFixed(1)
      }))
      this.setData({ augRankList: list, augRankLoading: false, augRankError: false })
    } catch (err) {
      this.setData({ augRankLoading: false, augRankError: true })
    }
  },

  // 加载热门搭配
  async loadHotCombos() {
    this.setData({ comboLoading: true })
    try {
      const data = await cloud.getHotCombos({ page: 1, page_size: 5 })
      const list = (data.list || []).map(c => ({
        ...c,
        best_win_rate: formatPercent(c.best_win_rate),
        best_pick_rate: formatPercent(c.best_pick_rate),
        champion_icon: image.resolveImageUrl(c.champion_icon),
        best_augment_icon: image.resolveImageUrl(c.best_augment_icon),
        augments: (c.augments || []).map(a => ({
          ...a,
          icon_url: image.resolveImageUrl(a.icon_url),
          win_rate: formatPercent(a.win_rate),
          pick_rate: formatPercent(a.pick_rate)
        })),
        items: (c.items || []).map(i => ({
          ...i,
          icon_url: image.resolveImageUrl(i.icon_url),
          win_rate: formatPercent(i.win_rate)
        }))
      }))
      this.setData({ hotCombos: list, comboLoading: false })
    } catch (err) {
      this.setData({ comboLoading: false })
    }
  },

  onRetry() { this.loadPageData() },
  onSearchTap() { wx.navigateTo({ url: '/pages/search/search' }) },

  onGoChampionList() {
    wx.navigateTo({ url: '/pages/champion-list/champion-list' })
  },
  onGoAugmentList() {
    wx.navigateTo({ url: '/pages/augment-list/augment-list' })
  },

  onQuickEntryTap(e) {
    const { path, istab } = e.currentTarget.dataset
    istab ? wx.switchTab({ url: path }) : wx.navigateTo({ url: path })
  },

  // 双栏英雄点击
  onMiniChampionTap(e) {
    const id = e.currentTarget.dataset.championId
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  },

  // 双栏海克斯点击
  onMiniAugmentTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  },

  // 热门搭配点击（跳转英雄详情）
  onComboTap(e) {
    const id = e.currentTarget.dataset.championId
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  }
})
