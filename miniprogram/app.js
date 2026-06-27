// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // 请将下方 env 替换为你在云开发控制台创建的实际环境 ID
      wx.cloud.init({
        env: 'cloud1-2g93qld9789eb02d',
        traceUser: true
      })
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo
    this.globalData.statusBarHeight = systemInfo.statusBarHeight
    this.globalData.navBarHeight = 44
  },

  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    currentPatch: null,
    userInfo: null
  }
})
