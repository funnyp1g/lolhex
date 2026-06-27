// 最简单的测试云函数 - 验证上传是否正常
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  console.log('[statsDataSync] 测试版本运行成功')

  try {
    // 获取当前版本（验证数据库连接）
    const patchRes = await db.collection('patches')
      .where({ is_current: true })
      .limit(1)
      .get()

    console.log('[statsDataSync] 数据库连接正常，找到版本:', patchRes.data.length)

    return {
      code: 0,
      message: '测试版本运行成功',
      data: {
        patches_found: patchRes.data.length,
        timestamp: Date.now()
      }
    }
  } catch (err) {
    console.error('[statsDataSync] 错误:', err.message)
    return {
      code: 1000,
      message: err.message,
      data: null
    }
  }
}