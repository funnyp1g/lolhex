// pages/index/index.js - 首页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatNumber, formatPercent } = require('../../utils/format')
const { getAugmentIconUrl } = require('../../utils/augment-icons')

Page({
  data: {
    currentPatch: '',
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
    // 趣数据（hexdata fun_data）
    funDataVersionWinners: [],
    funDataVersionLosers: [],
    funDataTopHexes: [],
    funDataTopHexesDisplay: [],
    funDataHiddenGems: [],
    funDataLoading: false,
    topHexesExpanded: false,
    topHexesExpandText: '展开全部'
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
      this.loadChampRank(),
      this.loadAugRank(),
      this.loadFunData()
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

  // 加载趣数据（hexdata fun_data.json）—— 同时填充版本调整卡片
  async loadFunData() {
    this.setData({ funDataLoading: true })
    const HEXDATA_CDN = 'https://hexdata.com.cn'
    const LABEL_COLORS = { '夯': '#dc2626', '顶级': '#d97706', '人上人': '#ca8a04', 'NPC': '#059669' }
    try {
      const data = await cloud.getFunData()

      const funDataVersionWinners = (data.versionWinners || []).slice(0, 5).map(c => ({
        ...c,
        imageFull: HEXDATA_CDN + (c.imageUrl || ''),
        winRateDisplay: (c.winRate * 100).toFixed(1),
        changeDisplay: (c.change > 0 ? '+' : '') + c.change.toFixed(1)
      }))

      const funDataVersionLosers = (data.versionLosers || []).slice(0, 5).map(c => ({
        ...c,
        imageFull: HEXDATA_CDN + (c.imageUrl || ''),
        winRateDisplay: (c.winRate * 100).toFixed(1),
        changeDisplay: (c.change > 0 ? '+' : '') + c.change.toFixed(1)
      }))

      const funDataTopHexes = (data.topHexes || []).map(h => ({
        ...h,
        winRateDisplay: (h.winRate * 100).toFixed(1),
        gamesDisplay: formatNumber(h.games),
        hexTierColor: LABEL_COLORS[h.hexLabel] || '#6b7280',
        topChampions: (h.topChampions || []).map(tc => ({
          ...tc,
          imageFull: HEXDATA_CDN + (tc.imageUrl || ''),
          winRateDisplay: (tc.winRate * 100).toFixed(1)
        }))
      }))

      const funDataHiddenGems = (data.hiddenGems || []).map(g => ({
        ...g,
        iconFull: getAugmentIconUrl(g.iconUrl) || HEXDATA_CDN + (g.iconUrl || ''),
        winRateDisplay: (g.winRate * 100).toFixed(1),
        pickRateDisplay: (g.pickRate * 100).toFixed(2),
        gamesDisplay: formatNumber(g.games)
      }))

      this.setData({
        funDataVersionWinners,
        funDataVersionLosers,
        funDataTopHexes,
        funDataTopHexesDisplay: funDataTopHexes.slice(0, 5),
        funDataHiddenGems,
        funDataLoading: false,
        topHexesExpanded: false,
        topHexesExpandText: '展开全部 (' + funDataTopHexes.length + ')'
      })
    } catch (err) {
      console.warn('[首页] 趣数据加载失败:', err)
      this.setData({ funDataLoading: false })
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

  // 版本风云英雄点击
  onVersionChampionTap(e) {
    const id = e.currentTarget.dataset.championId
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  },

  // 隐藏宝藏海克斯点击
  onHiddenGemTap(e) {
    const id = e.currentTarget.dataset.augmentId
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  },

  // 顶级海克斯英雄点击
  onTopHexChampionTap(e) {
    const id = e.currentTarget.dataset.championId
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  },

  // 顶级海克斯展开/收起
  onToggleTopHexes() {
    const expanded = !this.data.topHexesExpanded
    const total = this.data.funDataTopHexes.length
    this.setData({
      topHexesExpanded: expanded,
      funDataTopHexesDisplay: expanded ? this.data.funDataTopHexes : this.data.funDataTopHexes.slice(0, 5),
      topHexesExpandText: expanded ? '收起' : '展开全部 (' + total + ')'
    })
  }
})
