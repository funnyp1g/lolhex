// 最简单的测试云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  console.log('测试云函数运行成功')
  return {
    code: 0,
    message: 'success',
    data: {
      test: 'Hello from statsDataSync',
      timestamp: Date.now()
    }
  }
}