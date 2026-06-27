// components/rate-bar/rate-bar.js - 胜率/选取率进度条组件
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 进度条数值 (0-100)
    value: {
      type: Number,
      value: 0
    },
    // 标签文字
    label: {
      type: String,
      value: ''
    },
    // 是否显示标签
    showLabel: {
      type: Boolean,
      value: true
    },
    // 是否显示数值
    showValue: {
      type: Boolean,
      value: true
    },
    // 进度条尺寸: normal (4px) / large (6px)
    size: {
      type: String,
      value: 'normal'
    },
    // 颜色模式: gradient 按值变色 / fixed 固定色
    colorMode: {
      type: String,
      value: 'gradient'
    },
    // 固定颜色（colorMode='fixed' 时）
    fixedColor: {
      type: String,
      value: '#1890FF'
    },
    // 数值后缀
    suffix: {
      type: String,
      value: '%'
    },
    // 类型: win_rate / pick_rate
    type: {
      type: String,
      value: 'win_rate'
    }
  },

  data: {
    barColor: '#1890FF',
    barEndColor: '#40a9ff'
  },

  observers: {
    'value, colorMode, fixedColor, type': function(value, colorMode, fixedColor, type) {
      if (colorMode === 'fixed') {
        this.setData({ barColor: fixedColor, barEndColor: fixedColor })
      } else {
        const colors = this._getBarColor(value, type)
        this.setData({ barColor: colors.start, barEndColor: colors.end })
      }
    }
  },

  methods: {
    // 根据数值和类型计算颜色
    _getBarColor(value, type) {
      if (type === 'pick_rate') {
        // 选取率：蓝色渐变
        return { start: '#1890FF', end: '#69C0FF' }
      }
      // 胜率：按区间变色
      if (value >= 55) return { start: '#FF4D4F', end: '#FF7875' }
      if (value >= 50) return { start: '#FA8C16', end: '#FFC069' }
      if (value >= 45) return { start: '#FADB14', end: '#FFF566' }
      return { start: '#8C8C8C', end: '#BFBFBF' }
    }
  }
})
