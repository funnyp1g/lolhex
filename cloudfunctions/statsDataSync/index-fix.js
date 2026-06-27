// cloudfunctions/statsDataSync/index.js 修复版本
// 修复：DNS 绕过代码使用自定义 https.Agent
// 替换原有的 fetchFromIesdev 函数

const cloud = require('wx-server-sdk')
const axios = require('axios')
const https = require('https')
const dns = require('dns')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const IESDEV_API = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion'
const IESDEV_REAL_IP = '84.17.37.217'  // iesdev 真实IP（绕过DNS污染）

const BATCH_SIZE = 20
const MIN_SAMPLE_SIZE = 30
const REQUEST_TIMEOUT = 15000
const REQUEST_DELAY = 200
const MAX_CONCURRENT = 5

const TIER_NUM_TO_LETTER = { 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D' }

// ========== 主函数保持不变（省略）==========

// ========== 修复：使用自定义 https.Agent 实现 DNS 绕过 ==========

/**
 * 创建自定义 HTTPS Agent，强制将 iesdev 域名解析到真实 IP
 * 这是正确的方法，可以影响 axios 的 HTTPS 请求
 */
function createCustomHttpsAgent() {
  return new https.Agent({
    // 自定义 lookup 函数
    lookup: (hostname, options, callback) => {
      if (hostname === 'data.v2.iesdev.com') {
        // 强制返回真实IP，绕过DNS污染
        console.log(`[DNS绕过] ${hostname} → ${IESDEV_REAL_IP}`)
        callback(null, IESDEV_REAL_IP, 4)
      } else {
        // 其他域名正常解析
        dns.lookup(hostname, options, callback)
      }
    },
    // 其他Agent配置
    keepAlive: true,
    maxSockets: MAX_CONCURRENT,
    timeout: REQUEST_TIMEOUT
  })
}

/**
 * 从 iesdev API 分批并发获取英雄统计数据（修复版）
 * 使用自定义 HTTPS Agent 实现 DNS 绕过
 */
async function fetchFromIesdev(championIds) {
  console.log('[iesdev] 开始获取统计数据，共', championIds.length, '个英雄')

  // 创建自定义 HTTPS Agent（关键修复）
  const customAgent = createCustomHttpsAgent()

  const results = []
  let successCount = 0
  let failCount = 0

  try {
    // 分批并发请求
    for (let i = 0; i < championIds.length; i += MAX_CONCURRENT) {
      const batch = championIds.slice(i, i + MAX_CONCURRENT)
      console.log(`[iesdev] 批次 ${Math.floor(i/MAX_CONCURRENT)+1}: 处理英雄ID ${batch.join(',')}`)

      const batchResults = await Promise.allSettled(
        batch.map(async (champId) => {
          // 随机延迟，避免触发限流
          await sleep(REQUEST_DELAY * Math.random())

          const url = `${IESDEV_API}?champion_id=${champId}`

          try {
            const response = await axios.get(url, {
              headers: {
                'User-Agent': 'ARAM-Mayhem-Guide/1.0',
                'Accept': 'application/json'
              },
              timeout: REQUEST_TIMEOUT,
              // 关键：使用自定义 HTTPS Agent
              httpsAgent: customAgent
            })

            // 解析响应
            const parsed = parseIesdevResponse(response.data)
            if (parsed) {
              successCount++
              console.log(`[iesdev] 英雄 ${champId} 成功，数据: ${parsed.data.augments.length}海克斯, ${parsed.data.items.length}装备`)
              return parsed
            }
            return null
          } catch (err) {
            failCount++
            console.error(`[iesdev] 英雄 ${champId} 失败:`, err.message)
            throw err
          }
        })
      )

      // 收集成功的结果
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value)
        }
      })

      // 批次间延迟
      if (i + MAX_CONCURRENT < championIds.length) {
        await sleep(REQUEST_DELAY * 2)
      }
    }

    console.log(`[iesdev] 完成: 成功 ${successCount}, 失败 ${failCount}`)

    if (results.length === 0) {
      throw new Error(`iesdev API 未获取到任何数据（全部请求失败）`)
    }

    // 如果成功率低于50%，警告但继续处理
    if (successCount < championIds.length * 0.5) {
      console.warn(`[iesdev] 警告: 成功率仅 ${Math.round(successCount/championIds.length*100)}%，数据可能不完整`)
    }

    return results

  } finally {
    // 销毁 Agent，释放资源
    customAgent.destroy()
  }
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
        const estimatedWinRate = estimateWinRateFromTier(trioTier)
        augment_trios.push({
          augment_ids: ids,
          win_rate: estimatedWinRate,
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

// ========== 工具函数保持不变 ==========

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

// ========== 导出修复后的函数供参考 ==========
module.exports = {
  fetchFromIesdev,
  parseIesdevResponse,
  createCustomHttpsAgent
}