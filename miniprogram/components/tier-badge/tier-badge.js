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
    }
  },

  data: {
    tierConfig: {
      S: { color: '#FF4D4F', bg: '#fff1f0', label: 'S' },
      A: { color: '#FA8C16', bg: '#fff7e6', label: 'A' },
      B: { color: '#FADB14', bg: '#fffbe6', label: 'B', textColor: '#595959' },
      C: { color: '#52C41A', bg: '#f6ffed', label: 'C' },
      D: { color: '#8C8C8C', bg: '#fafafa', label: 'D' }
    }
  },

  methods: {}
})
