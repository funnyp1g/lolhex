#!/usr/bin/env node
/**
 * LOL 海克斯大乱斗数据源连通性诊断脚本
 * 运行方式: node diagnose-data-source.js
 *
 * 功能：测试所有数据源的可达性，找出请求失败的原因
 */

const axios = require('axios')
const https = require('https')
const dns = require('dns')

console.log('=== LOL 海克斯大乱斗数据源连通性诊断 ===\n')
console.log('运行时间:', new Date().toLocaleString('zh-CN'))
console.log('\n')

// ========== 数据源配置 ==========
const DATA_SOURCES = {
  // 静态数据源
  'Community Dragon (英雄)': {
    url: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
    timeout: 10000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  },
  'Community Dragon (装备)': {
    url: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json',
    timeout: 10000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  },
  'Community Dragon (海克斯)': {
    url: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json',
    timeout: 10000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  },
  'aramgg.com (海克斯中文)': {
    url: 'https://aramgg.com/data/aram-mayhem-augments.zh_cn.json',
    timeout: 10000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  },

  // 中文数据源（可能不可达）
  'Riot 中国 CDN (英雄)': {
    url: 'https://leagueoflegends.leagueoflegends.com.cn/loln-od/zh_CN/26.12/data/champion.json',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://lol.qq.com/'
    }
  },
  'Data Dragon (英雄)': {
    url: 'https://ddragon.leagueoflegends.com/cdn/26.12/data/zh_CN/champion.json',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://lol.qq.com/'
    }
  },

  // 统计数据源
  'iesdev API (英雄1统计)': {
    url: 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=1',
    timeout: 15000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' },
    dnsOverride: '84.17.37.217'  // 绕过 DNS 污染
  }
}

// ========== DNS 解析测试 ==========
async function testDNSResolution(hostname) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'DNS解析超时(5秒)' })
    }, 5000)

    dns.lookup(hostname, (err, address, family) => {
      clearTimeout(timeout)
      if (err) {
        resolve({ success: false, error: err.message })
      } else {
        resolve({ success: true, address, family })
      }
    })
  })
}

// ========== HTTP 请求测试 ==========
async function testHTTPRequest(name, config) {
  const result = {
    name,
    url: config.url,
    success: false,
    status: null,
    dataSize: null,
    error: null,
    time: null
  }

  const startTime = Date.now()

  try {
    // DNS 绕过（如果配置了）
    let axiosConfig = {
      method: 'GET',
      url: config.url,
      headers: config.headers,
      timeout: config.timeout,
      responseType: 'json'
    }

    // 自定义 DNS 解析（iesdev）
    if (config.dnsOverride) {
      // 创建自定义 HTTPS Agent
      const customAgent = new https.Agent({
        lookup: (hostname, options, callback) => {
          if (hostname === 'data.v2.iesdev.com') {
            callback(null, config.dnsOverride, 4)
          } else {
            dns.lookup(hostname, options, callback)
          }
        }
      })
      axiosConfig.httpsAgent = customAgent
    }

    const response = await axios(axiosConfig)

    result.success = true
    result.status = response.status
    result.dataSize = JSON.stringify(response.data).length
    result.time = Date.now() - startTime

    // 检查数据结构
    if (response.data) {
      if (Array.isArray(response.data)) {
        result.dataType = `Array[${response.data.length}]`
      } else if (typeof response.data === 'object') {
        const keys = Object.keys(response.data)
        result.dataType = `Object{${keys.slice(0, 3).join(',')}...}`
      }
    }

  } catch (err) {
    result.time = Date.now() - startTime
    result.error = err.message

    if (err.response) {
      result.status = err.response.status
      result.errorDetail = err.response.data
    }

    if (err.code) {
      result.errorCode = err.code
    }
  }

  return result
}

// ========== 主测试流程 ==========
async function runDiagnosis() {
  console.log('=== 1. DNS 解析测试 ===\n')

  const dnsTests = await Promise.all([
    testDNSResolution('raw.communitydragon.org'),
    testDNSResolution('aramgg.com'),
    testDNSResolution('data.v2.iesdev.com'),
    testDNSResolution('leagueoflegends.leagueoflegends.com.cn'),
    testDNSResolution('ddragon.leagueoflegends.com')
  ])

  dnsTests.forEach((test, i) => {
    const hostname = ['raw.communitydragon.org', 'aramgg.com', 'data.v2.iesdev.com', 'leagueoflegends.leagueoflegends.com.cn', 'ddragon.leagueoflegends.com'][i]
    const status = test.success ? '✅' : '❌'
    const info = test.success ? `${test.address} (IPv${test.family})` : test.error
    console.log(`${status} ${hostname}: ${info}`)
  })

  console.log('\n=== 2. HTTP 请求测试 ===\n')

  const httpTests = []
  for (const [name, config] of Object.entries(DATA_SOURCES)) {
    console.log(`正在测试: ${name}...`)
    const result = await testHTTPRequest(name, config)
    httpTests.push(result)

    const status = result.success ? '✅' : '❌'
    const info = result.success
      ? `HTTP ${result.status} | ${result.dataSize} bytes | ${result.time}ms | ${result.dataType}`
      : `HTTP ${result.status || 'N/A'} | ${result.error}`
    console.log(`${status} ${name}: ${info}`)
    console.log(`   URL: ${result.url}`)
    if (!result.success && result.errorDetail) {
      console.log(`   错误详情: ${JSON.stringify(result.errorDetail).substring(0, 100)}`)
    }
    console.log('')
  }

  console.log('\n=== 3. 诊断总结 ===\n')

  const successCount = httpTests.filter(t => t.success).length
  const failCount = httpTests.filter(t => !t.success).length

  console.log(`成功: ${successCount}/${httpTests.length}`)
  console.log(`失败: ${failCount}/${httpTests.length}`)

  if (failCount > 0) {
    console.log('\n失败原因分析:')
    httpTests.filter(t => !t.success).forEach(t => {
      console.log(`\n❌ ${t.name}`)
      console.log(`   错误: ${t.error}`)
      if (t.errorCode) {
        console.log(`   错误码: ${t.errorCode}`)
        // 错误码解释
        const explanations = {
          'ENOTFOUND': 'DNS解析失败 - 域名不存在或DNS服务器无法解析',
          'ETIMEDOUT': '连接超时 - 目标服务器无响应或网络不通',
          'ECONNREFUSED': '连接被拒绝 - 目标服务器拒绝连接',
          'ECONNRESET': '连接重置 - 连接被服务器强制关闭',
          'CERT_HAS_EXPIRED': 'SSL证书过期 - HTTPS证书已失效',
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE': 'SSL验证失败 - 无法验证证书签名'
        }
        if (explanations[t.errorCode]) {
          console.log(`   解释: ${explanations[t.errorCode]}`)
        }
      }
    })
  }

  console.log('\n=== 4. 推荐数据源配置 ===\n')

  const workingSources = httpTests.filter(t => t.success)
  console.log('可用数据源:')
  workingSources.forEach(t => {
    console.log(`✅ ${t.name} (${t.time}ms)`)
  })

  console.log('\n不可用数据源（需要移除或替换）:')
  httpTests.filter(t => !t.success).forEach(t => {
    console.log(`❌ ${t.name} - ${t.error}`)
  })

  // 特殊提示：iesdev DNS 污染
  const iesdevTest = httpTests.find(t => t.name.includes('iesdev'))
  if (iesdevTest && !iesdevTest.success) {
    console.log('\n⚠️ iesdev API 特别说明:')
    console.log('   iesdev API 存在 DNS 污染问题（被解析到 127.0.0.1）')
    console.log('   云函数需要使用 DNS 绕过代码，强制解析到真实IP: 84.17.37.217')
    console.log('   请检查云函数 statsDataSync/index.js 中的 dns.lookup 覆盖代码是否生效')
  }
}

// ========== 执行诊断 ==========
runDiagnosis().catch(err => {
  console.error('诊断脚本执行失败:', err)
  process.exit(1)
})