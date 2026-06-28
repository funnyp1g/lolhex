// pages/champion-detail/champion-detail.js - 英雄详情页（最复杂页面）
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_TTL, RARITY_LABELS, RARITY_ICONS, ITEM_SLOT_LABELS, ROLE_COLORS } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatNumber } = require('../../utils/format')

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
    // 当前稀有度过滤后的海克斯（全部，最多5条）
    filteredAugments: [],
    // 实际展示的海克斯（默认3条，展开后全部）
    displayedAugments: [],
    augmentsExpanded: false,
    augmentsTotalCount: 0,
    augmentsRemainingCount: 0,
    // 推荐装备（对齐 aramgg：核心装备 + 鞋子 + 情境装备）
    itemsCore: [],
    itemsBoots: [],
    itemsSituational: [],
    // aramgg builds 数据（1:1 复刻）
    equipmentBuilds: [],
    equipmentPatch: '',
    // 海克斯-装备联动数据
    augmentItemLinkage: [],
    // 状态
    loading: true,
    error: false,
    // 常量引用
    roleColors: ROLE_COLORS,
    // 胜率进度条值
    winRateValue: 0,
    pickRateValue: 0,
    // T级总览卡片
    championTierRank: '',
    championRank: 0,
    totalChampions: 0,
    // 阶段表现（按 augment_id 索引）
    stagePerformanceByAugment: {},
    // 当前选中的海克斯（用于阶段表现联动）
    selectedAugmentId: null,
    selectedAugmentName: ''
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
    const { champion, augments, items, augment_items_linkage, stage_performance } = data

    // 处理英雄基础数据
    const processedChampion = {
      ...champion,
      icon_url: image.resolveImageUrl(champion.icon_url),
      win_rate_display: formatWinRate(champion.win_rate),
      pick_rate_display: formatPickRate(champion.pick_rate),
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
          slot_label: ITEM_SLOT_LABELS[item.slot] || item.slot
        }
        const slot = item.slot || 'core'
        if (itemsBySlot[slot]) {
          itemsBySlot[slot].push(processed)
        }
      })
    }

    // 构建阶段表现映射（按 augment_id 索引，数据来自 championDetail 云函数）
    const stageByAugment = {}
    const stageData = stage_performance || []
    stageData.forEach(s => {
      if (!stageByAugment[s.augment_id]) stageByAugment[s.augment_id] = {}
      stageByAugment[s.augment_id][s.stage] = {
        stage: s.stage,
        win_rate: s.win_rate,
        pick_rate: s.pick_rate,
        sample_size: s.sample_size
      }
    })

    // 默认排序：按胜率降序；限制每个分类的数量
    Object.keys(augmentsByRarity).forEach(key => {
      augmentsByRarity[key].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
    })
    Object.keys(itemsBySlot).forEach(key => {
      itemsBySlot[key].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
    })
    // 处理 aramgg builds 数据（1:1 复刻装备配置）
    const builds = data.builds || []
    const equipmentBuilds = builds.map(build => ({
      tags: build.tags || [],
      games_display: (build.games || 0) >= 1000
        ? (build.games / 1000).toFixed(1) + 'K'
        : String(build.games || 0),
      win_rate_display: formatWinRate(build.winRate),
      pick_rate_display: formatPickRate(build.pickRate),
      coreItems: (build.coreItems || []).map(ci => ({
        items: (ci.itemIds || []).map((id, i) => ({
          id,
          name: (ci.itemNames || [])[i] || '',
          icon_url: image.resolveImageUrl(
            `https://ddragon.leagueoflegends.com/cdn/16.13.1/img/item/${id}.png`
          )
        })),
        win_rate_display: formatWinRate(ci.winRate)
      })),
      startingItems: (build.startingItems || []).map(si =>
        typeof si === 'string' ? { name: si, icon_url: '' } : si
      ),
      situationalItems: (build.situationalItems || []).map(si =>
        typeof si === 'string' ? { name: si, icon_url: '' } : si
      )
    }))

    // 降级逻辑：无builds数据时使用单品数据
    // 对齐 aramgg.com 装备结构：
    const allItemsSorted = Object.values(itemsBySlot).flat().sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
    const itemsCore = allItemsSorted.slice(0, 3)
    const itemsBoots = itemsBySlot.boots.slice(0, 3)
    const coreIds = new Set(itemsCore.map(i => i.item_id || i._id))
    const itemsSituational = allItemsSorted.filter(i => !coreIds.has(i.item_id || i._id)).slice(0, 6)

    const activeRarity = augmentsByRarity.prismatic.length > 0 ? 'prismatic' :
      augmentsByRarity.gold.length > 0 ? 'gold' : 'silver'

    // 自动选中当前稀有度下胜率最高的海克斯（用于阶段表现联动）
    const topAugments = augmentsByRarity[activeRarity]
    const selectedAugmentId = topAugments.length > 0 ? topAugments[0].augment_id : null
    const selectedAugmentName = topAugments.length > 0
      ? (topAugments[0].augment_name_zh || topAugments[0].name_zh || '')
      : ''

    // 计算展示的海克斯（默认3条，最多5条）
    const filteredAll = augmentsByRarity[activeRarity].slice(0, 5)
    const displayed = filteredAll.slice(0, 3)
    const totalCount = filteredAll.length

    this.setData({
      champion: processedChampion,
      championTierRank: champion.tier_rank || '',
      championRank: champion.champion_rank || 0,
      totalChampions: champion.total_champions || 0,
      stagePerformanceByAugment: stageByAugment,
      selectedAugmentId: selectedAugmentId,
      selectedAugmentName: selectedAugmentName,
      augmentsPrismatic: augmentsByRarity.prismatic,
      augmentsGold: augmentsByRarity.gold,
      augmentsSilver: augmentsByRarity.silver,
      filteredAugments: filteredAll,
      displayedAugments: displayed,
      augmentsExpanded: false,
      augmentsTotalCount: totalCount,
      augmentsRemainingCount: Math.max(0, totalCount - 3),
      activeRarity,
      equipmentBuilds: equipmentBuilds,
      equipmentPatch: data.patch_version || '',
      itemsCore: itemsCore,
      itemsBoots: itemsBoots,
      itemsSituational: itemsSituational,
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
    const filtered = (map[rarity] || []).slice(0, 5)
    const displayed = filtered.slice(0, 3)
    // 切换稀有度时自动选中胜率最高的海克斯（用于阶段表现联动）
    const topAugment = filtered.length > 0 ? filtered[0] : null
    this.setData({
      filteredAugments: filtered,
      displayedAugments: displayed,
      augmentsExpanded: false,
      augmentsTotalCount: filtered.length,
      augmentsRemainingCount: Math.max(0, filtered.length - 3),
      selectedAugmentId: topAugment ? topAugment.augment_id : null,
      selectedAugmentName: topAugment ? (topAugment.augment_name_zh || topAugment.name_zh || '') : ''
    })
  },

  // 展开/收起海克斯列表
  onToggleAugments() {
    const { augmentsExpanded, filteredAugments } = this.data
    if (augmentsExpanded) {
      this.setData({
        displayedAugments: filteredAugments.slice(0, 3),
        augmentsExpanded: false
      })
    } else {
      this.setData({
        displayedAugments: filteredAugments,
        augmentsExpanded: true
      })
    }
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
  },

  // 重试
  onRetry() {
    this.loadChampionDetail(Number(this.data.championId))
  }
})
