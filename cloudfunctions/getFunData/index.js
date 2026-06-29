// cloudfunctions/getFunData/index.js
// 代理 hexdata fun_data.json，绕过小程序 request 域名白名单限制
const https = require('https')

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(new Error('JSON parse failed: ' + e.message)) }
      })
    }).on('error', reject)
  })
}

exports.main = async () => {
  try {
    const data = await fetchJSON('https://hexdata.com.cn/data/fun_data.json')
    return { code: 0, data }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
