// components/item-card/item-card.js - 装备卡片组件
const { ITEM_SLOT_LABELS } = require('../../utils/constants')
const { formatPercent } = require('../../utils/format')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    item: {
      type: Object,
      value: {}
    },
    showSlot: {
      type: Boolean,
      value: true
    },
    size: {
      type: String,
      value: 'normal'
    },
    showDetail: {
      type: Boolean,
      value: false
    }
  },

  data: {
    slotLabel: '',
    detailVisible: false,
    winRateDisplay: '',
    pickRateDisplay: '',
    hasWinRate: false,
    hasPickRate: false
  },

  observers: {
    'item.slot': function(slot) {
      this.setData({
        slotLabel: ITEM_SLOT_LABELS[slot] || slot
      })
    },
    'item.win_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasWinRate: has,
        winRateDisplay: has ? formatPercent(val) : ''
      })
    },
    'item.pick_rate': function(val) {
      const has = val !== null && val !== undefined
      this.setData({
        hasPickRate: has,
        pickRateDisplay: has ? formatPercent(val) : ''
      })
    }
  },

  methods: {
    onTap() {
      if (this.data.showDetail) {
        this.setData({ detailVisible: true })
        return
      }
      const item = this.data.item
      const id = item._id || item.item_id
      this.triggerEvent('click', { itemId: id, item: item })
    },

    onCloseDetail() {
      this.setData({ detailVisible: false })
    },

    preventBubble() {}
  }
})
