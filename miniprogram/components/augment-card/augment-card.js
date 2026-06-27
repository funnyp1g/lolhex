// components/augment-card/augment-card.js - 海克斯卡片组件
const { RARITY_LABELS } = require('../../utils/constants')
const { formatPercent, formatSampleSize } = require('../../utils/format')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 海克斯数据对象
    augment: {
      type: Object,
      value: {}
    },
    // 是否显示描述行
    showDescription: {
      type: Boolean,
      value: false
    },
    // 是否显示胜率条
    showRateBar: {
      type: Boolean,
      value: true
    },
    // 是否显示 Tier 徽章
    showTier: {
      type: Boolean,
      value: true
    },
    // 排名序号（可选）
    rank: {
      type: Number,
      value: 0
    }
  },

  data: {
    rarityLabel: '',
    winRateDisplay: '',
    pickRateDisplay: '',
    sampleDisplay: '',
    winRateValue: 0,
    hasWinRate: false,
    hasPickRate: false,
    hasSample: false
  },

  observers: {
    'augment.rarity': function(rarity) {
      this.setData({ rarityLabel: RARITY_LABELS[rarity] || rarity })
    },
    'augment.win_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasWinRate: has,
        winRateDisplay: has ? formatPercent(val) : '',
        winRateValue: has ? (val < 1 ? val * 100 : val) : 0
      })
    },
    'augment.pick_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasPickRate: has,
        pickRateDisplay: has ? formatPercent(val) : ''
      })
    },
    'augment.sample_size': function(val) {
      const has = val !== null && val !== undefined && val > 0
      this.setData({
        hasSample: has,
        sampleDisplay: has ? formatSampleSize(val) + '场' : ''
      })
    }
  },

  methods: {
    onTap() {
      const aug = this.data.augment
      const id = aug._id || aug.augment_id || aug.riot_id
      this.triggerEvent('click', { augmentId: id, augment: aug })
      if (!this.getBehavior) {
        wx.navigateTo({
          url: `/pages/augment-detail/augment-detail?id=${id}`
        })
      }
    }
  }
})
