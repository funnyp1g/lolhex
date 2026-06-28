// cloudfunctions/championList/index.js
// 英雄列表查询云函数
// 功能：获取英雄列表，支持按胜率/选取率排序，支持分页
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 获取当前版本号（若未指定则从 patches 集合读取 is_current=true 的记录）
async function getCurrentPatch() {
  const res = await db.collection('patches')
    .where({ is_current: true })
    .field({ version: true })
    .limit(1)
    .get()
  if (res.data.length === 0) {
    throw new Error('未找到当前版本信息，请先执行 staticDataSync')
  }
  return Number(res.data[0].version)
}

exports.main = async (event) => {
  try {
    const {
      sort_by = 'win_rate',   // 排序字段："win_rate" | "pick_rate"
      order = 'desc',         // 排序方向："desc" | "asc"
      page = 1,               // 页码，从 1 开始
      page_size = 20,         // 每页数量，最大 50
      patch,                  // 可选版本号
      role,                   // 可选，角色筛选："战士" | "法师" | "刺客" | "射手" | "坦克" | "辅助"
      keyword                 // 可选，关键词搜索（匹配 name_zh 或 name）
    } = event

    // ---------- 参数校验 ----------
    const validSortFields = ['win_rate', 'pick_rate']
    const validOrders = ['desc', 'asc']
    if (sort_by && !validSortFields.includes(sort_by)) {
      return { code: 1001, data: null, message: `sort_by 必须为 ${validSortFields.join('/')} 之一` }
    }
    if (order && !validOrders.includes(order)) {
      return { code: 1001, data: null, message: `order 必须为 ${validOrders.join('/')} 之一` }
    }
    if (page !== undefined && (page < 1 || !Number.isInteger(page))) {
      return { code: 1001, data: null, message: 'page 必须为正整数' }
    }
    if (page_size !== undefined && (page_size < 1 || !Number.isInteger(page_size))) {
      return { code: 1001, data: null, message: 'page_size 必须为正整数' }
    }
    if (patch && !/^\d+\.\d+$/.test(patch)) {
      return { code: 1001, data: null, message: 'patch 格式不正确，应为 "xx.xx"' }
    }

    const patchVersion = patch || await getCurrentPatch()
    const safePageSize = Math.max(1, Math.min(page_size, 50))

    // ---------- 构建查询条件 ----------
    let where = { patch_version: patchVersion }
    if (role) where.roles = role
    if (keyword) {
      // 使用正则搜索名称（中文或英文），使用 _.or 同时匹配 name_zh 和 name
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = db.RegExp({ regexp: escapedKeyword, options: 'i' })
      const baseCondition = { patch_version: patchVersion }
      if (role) baseCondition.roles = role
      where = _.or([
        { ...baseCondition, name_zh: regex },
        { ...baseCondition, name: regex }
      ])
    }

    // ---------- 查询总数 ----------
    const countResult = await db.collection('champions')
      .where(where)
      .count()
    const total = countResult.total

    // ---------- 分页查询 ----------
    const skip = (page - 1) * safePageSize
    const listResult = await db.collection('champions')
      .where(where)
      .orderBy(sort_by, order)
      .skip(skip)
      .limit(safePageSize)
      .field({
        _id: true,
        riot_id: true,
        name: true,
        name_zh: true,
        title: true,
        roles: true,
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
    console.error('[championList] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
