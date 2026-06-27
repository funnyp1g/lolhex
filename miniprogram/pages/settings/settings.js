// pages/settings/settings.js - 设置页
const cache = require('../../utils/cache')
const cloud = require('../../utils/cloud')
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants')

Page({
  data: {
    currentPatch: '',
    cacheSize: '计算中...',
    version: '1.0.0',
    // 设置选项
    enableNotification: true,
    autoRefresh: true,
    // 数据更新时间
    lastUpdateTime: ''
  },

  onLoad() {
    this.loadPatchVersion()
    this.calculateCacheSize()
    this.loadLastUpdateTime()
  },

  onShow() {
    this.calculateCacheSize()
  },

  // 加载版本号
  async loadPatchVersion() {
    try {
      const data = await cloud.getCurrentPatch()
      if (data && data.version) {
        this.setData({ currentPatch: data.version })
      }
    } catch (err) {
      const cached = cache.getCache(CACHE_KEYS.CURRENT_PATCH)
      this.setData({ currentPatch: cached || '--' })
    }
  },

  // 加载最后更新时间
  loadLastUpdateTime() {
    const updateTime = cache.getCache('last_update_time')
    if (updateTime) {
      this.setData({ lastUpdateTime: updateTime })
    }
  },

  // 计算缓存大小
  calculateCacheSize() {
    try {
      const res = wx.getStorageInfoSync()
      const sizeKB = res.currentSize || 0
      if (sizeKB > 1024) {
        this.setData({ cacheSize: (sizeKB / 1024).toFixed(1) + ' MB' })
      } else {
        this.setData({ cacheSize: sizeKB + ' KB' })
      }
    } catch (err) {
      this.setData({ cacheSize: '未知' })
    }
  },

  // 清除缓存
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有本地缓存数据吗？清除后下次加载数据可能需要更长时间。',
      confirmColor: '#1890ff',
      success: (res) => {
        if (res.confirm) {
          cache.clearAllCache()
          this.calculateCacheSize()
          wx.showToast({ title: '缓存已清除', icon: 'success' })
        }
      }
    })
  },

  // 意见反馈
  onFeedback() {
    // 使用微信内置意见反馈按钮（需要在 button 组件中使用）
    // 这里暂时提示
    wx.showModal({
      title: '意见反馈',
      content: '如果您有任何建议或发现问题，请通过以下方式联系我们：\n\n📧 邮箱：feedback@example.com\n\n感谢您的反馈！',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 关于
  onAbout() {
    wx.showModal({
      title: '关于',
      content: `海克斯大乱斗图鉴 v${this.data.version}\n\n一款面向英雄联盟玩家的查询工具，提供海克斯大乱斗（ARAM）模式下的英雄适配海克斯查询、装备推荐和强化组合分析服务。\n\n当前数据版本：${this.data.currentPatch}\n\n数据来源：社区对战数据聚合，每日更新，仅供参考。\n\n本工具非 Riot Games 官方产品。`,
      showCancel: false,
      confirmText: '确定'
    })
  },

  // 数据源说明
  onDataInfo() {
    wx.showModal({
      title: '数据源说明',
      content: `当前版本：${this.data.currentPatch}\n\n统计数据来源于社区对战数据聚合，每日自动更新。\n\n主要数据源：\n· Community Dragon（静态数据）\n· Data Dragon（中文本地化）\n· data.v2.iesdev.com（实时统计）\n· hextech.dtodo.cn（国服数据）\n\n数据仅供参考，与实际游戏数据可能存在偏差。`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 刷新数据
  onRefreshData() {
    wx.showLoading({ title: '刷新中...' })

    // 清除列表缓存，强制重新请求
    cache.removeCache(CACHE_KEYS.CHAMPION_LIST)
    cache.removeCache(CACHE_KEYS.AUGMENT_LIST)
    cache.removeCache(CACHE_KEYS.ITEM_LIST)

    // 记录更新时间
    const now = new Date().toLocaleString('zh-CN')
    cache.setCache('last_update_time', now, 0)

    setTimeout(() => {
      wx.hideLoading()
      this.setData({ lastUpdateTime: now })
      this.calculateCacheSize()
      wx.showToast({ title: '数据已刷新', icon: 'success' })
    }, 1000)
  }
})
