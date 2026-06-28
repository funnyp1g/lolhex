// scripts/fetch-real-data-v2.js
// 从 data.v2.iesdev.com (Blitz.gg) 拉取真实海克斯大乱斗统计数据
// 绕过 DNS 劫持：通过 DoH 解析真实 IP，使用 IP 直连
// 用法：node scripts/fetch-real-data-v2.js
// 输出：data-export/ 目录下 JSON 文件

const https = require('https')
const axios = require('axios')
const fs = require('fs')
const path = require('path')

const API_HOST = 'data.v2.iesdev.com'
const API_PATH = '/api/v1/query_objects/prod/lol/aram_mayhem_champion'
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export')
const DELAY = 300
const CONCURRENT = 3
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

// 通过 DNS-over-HTTPS 解析真实 IP
async function resolveRealIP(hostname) {
  const dohServers = [
    'https://dns.google/resolve',
    'https://cloudflare-dns.com/dns-query',
    'https://doh.opendns.com/dns-query',
  ]

  for (const doh of dohServers) {
    try {
      const { data } = await axios.get(doh, {
        params: { name: hostname, type: 'A' },
        headers: { 'Accept': 'application/dns-json' },
        timeout: 5000
      })
      if (data.Answer && data.Answer.length > 0) {
        const ips = data.Answer.filter(a => a.type === 1).map(a => a.data)
        if (ips.length > 0) {
          console.log(`  DoH (${new URL(doh).hostname}): ${hostname} → ${ips[0]}`)
          return ips
        }
      }
    } catch (e) {
      // try next
    }
  }
  return []
}

// 使用 IP 直连 + SNI 发起 HTTPS 请求
async function fetchWithIP(hostname, path, realIP) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: realIP,
      port: 443,
      path: path,
      method: 'GET',
      servername: hostname,  // SNI
      headers: {
        'Host': hostname,
        'User-Agent': 'ARAM-Mayhem-Guide/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000,
      rejectUnauthorized: false  // 允许自签名证书（CDN 可能不匹配 IP）
    }

    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch (e) {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

async function fetchChampion(championId, hostname, realIPs) {
  const path = `${API_PATH}?champion_id=${championId}`

  for (const ip of realIPs) {
    try {
      const result = await fetchWithIP(hostname, path, ip)
      if (result.status === 200) {
        return { champion_id: championId, data: result.data, ok: true }
      }
    } catch (e) {
      // try next IP
    }
  }

  // Fallback: try normal axios (might work if DNS is cached differently)
  try {
    const { data } = await axios.get(`https://${hostname}${path}`, {
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0', 'Accept': 'application/json' },
      timeout: 10000
    })
    return { champion_id: championId, data, ok: true }
  } catch (err) {
    return { champion_id: championId, ok: false, error: err.message }
  }
}

async function main() {
  console.log('=== 从 Blitz.gg/iesdev 拉取真实海克斯大乱斗数据 ===')
  console.log(`API: ${API_HOST}${API_PATH}`)
  console.log(`英雄数: ${CHAMPION_IDS.length}`)
  console.log(`输出: ${OUTPUT_DIR}\n`)

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Step 1: 通过 DoH 解析真实 IP
  console.log('=== 步骤 1: DNS 解析 (DoH) ===')
  const realIPs = await resolveRealIP(API_HOST)
  if (realIPs.length === 0) {
    console.error('❌ 无法解析 data.v2.iesdev.com 的真实 IP')
    console.log('尝试备用方案...')
    return
  }

  // Step 2: 获取数据
  console.log(`\n=== 步骤 2: 获取英雄数据 (${CHAMPION_IDS.length} 个) ===`)
  const allData = []
  let success = 0, fail = 0

  for (let i = 0; i < CHAMPION_IDS.length; i += CONCURRENT) {
    const batch = CHAMPION_IDS.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      batch.map(async (id) => {
        await sleep(Math.random() * DELAY)
        const r = await fetchChampion(id, API_HOST, realIPs)
        if (r.ok) success++; else fail++
        const status = r.ok ? '✅' : '❌'
        process.stdout.write(`  [${i + batch.indexOf(id) + 1}/${CHAMPION_IDS.length}] ID ${id} ${status}${r.ok ? '' : ' ' + (r.error || '')}\n`)
        return r
      })
    )
    allData.push(...results)
    if (i + CONCURRENT < CHAMPION_IDS.length) await sleep(DELAY)
  }

  console.log(`\n完成: ${success} 成功, ${fail} 失败\n`)

  if (success === 0) {
    console.error('❌ 所有请求失败，无法获取数据')
    return
  }

  // Step 3: 生成云数据库导入文件
  console.log('=== 生成数据文件 ===')
  const championAugments = []
  const championItems = []
  const augmentItems = []
  const augmentTrios = []
  const championUpdates = []

  const augmentWinRates = {}
  const usedAugmentIds = new Set()
  const usedItemIds = new Set()

  allData.filter(r => r.ok).forEach(({ champion_id, data }) => {
    // champion 全局统计
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
      const wr = Math.round(a.win_rate * 10000) / 100
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
}

main().catch(console.error)
