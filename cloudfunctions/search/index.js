// cloudfunctions/search/index.js
// 模糊搜索云函数（按 PRD §7.2 规范）
// 功能：模糊搜索英雄和海克斯，支持中英文、称号匹配
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { keyword, limit = 10 } = event

    // ---------- 参数校验 ----------
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return { code: 1001, data: null, message: 'keyword 不能为空' }
    }

    // 限制返回条数，防止一次返回过多
    const safeLimit = Math.min(Math.max(1, limit || 10), 20)
    // 正则转义，防止 ReDoS 攻击
    const escapedKeyword = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // ---------- 并行搜索英雄和海克斯 ----------
    const [championsRes, augmentsRes] = await Promise.all([
      // 英雄搜索（中文名 / 英文名 / 称号）
      db.collection('champions')
        .where(_.or([
          { name_zh: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { name: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { title: db.RegExp({ regexp: escapedKeyword, options: 'i' }) }
        ]))
        .field({
          _id: true,
          name: true,
          name_zh: true,
          title: true,
          icon_url: true,
          win_rate: true,
          roles: true
        })
        .limit(safeLimit)
        .get(),

      // 海克斯搜索（中文名 / 英文名）
      db.collection('augments')
        .where(_.or([
          { name_zh: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { name: db.RegExp({ regexp: escapedKeyword, options: 'i' }) }
        ]))
        .field({
          _id: true,
          name: true,
          name_zh: true,
          rarity: true,
          icon_url: true,
          win_rate: true
        })
        .limit(safeLimit)
        .get()
    ])

    // ---------- 合并结果（英雄在前、海克斯在后） ----------
    const results = [
      ...championsRes.data.map(c => ({ type: 'champion', ...c })),
      ...augmentsRes.data.map(a => ({ type: 'augment', ...a }))
    ]

    return {
      code: 0,
      message: 'success',
      data: {
        results,
        total: results.length
      }
    }
  } catch (err) {
    console.error('[search] 搜索异常:', err)
    return { code: 2000, data: null, message: `搜索服务异常: ${err.message}` }
  }
}
