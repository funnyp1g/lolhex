// cloudfunctions/currentPatch/index.js
// 当前版本信息查询云函数
// 功能：获取当前数据版本号及状态信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const res = await db.collection('patches')
      .where({ is_current: true })
      .limit(1)
      .get()

    if (res.data.length === 0) {
      return { code: 1003, data: null, message: '版本数据未初始化，请先执行 staticDataSync' }
    }

    return {
      code: 0,
      message: 'success',
      data: res.data[0]
    }
  } catch (err) {
    console.error('[currentPatch] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
