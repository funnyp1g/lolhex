// cloudfunctions/statsDataSync/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 真实 aramgg 统计数据（从 data-export/*-real.csv 转换）
// 注意: champion_items 数据过大（2.8MB），单独 require 会超云函数 4MB 限制
// champion_items 仅作降级用，hotCombos/championDetail 主装备源已是 champion-builds.js
const REAL_CHAMPION_AUGMENTS = require('./data/real-champion-augments.js')
const REAL_CHAMPION_GLOBALS = require('./data/real-champion-globals.js')
const REAL_AUGMENT_GLOBALS = require('./data/real-augment-globals.js')
const REAL_AUGMENT_TRIOS = require('./data/real-augment-trios.js')
const REAL_CHAMPION_STAGE_PERFORMANCE = require('./data/real-champion-stage-performance.js')

const BATCH_SIZE = 20

exports.main = async (event) => {
  console.log('[statsDataSync] 开始统计数据同步')
  const startTime = Date.now()

  try {
    // 1. 获取当前版本
    const patchRes = await db.collection('patches')
      .where({ is_current: true }).limit(1).get()
    if (patchRes.data.length === 0) {
      return { code: 1002, message: '未找到当前版本，请先执行 staticDataSync', data: null }
    }
    const patchVersion = Number(patchRes.data[0].version)

    // 2. 获取所有英雄 ID
    const championsRes = await db.collection('champions')
      .where({ patch_version: patchVersion }).field({ riot_id: true }).get()
    const championIds = championsRes.data.map(c => c.riot_id)
    console.log(`[statsDataSync] 版本 ${patchVersion}，共 ${championIds.length} 个英雄`)

    // 3. 标记同步开始
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'syncing', updated_at: new Date() } })

    // 4. 加载真实 aramgg 统计数据
    const allStats = loadRealStats(patchVersion)
    console.log(`[statsDataSync] 数据准备完成，有效数据 ${allStats.length} 条`)

    // 5. 写入云数据库
    await writeToDatabase(allStats, patchVersion)

    // 6. 用真实全局聚合数据更新 champions/augments 的 win_rate/pick_rate
    await updateChampionGlobalStatsReal(patchVersion)
    await updateAugmentGlobalStatsReal(patchVersion)

    // 7. 更新版本状态
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'ready', stats_updated_at: new Date(), updated_at: new Date() } })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[statsDataSync] 同步完成，耗时 ${elapsed}s`)
    return { code: 0, message: 'success', data: { patch_version: patchVersion, elapsed_seconds: Number(elapsed) } }
  } catch (err) {
    console.error('[statsDataSync] 同步异常:', err)
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'error', updated_at: new Date() } }).catch(() => {})
    return { code: 2000, message: `同步异常: ${err.message}`, data: null }
  }
}

// 从预编译的 JS 模块加载真实 aramgg 统计数据
// 数据来源: aramgg.com champion-stats + RSC builds (2026-06-27 抓取)
function loadRealStats(patchVersion) {
  const results = []

  // --- champion_augments ---
  REAL_CHAMPION_AUGMENTS.forEach(row => {
    const pv = Number(row.patch_version)
    if (pv !== patchVersion) return
    results.push({
      type: 'champion_augment',
      champion_id: row.champion_id,
      augment_id: row.augment_id,
      win_rate: row.win_rate,
      pick_rate: row.pick_rate,
      sample_size: row.sample_size,
      tier: row.tier,
      patch_version: pv
    })
  })
  console.log(`[loadRealStats] champion_augments: ${results.filter(r => r.type === 'champion_augment').length} 条`)

  // --- champion_items (过大，跳过写入；主装备源为 champion-builds.js) ---
  console.log('[loadRealStats] champion_items: 0 条（跳过，主装备源为 champion-builds.js）')

  // --- augment_items (无真实数据源，跳过) ---
  console.log('[loadRealStats] augment_items: 0 条（无真实数据）')

  // --- augment_trios ---
  REAL_AUGMENT_TRIOS.forEach(row => {
    const pv = Number(row.patch_version)
    if (pv !== patchVersion) return
    // augment_trios CSV 格式: augment_ids 是逗号分隔的 ID 列表字符串
    let augIds = row.augment_ids
    if (typeof augIds === 'string') {
      augIds = augIds.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean)
    }
    // 确保 augment_ids 全部为数字（修复 trioRank 查询时的类型不匹配）
    if (Array.isArray(augIds)) {
      augIds = augIds.map(id => Number(id)).filter(Boolean)
    }
    if (!Array.isArray(augIds) || augIds.length !== 3) return
    results.push({
      type: 'augment_trio',
      augment_ids: augIds,
      champion_id: null,
      win_rate: row.win_rate,
      sample_size: row.sample_size,
      tier: row.tier,
      patch_version: pv
    })
  })
  console.log(`[loadRealStats] augment_trios: ${results.filter(r => r.type === 'augment_trio').length} 条`)

  // --- champion_stage_performance ---
  REAL_CHAMPION_STAGE_PERFORMANCE.forEach(row => {
    const pv = Number(row.patch_version)
    if (pv !== patchVersion) return
    results.push({
      type: 'champion_stage_performance',
      champion_id: row.champion_id,
      augment_id: row.augment_id,
      stage: row.stage,
      win_rate: row.win_rate,
      pick_rate: 0,
      sample_size: row.sample_size,
      patch_version: pv
    })
  })
  console.log(`[loadRealStats] champion_stage_performance: ${results.filter(r => r.type === 'champion_stage_performance').length} 条`)

  return results
}

// 清理当前版本的旧统计数据
async function cleanupOldData(patchVersion) {
  const collections = ['champion_augments', 'champion_items', 'augment_items', 'augment_trios', 'champion_stage_performance']
  const _ = db.command
  for (const col of collections) {
    try {
      // 云数据库 remove 需要先查到所有匹配的文档 ID
      const res = await db.collection(col)
        .where({ patch_version: patchVersion })
        .field({ _id: true })
        .limit(1000)
        .get()
      for (let i = 0; i < res.data.length; i += 20) {
        const batch = res.data.slice(i, i + 20)
        await Promise.all(batch.map(doc =>
          db.collection(col).doc(doc._id).remove().catch(() => {})
        ))
      }
    } catch (err) {
      console.warn(`[cleanupOldData] 清理 ${col} 旧数据失败:`, err.message)
    }
  }
}

async function writeToDatabase(allStats, patchVersion) {
  const championAugments = allStats.filter(r => r.type === 'champion_augment')
  const championItems = allStats.filter(r => r.type === 'champion_item')
  const augmentItems = allStats.filter(r => r.type === 'augment_item')
  const augmentTrios = allStats.filter(r => r.type === 'augment_trio')
  const stagePerfs = allStats.filter(r => r.type === 'champion_stage_performance')

  // 写入 champion_augments
  for (let i = 0; i < championAugments.length; i += BATCH_SIZE) {
    const batch = championAugments.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.augment_id}_${patchVersion}`
      return db.collection('champion_augments').doc(_id).set({
        data: {
          champion_id: doc.champion_id, augment_id: doc.augment_id,
          win_rate: doc.win_rate, pick_rate: doc.pick_rate,
          sample_size: doc.sample_size, tier: doc.tier,
          patch_version: patchVersion, updated_at: new Date()
        }
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_augments 写入 ${championAugments.length} 条`)

  // 写入 champion_items
  for (let i = 0; i < championItems.length; i += BATCH_SIZE) {
    const batch = championItems.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.item_id}_${patchVersion}`
      return db.collection('champion_items').doc(_id).set({
        data: {
          champion_id: doc.champion_id, item_id: doc.item_id,
          win_rate: doc.win_rate, pick_rate: doc.pick_rate,
          sample_size: doc.sample_size, tier: doc.tier,
          is_core: doc.is_core || false, slot: doc.slot || 'core',
          patch_version: patchVersion, updated_at: new Date()
        }
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_items 写入 ${championItems.length} 条`)

  // 写入 augment_items
  for (let i = 0; i < augmentItems.length; i += BATCH_SIZE) {
    const batch = augmentItems.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.augment_id}_${doc.item_id}_null_${patchVersion}`
      return db.collection('augment_items').doc(_id).set({
        data: {
          augment_id: doc.augment_id, champion_id: null, item_id: doc.item_id,
          win_rate: doc.win_rate, pick_rate: doc.pick_rate,
          sample_size: doc.sample_size, tier: doc.tier,
          patch_version: patchVersion, updated_at: new Date()
        }
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] augment_items 写入 ${augmentItems.length} 条`)

  // 写入 augment_trios
  for (let i = 0; i < augmentTrios.length; i += BATCH_SIZE) {
    const batch = augmentTrios.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const ids = doc.augment_ids
      const _id = `${ids[0]}_${ids[1]}_${ids[2]}_null_${patchVersion}`
      return db.collection('augment_trios').doc(_id).set({
        data: {
          augment_ids: ids, champion_id: null,
          win_rate: doc.win_rate, sample_size: doc.sample_size, tier: doc.tier,
          patch_version: patchVersion, updated_at: new Date()
        }
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] augment_trios 写入 ${augmentTrios.length} 条`)

  // 写入 champion_stage_performance（新增）
  for (let i = 0; i < stagePerfs.length; i += BATCH_SIZE) {
    const batch = stagePerfs.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.augment_id}_${doc.stage}_${patchVersion}`
      return db.collection('champion_stage_performance').doc(_id).set({
        data: {
          champion_id: doc.champion_id, augment_id: doc.augment_id,
          stage: doc.stage, win_rate: doc.win_rate, pick_rate: doc.pick_rate,
          sample_size: doc.sample_size, patch_version: patchVersion, updated_at: new Date()
        }
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_stage_performance 写入 ${stagePerfs.length} 条`)
}

// 用真实全局聚合数据更新 champions 集合的 win_rate/pick_rate
async function updateChampionGlobalStatsReal(patchVersion) {
  console.log('[statsDataSync] 更新 champion 全局统计...')
  let updated = 0
  for (const row of REAL_CHAMPION_GLOBALS) {
    const pv = Number(row.patch_version)
    if (pv !== patchVersion) continue
    const championId = String(row.riot_id)
    await db.collection('champions').doc(championId).update({
      data: {
        win_rate: row.win_rate,
        pick_rate: row.pick_rate,
        sample_size: row.num_games || row.sample_size || 0,
        updated_at: new Date()
      }
    }).then(() => { updated++ }).catch(() => {})
  }
  console.log(`[statsDataSync] champions 全局统计更新 ${updated} 条`)
}

// 用真实全局聚合数据更新 augments 集合的 win_rate/pick_rate
async function updateAugmentGlobalStatsReal(patchVersion) {
  console.log('[statsDataSync] 更新 augment 全局统计...')
  let updated = 0
  for (const row of REAL_AUGMENT_GLOBALS) {
    const pv = Number(row.patch_version)
    if (pv !== patchVersion) continue
    const augmentId = String(row.riot_id)
    await db.collection('augments').doc(augmentId).update({
      data: {
        win_rate: row.win_rate,
        pick_rate: row.pick_rate,
        champions_count: row.champions_count || 0,
        updated_at: new Date()
      }
    }).then(() => { updated++ }).catch(() => {})
  }
  console.log(`[statsDataSync] augments 全局统计更新 ${updated} 条`)
}
