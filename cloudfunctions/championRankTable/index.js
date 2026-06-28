// cloudfunctions/championRankTable/index.js
// 首页英雄排行表专用云函数 — 全量英雄 T级+胜率+选取率+样本
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function mapTierToRank(winRate) {
  if (winRate >= 55) return 'T1'
  if (winRate >= 52) return 'T2'
  if (winRate >= 49) return 'T3'
  if (winRate >= 46) return 'T4'
  return 'T5'
}

async function getCurrentPatch() {
  const res = await db.collection('patches')
    .where({ is_current: true }).field({ version: true }).limit(1).get()
  if (res.data.length === 0) throw new Error('未找到当前版本信息')
  return Number(res.data[0].version)
}

exports.main = async (event) => {
  const {
    sort_by = 'win_rate',
    order = 'desc',
    role = '',
    page = 1,
    page_size = 20,
    patch
  } = event

  // 参数校验
  const validSortFields = ['win_rate', 'pick_rate', 'sample_size']
  const validOrders = ['desc', 'asc']
  if (sort_by && !validSortFields.includes(sort_by)) {
    return { code: 1001, message: `sort_by 必须为 ${validSortFields.join('/')} 之一`, data: null }
  }
  if (order && !validOrders.includes(order)) {
    return { code: 1001, message: `order 必须为 ${validOrders.join('/')} 之一`, data: null }
  }
  const safePage = Math.max(1, parseInt(page) || 1)
  const safePageSize = Math.max(1, Math.min(parseInt(page_size) || 20, 50))

  try {
    const patchVersion = patch || await getCurrentPatch()

    // 构建查询条件
    const where = { patch_version: patchVersion }
    if (role) {
      where.roles = role
    }

    // 总数
    const countResult = await db.collection('champions')
      .where(where).count()
    const total = countResult.total

    // 分页查询
    const skip = (safePage - 1) * safePageSize
    const listResult = await db.collection('champions')
      .where(where)
      .orderBy(sort_by, order)
      .skip(skip)
      .limit(safePageSize)
      .field({
        _id: true, riot_id: true, name: true, name_zh: true,
        icon_url: true, roles: true, win_rate: true, pick_rate: true
      })
      .get()

    // 组装响应，计算 tier_rank
    const list = listResult.data.map(c => ({
      champion_id: c.riot_id,
      name: c.name,
      name_zh: c.name_zh,
      icon_url: c.icon_url,
      roles: c.roles || [],
      tier_rank: mapTierToRank(c.win_rate || 0),
      win_rate: c.win_rate || 0,
      pick_rate: c.pick_rate || 0,
      sample_size: 0  // champions 集合当前不含 sample_size，后续可关联计算
    }))

    return {
      code: 0,
      message: 'success',
      data: {
        list,
        total,
        page: safePage,
        page_size: safePageSize,
        total_pages: Math.ceil(total / safePageSize)
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[championRankTable] 查询异常:', err)
    return { code: 2000, message: `服务器内部错误: ${err.message}`, data: null }
  }
}
