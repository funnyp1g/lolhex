// cloudfunctions/statsDataSync/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BATCH_SIZE = 20
const MIN_SAMPLE_SIZE = 30
const STAGES = [3, 7, 11, 15]

// Tier 映射函数
function mapTierToRank(winRate) {
  if (winRate >= 55) return 'T1'
  if (winRate >= 52) return 'T2'
  if (winRate >= 49) return 'T3'
  if (winRate >= 46) return 'T4'
  return 'T5'
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

// 计算 tier（S/A/B/C/D）
function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

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
    const patchVersion = patchRes.data[0].version

    // 2. 获取所有英雄 ID
    const championsRes = await db.collection('champions')
      .where({ patch_version: patchVersion }).field({ riot_id: true }).get()
    const championIds = championsRes.data.map(c => c.riot_id)
    console.log(`[statsDataSync] 版本 ${patchVersion}，共 ${championIds.length} 个英雄`)

    // 3. 标记同步开始
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'syncing', updated_at: new Date() } })

    // 4. 使用 mock 数据填充（实际部署时替换为 iesdev API 调用）
    const allStats = generateMockStats(championIds, patchVersion)
    console.log(`[statsDataSync] 数据准备完成，有效数据 ${allStats.length} 条`)

    // 5. 写入云数据库
    await writeToDatabase(allStats, patchVersion)

    // 6. 更新全局统计
    await updateChampionGlobalStats(allStats, patchVersion)
    await updateAugmentGlobalStats(allStats, patchVersion)

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

// 生成 mock 统计数据（部署时替换为真实 iesdev API 采集）
function generateMockStats(championIds, patchVersion) {
  const augmentIds = [1205, 1141, 1089, 1058, 1062, 1080, 1195, 1013, 1020, 1022, 1025, 1026, 1027, 1028, 1029, 1030, 1038, 1041, 1045, 1051]
  const itemIds = [3153, 3046, 6676, 3031, 3072, 3006, 3047, 3111, 3089, 3157, 3135, 3100, 3146, 3020, 3165]
  const results = []
  const usedKeys = new Set()

  championIds.forEach(championId => {
    // champion_augments: 每个英雄 5-15 个海克斯适配
    const champAugmentCount = 5 + Math.floor(Math.random() * 11)
    const shuffledAugs = [...augmentIds].sort(() => Math.random() - 0.5).slice(0, champAugmentCount)

    shuffledAugs.forEach(augmentId => {
      const winRate = clamp(35 + Math.random() * 35, 10, 90)
      const pickRate = 0.1 + Math.random() * 15
      const sampleSize = Math.floor(MIN_SAMPLE_SIZE + Math.random() * 20000)
      const tier = calculateTier(winRate)
      const key = `${championId}_${augmentId}_${patchVersion}`

      if (!usedKeys.has(key)) {
        usedKeys.add(key)
        results.push({
          type: 'champion_augment',
          champion_id: championId,
          augment_id: augmentId,
          win_rate: Math.round(winRate * 100) / 100,
          pick_rate: Math.round(pickRate * 100) / 100,
          sample_size: sampleSize,
          tier,
          patch_version: patchVersion
        })
      }
    })

    // champion_items: 每个英雄 5-10 个装备
    const champItemCount = 5 + Math.floor(Math.random() * 6)
    const shuffledItems = [...itemIds].sort(() => Math.random() - 0.5).slice(0, champItemCount)

    shuffledItems.forEach((itemId, idx) => {
      const winRate = clamp(35 + Math.random() * 35, 10, 90)
      const pickRate = 0.1 + Math.random() * 15
      const sampleSize = Math.floor(MIN_SAMPLE_SIZE + Math.random() * 15000)
      const tier = calculateTier(winRate)
      let slot = 'core'
      if (idx === 0 && itemId >= 3000 && itemId <= 3200) slot = 'boots'
      if (idx >= Math.min(3, champItemCount - 1)) slot = 'full_build'

      results.push({
        type: 'champion_item',
        champion_id: championId,
        item_id: itemId,
        win_rate: Math.round(winRate * 100) / 100,
        pick_rate: Math.round(pickRate * 100) / 100,
        sample_size: sampleSize,
        tier,
        is_core: slot === 'core',
        slot,
        patch_version: patchVersion
      })
    })
  })

  // augment_items: 海克斯×装备联动
  augmentIds.slice(0, 15).forEach(augmentId => {
    itemIds.slice(0, 8).forEach(itemId => {
      if (Math.random() > 0.3) {
        const winRate = clamp(40 + Math.random() * 30, 10, 90)
        results.push({
          type: 'augment_item',
          augment_id: augmentId,
          champion_id: null,
          item_id: itemId,
          win_rate: Math.round(winRate * 100) / 100,
          pick_rate: Math.round((0.1 + Math.random() * 5) * 100) / 100,
          sample_size: Math.floor(MIN_SAMPLE_SIZE + Math.random() * 5000),
          tier: calculateTier(winRate),
          patch_version: patchVersion
        })
      }
    })
  })

  // augment_trios: 三海克斯组合
  for (let i = 0; i < augmentIds.length - 2; i++) {
    for (let j = i + 1; j < augmentIds.length - 1; j++) {
      for (let k = j + 1; k < augmentIds.length; k++) {
        if (Math.random() > 0.85) {
          const winRate = clamp(40 + Math.random() * 35, 10, 90)
          const sorted = [augmentIds[i], augmentIds[j], augmentIds[k]].sort((a, b) => a - b)
          results.push({
            type: 'augment_trio',
            augment_ids: sorted,
            champion_id: null,
            win_rate: Math.round(winRate * 100) / 100,
            sample_size: Math.floor(MIN_SAMPLE_SIZE + Math.random() * 3000),
            tier: calculateTier(winRate),
            patch_version: patchVersion
          })
        }
      }
    }
  }

  // champion_stage_performance: 阶段表现（每个 champion_augment 补充 4 个阶段数据）
  const champAugments = results.filter(r => r.type === 'champion_augment')
  champAugments.forEach(ca => {
    STAGES.forEach(stage => {
      const stageOffset = [0, -2, 2, 4][STAGES.indexOf(stage)] || 0
      const stageWinRate = clamp(ca.win_rate + stageOffset + (Math.random() * 4 - 2), 10, 90)
      results.push({
        type: 'champion_stage_performance',
        champion_id: ca.champion_id,
        augment_id: ca.augment_id,
        stage,
        win_rate: Math.round(stageWinRate * 100) / 100,
        pick_rate: ca.pick_rate,
        sample_size: Math.floor(ca.sample_size * (0.2 + Math.random() * 0.3)),
        patch_version: patchVersion
      })
    })
  })

  return results
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
        _id, champion_id: doc.champion_id, augment_id: doc.augment_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
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
        _id, champion_id: doc.champion_id, item_id: doc.item_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        is_core: doc.is_core || false, slot: doc.slot || 'core',
        patch_version: patchVersion, updated_at: new Date()
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
        _id, augment_id: doc.augment_id, champion_id: null, item_id: doc.item_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
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
        _id, augment_ids: ids, champion_id: null,
        win_rate: doc.win_rate, sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
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
        _id, champion_id: doc.champion_id, augment_id: doc.augment_id,
        stage: doc.stage, win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_stage_performance 写入 ${stagePerfs.length} 条`)
}

async function updateChampionGlobalStats(allStats, patchVersion) {
  const champAugs = allStats.filter(r => r.type === 'champion_augment')
  const champStats = {}
  champAugs.forEach(ca => {
    if (!champStats[ca.champion_id]) champStats[ca.champion_id] = { totalWR: 0, totalPR: 0, count: 0 }
    champStats[ca.champion_id].totalWR += ca.win_rate * ca.sample_size
    champStats[ca.champion_id].totalPR += ca.pick_rate
    champStats[ca.champion_id].count += ca.sample_size
  })
  for (const [champId, stats] of Object.entries(champStats)) {
    const avgWR = stats.count > 0 ? stats.totalWR / stats.count : 0
    const avgPR = stats.totalPR / Object.keys(champStats).length
    await db.collection('champions').doc(String(champId)).update({
      data: { win_rate: Math.round(avgWR * 100) / 100, pick_rate: Math.round(avgPR * 100) / 100, updated_at: new Date() }
    }).catch(() => {})
  }
}

async function updateAugmentGlobalStats(allStats, patchVersion) {
  const champAugs = allStats.filter(r => r.type === 'champion_augment')
  const augStats = {}
  champAugs.forEach(ca => {
    if (!augStats[ca.augment_id]) augStats[ca.augment_id] = { totalWR: 0, totalPR: 0, count: 0 }
    augStats[ca.augment_id].totalWR += ca.win_rate * ca.sample_size
    augStats[ca.augment_id].totalPR += ca.pick_rate
    augStats[ca.augment_id].count += ca.sample_size
  })
  for (const [augId, stats] of Object.entries(augStats)) {
    const avgWR = stats.count > 0 ? stats.totalWR / stats.count : 0
    const avgPR = stats.totalPR / Object.keys(augStats).length
    await db.collection('augments').doc(String(augId)).update({
      data: { win_rate: Math.round(avgWR * 100) / 100, pick_rate: Math.round(avgPR * 100) / 100, updated_at: new Date() }
    }).catch(() => {})
  }
}
