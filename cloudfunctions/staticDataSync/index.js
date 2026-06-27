// cloudfunctions/staticDataSync/index.js
// 静态数据同步云函数（每版本触发，手动调用）
// 功能：从多个外部 API 拉取英雄/装备/海克斯基础数据 + 中文本地化，合并后写入云数据库
// 数据源：
//   1) Community Dragon - 英文基础数据（英雄/装备/海克斯）
//   2) League of Dragon (Riot CDN) - 中文本地化（英雄/装备）
//   3) League of Dragon (Riot CDN) - 海克斯中文翻译
//
// 中文源优先级：
//   主源: https://leagueoflegends.leagueoflegends.com.cn/loln-od/zh_CN/{ver}/data/...
//   备源: https://ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/...

const cloud = require('wx-server-sdk')
const axios = require('axios')
const { CHAMPION_CN_MAP } = require('./champion-cn-map')
const { ITEM_CN_MAP } = require('./item-cn-map')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
// 图片 CDN：DDragon /img/ 端点（从微信小程序可访问，云函数 403 不影响前端）
const DDRAGON_IMG_BASE = 'https://ddragon.leagueoflegends.com/cdn/16.13.1/img'
// 英文基础数据源（JSON）
const CDRAWN_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1'
// 中文数据源（多源并行，取第一个成功的）
// 主源：Riot 中国 CDN（League of Dragon），中国大陆可直接访问
const LEAGUE_OF_DRAGON_BASE = 'https://leagueoflegends.leagueoflegends.com.cn/loln-od'
// 备源：Data Dragon 官方 CDN（可能从云函数不可达）
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn'
// 备源2：hextech.dtodo.cn（海克斯中文翻译）
const HEXTECH_BASE = 'https://hextech.dtodo.cn/data'

const ENDPOINTS = {
  championSummary: `${CDRAWN_BASE}/champion-summary.json`,
  items: `${CDRAWN_BASE}/items.json`,
  cherryAugments: `${CDRAWN_BASE}/cherry-augments.json`
}

const DEFAULT_HEADERS = {
  'User-Agent': 'ARAM-Mayhem-Guide/1.0 (WeChat-MiniProgram)',
  Accept: 'application/json'
}

// Data Dragon 需要 QQ 域 Referer 才能通过 CDN 验证（Riot CDN IP 封锁）
const DDRAGON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
  Referer: 'https://lol.qq.com/',
  Origin: 'https://lol.qq.com'
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { patch_version } = event  // 手动触发时传入版本号，如 "26.12"

  if (!patch_version || !/^\d+\.\d+$/.test(patch_version)) {
    return { code: 1001, data: null, message: 'patch_version 格式不正确，应为 "xx.xx"' }
  }

  console.log(`[staticDataSync] 开始同步版本 ${patch_version} 的静态数据`)

  try {
    // 标记版本状态为 syncing
    await db.collection('patches').doc(patch_version).set({
      data: {
        version: patch_version,
        released_at: new Date(),
        is_current: true,
        data_status: 'syncing',
        updated_at: new Date()
      }
    }).catch(() => {})

    // Step 1: 并行拉取所有数据源
    const [
      championSummary,
      itemsRaw,
      cherryAugments
    ] = await Promise.all([
      fetchJSON(ENDPOINTS.championSummary),
      fetchJSON(ENDPOINTS.items),
      fetchJSON(ENDPOINTS.cherryAugments)
    ])

    // Data Dragon 中文本地化：多源并行获取，允许降级为英文名
    // 主源：League of Dragon（Riot 中国 CDN），备源：Data Dragon 官方 CDN
    let ddChampion = {}, ddItem = {}, hextechZh = {}
    const [ddC, ddI, augZh] = await Promise.all([
      fetchChineseChampion(patch_version).catch(err => {
        console.warn(`[staticDataSync] ⚠️ 英雄中文数据获取失败: ${err.message}，将使用英文名`)
        return null
      }),
      fetchChineseItem(patch_version).catch(err => {
        console.warn(`[staticDataSync] ⚠️ 装备中文数据获取失败: ${err.message}，将使用英文名`)
        return null
      }),
      fetchChineseAugments(patch_version).catch(err => {
        console.warn(`[staticDataSync] ⚠️ 海克斯中文翻译获取失败: ${err.message}，将使用英文名`)
        return {}
      })
    ])
    if (ddC) ddChampion = ddC
    if (ddI) ddItem = ddI
    if (augZh) hextechZh = augZh

    console.log(`[staticDataSync] 数据拉取完成，开始转换和写入`)

    // Step 2: 转换并写入各集合
    const [champCount, itemCount, augCount] = await Promise.all([
      syncChampions(championSummary, ddChampion, patch_version),
      syncItems(itemsRaw, ddItem, patch_version),
      syncAugments(cherryAugments, hextechZh, patch_version)
    ])

    // Step 3: 更新 patches 集合 - 将新版本设为 is_current
    await db.collection('patches').doc(patch_version).update({
      data: {
        is_current: true,
        data_status: 'ready',
        static_updated_at: new Date(),
        updated_at: new Date()
      }
    })

    // Step 4: 将旧版本的 is_current 置为 false
    await db.collection('patches')
      .where({
        is_current: true,
        _id: _.neq(patch_version)
      })
      .update({
        data: { is_current: false, updated_at: new Date() }
      })

    console.log(`[staticDataSync] 版本 ${patch_version} 静态数据同步完成`)
    const embeddedChampCount = Object.keys(CHAMPION_CN_MAP).length
    console.log(`[staticDataSync] 中文数据: 英雄 ${embeddedChampCount} 个(内嵌), 装备 ${Object.keys(ITEM_CN_MAP).length} 个(内嵌), 海克斯 ${Object.keys(hextechZh).length} 个`)
    return {
      code: 0,
      message: 'success',
      data: {
        patch_version,
        champions_synced: champCount,
        items_synced: itemCount,
        augments_synced: augCount
      }
    }
  } catch (err) {
    console.error('[staticDataSync] 同步失败:', err)
    // 更新版本状态为 error
    await db.collection('patches')
      .where({ _id: patch_version })
      .update({ data: { data_status: 'error', updated_at: new Date() } })
      .catch(() => {})

    return { code: 2001, data: null, message: `静态数据同步失败: ${err.message}` }
  }
}

// ========== 数据转换与写入函数 ==========

/**
 * 同步英雄数据
 * 合并 Community Dragon（ID/英文名/图标）+ 内嵌中文映射（champion-cn-map.js）
 */
async function syncChampions(championSummary, ddChampion, patchVersion) {
  const ddData = (ddChampion && ddChampion.data) || {}

  // Data Dragon 映射（如果获取成功的话）
  const ddMap = {}
  for (const [key, val] of Object.entries(ddData)) {
    ddMap[key] = {
      name_zh: val.name,        // DDragon name = 中文名（如"亚索"）
      title: val.title          // DDragon title = 称号（如"疾风剑豪"）
    }
    ddMap[key.toLowerCase()] = ddMap[key]
  }

  const batch = championSummary
    .filter(c => c && c.id > 0)
    .map(champ => {
      // 优先级1: 内嵌映射（来自 Data Dragon zh_CN，170 个英雄全覆盖）
      const embedded = CHAMPION_CN_MAP[champ.id]

      // 优先级2: Data Dragon 动态获取（如果成功的话）
      const lookupKey = champ.alias || champ.name
      let ddInfo = ddMap[lookupKey]
      if (!ddInfo) ddInfo = ddMap[lookupKey.toLowerCase()]

      // 优先级3: 英文名（全部失败时的降级）
      return {
        _id: String(champ.id),
        riot_id: champ.id,
        name: champ.name,
        name_zh: embedded?.name_zh || ddInfo?.name_zh || champ.name,
        title: embedded?.title || ddInfo?.title || '',
        roles: [],
        icon_url: `${DDRAGON_IMG_BASE}/champion/${champ.alias || champ.name}.png`,
        win_rate: 0,
        pick_rate: 0,
        patch_version: patchVersion,
        updated_at: new Date()
      }
    })

  await batchUpsert('champions', batch)
  console.log(`[staticDataSync] champions 写入 ${batch.length} 条`)
  return batch.length
}

/**
 * 同步装备数据
 * 合并 Community Dragon（ID/英文名/价格/合成路径）+ 内嵌中文映射（item-cn-map.js）
 */
async function syncItems(itemsRaw, ddItem, patchVersion) {
  const ddData = (ddItem && ddItem.data) || {}

  // Data Dragon 映射（如果获取成功的话）
  const ddMap = {}
  for (const [key, val] of Object.entries(ddData)) {
    ddMap[key] = {
      name_zh: val.name || key,
      description_zh: val.description || ''
    }
  }

  const batch = itemsRaw
    .filter(item => item && item.id > 0)
    .map(item => {
      // 优先级1: 内嵌映射（来自 Data Dragon zh_CN）
      const embedded = ITEM_CN_MAP[item.id]

      // 优先级2: Data Dragon 动态获取
      const ddInfo = ddMap[String(item.id)]

      // 优先级3: 英文名
      return {
        _id: String(item.id),
        riot_id: item.id,
        name: item.name || '',
        name_zh: embedded?.name_zh || ddInfo?.name_zh || item.name,
        description: item.description || '',
        description_zh: embedded?.desc_zh || stripHtml(ddInfo?.description_zh || ''),
        price: item.priceTotal || item.price || 0,
        icon_url: `${DDRAGON_IMG_BASE}/item/${item.id}.png`,
        from_ids: (item.from || []).map(Number),
        to_ids: (item.to || []).map(Number),
        categories: item.categories || [],
        patch_version: patchVersion,
        updated_at: new Date()
      }
    })

  await batchUpsert('items', batch)
  console.log(`[staticDataSync] items 写入 ${batch.length} 条`)
  return batch.length
}

/**
 * 同步海克斯强化数据
 * 合并 Community Dragon（ID/英文名/稀有度）+ 中文翻译数据（Map 格式）
 */
async function syncAugments(cherryAugments, zhMap, patchVersion) {
  // zhMap 格式: { 1205: { name_zh: "无限循环", description_zh: "..." }, ... }
  // 兼容 Map 和普通 object
  const getZhInfo = (id) => {
    const numId = Number(id)
    if (zhMap instanceof Map) return zhMap.get(numId) || {}
    return zhMap[numId] || zhMap[String(numId)] || {}
  }

  // BUG-004 修复：CDragon 的 rarity 字段是字符串 "kSilver"/"kGold"/"kPrismatic"
  // 不是数字 1/2/3，需要正确转换
  const rarityFromK = (rarity) => {
    if (!rarity) return null
    const str = String(rarity).toLowerCase().replace(/^k/, '')
    // "kSilver" → "silver", "kGold" → "gold", "kPrismatic" → "prismatic"
    if (['silver', 'gold', 'prismatic'].includes(str)) return str
    return null  // kEventChoice, kBronze 等非标准稀有度返回 null
  }

  // 只处理标准三种稀有度的海克斯，过滤掉 kEventChoice/kBronze 等特殊类型
  const batch = cherryAugments
    .filter(a => a && a.id > 0)
    .map(augment => {
      const zhInfo = getZhInfo(augment.id)
      const rarity = rarityFromK(augment.rarity)
      if (!rarity) return null  // 跳过非标准稀有度

      return {
        _id: String(augment.id),
        riot_id: augment.id,
        // BUG-005 修复：CDragon 的英文名在 nameTRA 字段，不是 name 或 apiName
        name: augment.nameTRA || augment.augmentNameId || '',
        name_zh: zhInfo.name_zh || augment.nameTRA || '',
        description: augment.description || '',
        description_zh: zhInfo.description_zh || stripHtml(augment.description || ''),
        rarity,
        icon_url: `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/augment-icons/${augment.id}.png`,
        win_rate: 0,
        pick_rate: 0,
        patch_version: patchVersion,
        updated_at: new Date()
      }
    })
    .filter(Boolean)  // 移除 null（非标准稀有度的海克斯）

  await batchUpsert('augments', batch)
  console.log(`[staticDataSync] augments 写入 ${batch.length} 条`)
  return batch.length
}

// ========== 工具函数 ==========

/**
 * 获取英雄中文数据（多源并行）
 * 主源：Data Dragon（需要 QQ Referer 头绕过 CDN 封锁）
 */
async function fetchChineseChampion(patchVersion) {
  const sources = [
    { url: `${DDRAGON_BASE}/${patchVersion}/data/zh_CN/champion.json`, headers: DDRAGON_HEADERS },
    // 备源：League of Dragon（Riot 中国 CDN，DNS 可能不可达）
    { url: `${LEAGUE_OF_DRAGON_BASE}/zh_CN/${patchVersion}/data/champion.json`, headers: DEFAULT_HEADERS }
  ]

  for (const source of sources) {
    try {
      const data = await fetchJSON(source.url, 1, 10000, source.headers)
      if (data && data.data) {
        console.log(`[fetchChineseChampion] 成功: ${source.url}`)
        return data
      }
    } catch (err) {
      console.warn(`[fetchChineseChampion] 源失败: ${source.url} - ${err.message}`)
    }
  }
  throw new Error('所有英雄中文数据源均不可用')
}

/**
 * 获取装备中文数据（多源并行）
 */
async function fetchChineseItem(patchVersion) {
  const sources = [
    { url: `${DDRAGON_BASE}/${patchVersion}/data/zh_CN/item.json`, headers: DDRAGON_HEADERS },
    { url: `${LEAGUE_OF_DRAGON_BASE}/zh_CN/${patchVersion}/data/item.json`, headers: DEFAULT_HEADERS }
  ]

  for (const source of sources) {
    try {
      const data = await fetchJSON(source.url, 1, 10000, source.headers)
      if (data && data.data) {
        console.log(`[fetchChineseItem] 成功: ${source.url}`)
        return data
      }
    } catch (err) {
      console.warn(`[fetchChineseItem] 源失败: ${source.url} - ${err.message}`)
    }
  }
  throw new Error('所有装备中文数据源均不可用')
}

/**
 * 获取海克斯中文翻译（多源并行）
 */
async function fetchChineseAugments(patchVersion) {
  const sources = [
    // 主源：Data Dragon（需要 QQ Referer）
    {
      url: `${DDRAGON_BASE}/${patchVersion}/data/zh_CN/augment.json`,
      headers: DDRAGON_HEADERS,
      parse: (data) => {
        if (!data || !data.data) return {}
        const map = {}
        for (const [key, val] of Object.entries(data.data)) {
          const id = val.key || key
          map[Number(id)] = {
            name_zh: val.displayName || val.name || '',
            description_zh: val.description || ''
          }
        }
        return map
      }
    },
    // 备源：hextech.dtodo.cn
    {
      url: `${HEXTECH_BASE}/aram-mayhem-augments.zh_cn.json`,
      headers: DEFAULT_HEADERS,
      parse: (data) => {
        if (!data) return {}
        const map = {}
        if (Array.isArray(data)) {
          data.forEach(a => {
            const id = a.id || a.riot_id
            if (id) {
              map[id] = {
                name_zh: a.displayName || a.name_zh || '',
                description_zh: a.description || a.description_zh || ''
              }
            }
          })
        } else if (typeof data === 'object') {
          for (const [id, val] of Object.entries(data)) {
            if (val && typeof val === 'object') {
              map[Number(id)] = {
                name_zh: val.displayName || '',
                description_zh: val.description || ''
              }
            }
          }
        }
        return map
      }
    }
  ]

  for (const source of sources) {
    try {
      const data = await fetchJSON(source.url, 1, 10000, source.headers)
      const parsed = source.parse(data)
      if (Object.keys(parsed).length > 0) {
        console.log(`[fetchChineseAugments] 成功: ${source.url} (${Object.keys(parsed).length} 条)`)
        return parsed
      }
    } catch (err) {
      console.warn(`[fetchChineseAugments] 源失败: ${source.url} - ${err.message}`)
    }
  }
  throw new Error('所有海克斯中文数据源均不可用')
}

/**
 * 批量 upsert 到云数据库
 * 云数据库单次写入限制 20 条，需分批执行
 */
async function batchUpsert(collectionName, docs, batchSize = 20) {
  const collection = db.collection(collectionName)
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await Promise.all(batch.map(doc => {
      const { _id, ...data } = doc
      return collection.doc(_id).set({ data })
    }))
  }
}

/**
 * HTTP GET 请求并解析 JSON
 * 含超时、重试、指数退避逻辑
 * @param {string} url
 * @param {number} retries
 * @param {number} timeout
 * @param {object} headers - 可选请求头，默认使用 DEFAULT_HEADERS
 */
async function fetchJSON(url, retries = 2, timeout = 8000, headers) {
  const reqHeaders = headers || DEFAULT_HEADERS
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: reqHeaders,
        timeout,
        responseType: 'json'
      })
      return response.data
    } catch (err) {
      console.warn(`[fetchJSON] 第 ${attempt} 次请求失败: ${url}`, err.message)
      if (attempt === retries) {
        throw new Error(`请求失败 (${retries} 次重试后): ${url} - ${err.message}`)
      }
      // 指数退避
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }
}

/** 去除 HTML 标签 */
function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

/** 延迟函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
