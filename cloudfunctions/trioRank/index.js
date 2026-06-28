// cloudfunctions/trioRank/index.js
// 三海克斯组合排行查询云函数
// 功能：获取三海克斯组合排行榜，支持按英雄、流派筛选
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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

exports.main = async (event) => {
  try {
    const {
      champion_id,        // 可选，英雄 ID 筛选
      playstyle,          // 可选，流派标签（保留字段，暂作过滤用）
      sort_by = 'win_rate',
      page = 1,
      page_size = 20,
      patch
    } = event

    // ---------- 参数校验 ----------
    const validSortFields = ['win_rate', 'sample_size']
    if (sort_by && !validSortFields.includes(sort_by)) {
      return { code: 1001, data: null, message: `sort_by 必须为 ${validSortFields.join('/')} 之一` }
    }
    if (page !== undefined && (page < 1 || !Number.isInteger(page))) {
      return { code: 1001, data: null, message: 'page 必须为正整数' }
    }
    if (page_size !== undefined && (page_size < 1 || !Number.isInteger(page_size))) {
      return { code: 1001, data: null, message: 'page_size 必须为正整数' }
    }

    const patchVersion = patch || await getCurrentPatch()
    const safePageSize = Math.max(1, Math.min(page_size, 50))

    // ---------- 构建查询条件 ----------
    const where = { patch_version: patchVersion }

    if (champion_id) {
      // 查询指定英雄的组合
      where.champion_id = champion_id
    } else {
      // 默认查全局组合（champion_id 为 null）
      where.champion_id = null
    }

    // 最低样本量过滤，避免小样本数据干扰排名
    where.sample_size = _.gte(50)

    // ---------- 查询总数 ----------
    const countResult = await db.collection('augment_trios')
      .where(where)
      .count()
    const total = countResult.total

    // ---------- 分页查询 ----------
    const skip = (page - 1) * safePageSize
    const listResult = await db.collection('augment_trios')
      .where(where)
      .orderBy(sort_by, 'desc')
      .skip(skip)
      .limit(safePageSize)
      .get()

    // ---------- 批量关联海克斯名称/图标 ----------
    const allAugmentIds = new Set()
    listResult.data.forEach(t => {
      if (Array.isArray(t.augment_ids)) {
        t.augment_ids.forEach(id => allAugmentIds.add(Number(id)))
      }
    })

    let augmentMap = {}
    if (allAugmentIds.size > 0) {
      const augmentInfoRes = await db.collection('augments')
        .where({ riot_id: _.in([...allAugmentIds]) })
        .field({ riot_id: true, name_zh: true, icon_url: true, rarity: true })
        .get()

      augmentInfoRes.data.forEach(a => {
        augmentMap[a.riot_id] = { name_zh: a.name_zh, icon_url: a.icon_url, rarity: a.rarity }
      })
    }

    // ---------- 组装响应数据 ----------
    const list = listResult.data.map(t => ({
      augment_ids: t.augment_ids,
      augment_names_zh: (t.augment_ids || []).map(id => augmentMap[Number(id)]?.name_zh || ''),
      augment_icons: (t.augment_ids || []).map(id => augmentMap[Number(id)]?.icon_url || ''),
      augment_rarities: (t.augment_ids || []).map(id => augmentMap[Number(id)]?.rarity || ''),
      win_rate: t.win_rate,
      sample_size: t.sample_size,
      tier: t.tier
    }))

    return {
      code: 0,
      message: 'success',
      data: {
        list,
        total,
        page,
        page_size: safePageSize,
        total_pages: Math.ceil(total / safePageSize)
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[trioRank] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
