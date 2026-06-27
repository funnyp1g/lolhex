// components/loading-skeleton/loading-skeleton.js - 加载骨架屏组件
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 骨架类型: default / augment / champion / item / detail
    type: {
      type: String,
      value: 'default'
    },
    // 行数（default 模式）
    rows: {
      type: Number,
      value: 3
    },
    // 是否显示头像占位
    showAvatar: {
      type: Boolean,
      value: true
    },
    // 是否开启动画
    animated: {
      type: Boolean,
      value: true
    },
    // 重复次数
    count: {
      type: Number,
      value: 3
    }
  },

  data: {
    // 构建循环数组
    loopArr: []
  },

  observers: {
    'count': function(count) {
      const arr = []
      for (let i = 0; i < count; i++) arr.push(i)
      this.setData({ loopArr: arr })
    },
    'rows': function(rows) {
      const arr = []
      for (let i = 0; i < rows; i++) arr.push(i)
      this.setData({ rowArr: arr })
    }
  },

  lifetimes: {
    attached() {
      this._buildArrays()
    }
  },

  methods: {
    _buildArrays() {
      const loopArr = []
      for (let i = 0; i < this.data.count; i++) loopArr.push(i)
      const rowArr = []
      for (let i = 0; i < this.data.rows; i++) rowArr.push(i)
      this.setData({ loopArr, rowArr })
    }
  }
})
