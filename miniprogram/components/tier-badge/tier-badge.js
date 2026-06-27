// components/tier-badge/tier-badge.js - Tier 评级徽章组件
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    // Tier 等级: S / A / B / C / D
    tier: {
      type: String,
      value: ''
    },
    // 尺寸: small (18×16px) / normal (24×20px) / large (32×26px)
    size: {
      type: String,
      value: 'normal'
    },
    // 形状: rect 方形 / round 圆角
    shape: {
      type: String,
      value: 'rect'
    },
    // 模式: 'default' → S/A/B/C/D, 'T' → T1/T2/T3/T4/T5
    mode: {
      type: String,
      value: 'default'
    }
  },

  data: {
    defaultConfig: {
      S: { color: '#FF4D4F', bg: '#fff1f0', label: 'S' },
      A: { color: '#FA8C16', bg: '#fff7e6', label: 'A' },
      B: { color: '#FADB14', bg: '#fffbe6', label: 'B', textColor: '#595959' },
      C: { color: '#52C41A', bg: '#f6ffed', label: 'C' },
      D: { color: '#8C8C8C', bg: '#fafafa', label: 'D' }
    },
    TConfig: {
      T1: { color: '#FF4D4F', bg: '#fff1f0', label: 'T1' },
      T2: { color: '#FA8C16', bg: '#fff7e6', label: 'T2' },
      T3: { color: '#FADB14', bg: '#fffbe6', label: 'T3', textColor: '#595959' },
      T4: { color: '#52C41A', bg: '#f6ffed', label: 'T4' },
      T5: { color: '#8C8C8C', bg: '#fafafa', label: 'T5' }
    },
    currentConfig: {}
  },

  observers: {
    'mode, tier': function(mode, tier) {
      var config = mode === 'T' ? this.data.TConfig : this.data.defaultConfig
      this.setData({ currentConfig: config })
    }
  },

  methods: {}
})
