// cloudfunctions/itemList/index.js
// 装备列表查询云函数
// 功能：获取装备列表，支持分类筛选、分页
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const {
      category,          // 可选，分类筛选："AttackDamage" | "AbilityPower" | "Armor" | ...
      page = 1,
      page_size = 20
    } = event

    // ---------- 参数校验 ----------
    if (page !== undefined && (page < 1 || !Number.isInteger(page))) {
      return { code: 1001, data: null, message: 'page 必须为正整数' }
    }
    if (page_size !== undefined && (page_size < 1 || !Number.isInteger(page_size))) {
      return { code: 1001, data: null, message: 'page_size 必须为正整数' }
    }

    const safePageSize = Math.max(1, Math.min(page_size, 50))

    // 构建查询条件（categories 为数组字段，使用包含查询）
    const where = {}
    if (category) {
      where.categories = category
    }

    // ---------- 查询总数 ----------
    const countResult = await db.collection('items')
      .where(where)
      .count()
    const total = countResult.total

    // ---------- 分页查询 ----------
    const skip = (page - 1) * safePageSize
    const listResult = await db.collection('items')
      .where(where)
      .skip(skip)
      .limit(safePageSize)
      .field({
        _id: true,
        riot_id: true,
        name: true,
        name_zh: true,
        price: true,
        icon_url: true,
        categories: true,
        from_ids: true
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
      meta: { timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[itemList] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
