// cloudfunctions/championDetail/index.js
// 英雄详情查询云函数
// 功能：获取指定英雄的完整信息，包括推荐海克斯、推荐装备、阶段表现
// 新增：hexdata 推荐决策模块数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const axios = require('axios')
const COMPLETED_ITEM_IDS = require('./data/completed-item-ids.js')
const CHAMPION_BUILDS = require('./data/champion-builds.js')
const FORMULA_ITEMS = require('./data/hero-formula-items.js')

// Tier 等级映射函数（T1-T5）
function mapTierToRank(winRate) {
  if (winRate >= 55) return 'T1'
  if (winRate >= 52) return 'T2'
  if (winRate >= 49) return 'T3'
  if (winRate >= 46) return 'T4'
  return 'T5'
}

// 获取当前版本号
async function getCurrentPatch() {
  const res = await db.collection('patches')
    .where({ is_current: true })
    .field({ version: true })
    .limit(1)
    .get()
  if (res.data.length === 0) {
    throw new Error('未找到当前版本信息')
  }
  return Number(res.data[0].version)
}

// hexdata 英雄详情请求（best-effort）
async function fetchHexHeroDetail(championId) {
  try {
    const { data } = await axios.get(`https://hexdata.com.cn/data/heroes/${championId}.json`, {
      timeout: 10000,
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    })
    const formula = FORMULA_ITEMS[String(championId)] || null
    return {
      augments: Array.isArray(data.augments) ? data.augments : [],
      items: Array.isArray(data.items) ? data.items : [],
      trios: Array.isArray(data.trios) ? data.trios : [],
      formula
    }
  } catch (e) {
    console.warn(`[championDetail] hexdata 拉取失败 (id=${championId}):`, e.message)
    return null
  }
}

exports.main = async (event) => {
  const { champion_id, patch } = event

  // 参数校验：champion_id 必须为数字
  if (!champion_id || typeof champion_id !== 'number') {
    return { code: 1001, data: null, message: 'champion_id 为必填数字' }
  }

  try {
    const patchVersion = patch || await getCurrentPatch()

    // ---------- 并行执行 5 个查询（4 DB + 1 hexdata） ----------
    const [championRes, augmentsRes, itemsRes, stageRes, hexdataRes] = await Promise.all([
      // 1. 英雄基础信息（兼容字符串和数字 _id）
      db.collection('champions')
        .where(_.or([{ _id: String(champion_id) }, { _id: champion_id }]))
        .limit(1)
        .get()
        .then(res => res.data.length > 0 ? { data: res.data[0] } : { data: null })
        .catch(() => ({ data: null })),

      // 2. 推荐海克斯（按胜率降序，最多返回 50 条）
      db.collection('champion_augments')
        .where({
          champion_id: champion_id,
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(50)
        .get(),

      // 3. 推荐装备（按胜率降序，最多返回 50 条，后续过滤成装）
      db.collection('champion_items')
        .where({
          champion_id: champion_id,
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(50)
        .get(),

      // 4. 阶段表现
      db.collection('champion_stage_performance')
        .where({
          champion_id: champion_id,
          patch_version: patchVersion
        })
        .orderBy('augment_id', 'asc')
        .orderBy('stage', 'asc')
        .limit(200)
        .get(),

      // 5. hexdata 推荐决策（best-effort，失败返回 null 不影响其他）
      fetchHexHeroDetail(champion_id)
    ])

    // 如果英雄不存在
    if (!championRes.data) {
      return { code: 1002, data: null, message: '英雄不存在' }
    }

    // ---------- 计算 champion 排名 ----------
    const higherCountRes = await db.collection('champions')
      .where({
        patch_version: patchVersion,
        win_rate: _.gt(championRes.data.win_rate || 0)
      })
      .count()
    const championRank = higherCountRes.total + 1

    const totalChampionsRes = await db.collection('champions')
      .where({ patch_version: patchVersion })
      .count()

    const tierRank = mapTierToRank(championRes.data.win_rate || 0)

    // ---------- 批量关联查询 augment 和 item 的中文名/稀有度 ----------
    const augmentIds = augmentsRes.data.map(a => a.augment_id)
    const allAugmentIds = [...new Set(augmentIds)]

    const itemIds = itemsRes.data.map(i => i.item_id)
    const uniqueItemIds = [...new Set(itemIds)]

    const [augmentInfoRes, itemInfoRes] = await Promise.all([
      allAugmentIds.length > 0
        ? db.collection('augments')
            .where({ riot_id: _.in(allAugmentIds) })
            .field({ riot_id: true, name_zh: true, rarity: true, icon_url: true })
            .get()
        : { data: [] },
      uniqueItemIds.length > 0
        ? db.collection('items')
            .where({ riot_id: _.in(uniqueItemIds) })
            .field({ riot_id: true, name_zh: true, icon_url: true })
            .get()
        : { data: [] }
    ])

    // 构建 ID → 信息 映射（避免 N+1 查询）
    const augmentMap = {}
    augmentInfoRes.data.forEach(a => { augmentMap[a.riot_id] = a })
    const itemMap = {}
    itemInfoRes.data.forEach(i => { itemMap[i.riot_id] = i })

    // ---------- 组装阶段表现：按 augment_id 分组 ----------
    const stageByAugment = {}
    stageRes.data.forEach(s => {
      if (!stageByAugment[s.augment_id]) {
        stageByAugment[s.augment_id] = {}
      }
      stageByAugment[s.augment_id][s.stage] = {
        stage: s.stage,
        win_rate: s.win_rate,
        pick_rate: s.pick_rate,
        sample_size: s.sample_size
      }
    })

    // ---------- 组装响应数据 ----------
    // 去重：同一个 augment_id 只取胜率最高的那条（防止 DB 残留重复记录）
    const dedupedAugments = new Map()
    augmentsRes.data.forEach(a => {
      const existing = dedupedAugments.get(a.augment_id)
      if (!existing || a.win_rate > existing.win_rate) {
        dedupedAugments.set(a.augment_id, a)
      }
    })
    let augments = [...dedupedAugments.values()]
      .sort((a, b) => b.win_rate - a.win_rate)
      .map(a => ({
        augment_id: a.augment_id,
        augment_name_zh: augmentMap[a.augment_id]?.name_zh || '',
        name_zh: augmentMap[a.augment_id]?.name_zh || '',
        rarity: augmentMap[a.augment_id]?.rarity || '',
        icon_url: augmentMap[a.augment_id]?.icon_url || '',
        win_rate: a.win_rate,
        pick_rate: a.pick_rate,
        tier: a.tier,
        tier_rank: mapTierToRank(a.win_rate),
        sample_size: a.sample_size,
        stage_performance: stageByAugment[a.augment_id] || null
      }))

    // 降级：无 champion_augments 数据时，用 hexdata 的 top_augments
    if (augments.length === 0 && championRes.data.top_augments) {
      augments = championRes.data.top_augments.map(ta => ({
        augment_id: Number(ta.id),
        augment_name_zh: augmentMap[Number(ta.id)]?.name_zh || ta.name || '',
        name_zh: augmentMap[Number(ta.id)]?.name_zh || ta.name || '',
        rarity: augmentMap[Number(ta.id)]?.rarity || '',
        icon_url: augmentMap[Number(ta.id)]?.icon_url || ta.iconUrl || '',
        win_rate: null,
        pick_rate: null,
        tier: null,
        tier_rank: null,
        sample_size: 0,
        stage_performance: null
      }))
    }

    // 为 hexdata 海克斯补充稀有度（从 DB augmentMap 查找）
    if (hexdataRes && hexdataRes.augments) {
      hexdataRes.augments = hexdataRes.augments.map(a => ({
        ...a,
        rarity: augmentMap[a.augmentId]?.rarity || a.rarity || ''
      }))
    }

    const items = itemsRes.data
      .filter(i => COMPLETED_ITEM_IDS.has(Number(i.item_id)))
      .map(i => ({
        item_id: i.item_id,
        item_name_zh: itemMap[i.item_id]?.name_zh || '',
        name_zh: itemMap[i.item_id]?.name_zh || '',
        icon_url: itemMap[i.item_id]?.icon_url || '',
        win_rate: i.win_rate,
        pick_rate: i.pick_rate,
        tier: i.tier,
        tier_rank: mapTierToRank(i.win_rate),
        is_core: i.is_core,
        slot: i.slot,
        sample_size: i.sample_size
      }))

    return {
      code: 0,
      message: 'success',
      data: {
        champion: {
          ...championRes.data,
          tier_rank: tierRank,
          champion_rank: championRank,
          total_champions: totalChampionsRes.total
        },
        augments,
        items,
        builds: CHAMPION_BUILDS[String(champion_id)] || CHAMPION_BUILDS[champion_id] || [],
        augment_items_linkage: [],
        stage_performance: stageRes.data,
        hexdata_decisions: hexdataRes,
        patch_version: patchVersion
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[championDetail] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
