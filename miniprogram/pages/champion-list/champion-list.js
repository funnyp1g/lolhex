// pages/champion-list/champion-list.js - 英雄列表页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_KEYS, CACHE_TTL, PAGE_SIZE, CHAMPION_ROLES, ROLE_COLORS } = require('../../utils/constants')
const { formatWinRate, formatPickRate } = require('../../utils/format')

Page({
  data: {
    // 英雄列表数据
    champions: [],
    // 分页
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    // 加载状态
    loading: true,
    loadingMore: false,
    error: false,
    // 排序
    sortBy: 'win_rate',
    sortOrder: 'desc',
    // 角色筛选
    roleFilter: '',
    roleOptions: [],
    roleColors: ROLE_COLORS,
    // 显示模式：list / grid
    viewMode: 'grid',
    // 搜索关键词
    keyword: ''
  },

  onLoad() {
    // 构建角色筛选选项
    const roleOptions = Object.keys(CHAMPION_ROLES).map(key => ({
      value: CHAMPION_ROLES[key],
      label: CHAMPION_ROLES[key]
    }))
    roleOptions.unshift({ value: '', label: '全部' })

    this.setData({ roleOptions })
    this.loadChampions()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, champions: [] })
    this.loadChampions().then(() => {
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

  // 加载英雄列表
  async loadChampions() {
    this.setData({ loading: true, error: false })

    try {
      const params = {
        page: this.data.page,
        page_size: this.data.pageSize,
        sort_by: this.data.sortBy,
        order: this.data.sortOrder
      }

      if (this.data.roleFilter) {
        params.role = this.data.roleFilter
      }
      if (this.data.keyword) {
        params.keyword = this.data.keyword
      }

      const data = await cloud.getChampionList(params)
      const list = (data.list || data || []).map(c => ({
        ...c,
        icon_url: image.resolveImageUrl(c.icon_url),
        name_zh: c.name_zh || c.name,   // 降级：name_zh 为空时使用英文名
        win_rate_display: formatWinRate(c.win_rate),
        pick_rate_display: formatPickRate(c.pick_rate),
        win_rate_value: c.win_rate < 1 ? c.win_rate * 100 : c.win_rate,
        pick_rate_value: c.pick_rate < 1 ? c.pick_rate * 100 : c.pick_rate
      }))

      // 缓存数据
      cache.setCache(CACHE_KEYS.CHAMPION_LIST, list, CACHE_TTL.CHAMPION_LIST)

      this.setData({
        champions: list,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('[英雄列表] 加载失败:', err)
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

      if (this.data.roleFilter) params.role = this.data.roleFilter
      if (this.data.keyword) params.keyword = this.data.keyword

      const data = await cloud.getChampionList(params)
      const newList = (data.list || data || []).map(c => ({
        ...c,
        icon_url: image.resolveImageUrl(c.icon_url),
        name_zh: c.name_zh || c.name,
        win_rate_display: formatWinRate(c.win_rate),
        pick_rate_display: formatPickRate(c.pick_rate),
        win_rate_value: c.win_rate < 1 ? c.win_rate * 100 : c.win_rate,
        pick_rate_value: c.pick_rate < 1 ? c.pick_rate * 100 : c.pick_rate
      }))

      this.setData({
        page: nextPage,
        champions: [...this.data.champions, ...newList],
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
    this.setData({ page: 1, champions: [] })
    this.loadChampions()
  },

  // 排序切换
  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.key
    if (sortBy === this.data.sortBy) {
      // 切换升降序
      this.setData({
        sortOrder: this.data.sortOrder === 'desc' ? 'asc' : 'desc'
      })
    } else {
      this.setData({ sortBy, sortOrder: 'desc' })
    }
    this.setData({ page: 1, champions: [] })
    this.loadChampions()
  },

  // 角色筛选
  onRoleChange(e) {
    const roleFilter = e.currentTarget.dataset.value
    this.setData({ roleFilter, page: 1, champions: [] })
    this.loadChampions()
  },

  // 切换列表/网格模式
  onToggleViewMode() {
    this.setData({
      viewMode: this.data.viewMode === 'list' ? 'grid' : 'list'
    })
  },

  // 搜索
  onSearchInput(e) {
    this.setData({ keyword: e.detail })
  },

  onSearch() {
    this.setData({ page: 1, champions: [] })
    this.loadChampions()
  },

  // 英雄点击
  onChampionTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  }
})
