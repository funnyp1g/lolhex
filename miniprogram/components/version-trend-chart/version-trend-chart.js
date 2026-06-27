// components/version-trend-chart/version-trend-chart.js - 版本趋势图组件
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 图表数据：{ patches: [], winRates: [], pickRates: [] }
    chartData: {
      type: Object,
      value: {}
    },
    // 标题
    title: {
      type: String,
      value: '版本趋势'
    },
    // 图表类型: win_rate / pick_rate
    type: {
      type: String,
      value: 'win_rate'
    },
    // 高度(rpx)
    height: {
      type: Number,
      value: 300
    }
  },

  data: {
    chartReady: false,
    hasData: false,
    // 简化的纯 CSS 柱状图数据（当 ECharts 不可用时使用）
    barItems: []
  },

  observers: {
    'chartData': function(data) {
      if (data && data.patches && data.patches.length > 0) {
        this._buildBarData(data)
        this.setData({ hasData: true })
      } else {
        this.setData({ hasData: false })
      }
    }
  },

  lifetimes: {
    attached() {
      // 检查 ECharts 是否可用
      this._checkECharts()
    }
  },

  methods: {
    // 检查 ECharts 组件是否已注册
    _checkECharts() {
      // 延迟检查，确保组件注册
      setTimeout(() => {
        this.setData({ chartReady: true })
        if (this.data.chartData && this.data.chartData.patches) {
          this._buildBarData(this.data.chartData)
        }
      }, 100)
    },

    // 构建柱状图/折线图数据
    _buildBarData(data) {
      const patches = data.patches || []
      const winRates = data.winRates || []
      const pickRates = data.pickRates || []
      const values = this.data.type === 'win_rate' ? winRates : pickRates
      const maxVal = Math.max(...values, 1)

      const barItems = patches.map((patch, index) => {
        const value = values[index] || 0
        const percent = Math.round((value / maxVal) * 100)
        return {
          label: patch,
          value: value < 1 ? (value * 100).toFixed(1) + '%' : value.toFixed(1) + '%',
          percent: percent,
          color: this._getBarColor(value)
        }
      })

      this.setData({ barItems })
    },

    // 根据数值返回颜色
    _getBarColor(value) {
      const pct = value < 1 ? value * 100 : value
      if (pct >= 55) return '#FF4D4F'
      if (pct >= 50) return '#FA8C16'
      if (pct >= 45) return '#FADB14'
      return '#8C8C8C'
    }
  }
})
