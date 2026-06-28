// utils/cloud.js - Cloud function wrapper

const callFunction = (name, data = {}) => {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '请求失败')
      }
      return res.result.data
    })
    .catch(err => {
      console.error(`[云函数 ${name}] 调用失败:`, err)
      throw err
    })
}

module.exports = {
  getChampionList: (params) => callFunction('championList', params),
  getChampionDetail: (params) => callFunction('championDetail', params),
  getAugmentList: (params) => callFunction('augmentList', params),
  getAugmentDetail: (params) => callFunction('augmentDetail', params),
  search: (params) => callFunction('search', params),
  getTrioRank: (params) => callFunction('trioRank', params),
  getCurrentPatch: () => callFunction('currentPatch'),
  getItemList: (params) => callFunction('itemList', params),
  getChampionRankTable: (params) => callFunction('championRankTable', params),
  getHotCombos: (params) => callFunction('hotCombos', params),
}
