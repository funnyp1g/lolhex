// cloudfunctions/championDetail/index.js
// 英雄详情查询云函数（最复杂，需并行查询 4 个集合 + 关联查询）
// 功能：获取指定英雄的完整信息，包括推荐海克斯、推荐装备、海克斯×出装联动
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
  return res.data[0].version
}

exports.main = async (event) => {
  const { champion_id, patch } = event

  // 参数校验：champion_id 必须为数字
  if (!champion_id || typeof champion_id !== 'number') {
    return { code: 1001, data: null, message: 'champion_id 为必填数字' }
  }

  try {
    const patchVersion = patch || await getCurrentPatch()

    // ---------- 并行执行 4 个核心查询 ----------
    const [championRes, augmentsRes, itemsRes, linkageRes] = await Promise.all([
      // 1. 英雄基础信息
      db.collection('champions')
        .doc(String(champion_id))
        .get()
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

      // 3. 推荐装备（按胜率降序，最多返回 30 条）
      db.collection('champion_items')
        .where({
          champion_id: champion_id,
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(30)
        .get(),

      // 4. 海克斯×出装联动（按胜率降序，最多返回 50 条）
      db.collection('augment_items')
        .where({
          champion_id: champion_id,
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(50)
        .get()
    ])

    // 如果英雄不存在
    if (!championRes.data) {
      return { code: 1002, data: null, message: '英雄不存在' }
    }

    // ---------- 批量关联查询 augment 和 item 的中文名/稀有度 ----------
    const augmentIds = augmentsRes.data.map(a => a.augment_id)
    const linkageAugmentIds = linkageRes.data.map(l => l.augment_id)
    const allAugmentIds = [...new Set([...augmentIds, ...linkageAugmentIds])]

    const itemIds = [
      ...itemsRes.data.map(i => i.item_id),
      ...linkageRes.data.map(l => l.item_id)
    ]
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

    // ---------- 组装响应数据 ----------
    const augments = augmentsRes.data.map(a => ({
      augment_id: a.augment_id,
      augment_name_zh: augmentMap[a.augment_id]?.name_zh || '',
      rarity: augmentMap[a.augment_id]?.rarity || '',
      icon_url: augmentMap[a.augment_id]?.icon_url || '',
      win_rate: a.win_rate,
      pick_rate: a.pick_rate,
      tier: a.tier,
      sample_size: a.sample_size
    }))

    const items = itemsRes.data.map(i => ({
      item_id: i.item_id,
      item_name_zh: itemMap[i.item_id]?.name_zh || '',
      icon_url: itemMap[i.item_id]?.icon_url || '',
      win_rate: i.win_rate,
      pick_rate: i.pick_rate,
      tier: i.tier,
      is_core: i.is_core,
      slot: i.slot,
      sample_size: i.sample_size
    }))

    const linkage = linkageRes.data.map(l => ({
      augment_id: l.augment_id,
      augment_name_zh: augmentMap[l.augment_id]?.name_zh || '',
      item_id: l.item_id,
      item_name_zh: itemMap[l.item_id]?.name_zh || '',
      win_rate: l.win_rate,
      pick_rate: l.pick_rate,
      tier: l.tier,
      sample_size: l.sample_size
    }))

    return {
      code: 0,
      message: 'success',
      data: {
        champion: championRes.data,
        augments,
        items,
        augment_items_linkage: linkage,
        patch_version: patchVersion
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[championDetail] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
