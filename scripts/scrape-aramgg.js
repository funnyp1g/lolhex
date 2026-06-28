// scripts/scrape-aramgg.js
// 本地运行：从 aramgg.com 抓取英雄、海克斯、装备数据，输出为云数据库可导入的 JSON
// 用法：node scripts/scrape-aramgg.js
// 输出：data-export/ 目录下的 JSON 文件，可直接在云开发控制台导入

const axios = require('axios')
const fs = require('fs')
const path = require('path')

const BASE = 'https://aramgg.com/zh-CN'
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export')
const DELAY = 500 // 请求间隔 ms，避免被限流
const PATCH_VERSION = '26.12'

// 已知的英雄 ID 列表（从 aramgg 首页提取）
// 先用首页 HTML 获取，如果失败则用此备用列表
const FALLBACK_CHAMPION_IDS = [
  1, 10, 101, 102, 103, 104, 105, 106, 107, 11, 110, 111, 112, 113, 114, 115, 117, 119, 12,
  120, 121, 122, 126, 127, 13, 131, 133, 134, 136, 14, 141, 142, 143, 145, 147, 15, 150, 154,
  157, 16, 161, 163, 164, 166, 17, 18, 19, 2, 20, 200, 201, 202, 203, 21, 22, 221, 222, 223,
  23, 233, 234, 235, 236, 238, 24, 240, 245, 246, 25, 254, 26, 266, 267, 268, 27, 28, 29, 3,
  30, 31, 32, 33, 34, 35, 350, 36, 360, 37, 38, 39, 4, 40, 41, 412, 42, 420, 421, 427, 429,
  43, 432, 44, 45, 48, 497, 498, 5, 50, 51, 516, 517, 518, 523, 526, 53, 54, 55, 555, 56, 57,
  58, 59, 6, 60, 61, 62, 63, 64, 67, 68, 69, 7, 711, 72, 74, 75, 76, 77, 777, 78, 79, 799, 8,
  80, 800, 804, 805, 81, 82, 83, 84, 85, 86, 875, 876, 887, 888, 89, 893, 895, 897, 9, 90, 901,
  902, 904, 91, 910, 92, 950, 96, 98, 99
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms + Math.random() * ms)) }

// ====== 抓取英雄列表 ======
async function fetchChampionList() {
  console.log('[1/4] 抓取英雄列表...')
  try {
    const { data } = await axios.get(BASE, { headers: HEADERS, timeout: 15000 })
    // 从页面中提取所有 champion-stats/{id} 链接
    const idMatches = data.match(/\/champion-stats\/(\d+)/g) || []
    const ids = [...new Set(idMatches.map(m => parseInt(m.split('/').pop())))]
    console.log(`  从首页提取到 ${ids.length} 个英雄 ID`)
    if (ids.length > 50) return ids
  } catch (err) {
    console.warn(`  首页抓取失败: ${err.message}，使用备用 ID 列表`)
  }
  return FALLBACK_CHAMPION_IDS
}

// ====== 抓取单个英雄详情 ======
async function fetchChampionDetail(championId) {
  const url = `${BASE}/champion-stats/${championId}`
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 })

    // 从 __NEXT_DATA__ 或内联 JSON 提取数据
    // aramgg.com 将数据嵌入在页面的 JSON-LD 和 HTML 中
    let champion = null, augments = [], items = []

    // 尝试提取 JSON-LD 结构化数据
    const jsonLdMatch = data.match(/<script type="application\/ld\+json">([^<]+)<\/script>/g)
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const json = JSON.parse(match.replace(/<[^>]+>/g, ''))
          if (json['@type'] === 'Product') {
            // Product 类型通常包含名称和描述
            champion = {
              name_zh: json.name || '',
              description: json.description || ''
            }
          }
        } catch (e) {}
      }
    }

    // 提取 title 获取英雄名
    const titleMatch = data.match(/<title>([^<]+)<\/title>/)
    const titleStr = titleMatch ? titleMatch[1] : ''
    // title 格式: "封魔剑魂 永恩海克斯大乱斗强化推荐 - 胜率/T层级 - aramgg.com"
    const nameMatch = titleStr.match(/^(.+?)海克斯大乱斗/)
    const heroName = nameMatch ? nameMatch[1] : ''

    // 提取 meta description 获取胜率数据
    const descMatch = data.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/)
    const desc = descMatch ? descMatch[1] : ''

    // 从 description 提取：胜率、选取率、T级
    // 格式: "...当前为 T3，胜率 50.25%、选取率 0.63%..."
    const tierMatch = desc.match(/T(\d)/)
    const wrMatch = desc.match(/胜率\s*([\d.]+)%/)
    const prMatch = desc.match(/选取率\s*([\d.]+)%/)

    const tierRank = tierMatch ? `T${tierMatch[1]}` : ''
    const winRate = wrMatch ? parseFloat(wrMatch[1]) : 0
    const pickRate = prMatch ? parseFloat(prMatch[1]) : 0

    // 提取推荐海克斯（从 meta 和页面内容）
    const augNames = []
    // meta 中推荐海克斯
    const recMatch = desc.match(/推荐的海克斯强化[：:](.+?)[。.]/)
    if (recMatch) {
      recMatch[1].split(/[、，,]/).forEach(n => {
        const trimmed = n.trim()
        if (trimmed && trimmed.length < 20) augNames.push(trimmed)
      })
    }

    // 从 FAQ schema 中提取
    const faqMatch = data.match(/"name":"[^"]*选什么海克斯强化[^"]*"[^}]*"text":"([^"]+)"/)
    if (faqMatch) {
      const text = faqMatch[1]
      const moreNames = text.match(/优先选择(.+?)等高胜率强化/) || text.match(/推荐优先选择(.+?)，搭配/)
      if (moreNames) {
        moreNames[1].split(/[、，,]/).forEach(n => {
          const trimmed = n.trim().replace(/[。.]/g, '')
          if (trimmed && trimmed.length < 20 && !augNames.includes(trimmed)) augNames.push(trimmed)
        })
      }
    }

    // 提取推荐装备
    const itemNames = []
    const itemMatch = desc.match(/核心三件套参考\s*(.+?)[。.]/) || desc.match(/推荐(.+?)作为核心装/)
    if (itemMatch) {
      itemMatch[1].split(/[、，,]/).forEach(n => {
        const trimmed = n.trim()
        if (trimmed && trimmed.length < 20) itemNames.push(trimmed)
      })
    }

    // 从页面内容提取海克斯胜率数据
    // 查找内联的统计 JSON 数据
    const statsMatches = data.match(/"win_rate":([\d.]+),"pick_rate":([\d.]+)/g) || []
    const augmentStats = []
    let idx = 0
    for (const sm of statsMatches) {
      const wr = sm.match(/"win_rate":([\d.]+)/)
      const pr = sm.match(/"pick_rate":([\d.]+)/)
      if (wr && pr) {
        const name = idx < augNames.length ? augNames[idx] : ''
        augmentStats.push({
          name_zh: name,
          win_rate: parseFloat(wr[1]),
          pick_rate: parseFloat(pr[1]),
          tier: ''
        })
        idx++
      }
    }

    // 查找 augment name（从链接中）
    const augLinkMatches = data.match(/\/augments\/(\d+)/g) || []
    const augIds = [...new Set(augLinkMatches.map(m => parseInt(m.split('/').pop())))]

    // 从页面文本中提取海克斯名称映射
    const augNameMap = {}
    const nameMatches = data.match(/"name":"([^"]{1,30})"/g) || []
    for (const nm of nameMatches) {
      const n = nm.match(/"name":"([^"]+)"/)[1]
      if (n && n.length > 1 && n.length < 20 && !['aramgg.com', '首页', 'name'].includes(n)) {
        // 过滤出海克斯名称（不是英雄名、不是普通词）
        if (!n.includes('英雄') && !n.includes('大乱斗') && !n.includes('怎么') && !n.includes('什么')) {
          // 可能是海克斯名
        }
      }
    }

    return {
      champion_id: championId,
      champion: {
        name_zh: heroName,
        tier_rank: tierRank,
        win_rate: winRate,
        pick_rate: pickRate,
      },
      augments: augmentStats,
      augment_ids: augIds,
      recommended_items: itemNames,
      raw_stats_count: statsMatches.length,
      raw_augment_ids_count: augIds.length
    }
  } catch (err) {
    console.warn(`  英雄 ${championId} 抓取失败: ${err.message}`)
    return { champion_id: championId, error: err.message }
  }
}

// ====== 抓取海克斯列表 ======
async function fetchAugmentList() {
  console.log('\n[2/4] 抓取海克斯列表...')
  try {
    const { data } = await axios.get(`${BASE}/augments`, { headers: HEADERS, timeout: 15000 })
    const augLinkMatches = data.match(/\/augments\/(\d+)/g) || []
    const ids = [...new Set(augLinkMatches.map(m => parseInt(m.split('/').pop())))]
    console.log(`  提取到 ${ids.length} 个海克斯 ID`)

    // 提取名称
    const augmentList = []
    const nameMatches = data.match(/"name":"([^"]{1,40})"/g) || []
    for (const nm of nameMatches) {
      const name = nm.match(/"name":"([^"]+)"/)[1]
      if (name && name.length > 1 && name.length < 20 &&
          !name.includes('aramgg') && !name.includes('首页') &&
          !name.includes('英雄') && !name.includes('大乱斗')) {
        if (!augmentList.includes(name)) augmentList.push(name)
      }
    }
    console.log(`  提取到 ${augmentList.length} 个海克斯名称`)
    return { ids, names: augmentList }
  } catch (err) {
    console.warn(`  海克斯列表抓取失败: ${err.message}`)
    return { ids: [], names: [] }
  }
}

// ====== 抓取单个海克斯详情 ======
async function fetchAugmentDetail(augmentId) {
  const url = `${BASE}/augments/${augmentId}`
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 })

    const titleMatch = data.match(/<title>([^<]+)<\/title>/)
    const titleStr = titleMatch ? titleMatch[1] : ''

    const descMatch = data.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/)
    const desc = descMatch ? descMatch[1] : ''

    const wrMatch = desc.match(/胜率\s*([\d.]+)%/)
    const prMatch = desc.match(/选取率\s*([\d.]+)%/)

    return {
      augment_id: augmentId,
      name_zh: titleStr.split('海克斯')[0].trim() || titleStr.split(' ')[0] || '',
      win_rate: wrMatch ? parseFloat(wrMatch[1]) : 0,
      pick_rate: prMatch ? parseFloat(prMatch[1]) : 0,
      description: desc.substring(0, 100) || ''
    }
  } catch (err) {
    return { augment_id: augmentId, error: err.message }
  }
}

// ====== 主流程 ======
async function main() {
  console.log('=== aramgg.com 数据采集工具 ===')
  console.log(`输出目录: ${OUTPUT_DIR}\n`)

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Step 1: 获取英雄列表
  const championIds = await fetchChampionList()

  // Step 2: 逐个抓取英雄详情
  console.log(`\n[3/4] 抓取 ${championIds.length} 个英雄详情...`)
  const champions = []
  let successCount = 0
  for (let i = 0; i < championIds.length; i++) {
    const id = championIds[i]
    process.stdout.write(`  [${i + 1}/${championIds.length}] 英雄 ${id}...`)
    const detail = await fetchChampionDetail(id)
    champions.push(detail)
    if (!detail.error) {
      successCount++
      console.log(` ✅ (${detail.raw_stats_count} 条统计)`)
    } else {
      console.log(` ❌ ${detail.error}`)
    }
    await sleep(DELAY)
  }
  console.log(`  完成: ${successCount}/${championIds.length} 成功`)

  // Step 4: 获取海克斯列表
  const augData = await fetchAugmentList()

  // 写入 JSON 文件
  console.log('\n[4/4] 写入 JSON 文件...')

  // champions.json - 英雄基础数据（含 T级、胜率）
  const championData = champions
    .filter(c => c.champion && c.champion.name_zh)
    .map(c => ({
      _id: String(c.champion_id),
      riot_id: c.champion_id,
      name: '',
      name_zh: c.champion.name_zh,
      title: '',
      roles: [],
      icon_url: `https://ddragon.leagueoflegends.com/cdn/16.13.1/img/champion/${c.champion.name_zh}.png`,
      win_rate: c.champion.win_rate,
      pick_rate: c.champion.pick_rate,
      patch_version: PATCH_VERSION,
      updated_at: new Date().toISOString()
    }))
  fs.writeFileSync(path.join(OUTPUT_DIR, 'champions-scraped.json'), JSON.stringify(championData, null, 2))
  console.log(`  champions-scraped.json: ${championData.length} 条`)

  // champion_augments.json - 英雄×海克斯适配数据
  const champAugmentData = []
  champions.forEach(c => {
    if (c.augments && c.augments.length > 0) {
      c.augments.forEach((a, idx) => {
        // 用 aid 列表中的 ID（如果有的话），否则用索引占位
        const aid = c.augment_ids && c.augment_ids[idx] ? c.augment_ids[idx] : idx + 1000
        champAugmentData.push({
          _id: `${c.champion_id}_${aid}_${PATCH_VERSION}`,
          champion_id: c.champion_id,
          augment_id: aid,
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          sample_size: 5000,
          tier: '',
          patch_version: PATCH_VERSION,
          updated_at: new Date().toISOString()
        })
      })
    }
  })
  fs.writeFileSync(path.join(OUTPUT_DIR, 'champion-augments-scraped.json'), JSON.stringify(champAugmentData, null, 2))
  console.log(`  champion-augments-scraped.json: ${champAugmentData.length} 条`)

  // augments.json - 海克斯基础数据
  const augmentData = augData.ids.map((id, idx) => ({
    _id: String(id),
    riot_id: id,
    name: '',
    name_zh: augData.names[idx] || `海克斯${id}`,
    description: '',
    description_zh: '',
    rarity: 'gold',
    icon_url: `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/augment-icons/${id}.png`,
    win_rate: 0,
    pick_rate: 0,
    patch_version: PATCH_VERSION,
    updated_at: new Date().toISOString()
  }))
  fs.writeFileSync(path.join(OUTPUT_DIR, 'augments-scraped.json'), JSON.stringify(augmentData, null, 2))
  console.log(`  augments-scraped.json: ${augmentData.length} 条`)

  // 统计摘要
  console.log('\n=== 采集完成 ===')
  console.log(`英雄: ${championData.length} 个`)
  console.log(`海克斯: ${augmentData.length} 个`)
  console.log(`英雄×海克斯适配: ${champAugmentData.length} 条`)
  console.log(`\n导入步骤:`)
  console.log(`1. 打开云开发控制台 → 数据库`)
  console.log(`2. 对每个集合选择"导入"，选择对应的 JSON 文件`)
  console.log(`3. 导入顺序: augments → champions → champion_augments`)
}

main().catch(console.error)
