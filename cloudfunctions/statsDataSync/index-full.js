// cloudfunctions/statsDataSync/index.js
// 统计数据同步云函数（每日凌晨 3:00 定时触发）
// 功能：从多数据源拉取英雄统计数据，清洗后写入云数据库，并更新全局胜率/选取率
// 数据源优先级：
//   1) 主数据源：data.v2.iesdev.com（Blitz.gg 结构化 API）
//   2) 备用源1：aramgg.com（网页抓取）
//   3) 备用源2：arammayhem.com（网页抓取）
//   4) 全部失败：保留云数据库中上次缓存数据，patches 标记为 stale

const cloud = require('wx-server-sdk')
const https = require('https')  // 添加：用于DNS绕过修复
const axios = require('axios')
const cheerio = require('cheerio')  // HTML解析库（用于aramgg.com）

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const IESDEV_API = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion'
// data.v2.iesdev.com 的 DNS 已被污染（解析到 127.0.0.1），需要通过 Cloudflare DNS 获取真实 IP
// 已知真实 CDN IP（通过 nslookup data.v2.iesdev.com 1.1.1.1 获取）
const IESDEV_REAL_IP = '84.17.37.217'
const ARAMGG_BASE = 'https://aramgg.com'
const ARAMMAYHEM_BASE = 'https://arammayhem.com'

const BATCH_SIZE = 20             // 云数据库批量写入上限
const MIN_SAMPLE_SIZE = 30        // 最小样本量过滤阈值
const REQUEST_TIMEOUT = 15000     // 单次请求超时（ms）
const REQUEST_DELAY = 200         // 请求间隔（ms），避免触发限流
const MAX_CONCURRENT = 5          // 最大并发请求数

// iesdev tier 数字 → 字母映射
const TIER_NUM_TO_LETTER = { 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D' }

// ========== 主函数 ==========
exports.main = async (event) => {
  console.log('[statsDataSync] 开始统计数据同步')
  const startTime = Date.now()

  // ⭐ 分批参数: batch_size控制每批同步的英雄数量
  // batch_index控制当前是第几批(从0开始)
  const { batch_size = 30, batch_index = 0 } = event

  try {
    // 1. 获取当前版本
    const patchRes = await db.collection('patches')
      .where({ is_current: true })
      .limit(1)
      .get()

    if (patchRes.data.length === 0) {
      return { code: 1003, data: null, message: '未找到当前版本，请先执行 staticDataSync' }
    }
    const patchVersion = patchRes.data[0].version

    // 2. 获取所有英雄 ID
    const championsRes = await db.collection('champions')
      .where({ patch_version: patchVersion })
      .field({ riot_id: true })
      .get()
    const allChampionIds = championsRes.data.map(c => c.riot_id)

    // ⭐ 分批处理: 只同步当前批次的英雄
    const startIndex = batch_index * batch_size
    const endIndex = Math.min(startIndex + batch_size, allChampionIds.length)
    const championIds = allChampionIds.slice(startIndex, endIndex)

    const totalHeroes = allChampionIds.length
    const currentBatch = batch_index + 1
    const totalBatches = Math.ceil(totalHeroes / batch_size)

    console.log(`[statsDataSync] 版本 ${patchVersion}，共 ${totalHeroes} 个英雄`)
    console.log(`[statsDataSync] 批次 ${currentBatch}/${totalBatches}，处理英雄 ${startIndex+1}-${endIndex} (共${championIds.length}个)`)

    // 标记版本状态为 syncing (仅在第一批时标记)
    if (batch_index === 0) {
      await db.collection('patches').doc(patchVersion).update({
        data: { data_status: 'syncing', updated_at: new Date() }
      }).catch(() => {})
    }

    // 3. 尝试多个数据源（国内源优先，国际源备用）
    let dataSource = 'aramgg'
    let allStats

    // 尝试主数据源：aramgg.com（国内可达，成功率最高）
    try {
      allStats = await fetchFromAramgg(championIds)
      console.log(`[statsDataSync] 主数据源 aramgg 成功，获取 ${allStats.length} 条英雄数据`)
    } catch (primaryErr) {
      console.error(`[statsDataSync] 主数据源 aramgg 失败: ${primaryErr.message}`)
      console.log(`[statsDataSync] 尝试备用数据源1: iesdev API`)

      // 尝试备用源1: iesdev API（国际源，需DNS绕过）
      try {
        dataSource = 'iesdev'
        allStats = await fetchFromIesdev(championIds)
        console.log(`[statsDataSync] 备用源1 iesdev 成功，获取 ${allStats.length} 条英雄数据`)
      } catch (backup1Err) {
        console.error(`[statsDataSync] 备用源1 iesdev 失败: ${backup1Err.message}`)
        console.log(`[statsDataSync] 尝试备用数据源2: arammayhem.com`)

        // 尝试备用源2: arammayhem.com
        try {
          dataSource = 'arammayhem'
          allStats = await fetchFromArammayhem(championIds)
          console.log(`[statsDataSync] 备用源2 arammayhem 成功，获取 ${allStats.length} 条英雄数据`)
        } catch (backup2Err) {
          console.error(`[statsDataSync] 备用源2 arammayhem 失败: ${backup2Err.message}`)

          // 所有数据源都失败
          await db.collection('patches').doc(patchVersion).update({
            data: { data_status: 'stale', updated_at: new Date() }
          }).catch(() => {})

          return {
            code: 2001,
            data: null,
            message: `所有数据源均失败: aramgg(${primaryErr.message}), iesdev(${backup1Err.message}), arammayhem(${backup2Err.message})`
          }
        }
      }
    }

    // 4. 数据清洗
    allStats = cleanStatsData(allStats)
    console.log(`[statsDataSync] 数据清洗完成，有效数据 ${allStats.length} 条`)

    // 5. 写入云数据库
    await writeToDatabase(allStats, patchVersion)

    // 6. 更新英雄全局胜率/选取率
    await updateChampionGlobalStats(allStats, patchVersion)

    // 7. 更新海克斯全局胜率/选取率
    await updateAugmentGlobalStats(allStats, patchVersion)

    // 8. 更新版本状态为 ready
    await db.collection('patches').doc(patchVersion).update({
      data: {
        data_status: 'ready',
        stats_updated_at: new Date(),
        updated_at: new Date()
      }
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[statsDataSync] 同步完成，数据源: ${dataSource}，耗时 ${elapsed}s`)

    return {
      code: 0,
      message: 'success',
      data: {
        patch_version: patchVersion,
        data_source: dataSource,
        champions_synced: allStats.length,
        elapsed_seconds: Number(elapsed)
      }
    }
  } catch (err) {
    console.error('[statsDataSync] 同步异常:', err)
    return { code: 2000, data: null, message: `同步异常: ${err.message}` }
  }
}

// ========== 主数据源：data.v2.iesdev.com ==========

/**
 * iesdev API 真实响应结构：
 * {
 *   "data": [{
 *     "champion_id": "1",         // STRING
 *     "data": {
 *       "augments": { "1002": { num_games, win_rate, pick_rate, tier(1-5数字), rank, total }, ... },
 *       "items": { "1001": { num_games, win_rate, pick_rate, tier, average_index }, ... },
 *       "augment_trios": { "1030:1097:1133": { num_games, pick_rate_tier, win_rate_tier }, ... },
 *       "win_rate": 0.45, "tier": 3, "num_games": 15000
 *     }
 *   }],
 *   "meta": { ... }
 * }
 *
 * 需要转换为内部统一格式：
 * {
 *   champion_id: Number,
 *   data: {
 *     augments: [{ augment_id, win_rate, pick_rate, sample_size, tier }],
 *     items: [{ item_id, win_rate, pick_rate, sample_size, tier }],
 *     augment_trios: [{ augment_ids: [id1,id2,id3], win_rate, sample_size, tier }]
 *   }
 * }
 */

/**
 * 解析 iesdev API 原始响应为内部统一格式
 */
function parseIesdevResponse(rawResponse) {
  // rawResponse = { data: [{ champion_id, data }], meta }
  const entries = rawResponse && Array.isArray(rawResponse.data) ? rawResponse.data : []
  if (entries.length === 0) return null

  const entry = entries[0]
  const champId = Number(entry.champion_id)
  const innerData = entry.data || {}

  // 转换 augments：object → array
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

  // 转换 items：object → array
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

  // 转换 augment_trios：object with "id1:id2:id3" keys → array
  const augment_trios = []
  if (innerData.augment_trios && typeof innerData.augment_trios === 'object') {
    for (const [key, trioData] of Object.entries(innerData.augment_trios)) {
      const ids = key.split(':').map(Number).filter(id => id > 0).sort((a, b) => a - b)
      if (ids.length === 3) {
        // iesdev trio 没有直接 win_rate，只有 tier 排名
        // 根据 win_rate_tier 估算胜率
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

/**
 * 从 iesdev API 分批并发获取英雄统计数据
 * DNS污染修复：使用真实IP + Host header（唯一可靠方法）
 * 原问题：data.v2.iesdev.com 被解析到 127.0.0.1
 * 修复：直接连接真实IP 84.17.37.217 + 设置Host header
 */
async function fetchFromIesdev(championIds) {
  console.log('[iesdev] 开始获取统计数据，共', championIds.length, '个英雄')
  console.log('[iesdev] DNS绕过修复：使用真实IP', IESDEV_REAL_IP)

  const results = []
  let successCount = 0
  let failCount = 0

  // 分批并发请求
  for (let i = 0; i < championIds.length; i += MAX_CONCURRENT) {
    const batch = championIds.slice(i, i + MAX_CONCURRENT)
    console.log(`[iesdev] 批次 ${Math.floor(i/MAX_CONCURRENT)+1}/${Math.ceil(championIds.length/MAX_CONCURRENT)}: 处理英雄ID ${batch.slice(0,3).join(',')}...`)

    const batchPromises = batch.map(async (champId) => {
      await sleep(REQUEST_DELAY * Math.random())

      return new Promise((resolve) => {
        const options = {
          hostname: IESDEV_REAL_IP,
          port: 443,
          path: `/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=${champId}`,
          method: 'GET',
          headers: {
            'Host': 'data.v2.iesdev.com',
            'User-Agent': 'ARAM-Mayhem-Guide/1.0',
            'Accept': 'application/json'
          },
          timeout: REQUEST_TIMEOUT,
          rejectUnauthorized: false
        }

        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const json = JSON.parse(data)
                const parsed = parseIesdevResponse(json)
                if (parsed) {
                  successCount++
                  resolve(parsed)
                } else resolve(null)
              } catch (e) {
                failCount++
                console.error(`[iesdev] 英雄 ${champId} JSON解析失败`)
                resolve(null)
              }
            } else {
              failCount++
              console.error(`[iesdev] 英雄 ${champId} HTTP ${res.statusCode}`)
              resolve(null)
            }
          })
        })

        req.on('error', err => {
          failCount++
          console.error(`[iesdev] 英雄 ${champId} 失败:`, err.message)
          resolve(null)
        })

        req.on('timeout', () => {
          failCount++
          req.destroy()
          resolve(null)
        })

        req.end()
      })
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults.filter(r => r))

    if (i + MAX_CONCURRENT < championIds.length) {
      await sleep(REQUEST_DELAY * 2)
    }
  }

  console.log(`[iesdev] 完成: 成功 ${successCount}/${championIds.length}, 失败 ${failCount}`)

  if (results.length === 0) {
    throw new Error(`iesdev API 未获取到任何数据（全部失败）`)
  }

  return results
}

// ========== 备用源1：aramgg.com 网页抓取（优先源）==========

/**
 * 从 aramgg.com 抓取英雄统计数据（国内可达）
 * 数据嵌入在HTML表格中，使用 cheerio 解析
 * URL: https://aramgg.com/zh-CN/champion-stats/{champion_id}
 *
 * 数据格式：
 * 表格结构：排名 | 强化ID | 层级 | 胜率 | 选取率
 */
async function fetchFromAramgg(championIds) {
  console.log('[aramgg] 开始获取统计数据，共', championIds.length, '个英雄')
  console.log('[aramgg] 使用国内数据源，无需DNS绕过')

  const results = []
  let successCount = 0
  let failCount = 0

  // 逐个获取英雄数据（aramgg.com 响应较慢，不适合并发）
  for (let i = 0; i < championIds.length; i++) {
    const champId = championIds[i]

    console.log(`[aramgg] 进度 ${i + 1}/${championIds.length}: 英雄 ${champId}`)

    try {
      // 请求间隔，避免触发限流（aramgg.com 响应较慢）
      if (i > 0) {
        await sleep(1000 + Math.random() * 500)  // 1-1.5秒间隔
      }

      // 获取HTML
      const url = `https://aramgg.com/zh-CN/champion-stats/${champId}`
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml'
        },
        timeout: REQUEST_TIMEOUT
      })

      // 解析HTML表格
      const cheerio = require('cheerio')
      const $ = cheerio.load(response.data)

      const championAugments = []

      // 查找第一个表格（海克斯推荐表格）
      const table = $('table').first()
      const rows = table.find('tr')

      rows.each((j, row) => {
        if (j === 0) return  // 跳过表头

        const cells = $(row).find('td')
        if (cells.length >= 5) {
          // 表格结构：排名 | 强化ID | 层级 | 胜率 | 选取率
          const augmentIdStr = $(cells[1]).text().trim().replace('#', '')
          const augmentId = Number(augmentIdStr)

          const tierStr = $(cells[2]).text().trim()  // "T1", "T2", etc.
          const tierNum = tierStr.replace('T', '')
          const tier = tierNum === '1' ? 'S' : tierNum === '2' ? 'A' : tierNum === '3' ? 'B' : tierNum === '4' ? 'C' : 'D'

          const winRateStr = $(cells[3]).text().trim().replace('%', '')
          const winRate = parseFloat(winRateStr) / 100

          const pickRateStr = $(cells[4]).text().trim().replace('%', '')
          const pickRate = parseFloat(pickRateStr) / 100

          // 估算样本量（基于选取率）
          const estimatedSampleSize = Math.floor(pickRate * 100000)  // 假设总场次约100,000

          championAugments.push({
            augment_id: augmentId,
            win_rate: winRate,
            pick_rate: pickRate,
            sample_size: estimatedSampleSize,
            tier: tier
          })
        }
      })

      if (championAugments.length > 0) {
        successCount++
        results.push({
          champion_id: champId,
          data: {
            augments: championAugments,
            items: [],  // aramgg.com 不提供装备数据，跳过
            augment_trios: []  // 不提供组合数据
          }
        })
        console.log(`[aramgg] ✅ 英雄 ${champId}: ${championAugments.length} 个海克斯数据`)
      } else {
        failCount++
        console.warn(`[aramgg] ⚠️ 英雄 ${champId}: 无数据`)
      }

    } catch (err) {
      failCount++
      console.error(`[aramgg] ❌ 英雄 ${champId} 失败:`, err.message)
    }
  }

  console.log(`[aramgg] 完成: 成功 ${successCount}/${championIds.length}, 失败 ${failCount}`)

  if (results.length === 0) {
    throw new Error(`aramgg.com 未获取到任何数据（全部失败）`)
  }

  return results
}

// ========== 备用源2：arammayhem.com ==========

/**
 * 从 arammayhem.com 抓取英雄统计数据（备用备用源）
 */

// ========== 备用源2：arammayhem.com 网页抓取 ==========

/**
 * 从 arammayhem.com 抓取统计数据
 */
async function fetchFromArammayhem(championIds) {
  const results = []

  for (const champId of championIds) {
    try {
      await sleep(800 + Math.random() * 500)

      const response = await axios.get(`${ARAMMAYHEM_BASE}/champion/${champId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html'
        },
        timeout: REQUEST_TIMEOUT
      })

      const $ = cheerio.load(response.data)
      const champData = {
        champion_id: champId,
        data: { items: [], augments: [], augment_trios: [] }
      }

      // 解析海克斯表格
      $('table.augments-table tr').each((_, el) => {
        const augmentData = {
          augment_id: parseInt($(el).attr('data-id')) || 0,
          augment_name: $(el).find('td.name').text().trim(),
          win_rate: parseFloat($(el).find('td.winrate').text()) / 100 || 0,
          pick_rate: parseFloat($(el).find('td.pickrate').text()) / 100 || 0,
          tier: $(el).find('td.tier').text().trim()
        }
        if (augmentData.augment_id) champData.data.augments.push(augmentData)
      })

      results.push(champData)
    } catch (err) {
      console.warn(`[arammayhem] 英雄 ${champId} 抓取失败:`, err.message)
    }
  }

  if (results.length === 0) {
    throw new Error('arammayhem.com 抓取未获取到任何数据')
  }

  return results
}

// ========== 数据清洗 ==========

/**
 * 清洗统计数据
 * 1. 移除样本量过小的记录（< MIN_SAMPLE_SIZE）
 * 2. 修正异常胜率（< 10% 或 > 90% 视为异常）
 * 3. 小数胜率统一转为百分比
 * 4. 海克斯三元组按 ID 升序排列
 */
function cleanStatsData(allStats) {
  return allStats.map(champStats => {
    const cleaned = {
      champion_id: champStats.champion_id,
      data: { ...(champStats.data || {}) }
    }

    // 清洗 items
    if (cleaned.data.items) {
      cleaned.data.items = cleaned.data.items
        .filter(item => item && (item.sample_size || 0) >= MIN_SAMPLE_SIZE)
        .map(item => ({
          ...item,
          win_rate: clamp(round2((item.win_rate || 0) * 100), 10, 90),
          pick_rate: round2((item.pick_rate || 0) * 100),
          sample_size: Math.max(0, Math.floor(item.sample_size || 0))
        }))
    }

    // 清洗 augments
    if (cleaned.data.augments) {
      cleaned.data.augments = cleaned.data.augments
        .filter(aug => aug && (aug.sample_size || 0) >= MIN_SAMPLE_SIZE)
        .map(aug => ({
          ...aug,
          win_rate: clamp(round2((aug.win_rate || 0) * 100), 10, 90),
          pick_rate: round2((aug.pick_rate || 0) * 100),
          sample_size: Math.max(0, Math.floor(aug.sample_size || 0))
        }))
    }

    // 清洗 augment_trios
    if (cleaned.data.augment_trios) {
      cleaned.data.augment_trios = cleaned.data.augment_trios
        .filter(trio => trio && (trio.sample_size || 0) >= MIN_SAMPLE_SIZE)
        .map(trio => {
          const ids = (trio.augments || trio.augment_ids || [])
            .map(Number)
            .filter(id => id > 0)
            .sort((a, b) => a - b)
          return {
            ...trio,
            augment_ids: ids,
            win_rate: clamp(round2((trio.win_rate || 0) * 100), 10, 90),
            sample_size: Math.max(0, Math.floor(trio.sample_size || 0))
          }
        })
        .filter(trio => trio.augment_ids.length === 3)
    }

    return cleaned
  })
}

// ========== 数据库写入 ==========

/**
 * 将统计数据拆解并批量写入各集合
 */
async function writeToDatabase(allStats, patchVersion) {
  const championAugmentsBatch = []
  const championItemsBatch = []
  const augmentTriosBatch = []
  const augmentItemsBatch = []

  // 全局 augment×item 聚合（用于 augmentDetail 查 champion_id=null 的全局推荐装备）
  const globalAugmentItems = {} // key: `${augmentId}_${itemId}` => { win_rate_sum, sample_size_sum, count }

  for (const champStats of allStats) {
    const champId = champStats.champion_id

    // champion_augments（英雄×海克斯适配）
    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        if (!aug.augment_id) continue
        championAugmentsBatch.push({
          _id: `${champId}_${aug.augment_id}_${patchVersion}`,
          champion_id: champId,
          augment_id: aug.augment_id,
          win_rate: aug.win_rate,
          pick_rate: aug.pick_rate,
          sample_size: aug.sample_size,
          tier: aug.tier || calculateTier(aug.win_rate),
          patch_version: patchVersion,
          updated_at: new Date()
        })
      }
    }

    // champion_items（英雄×装备推荐）
    if (champStats.data.items) {
      for (const item of champStats.data.items) {
        if (!item.item_id) continue
        championItemsBatch.push({
          _id: `${champId}_${item.item_id}_${patchVersion}`,
          champion_id: champId,
          item_id: item.item_id,
          win_rate: item.win_rate,
          pick_rate: item.pick_rate,
          sample_size: item.sample_size,
          tier: item.tier || calculateTier(item.win_rate),
          is_core: item.tier === 'S' || item.tier === 'A',
          slot: determineSlot(item),
          patch_version: patchVersion,
          updated_at: new Date()
        })
      }
    }

    // augment_trios（三海克斯组合）
    if (champStats.data.augment_trios) {
      for (const trio of champStats.data.augment_trios) {
        const sortedIds = (trio.augment_ids || []).sort((a, b) => a - b)
        if (sortedIds.length !== 3) continue
        augmentTriosBatch.push({
          _id: `${sortedIds.join('_')}_${champId}_${patchVersion}`,
          augment_ids: sortedIds,
          champion_id: champId,
          win_rate: trio.win_rate,
          sample_size: trio.sample_size,
          tier: trio.tier || calculateTier(trio.win_rate),
          patch_version: patchVersion,
          updated_at: new Date()
        })
      }
    }

    // augment_items（海克斯×装备联动）
    // 基于同一英雄下的 augments 和 items 数据，构建海克斯与装备的组合联动记录
    if (champStats.data.augments && champStats.data.items &&
        champStats.data.augments.length > 0 && champStats.data.items.length > 0) {
      for (const aug of champStats.data.augments) {
        if (!aug.augment_id) continue
        for (const item of champStats.data.items) {
          if (!item.item_id) continue
          // 联动记录的胜率取两者胜率的加权平均，样本量取两者最小值
          const comboWinRate = round2((aug.win_rate + item.win_rate) / 2)
          const comboSampleSize = Math.min(aug.sample_size || 0, item.sample_size || 0)
          if (comboSampleSize < MIN_SAMPLE_SIZE) continue

          augmentItemsBatch.push({
            _id: `${champId}_${aug.augment_id}_${item.item_id}_${patchVersion}`,
            champion_id: champId,
            augment_id: aug.augment_id,
            item_id: item.item_id,
            win_rate: clamp(comboWinRate, 10, 90),
            pick_rate: round2((aug.pick_rate + item.pick_rate) / 2),
            sample_size: comboSampleSize,
            tier: calculateTier(comboWinRate),
            patch_version: patchVersion,
            updated_at: new Date()
          })

          // 累加到全局聚合
          const key = `${aug.augment_id}_${item.item_id}`
          if (!globalAugmentItems[key]) {
            globalAugmentItems[key] = {
              augment_id: aug.augment_id,
              item_id: item.item_id,
              totalWeight: 0,
              weightedWinRate: 0,
              totalPickRate: 0
            }
          }
          globalAugmentItems[key].totalWeight += comboSampleSize
          globalAugmentItems[key].weightedWinRate += comboWinRate * comboSampleSize
          globalAugmentItems[key].totalPickRate += (aug.pick_rate + item.pick_rate) / 2
        }
      }
    }
  }

  // 生成全局 augment_items（champion_id = null）
  for (const [key, agg] of Object.entries(globalAugmentItems)) {
    const globalWinRate = agg.totalWeight > 0
      ? round2(agg.weightedWinRate / agg.totalWeight)
      : 0
    const globalPickRate = agg.totalWeight > 0
      ? round2(agg.totalPickRate / agg.totalWeight)
      : 0
    augmentItemsBatch.push({
      _id: `global_${key}_${patchVersion}`,
      champion_id: null,
      augment_id: agg.augment_id,
      item_id: agg.item_id,
      win_rate: clamp(globalWinRate, 10, 90),
      pick_rate: globalPickRate,
      sample_size: agg.totalWeight,
      tier: calculateTier(globalWinRate),
      patch_version: patchVersion,
      updated_at: new Date()
    })
  }

  console.log(`[statsDataSync] 待写入 champion_augments: ${championAugmentsBatch.length} 条`)
  await batchUpsert('champion_augments', championAugmentsBatch)

  console.log(`[statsDataSync] 待写入 champion_items: ${championItemsBatch.length} 条`)
  await batchUpsert('champion_items', championItemsBatch)

  console.log(`[statsDataSync] 待写入 augment_trios: ${augmentTriosBatch.length} 条`)
  await batchUpsert('augment_trios', augmentTriosBatch)

  console.log(`[statsDataSync] 待写入 augment_items: ${augmentItemsBatch.length} 条`)
  await batchUpsert('augment_items', augmentItemsBatch)
}

/**
 * 更新 champions 集合的全局胜率和选取率
 * 全局胜率 = 所有海克斯胜率按样本量加权平均
 */
async function updateChampionGlobalStats(allStats, patchVersion) {
  for (const champStats of allStats) {
    const champId = champStats.champion_id
    let totalWeight = 0
    let weightedWinRate = 0
    let totalPickRate = 0

    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        totalWeight += aug.sample_size
        weightedWinRate += (aug.win_rate || 0) * (aug.sample_size || 0)
        totalPickRate += aug.pick_rate || 0
      }
    }

    const globalWinRate = totalWeight > 0
      ? round2(weightedWinRate / totalWeight)
      : 0

    await db.collection('champions').doc(String(champId)).update({
      data: {
        win_rate: globalWinRate,
        pick_rate: round2(totalPickRate),
        updated_at: new Date()
      }
    }).catch(err => {
      console.warn(`[statsDataSync] 更新英雄 ${champId} 全局数据失败:`, err.message)
    })
  }
}

/**
 * 更新 augments 集合的全局胜率和选取率
 */
async function updateAugmentGlobalStats(allStats, patchVersion) {
  const augmentAgg = {}

  for (const champStats of allStats) {
    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        const id = aug.augment_id
        if (!id) continue
        if (!augmentAgg[id]) {
          augmentAgg[id] = { totalWeight: 0, weightedWinRate: 0, totalPickRate: 0 }
        }
        augmentAgg[id].totalWeight += aug.sample_size || 0
        augmentAgg[id].weightedWinRate += (aug.win_rate || 0) * (aug.sample_size || 0)
        augmentAgg[id].totalPickRate += aug.pick_rate || 0
      }
    }
  }

  for (const [augmentId, agg] of Object.entries(augmentAgg)) {
    const globalWinRate = agg.totalWeight > 0
      ? round2(agg.weightedWinRate / agg.totalWeight)
      : 0

    await db.collection('augments').doc(String(augmentId)).update({
      data: {
        win_rate: globalWinRate,
        pick_rate: round2(agg.totalPickRate),
        updated_at: new Date()
      }
    }).catch(err => {
      console.warn(`[statsDataSync] 更新海克斯 ${augmentId} 全局数据失败:`, err.message)
    })
  }
}

// ========== 工具函数 ==========

/** 根据胜率自动计算 Tier */
function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

/** 根据 Tier 估算胜率（用于 iesdev trio 数据，只有 tier 没有 win_rate） */
function estimateWinRateFromTier(tier) {
  // 基于各 tier 典型胜率中位数估算
  const estimates = { S: 0.65, A: 0.58, B: 0.52, C: 0.47, D: 0.40 }
  return estimates[tier] || 0.50
}

/** 根据数据判断装备槽位 */
function determineSlot(item) {
  const bootIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
  if (bootIds.includes(item.item_id)) return 'boots'
  if (item.tier === 'S' || item.tier === 'A') return 'core'
  return 'full_build'
}

/** 数值钳制 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** 保留两位小数 */
function round2(value) {
  return Math.round(value * 100) / 100
}

/** 批量 upsert */
async function batchUpsert(collectionName, docs, batchSize = BATCH_SIZE) {
  const collection = db.collection(collectionName)
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await Promise.all(batch.map(doc => {
      const { _id, ...data } = doc
      return collection.doc(_id).set({ data })
    }))
  }
}

/** 延迟函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
