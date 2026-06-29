// cloudfunctions/augmentDetail/index.js
// 海克斯详情查询云函数
// 功能：获取指定海克斯的完整信息，包括最适配/不适配英雄、推荐装备
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
  const { augment_id, patch } = event

  // 参数校验：augment_id 必须为数字
  if (!augment_id || typeof augment_id !== 'number') {
    return { code: 1001, data: null, message: 'augment_id 为必填数字' }
  }

  try {
    const patchVersion = patch || await getCurrentPatch()

    // ---------- 并行执行 3 个核心查询 ----------
    const [augmentRes, bestRes, worstRes] = await Promise.all([
      // 1. 海克斯基础信息（兼容字符串和数字 _id）
      db.collection('augments')
        .where(_.or([{ _id: String(augment_id) }, { _id: augment_id }]))
        .limit(1)
        .get()
        .then(res => res.data.length > 0 ? { data: res.data[0] } : { data: null })
        .catch(() => ({ data: null })),

      // 2. 最适配英雄 TOP10（按胜率降序）
      db.collection('champion_augments')
        .where({ augment_id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc')
        .limit(10)
        .get(),

      // 3. 最不适配英雄 BOTTOM5（按胜率升序）
      db.collection('champion_augments')
        .where({ augment_id, patch_version: patchVersion })
        .orderBy('win_rate', 'asc')
        .limit(5)
        .get()
    ])

    // 如果海克斯不存在
    if (!augmentRes.data) {
      return { code: 1002, data: null, message: '海克斯不存在' }
    }

    // ---------- 计算全局排名（按胜率在所有海克斯中的排名） ----------
    const higherCountRes = await db.collection('augments')
      .where({
        patch_version: patchVersion,
        win_rate: _.gt(augmentRes.data.win_rate || 0)
      })
      .count()
    const global_rank = higherCountRes.total + 1

    // 查询当前版本海克斯总数（用于排名卡片展示 "排名 #X/171"）
    const totalAugmentsRes = await db.collection('augments')
      .where({ patch_version: patchVersion })
      .count()

    // ---------- 批量关联查询英雄的中文名/图标 ----------
    const championIds = [
      ...bestRes.data.map(a => a.champion_id),
      ...worstRes.data.map(a => a.champion_id)
    ]

    const championInfoRes = championIds.length > 0
      ? await db.collection('champions')
          .where({ riot_id: _.in(championIds) })
          .field({ riot_id: true, name_zh: true, icon_url: true })
          .get()
      : { data: [] }

    const championMap = {}
    championInfoRes.data.forEach(c => { championMap[c.riot_id] = c })

    // ---------- 组装响应数据 ----------
    // 去重：同一个 champion_id 只保留一条（防止 DB 残留重复记录）
    const bestMap = new Map()
    bestRes.data.forEach(a => {
      if (!bestMap.has(a.champion_id)) bestMap.set(a.champion_id, a)
    })
    const worstMap = new Map()
    worstRes.data.forEach(a => {
      if (!worstMap.has(a.champion_id)) worstMap.set(a.champion_id, a)
    })

    const augmentData = {
      ...augmentRes.data,
      global_rank,
      total_augments: totalAugmentsRes.total
    }

    return {
      code: 0,
      message: 'success',
      data: {
        augment: augmentData,
        best_champions: [...bestMap.values()].map(a => ({
          champion_id: a.champion_id,
          champion_name_zh: championMap[a.champion_id]?.name_zh || '',
          icon_url: championMap[a.champion_id]?.icon_url || '',
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          tier: a.tier,
          sample_size: a.sample_size
        })),
        worst_champions: [...worstMap.values()].map(a => ({
          champion_id: a.champion_id,
          champion_name_zh: championMap[a.champion_id]?.name_zh || '',
          icon_url: championMap[a.champion_id]?.icon_url || '',
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          tier: a.tier,
          sample_size: a.sample_size
        })),
        items: [],  // augment_items 集合暂无数据源
        patch_version: patchVersion
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[augmentDetail] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
