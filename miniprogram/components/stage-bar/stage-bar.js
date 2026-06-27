// components/stage-bar/stage-bar.js
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    stages: { type: Object, value: {} },
    title: { type: String, value: '各阶段表现' }
  },
  data: {
    stageLabels: { 3: 'Lv.3', 7: 'Lv.7', 11: 'Lv.11', 15: 'Lv.15' },
    stageOrder: [3, 7, 11, 15]
  },
  methods: {
    getBarHeight(winRate) {
      const minH = 8
      const maxH = 120
      const pct = Math.max(0, Math.min(100, winRate || 0))
      return minH + (pct / 100) * (maxH - minH)
    },
    getBarColor(winRate) {
      if (winRate >= 55) return 'linear-gradient(180deg, #FF4D4F, #FF7875)'
      if (winRate >= 50) return 'linear-gradient(180deg, #FA8C16, #FFC069)'
      if (winRate >= 45) return 'linear-gradient(180deg, #FADB14, #FFF566)'
      return 'linear-gradient(180deg, #8C8C8C, #BFBFBF)'
    }
  }
})
