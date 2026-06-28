// cloudfunctions/augmentList/index.js
// 海克斯列表查询云函数
// 功能：获取海克斯强化列表，支持稀有度筛选、排序、分页
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
      rarity,              // 可选，稀有度筛选："silver" | "gold" | "prismatic"
      sort_by = 'win_rate',
      order = 'desc',
      page = 1,
      page_size = 20,
      patch,
      keyword              // 可选，搜索关键词
    } = event

    // ---------- 参数校验 ----------
    const validRarities = ['silver', 'gold', 'prismatic']
    if (rarity && !validRarities.includes(rarity)) {
      return { code: 1001, data: null, message: `rarity 必须为 ${validRarities.join('/')} 之一` }
    }
    const validSortFields = ['win_rate', 'pick_rate']
    if (sort_by && !validSortFields.includes(sort_by)) {
      return { code: 1001, data: null, message: `sort_by 必须为 ${validSortFields.join('/')} 之一` }
    }
    const validOrders = ['desc', 'asc']
    if (order && !validOrders.includes(order)) {
      return { code: 1001, data: null, message: `order 必须为 ${validOrders.join('/')} 之一` }
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
    let where = { patch_version: patchVersion }
    if (rarity) where.rarity = rarity
    if (keyword) {
      const trimmed = keyword.trim()
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = db.RegExp({ regexp: escaped, options: 'i' })
      // 微信云 DB 中 _.or + db.RegExp 兼容性差，改用单字段 name_zh 搜索
      // name_zh 已由 patchBaseData/staticDataSync 填入了中文名（降级为英文名）
      where.name_zh = regex
    }

    // ---------- 查询总数 ----------
    const countResult = await db.collection('augments')
      .where(where)
      .count()
    const total = countResult.total

    // ---------- 分页查询 ----------
    const skip = (page - 1) * safePageSize
    const listResult = await db.collection('augments')
      .where(where)
      .orderBy(sort_by, order)
      .skip(skip)
      .limit(safePageSize)
      .field({
        _id: true,
        riot_id: true,
        name: true,
        name_zh: true,
        rarity: true,
        icon_url: true,
        win_rate: true,
        pick_rate: true
      })
      .get()

    return {
      code: 0,
      message: 'success',
      data: {
        list: listResult.data,
        total,
        page,
        page_size: safePageSize,
        total_pages: Math.ceil(total / safePageSize)
      },
      meta: {
        patch_version: patchVersion,
        timestamp: Date.now()
      }
    }
  } catch (err) {
    console.error('[augmentList] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
