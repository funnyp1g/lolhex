#!/usr/bin/env node
/**
 * 测试修复后的 DNS 绕过代码
 * 验证自定义 HTTPS Agent 是否能正确绕过 iesdev API 的 DNS 污染
 */

const axios = require('axios')
const https = require('https')
const dns = require('dns')

console.log('=== 测试 DNS 绕过修复方案 ===\n')

// ========== 原始方法（失败）==========
console.log('1️⃣ 原始方法: 修改全局 dns.lookup')
console.log('   预期: 失败（DNS污染到127.0.0.1）\n')

async function testOriginalMethod() {
  const dns = require('dns')
  const originalLookup = dns.lookup

  // 尝试修改全局 dns.lookup
  dns.lookup = function(hostname, opts, cb) {
    if (hostname === 'data.v2.iesdev.com') {
      console.log('   dns.lookup 被调用（但这不会影响 axios）')
      if (typeof opts === 'function') { cb = opts; opts = {} }
      cb(null, '84.17.37.217', 4)
    } else {
      originalLookup(hostname, opts, cb)
    }
  }

  try {
    const url = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=1'
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' },
      timeout: 10000
    })
    console.log('   结果: ✅ 成功（意外！）')
    return true
  } catch (err) {
    console.log('   结果: ❌ 失败')
    console.log('   错误:', err.message)
    if (err.code) console.log('   错误码:', err.code)
    return false
  } finally {
    dns.lookup = originalLookup
  }
}

// ========== 修复方法（成功）==========
console.log('2️⃣ 修复方法: 使用自定义 https.Agent')
console.log('   预期: 成功（强制解析到真实IP）\n')

async function testFixedMethod() {
  // 创建自定义 HTTPS Agent
  const customAgent = new https.Agent({
    lookup: (hostname, options, callback) => {
      if (hostname === 'data.v2.iesdev.com') {
        console.log('   ✅ 自定义 lookup 生效！')
        console.log('   DNS绕过: data.v2.iesdev.com → 84.17.37.217')
        callback(null, '84.17.37.217', 4)
      } else {
        dns.lookup(hostname, options, callback)
      }
    },
    keepAlive: true,
    timeout: 10000
  })

  try {
    const url = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=1'
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' },
      timeout: 10000,
      httpsAgent: customAgent  // 关键：使用自定义Agent
    })

    console.log('   结果: ✅ 成功')
    console.log('   HTTP状态:', response.status)
    console.log('   数据大小:', JSON.stringify(response.data).length, 'bytes')

    // 检查数据结构
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      const entry = response.data.data[0]
      console.log('   英雄ID:', entry.champion_id)
      console.log('   海克斯数:', Object.keys(entry.data.augments || {}).length)
      console.log('   装备数:', Object.keys(entry.data.items || {}).length)
      console.log('   三组合数:', Object.keys(entry.data.augment_trios || {}).length)
      console.log('   样本量:', entry.data.num_games)
      console.log('   胜率:', Math.round(entry.data.win_rate * 100) + '%')
    }

    return true
  } catch (err) {
    console.log('   结果: ❌ 失败')
    console.log('   错误:', err.message)
    if (err.code) console.log('   错误码:', err.code)
    return false
  } finally {
    customAgent.destroy()
  }
}

// ========== 运行测试 ==========
async function runTests() {
  const result1 = await testOriginalMethod()
  console.log('\n')

  const result2 = await testFixedMethod()
  console.log('\n')

  console.log('=== 测试总结 ===\n')
  console.log('原始方法:', result1 ? '✅ 成功' : '❌ 失败')
  console.log('修复方法:', result2 ? '✅ 成功' : '❌ 失败')

  if (!result1 && result2) {
    console.log('\n✅ 修复方案有效！')
    console.log('   请将 cloudfunctions/statsDataSync/index.js 替换为 index-fix.js')
    console.log('   关键修复: 使用 httpsAgent 参数传入自定义 HTTPS Agent')
  } else if (result1 && result2) {
    console.log('\n⚠️ 两种方法都成功？')
    console.log('   这可能是因为 Node.js 版本差异或环境配置不同')
    console.log('   建议仍然使用修复方法，因为它更可靠')
  } else if (!result1 && !result2) {
    console.log('\n❌ 两种方法都失败！')
    console.log('   可能原因:')
    console.log('   1. 网络环境完全封锁了 iesdev API（即使使用真实IP）')
    console.log('   2. 需要使用其他数据源替代')
    console.log('   3. 需要配置代理服务器')
  }
}

runTests().catch(err => {
  console.error('测试执行失败:', err)
  process.exit(1)
})