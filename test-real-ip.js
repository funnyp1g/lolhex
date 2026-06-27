#!/usr/bin/env node
/**
 * 使用原生 https.request 测试 iesdev API
 * 避免 axios 的潜在问题，直接使用 Node.js 内置模块
 */

const https = require('https')
const dns = require('dns')

console.log('=== 使用原生 https.request 测试 ===\n')

// ========== 方法1: 直接请求（失败）==========
console.log('1️⃣ 直接请求 data.v2.iesdev.com（DNS污染）\n')

async function testDirectRequest() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'data.v2.iesdev.com',
      port: 443,
      path: '/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=1',
      method: 'GET',
      headers: {
        'User-Agent': 'ARAM-Mayhem-Guide/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    }

    console.log('   DNS解析中...')
    dns.lookup('data.v2.iesdev.com', (err, address) => {
      if (err) {
        console.log('   DNS解析失败:', err.message)
      } else {
        console.log('   DNS解析结果:', address)
      }
    })

    const req = https.request(options, (res) => {
      console.log('   HTTP状态:', res.statusCode)

      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('   ✅ 成功，数据大小:', data.length)
          try {
            const json = JSON.parse(data)
            console.log('   数据验证: ✅ JSON有效')
            resolve(true)
          } catch (e) {
            console.log('   数据验证: ❌ JSON无效')
            resolve(false)
          }
        } else {
          console.log('   ❌ HTTP错误:', res.statusCode)
          console.log('   响应:', data.substring(0, 100))
          resolve(false)
        }
      })
    })

    req.on('error', (err) => {
      console.log('   ❌ 请求失败:', err.message)
      console.log('   错误码:', err.code)
      resolve(false)
    })

    req.on('timeout', () => {
      console.log('   ❌ 超时')
      req.destroy()
      resolve(false)
    })

    req.end()
  })
}

// ========== 方法2: 使用真实IP + Host header（推荐）==========
console.log('\n2️⃣ 使用真实IP + Host header（绕过DNS）\n')

async function testRealIpRequest() {
  return new Promise((resolve) => {
    const REAL_IP = '84.17.37.217'

    const options = {
      hostname: REAL_IP,  // 直接使用IP地址
      port: 443,
      path: '/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=1',
      method: 'GET',
      headers: {
        'Host': 'data.v2.iesdev.com',  // 关键：设置Host header
        'User-Agent': 'ARAM-Mayhem-Guide/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000,
      // 关键：不验证证书（因为我们用的是IP而不是域名）
      rejectUnauthorized: false  // ⚠️ 安全警告：生产环境需要谨慎
    }

    console.log('   使用真实IP:', REAL_IP)
    console.log('   Host header:', 'data.v2.iesdev.com')

    const req = https.request(options, (res) => {
      console.log('   HTTP状态:', res.statusCode)

      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('   ✅ 成功，数据大小:', data.length)
          try {
            const json = JSON.parse(data)
            console.log('   数据验证: ✅ JSON有效')

            if (json.data && Array.isArray(json.data)) {
              const entry = json.data[0]
              console.log('   英雄ID:', entry.champion_id)
              console.log('   样本量:', entry.data.num_games)
              console.log('   胜率:', Math.round(entry.data.win_rate * 100) + '%')
              console.log('   海克斯数:', Object.keys(entry.data.augments || {}).length)
              console.log('   装备数:', Object.keys(entry.data.items || {}).length)
            }

            resolve(true)
          } catch (e) {
            console.log('   数据验证: ❌ JSON无效:', e.message)
            resolve(false)
          }
        } else {
          console.log('   ❌ HTTP错误:', res.statusCode)
          console.log('   响应:', data.substring(0, 200))
          resolve(false)
        }
      })
    })

    req.on('error', (err) => {
      console.log('   ❌ 请求失败:', err.message)
      console.log('   错误码:', err.code)
      resolve(false)
    })

    req.on('timeout', () => {
      console.log('   ❌ 超时')
      req.destroy()
      resolve(false)
    })

    req.end()
  })
}

// ========== 运行测试 ==========
async function runTests() {
  const result1 = await testDirectRequest()
  console.log('\n')

  const result2 = await testRealIpRequest()
  console.log('\n')

  console.log('=== 测试总结 ===\n')
  console.log('直接请求:', result1 ? '✅ 成功' : '❌ 失败')
  console.log('真实IP请求:', result2 ? '✅ 成功' : '❌ 失败')

  if (!result1 && result2) {
    console.log('\n✅ 真实IP方案有效！')
    console.log('   这是最可靠的DNS绕过方法')
    console.log('   云函数修复方案: 直接使用IP地址 + Host header')
    console.log('   ⚠️ 注意: 需要设置 rejectUnauthorized: false（证书验证问题）')
  } else if (result2) {
    console.log('\n✅ 真实IP方案可用，推荐使用此方法')
  } else {
    console.log('\n❌ 真实IP方案也失败！')
    console.log('   可能原因:')
    console.log('   1. IP地址已失效（iesdev更换了服务器）')
    console.log('   2. 网络防火墙封锁了该IP')
    console.log('   3. 需要使用代理或其他数据源')
    console.log('\n建议:')
    console.log('   使用 aramgg.com 作为替代数据源')
  }
}

runTests().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})