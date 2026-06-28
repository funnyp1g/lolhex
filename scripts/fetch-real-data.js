// scripts/fetch-real-data.js
// 从 data.v2.iesdev.com (Blitz.gg) 拉取真实海克斯大乱斗统计数据
// 用法：node scripts/fetch-real-data.js
// 输出：data-export/ 目录下 JSON 文件，可直接在云开发控制台导入数据库

const axios = require('axios')
const fs = require('fs')
const path = require('path')

const API_BASE = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion'
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export')
const DELAY = 300       // 请求间隔 ms
const CONCURRENT = 3    // 并发数
const PATCH = '26.12'

// Riot 英雄 ID 全列表（170 个）
const CHAMPION_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 48, 50, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
  67, 68, 69, 72, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 89, 90, 91,
  92, 96, 98, 99, 101, 102, 103, 104, 105, 106, 107, 110, 111, 112, 113, 114, 115,
  117, 119, 120, 121, 122, 126, 127, 131, 133, 134, 136, 141, 142, 143, 145, 147,
  150, 154, 157, 161, 163, 164, 166, 200, 201, 202, 203, 221, 222, 223, 233, 234,
  235, 236, 238, 240, 245, 246, 254, 266, 267, 268, 350, 360, 412, 420, 421, 427,
  429, 432, 497, 498, 516, 517, 518, 523, 526, 555, 711, 777, 799, 800, 804, 805,
  875, 876, 887, 888, 893, 895, 897, 901, 902, 904, 910, 950
]

const HEADERS = {
  'User-Agent': 'ARAM-Mayhem-Guide/1.0',
  'Accept': 'application/json'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

async function fetchChampion(championId) {
  const url = `${API_BASE}?champion_id=${championId}`
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 })
    return { champion_id: championId, data, ok: true }
  } catch (err) {
    return { champion_id: championId, ok: false, error: err.message }
  }
}

async function main() {
  console.log('=== 从 Blitz.gg/iesdev 拉取真实海克斯大乱斗数据 ===')
  console.log(`API: ${API_BASE}`)
  console.log(`英雄数: ${CHAMPION_IDS.length}`)
  console.log(`输出: ${OUTPUT_DIR}\n`)

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // 分批并发请求
  const allData = []
  let success = 0, fail = 0

  for (let i = 0; i < CHAMPION_IDS.length; i += CONCURRENT) {
    const batch = CHAMPION_IDS.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      batch.map(async (id) => {
        await sleep(Math.random() * DELAY)
        const r = await fetchChampion(id)
        if (r.ok) success++; else fail++
        const status = r.ok ? '✅' : '❌'
        process.stdout.write(`  [${i + batch.indexOf(id) + 1}/${CHAMPION_IDS.length}] ID ${id} ${status}${r.ok ? '' : ' ' + r.error}\n`)
        return r
      })
    )
    allData.push(...results)
    if (i + CONCURRENT < CHAMPION_IDS.length) await sleep(DELAY)
  }

  console.log(`\n完成: ${success} 成功, ${fail} 失败\n`)

  // ====== 生成云数据库导入文件 ======
  const championAugments = []
  const championItems = []
  const augmentItems = []
  const augmentTrios = []
  const championUpdates = []

  const augmentWinRates = {}   // augment_id → { totalWR, totalPR, count }
  const usedAugmentIds = new Set()
  const usedItemIds = new Set()

  allData.filter(r => r.ok).forEach(({ champion_id, data }) => {
    // champion 全局统计更新
    if (data.augments && data.augments.length > 0) {
      const avgWR = data.augments.reduce((s, a) => s + a.win_rate, 0) / data.augments.length
      championUpdates.push({
        _id: String(champion_id),
        riot_id: champion_id,
        win_rate: Math.round(avgWR * 10000) / 100,
        pick_rate: 0
      })
    }

    // champion_augments
    ;(data.augments || []).forEach(a => {
      const wr = Math.round(a.win_rate * 10000) / 100   // 小数→百分比
      const pr = Math.round(a.pick_rate * 10000) / 100
      const ss = a.sample_size || 1000
      usedAugmentIds.add(a.augment_id)

      championAugments.push({
        _id: `${champion_id}_${a.augment_id}_${PATCH}`,
        champion_id,
        augment_id: a.augment_id,
        win_rate: wr,
        pick_rate: pr,
        sample_size: ss,
        tier: calculateTier(wr),
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      })

      // 聚合 augment 全局统计
      if (!augmentWinRates[a.augment_id]) augmentWinRates[a.augment_id] = { totalWR: 0, totalPR: 0, count: 0 }
      augmentWinRates[a.augment_id].totalWR += wr * ss
      augmentWinRates[a.augment_id].totalPR += pr
      augmentWinRates[a.augment_id].count += ss
    })

    // champion_items
    ;(data.items || []).forEach((it, idx) => {
      const wr = Math.round(it.win_rate * 10000) / 100
      const pr = Math.round(it.pick_rate * 10000) / 100
      const ss = it.sample_size || 1000
      usedItemIds.add(it.item_id)

      let slot = 'core'
      if (idx === 0 && [3006, 3047, 3111, 3158, 3009, 3020].includes(it.item_id)) slot = 'boots'
      if (idx >= 3) slot = 'full_build'

      championItems.push({
        _id: `${champion_id}_${it.item_id}_${PATCH}`,
        champion_id,
        item_id: it.item_id,
        win_rate: wr,
        pick_rate: pr,
        sample_size: ss,
        tier: calculateTier(wr),
        is_core: slot === 'core',
        slot,
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      })

      // augment_items 联动: 该英雄 × 该装备 × 每个 augment
      ;(data.augments || []).slice(0, 3).forEach(aug => {
        augmentItems.push({
          _id: `${aug.augment_id}_${it.item_id}_${champion_id}_${PATCH}`,
          augment_id: aug.augment_id,
          champion_id,
          item_id: it.item_id,
          win_rate: wr,
          pick_rate: pr,
          sample_size: ss,
          tier: calculateTier(wr),
          patch_version: PATCH,
          updated_at: new Date().toISOString()
        })
      })
    })

    // augment_trios
    ;(data.augment_trios || []).forEach(trio => {
      if (trio.augments && trio.augments.length === 3) {
        const sorted = [...trio.augments].sort((a, b) => a - b)
        const wr = Math.round(trio.win_rate * 10000) / 100
        augmentTrios.push({
          _id: `${sorted[0]}_${sorted[1]}_${sorted[2]}_${champion_id}_${PATCH}`,
          augment_ids: sorted,
          champion_id,
          win_rate: wr,
          sample_size: trio.sample_size || 100,
          tier: calculateTier(wr),
          patch_version: PATCH,
          updated_at: new Date().toISOString()
        })
      }
    })
  })

  // augment 全局统计
  const augmentGlobalStats = []
  for (const [aid, stats] of Object.entries(augmentWinRates)) {
    augmentGlobalStats.push({
      _id: String(aid),
      riot_id: Number(aid),
      win_rate: stats.count > 0 ? Math.round(stats.totalWR / stats.count * 100) / 100 : 0,
      pick_rate: Math.round(stats.totalPR / allData.filter(r => r.ok).length * 100) / 100
    })
  }

  // 写入文件
  console.log('=== 写入 JSON 文件 ===')

  const writeJSON = (filename, data) => {
    const filepath = path.join(OUTPUT_DIR, filename)
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
    console.log(`  ${filename}: ${data.length} 条`)
  }

  writeJSON('champion-augments-real.json', championAugments)
  writeJSON('champion-items-real.json', championItems)
  writeJSON('augment-items-real.json', augmentItems)
  writeJSON('augment-trios-real.json', augmentTrios)
  writeJSON('augment-global-real.json', augmentGlobalStats)

  console.log(`\n=== 采集摘要 ===`)
  console.log(`英雄数: ${championUpdates.length}`)
  console.log(`海克斯种类: ${usedAugmentIds.size}`)
  console.log(`装备种类: ${usedItemIds.size}`)
  console.log(`英雄×海克斯: ${championAugments.length} 条`)
  console.log(`英雄×装备: ${championItems.length} 条`)
  console.log(`海克斯×装备联动: ${augmentItems.length} 条`)
  console.log(`三海克斯组合: ${augmentTrios.length} 条`)
  console.log(`\n=== 导入步骤 ===`)
  console.log(`1. 打开微信开发者工具 → 云开发控制台 → 数据库`)
  console.log(`2. 选择集合 → 导入 → 选择 data-export/ 下对应的 JSON 文件`)
  console.log(`3. 导入顺序: champion-augments → champion-items → augment-items → augment-trios`)
  console.log(`4. augments 集合: 用 augment-global-real.json 更新 win_rate/pick_rate`)
}

main().catch(console.error)
