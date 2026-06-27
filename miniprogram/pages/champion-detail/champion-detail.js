// pages/champion-detail/champion-detail.js - 英雄详情页（最复杂页面）
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_TTL, RARITY_LABELS, RARITY_ICONS, ITEM_SLOT_LABELS, ROLE_COLORS } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatSampleSize, formatNumber } = require('../../utils/format')

Page({
  data: {
    championId: '',
    champion: null,
    // 推荐海克斯（按稀有度分组）
    augmentsPrismatic: [],
    augmentsGold: [],
    augmentsSilver: [],
    // 当前激活的稀有度 Tab
    activeRarity: 'prismatic',
    rarityTabs: [
      { key: 'prismatic', text: '💎 棱彩级' },
      { key: 'gold', text: '🥇 黄金级' },
      { key: 'silver', text: '🥈 白银级' }
    ],
    // 当前稀有度过滤后的海克斯
    filteredAugments: [],
    // 推荐装备（按槽位分组）
    itemsCore: [],
    itemsBoots: [],
    itemsFullBuild: [],
    // 海克斯-装备联动数据
    augmentItemLinkage: [],
    // 状态
    loading: true,
    error: false,
    // 常量引用
    roleColors: ROLE_COLORS,
    // 胜率进度条值
    winRateValue: 0,
    pickRateValue: 0
  },

  onLoad(options) {
    const { id } = options
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ championId: id })
    this.loadChampionDetail(id)
  },

  onPullDownRefresh() {
    this.loadChampionDetail(Number(this.data.championId)).then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载英雄详情
  async loadChampionDetail(id) {
    this.setData({ loading: true, error: false })

    try {
      const data = await cloud.getChampionDetail({ champion_id: Number(id) })
      this._processDetail(data)
      this.setData({ loading: false })
    } catch (err) {
      console.error('[英雄详情] 加载失败:', err)
      this.setData({ loading: false, error: true })
    }
  },

  // 处理详情数据
  _processDetail(data) {
    const { champion, augments, items, augment_items_linkage } = data

    // 处理英雄基础数据
    const processedChampion = {
      ...champion,
      icon_url: image.resolveImageUrl(champion.icon_url),
      win_rate_display: formatWinRate(champion.win_rate),
      pick_rate_display: formatPickRate(champion.pick_rate),
      sample_display: formatSampleSize(champion.sample_size || 0),
      roles_colored: (champion.roles || []).map(r => ({
        name: r,
        color: ROLE_COLORS[r] || '#1890ff'
      }))
    }

    // 处理海克斯数据
    const augmentsByRarity = { prismatic: [], gold: [], silver: [] }
    if (augments && augments.length > 0) {
      augments.forEach(a => {
        const processed = {
          ...a,
          icon_url: image.resolveImageUrl(a.icon_url),
          win_rate_display: formatWinRate(a.win_rate),
          pick_rate_display: formatPickRate(a.pick_rate),
          sample_display: formatSampleSize(a.sample_size || 0),
          win_rate_value: a.win_rate < 1 ? a.win_rate * 100 : a.win_rate,
          rarity_label: RARITY_LABELS[a.rarity] || a.rarity,
          rarity_icon: RARITY_ICONS[a.rarity] || ''
        }
        const rarity = a.rarity || 'silver'
        if (augmentsByRarity[rarity]) {
          augmentsByRarity[rarity].push(processed)
        }
      })
    }

    // 处理装备数据
    const itemsBySlot = { core: [], boots: [], full_build: [] }
    if (items && items.length > 0) {
      items.forEach(item => {
        const processed = {
          ...item,
          icon_url: image.resolveImageUrl(item.icon_url),
          win_rate_display: formatWinRate(item.win_rate),
          pick_rate_display: formatPickRate(item.pick_rate),
          sample_display: formatSampleSize(item.sample_size || 0),
          slot_label: ITEM_SLOT_LABELS[item.slot] || item.slot
        }
        const slot = item.slot || 'core'
        if (itemsBySlot[slot]) {
          itemsBySlot[slot].push(processed)
        }
      })
    }

    // 默认排序：按胜率降序
    Object.keys(augmentsByRarity).forEach(key => {
      augmentsByRarity[key].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
    })
    Object.keys(itemsBySlot).forEach(key => {
      itemsBySlot[key].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
    })

    const activeRarity = augmentsByRarity.prismatic.length > 0 ? 'prismatic' :
      augmentsByRarity.gold.length > 0 ? 'gold' : 'silver'

    this.setData({
      champion: processedChampion,
      augmentsPrismatic: augmentsByRarity.prismatic,
      augmentsGold: augmentsByRarity.gold,
      augmentsSilver: augmentsByRarity.silver,
      filteredAugments: augmentsByRarity[activeRarity],
      activeRarity,
      itemsCore: itemsBySlot.core,
      itemsBoots: itemsBySlot.boots,
      itemsFullBuild: itemsBySlot.full_build,
      augmentItemLinkage: augment_items_linkage || [],
      winRateValue: champion.win_rate < 1 ? champion.win_rate * 100 : champion.win_rate,
      pickRateValue: champion.pick_rate < 1 ? champion.pick_rate * 100 : champion.pick_rate
    })
  },

  // 稀有度 Tab 切换
  onRarityChange(e) {
    const key = e.currentTarget.dataset.key || e.detail.name
    this.setData({ activeRarity: key })
    this._filterAugments(key)
  },

  _filterAugments(rarity) {
    const map = {
      prismatic: this.data.augmentsPrismatic,
      gold: this.data.augmentsGold,
      silver: this.data.augmentsSilver
    }
    this.setData({ filteredAugments: map[rarity] || [] })
  },

  // 海克斯点击
  onAugmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/augment-detail/augment-detail?id=${id}` })
  },

  // 装备点击
  onItemTap(e) {
    const { id } = e.currentTarget.dataset
    // 装备暂时无详情页，可以展示 popup 或 toast
    wx.showToast({ title: '装备详情开发中', icon: 'none' })
  }
})
