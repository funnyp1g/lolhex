// pages/augment-detail/augment-detail.js - 海克斯详情页
const cloud = require('../../utils/cloud')
const cache = require('../../utils/cache')
const image = require('../../utils/image')
const { CACHE_TTL, RARITY_LABELS, RARITY_ICONS } = require('../../utils/constants')
const { formatWinRate, formatPickRate, formatSampleSize, formatNumber } = require('../../utils/format')

Page({
  data: {
    augmentId: '',
    augment: null,
    // 最佳适配英雄 TOP5
    bestChampions: [],
    // 最差适配英雄
    worstChampions: [],
    // 推荐装备
    recommendedItems: [],
    // 版本趋势数据
    trendData: null,
    // 状态
    loading: true,
    error: false,
    // 格式化后的数值
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
    this.setData({ augmentId: id })
    this.loadAugmentDetail(id)
  },

  onPullDownRefresh() {
    this.loadAugmentDetail(Number(this.data.augmentId)).then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载海克斯详情
  async loadAugmentDetail(id) {
    this.setData({ loading: true, error: false })

    try {
      const data = await cloud.getAugmentDetail({ augment_id: Number(id) })
      this._processDetail(data)
      this.setData({ loading: false })
    } catch (err) {
      console.error('[海克斯详情] 加载失败:', err)
      this.setData({ loading: false, error: true })
    }
  },

  // 处理详情数据
  _processDetail(data) {
    const { augment, best_champions, worst_champions, items } = data

    // 处理海克斯基础数据
    const processed = {
      ...augment,
      icon_url: image.resolveImageUrl(augment.icon_url),
      win_rate_display: formatWinRate(augment.win_rate),
      pick_rate_display: formatPickRate(augment.pick_rate),
      sample_display: formatSampleSize(augment.sample_size || 0),
      rarity_label: RARITY_LABELS[augment.rarity] || augment.rarity,
      rarity_icon: RARITY_ICONS[augment.rarity] || ''
    }

    // 处理最佳英雄
    const bestChampions = (best_champions || []).map((c, idx) => ({
      ...c,
      champion_icon: image.resolveImageUrl(c.champion_icon || c.icon_url),
      rank: idx + 1,
      win_rate_display: formatWinRate(c.win_rate),
      sample_display: formatSampleSize(c.sample_size || 0),
      win_rate_value: c.win_rate < 1 ? c.win_rate * 100 : c.win_rate
    }))

    // 处理最差英雄
    const worstChampions = (worst_champions || []).map(c => ({
      ...c,
      champion_icon: image.resolveImageUrl(c.champion_icon || c.icon_url),
      win_rate_display: formatWinRate(c.win_rate),
      sample_display: formatSampleSize(c.sample_size || 0),
      win_rate_value: c.win_rate < 1 ? c.win_rate * 100 : c.win_rate
    }))

    // 处理推荐装备
    const recommendedItems = (items || []).map(item => ({
      ...item,
      icon_url: image.resolveImageUrl(item.icon_url),
      win_rate_display: formatWinRate(item.win_rate),
      sample_display: formatSampleSize(item.sample_size || 0)
    }))

    this.setData({
      augment: processed,
      bestChampions,
      worstChampions,
      recommendedItems,
      winRateValue: augment.win_rate < 1 ? augment.win_rate * 100 : augment.win_rate,
      pickRateValue: augment.pick_rate < 1 ? augment.pick_rate * 100 : augment.pick_rate
    })
  },

  // 英雄点击
  onChampionTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${id}` })
  },

  // 重试
  onRetry() {
    this.loadAugmentDetail(Number(this.data.augmentId))
  }
})
