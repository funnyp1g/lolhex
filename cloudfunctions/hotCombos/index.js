// cloudfunctions/hotCombos/index.js
// 首页热门搭配 — 最强英雄+海克斯+装备组合
// 排名规则：每个英雄取其最高胜率的海克斯对，按该胜率排序，取TOP5
// 每个组合展示：英雄 + 最佳海克斯 + 前3海克斯 + 前3成装
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const CHAMPION_BUILDS = require('./data/champion-builds.js')

const DDRAGON_IMG = 'https://ddragon.leagueoflegends.com/cdn/16.13.1/img'

async function getCurrentPatch() {
  const res = await db.collection('patches')
    .where({ is_current: true }).field({ version: true }).limit(1).get()
  if (res.data.length === 0) throw new Error('未找到当前版本')
  return Number(res.data[0].version)
}

exports.main = async (event) => {
  const { page = 1, page_size = 5 } = event
  const safeSize = Math.min(page_size, 5)

  try {
    const patchVersion = await getCurrentPatch()

    // Phase 1: 获取足够多的 champion_augment 记录，按胜率降序
    const allRes = await db.collection('champion_augments')
      .where({ patch_version: patchVersion })
      .orderBy('win_rate', 'desc')
      .limit(300)
      .get()

    if (allRes.data.length === 0) {
      return { code: 0, message: 'success', data: { list: [], total: 0 } }
    }

    // Phase 2: 每个英雄取最高的那个 augment 对（用于排名）
    const championBest = new Map() // champion_id -> { augment_id, win_rate, pick_rate, sample_size, tier }
    allRes.data.forEach(row => {
      if (!championBest.has(row.champion_id)) {
        championBest.set(row.champion_id, {
          augment_id: row.augment_id,
          win_rate: row.win_rate,
          pick_rate: row.pick_rate,
          sample_size: row.sample_size,
          tier: row.tier
        })
      }
    })

    // Phase 3: 按最高胜率排序，取 top-N 英雄
    const sortedChampions = [...championBest.entries()]
      .sort((a, b) => b[1].win_rate - a[1].win_rate)
      .slice(0, safeSize)

    const topChampionIds = sortedChampions.map(([id]) => id)

    // Phase 4: 并行查询每个英雄的 top 3 海克斯
    const augmentPromises = topChampionIds.map(id =>
      db.collection('champion_augments')
        .where({ champion_id: id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc')
        .limit(3)
        .get()
    )

    const augmentResults = await Promise.all(augmentPromises)

    // Phase 5: 收集所有引用的 ID，批量查询名称和图标
    const allAugmentIds = new Set()
    sortedChampions.forEach(([championId]) => {
      allAugmentIds.add(championBest.get(championId).augment_id)
    })
    augmentResults.forEach(res => {
      res.data.forEach(a => allAugmentIds.add(a.augment_id))
    })

    const [champRes, augRes] = await Promise.all([
      db.collection('champions')
        .where({ riot_id: _.in(topChampionIds) })
        .field({ riot_id: true, name_zh: true, icon_url: true })
        .get(),
      db.collection('augments')
        .where({ riot_id: _.in([...allAugmentIds]) })
        .field({ riot_id: true, name_zh: true, icon_url: true, rarity: true })
        .get()
    ])

    const champMap = {}
    champRes.data.forEach(c => { champMap[c.riot_id] = c })
    const augMap = {}
    augRes.data.forEach(a => { augMap[a.riot_id] = a })

    // Phase 6: 从 builds 提取第一套核心装备（每个英雄第一流派的第一组 3 件套）
    // 然后组装响应
    const list = sortedChampions.map(([championId, best], index) => {
      const augData = augmentResults[index].data || []

      // 从 champion-builds.js 取该英雄第一套流派的第一个 coreItems（3件套）
      const builds = CHAMPION_BUILDS[String(championId)] || CHAMPION_BUILDS[championId] || []
      let coreItems = []
      if (builds.length > 0) {
        const firstBuild = builds[0]
        if (firstBuild.coreItems && firstBuild.coreItems.length > 0) {
          coreItems = (firstBuild.coreItems[0].itemIds || []).map((id, i) => ({
            item_id: id,
            name_zh: (firstBuild.coreItems[0].itemNames || [])[i] || '',
            icon_url: `${DDRAGON_IMG}/item/${id}.png`,
            win_rate: firstBuild.coreItems[0].winRate || 0
          }))
        }
      }

      return {
        combo_id: `${championId}_${best.augment_id}`,
        champion_id: championId,
        champion_name_zh: champMap[championId]?.name_zh || '',
        champion_icon: champMap[championId]?.icon_url || '',
        // 排名基准海克斯
        best_augment_id: best.augment_id,
        best_augment_name_zh: augMap[best.augment_id]?.name_zh || '',
        best_augment_icon: augMap[best.augment_id]?.icon_url || '',
        best_augment_rarity: augMap[best.augment_id]?.rarity || '',
        best_win_rate: best.win_rate,
        best_pick_rate: best.pick_rate,
        best_sample_size: best.sample_size,
        best_tier: best.tier,
        // Top 海克斯（最多3个）
        augments: augData.map(a => ({
          augment_id: a.augment_id,
          name_zh: augMap[a.augment_id]?.name_zh || '',
          icon_url: augMap[a.augment_id]?.icon_url || '',
          rarity: augMap[a.augment_id]?.rarity || '',
          win_rate: a.win_rate,
          pick_rate: a.pick_rate,
          tier: a.tier
        })),
        // 第一套核心装备（来自 aramgg builds，1:1 复刻）
        items: coreItems
      }
    })

    return {
      code: 0,
      message: 'success',
      data: { list, total: list.length }
    }
  } catch (err) {
    console.error('[hotCombos] 异常:', err)
    return { code: 2000, message: err.message, data: null }
  }
}
