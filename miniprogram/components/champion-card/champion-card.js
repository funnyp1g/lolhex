// components/champion-card/champion-card.js - 英雄卡片组件
const { ROLE_COLORS } = require('../../utils/constants')
const { formatPercent } = require('../../utils/format')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    champion: {
      type: Object,
      value: {}
    },
    mode: {
      type: String,
      value: 'list'
    },
    showStats: {
      type: Boolean,
      value: true
    },
    showRateBar: {
      type: Boolean,
      value: false
    },
    showTier: {
      type: Boolean,
      value: false
    },
    rank: {
      type: Number,
      value: 0
    }
  },

  data: {
    roleColors: ROLE_COLORS,
    winRateDisplay: '',
    pickRateDisplay: '',
    winRateValue: 0,
    hasWinRate: false,
    hasPickRate: false
  },

  observers: {
    'champion.win_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasWinRate: has,
        winRateDisplay: has ? formatPercent(val) : '',
        winRateValue: has ? (val < 1 ? val * 100 : val) : 0
      })
    },
    'champion.pick_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasPickRate: has,
        pickRateDisplay: has ? formatPercent(val) : ''
      })
    }
  },

  methods: {
    onTap() {
      const champ = this.data.champion
      const id = champ._id || champ.champion_id || champ.riot_id
      this.triggerEvent('click', { championId: id, champion: champ })
      if (!this.getBehavior) {
        wx.navigateTo({
          url: `/pages/champion-detail/champion-detail?id=${id}`
        })
      }
    }
  }
})
