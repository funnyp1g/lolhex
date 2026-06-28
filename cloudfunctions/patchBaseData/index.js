// cloudfunctions/patchBaseData/index.js
// 精简云函数 — 只补全 name_zh/icon_url/rarity 等基础字段
// 零外部 API 依赖，所有数据内嵌，仅需 wx-server-sdk
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 内嵌数据
const championAliases = require('./data/champion-aliases.json')
const augmentBase = require('./data/augment-base.json')
const itemBase = require('./data/item-base.json')
const { CHAMPION_CN_MAP } = require('./data/champion-cn-map')
const { ITEM_CN_MAP } = require('./data/item-cn-map')
const { CHAMPION_ROLES } = require('./data/champion-roles')

const DDRAGON_IMG = 'https://ddragon.leagueoflegends.com/cdn/16.13.1/img'

// 快批量 update — 50条/批，忽略错误
async function fastUpdate(collectionName, docs) {
  const collection = db.collection(collectionName)
  let done = 0
  for (let i = 0; i < docs.length; i += 50) {
    const batch = docs.slice(i, i + 50)
    await Promise.all(batch.map(async (doc) => {
      const { _id, ...data } = doc
      try {
        await collection.doc(_id).update({ data })
      } catch (e) {
        // 忽略，可能文档不存在
      }
    }))
    done += batch.length
  }
  return done
}

// 单个集合的补全逻辑
async function patchOne(name, collection, query, buildDoc) {
  const res = await collection.where(query).field({ _id: true, riot_id: true }).limit(500).get()
  if (res.data.length === 0) {
    console.log(`[patch] ${name}: 0 条，跳过`)
    return 0
  }
  const docs = res.data.map(buildDoc)
  console.log(`[patch] ${name}: ${docs.length} 条，开始更新...`)
  const count = await fastUpdate(name, docs)
  console.log(`[patch] ${name}: ${count} 完成`)
  return count
}

exports.main = async (event) => {
  const patchVersion = Number(event.patch_version || '26.12')
  console.log('[patch] 开始，版本:', patchVersion)

  // 三个集合并行处理
  const [champCount, augCount, itemCount] = await Promise.all([
    patchOne('champions', db.collection('champions'),
      { patch_version: patchVersion },
      c => {
        const a = championAliases[c.riot_id]
        const cn = CHAMPION_CN_MAP[c.riot_id] || {}
        return {
          _id: c._id,
          name: a?.name || '',
          name_zh: cn.name_zh || a?.name || '',
          title: cn.title || '',
          roles: CHAMPION_ROLES[c.riot_id] || [],
          icon_url: a ? `${DDRAGON_IMG}/champion/${a.alias || a.name}.png` : ''
        }
      }
    ).catch(e => { console.error('champions err:', e.message); return -1; }),

    patchOne('augments', db.collection('augments'),
      { patch_version: patchVersion },
      a => {
        const b = augmentBase[a.riot_id] || {}
        return {
          _id: a._id,
          name: b.name || '',
          name_zh: b.name_zh || b.name || '',
          rarity: b.rarity || 'silver',
          icon_url: b.icon_url || ''
        }
      }
    ).catch(e => { console.error('augments err:', e.message); return -1; }),

    patchOne('items', db.collection('items'),
      { patch_version: patchVersion },
      it => {
        const b = itemBase[it.riot_id] || {}
        const cn = ITEM_CN_MAP[it.riot_id] || {}
        return {
          _id: it._id,
          name: b.name || '',
          name_zh: cn.name_zh || b.name || '',
          icon_url: it.riot_id ? `${DDRAGON_IMG}/item/${it.riot_id}.png` : ''
        }
      }
    ).catch(e => { console.error('items err:', e.message); return -1; })
  ])

  console.log(`[patch] 完成: champions=${champCount}, augments=${augCount}, items=${itemCount}`)
  return {
    code: 0,
    message: 'success',
    data: { champions: champCount, augments: augCount, items: itemCount }
  }
}
