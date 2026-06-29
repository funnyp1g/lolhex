// scripts/export-all-csv.js
// 生成全量 CSV 文件，用于手动导入微信云数据库
// 用法: node scripts/export-all-csv.js
// 输出: exports/ 目录下 5 个 CSV 文件

const fs = require('fs')
const path = require('path')
const https = require('https')

const OUT_DIR = path.join(__dirname, '..', 'exports')
const DATA_DIR = path.join(__dirname, '..', 'cloudfunctions', 'statsDataSync', 'data')
const HEXDATA_BASE = 'https://hexdata.com.cn/data'

// 稀有度映射
const RARITY_MAP = { '黄金': 'gold', '白银': 'silver', '棱彩': 'prismatic' }

// ====== HTTP GET ======
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000, headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' } }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)) }
      })
    }).on('error', reject).on('timeout', () => { reject(new Error('timeout')) })
  })
}

// ====== CSV 工具 ======
function escapeCsv(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function toCsv(rows, columns) {
  const header = columns.join(',')
  const body = rows.map(row => columns.map(c => escapeCsv(row[c])).join(','))
  return [header, ...body].join('\n')
}

function writeCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns)
  fs.writeFileSync(path.join(OUT_DIR, filename), '﻿' + csv, 'utf8')  // BOM for Excel
  console.log(`  ${filename}: ${rows.length} 行, ${(csv.length / 1024).toFixed(1)} KB`)
}

// ====== hexdata → DB 字段映射 ======
function mapHero(hero) {
  const v = (val, fn) => val !== undefined ? fn(val) : val
  return {
    _id: String(hero.id),
    riot_id: hero.id,
    name_zh: hero.name || '',
    title: hero.title || '',
    icon_url: hero.imageUrl || '',
    win_rate: v(hero.winRate, x => x * 100),
    pick_rate: v(hero.pickRate, x => x * 100),
    sample_size: hero.games || 0,
    tier: hero.tier || '',
    roles: Array.isArray(hero.roles) ? hero.roles.join(';') : '',
    win_rate_change: v(hero.winRateChange, x => x * 100),
    pick_rate_change: v(hero.pickRateChange, x => x * 100),
    previous_win_rate: v(hero.previousWinRate, x => x * 100),
    previous_pick_rate: v(hero.previousPickRate, x => x * 100),
    top_augments: Array.isArray(hero.topAugments) ? JSON.stringify(hero.topAugments) : '[]',
    avg_damage: hero.avgDamage,
    avg_damage_taken: hero.avgDamageTaken,
    avg_kills: hero.avgKills,
    avg_deaths: hero.avgDeaths,
    avg_assists: hero.avgAssists,
    kda: hero.kda,
    avg_gold: hero.avgGold,
    avg_cs: hero.avgCs,
    avg_cc_time: hero.avgCcTime,
    avg_turret_dmg: hero.avgTurretDmg,
    avg_heal_shield: hero.avgHealShield,
    avg_dmg_mitigated: hero.avgDmgMitigated,
    damage_share: hero.damageShare,
    gold_efficiency: hero.goldEfficiency,
    kill_participation: hero.killParticipation,
    multi_kill_rate: hero.multiKillRate,
    utility_score: hero.utilityScore,
    survivability: hero.survivability,
    previous_games: hero.previousGames,
    wins: hero.wins,
    search_terms: hero.searchTerms,
    role_tags: hero.roleTags,
    patch_version: '',  // 由导入时填写
    updated_at: new Date().toISOString()
  }
}

function mapAugment(aug) {
  const v = (val, fn) => val !== undefined ? fn(val) : val
  return {
    _id: String(aug.id),
    riot_id: aug.id,
    name_zh: aug.name || '',
    icon_url: aug.iconUrl || '',
    description: aug.description || '',
    rarity: RARITY_MAP[aug.rarity] || aug.rarity || '',
    win_rate: v(aug.winRate, x => x * 100),
    pick_rate: v(aug.pickRate, x => x * 100),
    sample_size: aug.games || 0,
    tier: aug.tier || '',
    hex_score: aug.hexScore,
    hex_tier: aug.hexTier,
    hex_label: aug.hexLabel,
    hex_tier_color: aug.hexTierColor,
    stage_adjusted_score: aug.stageAdjustedScore,
    stage_weighted_win_rate: v(aug.stageWeightedWinRate, x => x * 100),
    stage_adjustment_weight: aug.stageAdjustmentWeight,
    stage_performance_factor: aug.stagePerformanceFactor,
    coverage_hero_count: aug.coverageHeroCount,
    avg_delta_win_rate: v(aug.avgDeltaWinRate, x => x * 100),
    weighted_avg_delta_win_rate: v(aug.weightedAvgDeltaWinRate, x => x * 100),
    hex_score_eligible_hero_count: aug.hexScoreEligibleHeroCount,
    hex_score_excluded_hero_count: aug.hexScoreExcludedHeroCount,
    wins: aug.wins,
    patch_version: '',
    updated_at: new Date().toISOString()
  }
}

// ====== 主流程 ======
async function main() {
  // 确保输出目录
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('=== Step 1: 拉取 hexdata JSON ===')

  let heroes = [], augments = []
  try {
    heroes = await httpGet(`${HEXDATA_BASE}/heroes.json`)
    console.log(`  heroes.json: ${heroes.length} 条`)
  } catch (e) {
    console.error(`  heroes.json 拉取失败: ${e.message}`)
  }

  try {
    augments = await httpGet(`${HEXDATA_BASE}/augments.json`)
    console.log(`  augments.json: ${augments.length} 条`)
  } catch (e) {
    console.error(`  augments.json 拉取失败: ${e.message}`)
  }

  // Champions CSV
  if (heroes.length > 0) {
    const rows = heroes.map(mapHero)
    const cols = Object.keys(rows[0])
    writeCsv('champions.csv', rows, cols)
  }

  // Augments CSV
  if (augments.length > 0) {
    const rows = augments.map(mapAugment)
    const cols = Object.keys(rows[0])
    writeCsv('augments.csv', rows, cols)
  }

  console.log('\n=== Step 2: 读取 JS 数据模块 ===')

  // champion_augments
  const championAugments = require(path.join(DATA_DIR, 'real-champion-augments.js'))
  console.log(`  champion_augments: ${championAugments.length} 条`)

  // augment_trios
  const augmentTrios = require(path.join(DATA_DIR, 'real-augment-trios.js'))
  console.log(`  augment_trios: ${augmentTrios.length} 条`)

  // champion_stage_performance
  const stagePerf = require(path.join(DATA_DIR, 'real-champion-stage-performance.js'))
  console.log(`  champion_stage_performance: ${stagePerf.length} 条`)

  // 转换并写入 CSV
  const patchVersion = '26.12'

  // champion_augments CSV
  const caRows = championAugments
    .filter(r => String(r.pv) === patchVersion)
    .map(r => ({
      _id: `${r.ci}_${r.ai}_${patchVersion}`,
      champion_id: r.ci,
      augment_id: r.ai,
      win_rate: r.wr,
      pick_rate: r.pr,
      sample_size: r.ss,
      tier: r.tr,
      patch_version: Number(r.pv),
      updated_at: new Date().toISOString()
    }))
  writeCsv('champion_augments.csv', caRows, ['_id', 'champion_id', 'augment_id', 'win_rate', 'pick_rate', 'sample_size', 'tier', 'patch_version', 'updated_at'])

  // augment_trios CSV
  const atRows = augmentTrios
    .filter(r => String(r.pv) === patchVersion)
    .map(r => {
      let ids = r.ai
      if (typeof ids === 'string') ids = ids.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)
      if (!Array.isArray(ids) || ids.length !== 3) return null
      const nums = ids.map(Number)
      return {
        _id: `${nums[0]}_${nums[1]}_${nums[2]}_null_${patchVersion}`,
        augment_ids: JSON.stringify(nums),
        champion_id: '',
        win_rate: r.wr || 0,
        sample_size: r.ss,
        tier: r.tr,
        patch_version: Number(r.pv),
        updated_at: new Date().toISOString()
      }
    })
    .filter(Boolean)
  writeCsv('augment_trios.csv', atRows, ['_id', 'augment_ids', 'champion_id', 'win_rate', 'sample_size', 'tier', 'patch_version', 'updated_at'])

  // champion_stage_performance CSV
  const spRows = stagePerf
    .filter(r => String(r.pv) === patchVersion)
    .map(r => ({
      _id: `${r.ci}_${r.ai}_${r.st}_${patchVersion}`,
      champion_id: r.ci,
      augment_id: r.ai,
      stage: r.st,
      win_rate: r.wr,
      pick_rate: 0,
      sample_size: r.ss,
      patch_version: Number(r.pv),
      updated_at: new Date().toISOString()
    }))
  writeCsv('champion_stage_performance.csv', spRows, ['_id', 'champion_id', 'augment_id', 'stage', 'win_rate', 'pick_rate', 'sample_size', 'patch_version', 'updated_at'])

  console.log(`\n=== 完成 ===`)
  console.log(`输出目录: ${OUT_DIR}`)
  console.log(`文件列表:`)
  fs.readdirSync(OUT_DIR).forEach(f => {
    const stat = fs.statSync(path.join(OUT_DIR, f))
    console.log(`  ${f}  (${(stat.size / 1024).toFixed(1)} KB)`)
  })
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
