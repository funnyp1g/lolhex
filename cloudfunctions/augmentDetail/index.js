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
  return res.data[0].version
}

exports.main = async (event) => {
  const { augment_id, patch } = event

  // 参数校验：augment_id 必须为数字
  if (!augment_id || typeof augment_id !== 'number') {
    return { code: 1001, data: null, message: 'augment_id 为必填数字' }
  }

  try {
    const patchVersion = patch || await getCurrentPatch()

    // ---------- 并行执行 4 个核心查询 ----------
    const [augmentRes, bestRes, worstRes, itemsRes] = await Promise.all([
      // 1. 海克斯基础信息
      db.collection('augments')
        .doc(String(augment_id))
        .get()
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
        .get(),

      // 4. 推荐装备（全局数据 champion_id = null，按胜率降序）
      db.collection('augment_items')
        .where({
          augment_id,
          champion_id: null,
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(30)
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

    // ---------- 批量关联查询英雄和装备的中文名/图标 ----------
    const championIds = [
      ...bestRes.data.map(a => a.champion_id),
      ...worstRes.data.map(a => a.champion_id)
    ]
    const itemIds = itemsRes.data.map(i => i.item_id)

    const [championInfoRes, itemInfoRes] = await Promise.all([
      championIds.length > 0
        ? db.collection('champions')
            .where({ riot_id: _.in(championIds) })
            .field({ riot_id: true, name_zh: true, icon_url: true })
            .get()
        : { data: [] },
      itemIds.length > 0
        ? db.collection('items')
            .where({ riot_id: _.in(itemIds) })
            .field({ riot_id: true, name_zh: true, icon_url: true })
            .get()
        : { data: [] }
    ])

    const championMap = {}
    championInfoRes.data.forEach(c => { championMap[c.riot_id] = c })
    const itemMap = {}
    itemInfoRes.data.forEach(i => { itemMap[i.riot_id] = i })

    // ---------- 组装响应数据 ----------
    const augmentData = {
      ...augmentRes.data,
      global_rank
    }

    return {
      code: 0,
      message: 'success',
      data: {
        augment: augmentData,
        best_champions: bestRes.data.map(a => ({
          champion_id: a.champion_id,
          champion_name_zh: championMap[a.champion_id]?.name_zh || '',
          icon_url: championMap[a.champion_id]?.icon_url || '',
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          tier: a.tier,
          sample_size: a.sample_size
        })),
        worst_champions: worstRes.data.map(a => ({
          champion_id: a.champion_id,
          champion_name_zh: championMap[a.champion_id]?.name_zh || '',
          icon_url: championMap[a.champion_id]?.icon_url || '',
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          tier: a.tier,
          sample_size: a.sample_size
        })),
        items: itemsRes.data.map(i => ({
          item_id: i.item_id,
          item_name_zh: itemMap[i.item_id]?.name_zh || '',
          icon_url: itemMap[i.item_id]?.icon_url || '',
          win_rate: i.win_rate,
          pick_rate: i.pick_rate,
          tier: i.tier,
          sample_size: i.sample_size
        })),
        patch_version: patchVersion
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[augmentDetail] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
