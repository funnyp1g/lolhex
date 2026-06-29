// cloudfunctions/statsDataSync/index.js
// 混合数据架构：hexdata.com.cn（英雄/海克斯全局统计）+ 手动导入 CSV（细粒度数据）
// 细粒度数据（champion_augments / augment_trios / champion_stage_performance）通过 exports/*.csv 手动导入
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')

const HEXDATA_BASE = 'https://hexdata.com.cn/data'

// ====== 稀有度映射：hexdata 中文 → DB 英文 ======
const RARITY_MAP = { '黄金': 'gold', '白银': 'silver', '棱彩': 'prismatic' }

// ====== hexdata → DB 字段映射（whitelist 模式，新字段安全） ======
const HERO_FIELD_MAP = {
  winRate:     { db: 'win_rate',           fn: v => v !== undefined ? v * 100 : v },
  pickRate:    { db: 'pick_rate',          fn: v => v !== undefined ? v * 100 : v },
  games:       { db: 'sample_size',        fn: v => v },
  tier:        { db: 'tier',               fn: v => v },
  roles:       { db: 'roles',              fn: v => v },
  winRateChange:   { db: 'win_rate_change',    fn: v => v !== undefined ? v * 100 : v },
  pickRateChange:  { db: 'pick_rate_change',   fn: v => v !== undefined ? v * 100 : v },
  previousWinRate: { db: 'previous_win_rate',  fn: v => v !== undefined ? v * 100 : v },
  previousPickRate:{ db: 'previous_pick_rate', fn: v => v !== undefined ? v * 100 : v },
  topAugments: { db: 'top_augments',       fn: v => Array.isArray(v) ? v : [] },
  avgDamage:   { db: 'avg_damage',         fn: v => v },
  avgDamageTaken: { db: 'avg_damage_taken', fn: v => v },
  avgKills:    { db: 'avg_kills',          fn: v => v },
  avgDeaths:   { db: 'avg_deaths',         fn: v => v },
  avgAssists:  { db: 'avg_assists',        fn: v => v },
  kda:         { db: 'kda',                fn: v => v },
  avgGold:     { db: 'avg_gold',           fn: v => v },
  avgCs:       { db: 'avg_cs',             fn: v => v },
  avgCcTime:   { db: 'avg_cc_time',        fn: v => v },
  avgTurretDmg:{ db: 'avg_turret_dmg',     fn: v => v },
  avgHealShield:{ db: 'avg_heal_shield',   fn: v => v },
  avgDmgMitigated: { db: 'avg_dmg_mitigated', fn: v => v },
  damageShare: { db: 'damage_share',       fn: v => v },
  goldEfficiency: { db: 'gold_efficiency', fn: v => v },
  killParticipation: { db: 'kill_participation', fn: v => v },
  multiKillRate: { db: 'multi_kill_rate',  fn: v => v },
  utilityScore:{ db: 'utility_score',      fn: v => v },
  survivability: { db: 'survivability',    fn: v => v },
  previousGames: { db: 'previous_games',   fn: v => v },
  wins:        { db: 'wins',               fn: v => v },
  searchTerms: { db: 'search_terms',       fn: v => v },
  roleTags:    { db: 'role_tags',          fn: v => v },
}

const AUGMENT_FIELD_MAP = {
  winRate:     { db: 'win_rate',              fn: v => v !== undefined ? v * 100 : v },
  pickRate:    { db: 'pick_rate',             fn: v => v !== undefined ? v * 100 : v },
  rarity:      { db: 'rarity',                fn: v => RARITY_MAP[v] || v },
  hexScore:    { db: 'hex_score',             fn: v => v },
  hexTier:     { db: 'hex_tier',              fn: v => v },
  hexLabel:    { db: 'hex_label',             fn: v => v },
  hexTierColor:{ db: 'hex_tier_color',        fn: v => v },
  stageAdjustedScore: { db: 'stage_adjusted_score', fn: v => v },
  stageWeightedWinRate: { db: 'stage_weighted_win_rate', fn: v => v !== undefined ? v * 100 : v },
  stageAdjustmentWeight: { db: 'stage_adjustment_weight', fn: v => v },
  stagePerformanceFactor: { db: 'stage_performance_factor', fn: v => v },
  coverageHeroCount: { db: 'coverage_hero_count', fn: v => v },
  avgDeltaWinRate: { db: 'avg_delta_win_rate', fn: v => v !== undefined ? v * 100 : v },
  weightedAvgDeltaWinRate: { db: 'weighted_avg_delta_win_rate', fn: v => v !== undefined ? v * 100 : v },
  hexScoreEligibleHeroCount: { db: 'hex_score_eligible_hero_count', fn: v => v },
  hexScoreExcludedHeroCount: { db: 'hex_score_excluded_hero_count', fn: v => v },
  games:       { db: 'sample_size',           fn: v => v },
  wins:        { db: 'wins',                  fn: v => v },
  description: { db: 'description',           fn: v => v },
  tier:        { db: 'tier',                  fn: v => v },
}

// ====== 主函数 ======
exports.main = async (event) => {
  console.log('[statsDataSync] 开始统计数据同步 (hexdata 全局 + 手动导入细粒度)')
  const startTime = Date.now()

  try {
    // 1. 获取当前版本
    const patchRes = await db.collection('patches')
      .where({ is_current: true }).limit(1).get()
    if (patchRes.data.length === 0) {
      return { code: 1002, message: '未找到当前版本，请先执行 staticDataSync', data: null }
    }
    const patchVersion = Number(patchRes.data[0].version)
    console.log(`[statsDataSync] 当前版本 ${patchVersion}`)

    // 2. 标记同步开始
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'syncing', updated_at: new Date() } })

    // 3. 并行拉取 hexdata JSON（best-effort，失败不阻塞）
    let heroes = null, augments = null
    try {
      [heroes, augments] = await Promise.all([
        fetchHexHeroes(),
        fetchHexAugments()
      ])
      console.log(`[statsDataSync] hexdata 拉取完成: ${heroes?.length || 0} 英雄, ${augments?.length || 0} 海克斯`)
    } catch (hexErr) {
      console.error('[statsDataSync] hexdata 拉取失败（将跳过全局统计更新）:', hexErr.message)
    }

    // 4. 写入 champions / augments 全局统计（来自 hexdata）
    if (heroes && heroes.length > 0) {
      await writeChampionsFromHexdata(heroes, patchVersion)
    }
    if (augments && augments.length > 0) {
      await writeAugmentsFromHexdata(augments, patchVersion)
    }

    // 5. 细粒度数据（champion_augments / augment_trios / champion_stage_performance）
    //    通过 exports/*.csv 手动导入，云函数不再写入

    // 6. 更新版本状态
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

// ====== hexdata HTTP 拉取 ======
async function fetchHexHeroes() {
  const { data } = await axios.get(`${HEXDATA_BASE}/heroes.json`, {
    timeout: 15000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  })
  return Array.isArray(data) ? data : null
}

async function fetchHexAugments() {
  const { data } = await axios.get(`${HEXDATA_BASE}/augments.json`, {
    timeout: 15000,
    headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
  })
  return Array.isArray(data) ? data : null
}

// ====== hexdata → DB 通用字段映射 ======
function mapFields(source, fieldMap) {
  const result = {}
  for (const [srcKey, { db: dbKey, fn }] of Object.entries(fieldMap)) {
    if (source[srcKey] !== undefined && source[srcKey] !== null) {
      result[dbKey] = fn(source[srcKey])
    }
  }
  return result
}

// ====== 从 hexdata 批量更新 champions 集合 ======
async function writeChampionsFromHexdata(heroes, patchVersion) {
  console.log('[statsDataSync] 从 hexdata 更新 champions 全局统计...')
  let updated = 0, failed = 0

  for (const hero of heroes) {
    const championId = String(hero.id)
    const updateData = mapFields(hero, HERO_FIELD_MAP)
    updateData.patch_version = patchVersion
    updateData.updated_at = new Date()

    try {
      await db.collection('champions').doc(championId).update({ data: updateData })
      updated++
    } catch (e) {
      failed++
      if (failed <= 3) {
        console.warn(`[statsDataSync] champions 更新失败 id=${championId}: ${e.message}`)
      }
    }
  }
  console.log(`[statsDataSync] champions 更新 ${updated} 成功, ${failed} 失败`)
}

// ====== 从 hexdata 批量更新 augments 集合 ======
async function writeAugmentsFromHexdata(augments, patchVersion) {
  console.log('[statsDataSync] 从 hexdata 更新 augments 全局统计...')
  let updated = 0, failed = 0

  for (const aug of augments) {
    const augmentId = String(aug.id)
    const updateData = mapFields(aug, AUGMENT_FIELD_MAP)
    updateData.patch_version = patchVersion
    updateData.updated_at = new Date()

    try {
      await db.collection('augments').doc(augmentId).update({ data: updateData })
      updated++
    } catch (e) {
      failed++
      if (failed <= 3) {
        console.warn(`[statsDataSync] augments 更新失败 id=${augmentId}: ${e.message}`)
      }
    }
  }
  console.log(`[statsDataSync] augments 更新 ${updated} 成功, ${failed} 失败`)
}

