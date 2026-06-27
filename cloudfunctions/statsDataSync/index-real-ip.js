// cloudfunctions/statsDataSync/index.js - 最终修复版
// 修复：使用真实IP + Host header 绕过DNS污染
// 替换原有的 fetchFromIesdev 函数

const cloud = require('wx-server-sdk')
const https = require('https')
const dns = require('dns')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const IESDEV_REAL_IP = '84.17.37.217'  // iesdev 真实IP
const IESDEV_HOST = 'data.v2.iesdev.com'
const IESDEV_API_PATH = '/api/v1/query_objects/prod/lol/aram_mayhem_champion'

const BATCH_SIZE = 20
const MIN_SAMPLE_SIZE = 30
const REQUEST_TIMEOUT = 15000
const REQUEST_DELAY = 200
const MAX_CONCURRENT = 5

const TIER_NUM_TO_LETTER = { 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D' }

// ========== 主函数省略（保持原有逻辑）==========

// ========== 关键修复：使用原生 https.request 绕过DNS污染 ==========

/**
 * 使用真实IP + Host header 请求 iesdev API
 * 这是唯一可靠的DNS绕过方法
 */
async function fetchFromIesdevRealIp(championIds) {
  console.log('[iesdev] 开始获取统计数据，共', championIds.length, '个英雄')
  console.log('[iesdev] 使用真实IP:', IESDEV_REAL_IP)

  const results = []
  let successCount = 0
  let failCount = 0

  // 分批并发请求
  for (let i = 0; i < championIds.length; i += MAX_CONCURRENT) {
    const batch = championIds.slice(i, i + MAX_CONCURRENT)
    console.log(`[iesdev] 批次 ${Math.floor(i/MAX_CONCURRENT)+1}/${Math.ceil(championIds.length/MAX_CONCURRENT)}: 英雄ID ${batch.slice(0,3).join(',')}...`)

    const batchPromises = batch.map(async (champId) => {
      // 随机延迟
      await sleep(REQUEST_DELAY * Math.random())

      return new Promise((resolve) => {
        const options = {
          hostname: IESDEV_REAL_IP,  // 直接使用真实IP
          port: 443,
          path: `${IESDEV_API_PATH}?champion_id=${champId}`,
          method: 'GET',
          headers: {
            'Host': IESDEV_HOST,  // 关键：设置Host header
            'User-Agent': 'ARAM-Mayhem-Guide/1.0',
            'Accept': 'application/json'
          },
          timeout: REQUEST_TIMEOUT,
          rejectUnauthorized: false  // ⚠️ 必须禁用证书验证（因为用的是IP）
        }

        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const json = JSON.parse(data)
                const parsed = parseIesdevResponse(json)

                if (parsed) {
                  successCount++
                  console.log(`[iesdev] ✅ 英雄 ${champId}: ${parsed.data.augments.length}海克斯, ${parsed.data.items.length}装备, 样本${parsed.data.augments[0]?.sample_size || 0}`)
                  resolve(parsed)
                } else {
                  failCount++
                  console.warn(`[iesdev] ⚠️ 英雄 ${champId}: 解析失败`)
                  resolve(null)
                }
              } catch (e) {
                failCount++
                console.error(`[iesdev] ❌ 英雄 ${champId}: JSON解析失败`)
                resolve(null)
              }
            } else {
              failCount++
              console.error(`[iesdev] ❌ 英雄 ${champId}: HTTP ${res.statusCode}`)
              resolve(null)
            }
          })
        })

        req.on('error', (err) => {
          failCount++
          console.error(`[iesdev] ❌ 英雄 ${champId}: ${err.message}`)
          resolve(null)
        })

        req.on('timeout', () => {
          failCount++
          console.error(`[iesdev] ❌ 英雄 ${champId}: 超时`)
          req.destroy()
          resolve(null)
        })

        req.end()
      })
    })

    // 执行批次
    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach(result => {
      if (result) results.push(result)
    })

    // 批次间延迟
    if (i + MAX_CONCURRENT < championIds.length) {
      await sleep(REQUEST_DELAY * 2)
    }
  }

  console.log(`[iesdev] 完成: 成功 ${successCount}/${championIds.length}, 失败 ${failCount}`)

  if (results.length === 0) {
    throw new Error(`iesdev API 未获取到任何数据（全部${championIds.length}个英雄请求失败）`)
  }

  // 成功率低于50%时警告
  if (successCount < championIds.length * 0.5) {
    console.warn(`[iesdev] ⚠️ 警告: 成功率 ${Math.round(successCount/championIds.length*100)}%，数据可能不完整`)
  }

  return results
}

// ========== 解析函数保持不变 ==========

function parseIesdevResponse(rawResponse) {
  const entries = rawResponse && Array.isArray(rawResponse.data) ? rawResponse.data : []
  if (entries.length === 0) return null

  const entry = entries[0]
  const champId = Number(entry.champion_id)
  const innerData = entry.data || {}

  // 转换 augments
  const augments = []
  if (innerData.augments && typeof innerData.augments === 'object') {
    for (const [augId, augData] of Object.entries(innerData.augments)) {
      augments.push({
        augment_id: Number(augId),
        win_rate: augData.win_rate || 0,
        pick_rate: augData.pick_rate || 0,
        sample_size: augData.num_games || 0,
        tier: TIER_NUM_TO_LETTER[augData.tier] || calculateTier((augData.win_rate || 0) * 100)
      })
    }
  }

  // 转换 items
  const items = []
  if (innerData.items && typeof innerData.items === 'object') {
    for (const [itemId, itemData] of Object.entries(innerData.items)) {
      items.push({
        item_id: Number(itemId),
        win_rate: itemData.win_rate || 0,
        pick_rate: itemData.pick_rate || 0,
        sample_size: itemData.num_games || 0,
        tier: TIER_NUM_TO_LETTER[itemData.tier] || calculateTier((itemData.win_rate || 0) * 100)
      })
    }
  }

  // 转换 augment_trios
  const augment_trios = []
  if (innerData.augment_trios && typeof innerData.augment_trios === 'object') {
    for (const [key, trioData] of Object.entries(innerData.augment_trios)) {
      const ids = key.split(':').map(Number).filter(id => id > 0).sort((a, b) => a - b)
      if (ids.length === 3) {
        const trioTier = TIER_NUM_TO_LETTER[trioData.win_rate_tier] || 'C'
        augment_trios.push({
          augment_ids: ids,
          win_rate: estimateWinRateFromTier(trioTier),
          sample_size: trioData.num_games || 0,
          tier: trioTier
        })
      }
    }
  }

  return {
    champion_id: champId,
    data: { augments, items, augment_trios }
  }
}

// ========== 工具函数 ==========

function calculateTier(winRate) {
  if (winRate >= 55) return 'S'
  if (winRate >= 50) return 'A'
  if (winRate >= 45) return 'B'
  if (winRate >= 40) return 'C'
  return 'D'
}

function estimateWinRateFromTier(tier) {
  const estimates = { S: 57, A: 52, B: 48, C: 44, D: 40 }
  return (estimates[tier] || 45) / 100
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ========== 导出 ==========
module.exports = {
  fetchFromIesdevRealIp,
  parseIesdevResponse
}