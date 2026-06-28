// components/rank-table/rank-table.js
var { ROLE_COLORS } = require('../../utils/constants')
var { formatWinRate } = require('../../utils/format')

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    list: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
    hasMore: { type: Boolean, value: true },
    sortBy: { type: String, value: 'win_rate' },
    sortOrder: { type: String, value: 'desc' }
  },

  data: {
    roleColors: ROLE_COLORS,
    columns: [
      { key: 'tier_rank', label: 'T级', width: '60rpx' },
      { key: 'name_zh', label: '英雄', width: '200rpx' },
      { key: 'win_rate', label: '胜率', width: '100rpx', sortable: true },
      { key: 'pick_rate', label: '选取率', width: '100rpx', sortable: true }
    ]
  },

  methods: {
    onRowTap: function (e) {
      var championId = e.currentTarget.dataset.championId
      this.triggerEvent('click', { championId: championId })
    },

    onSortTap: function (e) {
      var key = e.currentTarget.dataset.key
      if (key === 'win_rate' || key === 'pick_rate') {
        var newOrder = this.data.sortBy === key && this.data.sortOrder === 'desc' ? 'asc' : 'desc'
        this.triggerEvent('sort', { sortBy: key, order: newOrder })
      }
    },

    onScrollToLower: function () {
      if (this.data.hasMore && !this.data.loading) {
        this.triggerEvent('loadmore')
      }
    },

    formatWinRate: formatWinRate
  }
})
