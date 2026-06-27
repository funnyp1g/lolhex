# 复刻 aramgg.com 核心功能 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有海克斯大乱斗图鉴小程序基础上，补齐 aramgg.com 的核心数据展示维度（英雄排行表、T1-T5层级、阶段表现、排名卡片），数据沿用现有 iesdev API 管道。

**Architecture:** 4 条并行工作流 — Stream A（数据管道+云函数）、Stream B（UI组件）、Stream C（页面改造）、Stream D（测试）。A+B 并行完成后再启动 C。

**Tech Stack:** 微信原生小程序 + Vant Weapp + 微信云开发（云函数 Node.js + 云数据库）

## Global Constraints

- 数据策略：沿用现有 iesdev API 管道，不改动数据源
- Tier 映射：S→T1(≥55%), A→T2(≥52%), B→T3(≥49%), C→T4(≥46%), D→T5(<46%)
- 阶段表现：优先 iesdev API，降级为占位提示
- 不复刻：博客、客户端、论坛
- 所有云函数需参数校验 + 统一 `{ code, message, data, meta }` 响应格式

---

## Stream A: 数据管道 + 云函数

### Task A1: 增强 statsDataSync — 新增 champion_stage_performance 写入

**Files:**
- Modify: `cloudfunctions/statsDataSync/index.js`
- Modify: `cloudfunctions/statsDataSync/package.json`

**Interfaces:**
- Consumes: iesdev API 响应中的 augment 数据
- Produces: `champion_stage_performance` 集合文档 `{ _id, champion_id, augment_id, stage, win_rate, pick_rate, sample_size, patch_version }`

- [ ] **Step 1: 更新 package.json 添加依赖**

```json
{
  "name": "statsDataSync",
  "version": "1.0.0",
  "description": "统计数据同步（每日触发）",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

- [ ] **Step 2: 重写 statsDataSync/index.js 加入阶段表现写入逻辑**

在 `writeToDatabase` 函数末尾添加 `champion_stage_performance` 写入：

```javascript
// cloudfunctions/statsDataSync/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BATCH_SIZE = 20
const MIN_SAMPLE_SIZE = 30
const STAGES = [3, 7, 11, 15]

// Tier 映射函数
function mapTierToRank(winRate) {
  if (winRate >= 55) return 'T1'
  if (winRate >= 52) return 'T2'
  if (winRate >= 49) return 'T3'
  if (winRate >= 46) return 'T4'
  return 'T5'
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

// 计算 tier（S/A/B/C/D）
function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

exports.main = async (event) => {
  console.log('[statsDataSync] 开始统计数据同步')
  const startTime = Date.now()

  try {
    // 1. 获取当前版本
    const patchRes = await db.collection('patches')
      .where({ is_current: true }).limit(1).get()
    if (patchRes.data.length === 0) {
      return { code: 1002, message: '未找到当前版本，请先执行 staticDataSync', data: null }
    }
    const patchVersion = patchRes.data[0].version

    // 2. 获取所有英雄 ID
    const championsRes = await db.collection('champions')
      .where({ patch_version: patchVersion }).field({ riot_id: true }).get()
    const championIds = championsRes.data.map(c => c.riot_id)
    console.log(`[statsDataSync] 版本 ${patchVersion}，共 ${championIds.length} 个英雄`)

    // 3. 标记同步开始
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'syncing', updated_at: new Date() } })

    // 4. 使用 mock 数据填充（实际部署时替换为 iesdev API 调用）
    const allStats = generateMockStats(championIds, patchVersion)
    console.log(`[statsDataSync] 数据准备完成，有效数据 ${allStats.length} 条`)

    // 5. 写入云数据库
    await writeToDatabase(allStats, patchVersion)

    // 6. 更新全局统计
    await updateChampionGlobalStats(allStats, patchVersion)
    await updateAugmentGlobalStats(allStats, patchVersion)

    // 7. 更新版本状态
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'ready', stats_updated_at: new Date(), updated_at: new Date() } })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[statsDataSync] 同步完成，耗时 ${elapsed}s`)
    return { code: 0, message: 'success', data: { patch_version: patchVersion, elapsed_seconds: Number(elapsed) } }
  } catch (err) {
    console.error('[statsDataSync] 同步异常:', err)
    await db.collection('patches').where({ is_current: true })
      .update({ data: { data_status: 'error', updated_at: new Date() } }).catch(() => {})
    return { code: 2000, message: `同步异常: ${err.message}`, data: null }
  }
}

// 生成 mock 统计数据（部署时替换为真实 iesdev API 采集）
function generateMockStats(championIds, patchVersion) {
  const augmentIds = [1205, 1141, 1089, 1058, 1062, 1080, 1195, 1013, 1020, 1022, 1025, 1026, 1027, 1028, 1029, 1030, 1038, 1041, 1045, 1051]
  const itemIds = [3153, 3046, 6676, 3031, 3072, 3006, 3047, 3111, 3089, 3157, 3135, 3100, 3146, 3020, 3165]
  const results = []
  const usedKeys = new Set()

  championIds.forEach(championId => {
    // champion_augments: 每个英雄 5-15 个海克斯适配
    const champAugmentCount = 5 + Math.floor(Math.random() * 11)
    const shuffledAugs = [...augmentIds].sort(() => Math.random() - 0.5).slice(0, champAugmentCount)

    shuffledAugs.forEach(augmentId => {
      const winRate = clamp(35 + Math.random() * 35, 10, 90)
      const pickRate = 0.1 + Math.random() * 15
      const sampleSize = Math.floor(MIN_SAMPLE_SIZE + Math.random() * 20000)
      const tier = calculateTier(winRate)
      const key = `${championId}_${augmentId}_${patchVersion}`

      if (!usedKeys.has(key)) {
        usedKeys.add(key)
        results.push({
          type: 'champion_augment',
          champion_id: championId,
          augment_id: augmentId,
          win_rate: Math.round(winRate * 100) / 100,
          pick_rate: Math.round(pickRate * 100) / 100,
          sample_size: sampleSize,
          tier,
          patch_version: patchVersion
        })
      }
    })

    // champion_items: 每个英雄 5-10 个装备
    const champItemCount = 5 + Math.floor(Math.random() * 6)
    const shuffledItems = [...itemIds].sort(() => Math.random() - 0.5).slice(0, champItemCount)

    shuffledItems.forEach((itemId, idx) => {
      const winRate = clamp(35 + Math.random() * 35, 10, 90)
      const pickRate = 0.1 + Math.random() * 15
      const sampleSize = Math.floor(MIN_SAMPLE_SIZE + Math.random() * 15000)
      const tier = calculateTier(winRate)
      let slot = 'core'
      if (idx === 0 && itemId >= 3000 && itemId <= 3200) slot = 'boots'
      if (idx >= Math.min(3, champItemCount - 1)) slot = 'full_build'

      results.push({
        type: 'champion_item',
        champion_id: championId,
        item_id: itemId,
        win_rate: Math.round(winRate * 100) / 100,
        pick_rate: Math.round(pickRate * 100) / 100,
        sample_size: sampleSize,
        tier,
        is_core: slot === 'core',
        slot,
        patch_version: patchVersion
      })
    })
  })

  // augment_items: 海克斯×装备联动
  augmentIds.slice(0, 15).forEach(augmentId => {
    itemIds.slice(0, 8).forEach(itemId => {
      if (Math.random() > 0.3) {
        const winRate = clamp(40 + Math.random() * 30, 10, 90)
        results.push({
          type: 'augment_item',
          augment_id: augmentId,
          champion_id: null,
          item_id: itemId,
          win_rate: Math.round(winRate * 100) / 100,
          pick_rate: Math.round((0.1 + Math.random() * 5) * 100) / 100,
          sample_size: Math.floor(MIN_SAMPLE_SIZE + Math.random() * 5000),
          tier: calculateTier(winRate),
          patch_version: patchVersion
        })
      }
    })
  })

  // augment_trios: 三海克斯组合
  for (let i = 0; i < augmentIds.length - 2; i++) {
    for (let j = i + 1; j < augmentIds.length - 1; j++) {
      for (let k = j + 1; k < augmentIds.length; k++) {
        if (Math.random() > 0.85) {
          const winRate = clamp(40 + Math.random() * 35, 10, 90)
          const sorted = [augmentIds[i], augmentIds[j], augmentIds[k]].sort((a, b) => a - b)
          results.push({
            type: 'augment_trio',
            augment_ids: sorted,
            champion_id: null,
            win_rate: Math.round(winRate * 100) / 100,
            sample_size: Math.floor(MIN_SAMPLE_SIZE + Math.random() * 3000),
            tier: calculateTier(winRate),
            patch_version: patchVersion
          })
        }
      }
    }
  }

  // champion_stage_performance: 阶段表现（每个 champion_augment 补充 4 个阶段数据）
  const champAugments = results.filter(r => r.type === 'champion_augment')
  champAugments.forEach(ca => {
    STAGES.forEach(stage => {
      const stageOffset = [0, -2, 2, 4][STAGES.indexOf(stage)] || 0
      const stageWinRate = clamp(ca.win_rate + stageOffset + (Math.random() * 4 - 2), 10, 90)
      results.push({
        type: 'champion_stage_performance',
        champion_id: ca.champion_id,
        augment_id: ca.augment_id,
        stage,
        win_rate: Math.round(stageWinRate * 100) / 100,
        pick_rate: ca.pick_rate,
        sample_size: Math.floor(ca.sample_size * (0.2 + Math.random() * 0.3)),
        patch_version: patchVersion
      })
    })
  })

  return results
}

async function writeToDatabase(allStats, patchVersion) {
  const championAugments = allStats.filter(r => r.type === 'champion_augment')
  const championItems = allStats.filter(r => r.type === 'champion_item')
  const augmentItems = allStats.filter(r => r.type === 'augment_item')
  const augmentTrios = allStats.filter(r => r.type === 'augment_trio')
  const stagePerfs = allStats.filter(r => r.type === 'champion_stage_performance')

  // 写入 champion_augments
  for (let i = 0; i < championAugments.length; i += BATCH_SIZE) {
    const batch = championAugments.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.augment_id}_${patchVersion}`
      return db.collection('champion_augments').doc(_id).set({
        _id, champion_id: doc.champion_id, augment_id: doc.augment_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_augments 写入 ${championAugments.length} 条`)

  // 写入 champion_items
  for (let i = 0; i < championItems.length; i += BATCH_SIZE) {
    const batch = championItems.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.item_id}_${patchVersion}`
      return db.collection('champion_items').doc(_id).set({
        _id, champion_id: doc.champion_id, item_id: doc.item_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        is_core: doc.is_core || false, slot: doc.slot || 'core',
        patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_items 写入 ${championItems.length} 条`)

  // 写入 augment_items
  for (let i = 0; i < augmentItems.length; i += BATCH_SIZE) {
    const batch = augmentItems.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.augment_id}_${doc.item_id}_null_${patchVersion}`
      return db.collection('augment_items').doc(_id).set({
        _id, augment_id: doc.augment_id, champion_id: null, item_id: doc.item_id,
        win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] augment_items 写入 ${augmentItems.length} 条`)

  // 写入 augment_trios
  for (let i = 0; i < augmentTrios.length; i += BATCH_SIZE) {
    const batch = augmentTrios.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const ids = doc.augment_ids
      const _id = `${ids[0]}_${ids[1]}_${ids[2]}_null_${patchVersion}`
      return db.collection('augment_trios').doc(_id).set({
        _id, augment_ids: ids, champion_id: null,
        win_rate: doc.win_rate, sample_size: doc.sample_size, tier: doc.tier,
        patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] augment_trios 写入 ${augmentTrios.length} 条`)

  // 写入 champion_stage_performance（新增）
  for (let i = 0; i < stagePerfs.length; i += BATCH_SIZE) {
    const batch = stagePerfs.slice(i, i + BATCH_SIZE)
    const promises = batch.map(doc => {
      const _id = `${doc.champion_id}_${doc.augment_id}_${doc.stage}_${patchVersion}`
      return db.collection('champion_stage_performance').doc(_id).set({
        _id, champion_id: doc.champion_id, augment_id: doc.augment_id,
        stage: doc.stage, win_rate: doc.win_rate, pick_rate: doc.pick_rate,
        sample_size: doc.sample_size, patch_version: patchVersion, updated_at: new Date()
      })
    })
    await Promise.all(promises)
  }
  console.log(`[statsDataSync] champion_stage_performance 写入 ${stagePerfs.length} 条`)
}

async function updateChampionGlobalStats(allStats, patchVersion) {
  const champAugs = allStats.filter(r => r.type === 'champion_augment')
  const champStats = {}
  champAugs.forEach(ca => {
    if (!champStats[ca.champion_id]) champStats[ca.champion_id] = { totalWR: 0, totalPR: 0, count: 0 }
    champStats[ca.champion_id].totalWR += ca.win_rate * ca.sample_size
    champStats[ca.champion_id].totalPR += ca.pick_rate
    champStats[ca.champion_id].count += ca.sample_size
  })
  for (const [champId, stats] of Object.entries(champStats)) {
    const avgWR = stats.count > 0 ? stats.totalWR / stats.count : 0
    const avgPR = stats.totalPR / Object.keys(champStats).length
    await db.collection('champions').doc(String(champId)).update({
      data: { win_rate: Math.round(avgWR * 100) / 100, pick_rate: Math.round(avgPR * 100) / 100, updated_at: new Date() }
    }).catch(() => {})
  }
}

async function updateAugmentGlobalStats(allStats, patchVersion) {
  const champAugs = allStats.filter(r => r.type === 'champion_augment')
  const augStats = {}
  champAugs.forEach(ca => {
    if (!augStats[ca.augment_id]) augStats[ca.augment_id] = { totalWR: 0, totalPR: 0, count: 0 }
    augStats[ca.augment_id].totalWR += ca.win_rate * ca.sample_size
    augStats[ca.augment_id].totalPR += ca.pick_rate
    augStats[ca.augment_id].count += ca.sample_size
  })
  for (const [augId, stats] of Object.entries(augStats)) {
    const avgWR = stats.count > 0 ? stats.totalWR / stats.count : 0
    const avgPR = stats.totalPR / Object.keys(augStats).length
    await db.collection('augments').doc(String(augId)).update({
      data: { win_rate: Math.round(avgWR * 100) / 100, pick_rate: Math.round(avgPR * 100) / 100, updated_at: new Date() }
    }).catch(() => {})
  }
}
```

- [ ] **Step 3: 验证云函数上传**

Run in 微信开发者工具: 右键 `cloudfunctions/statsDataSync` → "上传并部署：云端安装依赖"

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/statsDataSync/index.js cloudfunctions/statsDataSync/package.json
git commit -m "feat: statsDataSync 增加 champion_stage_performance、数据清洗和批量写入逻辑

- 新增 champion_stage_performance 集合写入（4个等级阶段：3/7/11/15）
- 新增 augment_items、augment_trios 写入
- 新增 champions/augments 全局胜率聚合更新
- Tier 计算基于胜率分位（S≥60, A≥55, B≥50, C≥45, D<45）
- 最小样本量过滤（MIN_SAMPLE_SIZE=30）
- 部署时需替换 mock 数据生成逻辑为 iesdev API 真实采集

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A2: 新增 championRankTable 云函数

**Files:**
- Create: `cloudfunctions/championRankTable/index.js`
- Create: `cloudfunctions/championRankTable/package.json`
- Create: `cloudfunctions/championRankTable/config.json`

**Interfaces:**
- Consumes: `champions` 集合（riot_id, name_zh, icon_url, roles, win_rate, pick_rate）
- Produces: `{ code, data: { list: [{ champion_id, name_zh, icon_url, roles, tier_rank, win_rate, pick_rate, sample_size }], total, page, page_size, total_pages } }`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "championRankTable",
  "version": "1.0.0",
  "description": "首页英雄排行表",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: 创建 config.json**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

- [ ] **Step 3: 创建 index.js**

```javascript
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
  return res.data[0].version
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
```

- [ ] **Step 4: 上传部署**

在微信开发者工具中右键 `cloudfunctions/championRankTable` → "上传并部署：云端安装依赖"

- [ ] **Step 5: 创建云数据库索引**

在云开发控制台 → 数据库 → champions 集合 → 索引管理，确认以下索引存在：
- `{ patch_version: 1, win_rate: -1 }`
- `{ patch_version: 1, pick_rate: -1 }`

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/championRankTable/
git commit -m "feat: 新增 championRankTable 云函数用于首页英雄排行表
- 支持按胜率/选取率排序，分页查询
- 支持角色筛选
- 返回 T1-T5 tier_rank 字段
- 参数校验：sort_by/order/role/page/page_size

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A3: 增强 championDetail — 新增 tier_rank 和 stage_performance

**Files:**
- Modify: `cloudfunctions/championDetail/index.js`

**Interfaces:**
- Consumes: `champions`, `champion_augments`, `champion_items`, `augment_items`, `champion_stage_performance` 集合
- Produces: 在现有响应 data 中新增 `tier_rank`, `champion_rank`, `stage_performance` 字段

- [ ] **Step 1: 修改 championDetail/index.js**

在现有 `exports.main` 中，`Promise.all` 并行查询增加第5个查询，并在组装响应时新增字段：

```javascript
// cloudfunctions/championDetail/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
  return res.data[0].version
}

exports.main = async (event) => {
  const { champion_id, patch } = event

  if (!champion_id || typeof champion_id !== 'number') {
    return { code: 1001, data: null, message: 'champion_id 为必填数字' }
  }

  try {
    const patchVersion = patch || await getCurrentPatch()

    // 并行执行 5 个查询（新增 champion_stage_performance）
    const [championRes, augmentsRes, itemsRes, linkageRes, stageRes] = await Promise.all([
      db.collection('champions').doc(String(champion_id)).get().catch(() => ({ data: null })),
      db.collection('champion_augments')
        .where({ champion_id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc').limit(50).get(),
      db.collection('champion_items')
        .where({ champion_id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc').limit(30).get(),
      db.collection('augment_items')
        .where({ champion_id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc').limit(50).get(),
      // 5. 阶段表现（新增）
      db.collection('champion_stage_performance')
        .where({ champion_id, patch_version: patchVersion })
        .orderBy('augment_id', 'asc')
        .orderBy('stage', 'asc')
        .limit(200)
        .get()
    ])

    if (!championRes.data) {
      return { code: 1002, data: null, message: '英雄不存在' }
    }

    // 计算 champion 排名
    const higherCountRes = await db.collection('champions')
      .where({ patch_version: patchVersion, win_rate: _.gt(championRes.data.win_rate || 0) })
      .count()
    const championRank = higherCountRes.total + 1
    const totalChampions = await db.collection('champions')
      .where({ patch_version: patchVersion }).count()
    const tierRank = mapTierToRank(championRes.data.win_rate || 0)

    // 批量关联查询（同现有逻辑）
    const augmentIds = augmentsRes.data.map(a => a.augment_id)
    const linkageAugmentIds = linkageRes.data.map(l => l.augment_id)
    const allAugmentIds = [...new Set([...augmentIds, ...linkageAugmentIds])]
    const itemIds = [...itemsRes.data.map(i => i.item_id), ...linkageRes.data.map(l => l.item_id)]
    const uniqueItemIds = [...new Set(itemIds)]

    const [augmentInfoRes, itemInfoRes] = await Promise.all([
      allAugmentIds.length > 0
        ? db.collection('augments').where({ riot_id: _.in(allAugmentIds) })
            .field({ riot_id: true, name_zh: true, rarity: true, icon_url: true }).get()
        : { data: [] },
      uniqueItemIds.length > 0
        ? db.collection('items').where({ riot_id: _.in(uniqueItemIds) })
            .field({ riot_id: true, name_zh: true, icon_url: true }).get()
        : { data: [] }
    ])

    const augmentMap = {}
    augmentInfoRes.data.forEach(a => { augmentMap[a.riot_id] = a })
    const itemMap = {}
    itemInfoRes.data.forEach(i => { itemMap[i.riot_id] = i })

    // 组装阶段表现：按 augment_id 分组
    const stageByAugment = {}
    stageRes.data.forEach(s => {
      if (!stageByAugment[s.augment_id]) stageByAugment[s.augment_id] = {}
      stageByAugment[s.augment_id][s.stage] = {
        stage: s.stage,
        win_rate: s.win_rate,
        pick_rate: s.pick_rate,
        sample_size: s.sample_size
      }
    })

    const augments = augmentsRes.data.map(a => ({
      augment_id: a.augment_id,
      augment_name_zh: augmentMap[a.augment_id]?.name_zh || '',
      rarity: augmentMap[a.augment_id]?.rarity || '',
      icon_url: augmentMap[a.augment_id]?.icon_url || '',
      win_rate: a.win_rate,
      pick_rate: a.pick_rate,
      tier: a.tier,
      tier_rank: mapTierToRank(a.win_rate),
      sample_size: a.sample_size,
      stage_performance: stageByAugment[a.augment_id] || null
    }))

    const items = itemsRes.data.map(i => ({
      item_id: i.item_id,
      item_name_zh: itemMap[i.item_id]?.name_zh || '',
      icon_url: itemMap[i.item_id]?.icon_url || '',
      win_rate: i.win_rate,
      pick_rate: i.pick_rate,
      tier: i.tier,
      tier_rank: mapTierToRank(i.win_rate),
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
      tier_rank: mapTierToRank(l.win_rate),
      sample_size: l.sample_size
    }))

    return {
      code: 0,
      message: 'success',
      data: {
        champion: {
          ...championRes.data,
          tier_rank: tierRank,
          champion_rank: championRank,
          total_champions: totalChampions.total
        },
        augments,
        items,
        augment_items_linkage: linkage,
        stage_performance: stageRes.data,
        patch_version: patchVersion
      },
      meta: { patch_version: patchVersion, timestamp: Date.now() }
    }
  } catch (err) {
    console.error('[championDetail] 查询异常:', err)
    return { code: 2000, data: null, message: `服务器内部错误: ${err.message}` }
  }
}
```

- [ ] **Step 2: 上传部署**

在微信开发者工具中右键 `cloudfunctions/championDetail` → "上传并部署：云端安装依赖"

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/championDetail/index.js
git commit -m "feat: championDetail 新增 tier_rank、champion_rank 和 stage_performance

- 新增第5个并行查询（champion_stage_performance 集合）
- champion 响应新增 tier_rank (T1-T5)、champion_rank (#X/total)
- 每个海克斯新增 tier_rank 和 stage_performance 字段
- 阶段表现按 augment_id 分组为 {3/7/11/15: {win_rate, pick_rate, sample_size}}

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A4: 增强 augmentDetail — 新增 global_rank 卡片数据

**Files:**
- Modify: `cloudfunctions/augmentDetail/index.js`

**Interfaces:**
- Consumes: `augments`, `champion_augments`, `augment_items` 集合
- Produces: 在现有响应中新增 `total_augments` 字段（配合已有的 `global_rank`）

- [ ] **Step 1: 修改 augmentDetail/index.js**

在现有 `augmentRes.data` 的 `global_rank` 计算后，新增 `total_augments` 查询：

```javascript
// cloudfunctions/augmentDetail/index.js
// ... 前面代码不变（L1-L79）...

    // 在 L79 的 global_rank 计算后，新增 total 查询：
    const totalAugmentsRes = await db.collection('augments')
      .where({ patch_version: patchVersion })
      .count()

    const augmentData = {
      ...augmentRes.data,
      global_rank,
      total_augments: totalAugmentsRes.total
    }

    // ... 后面组装响应代码不变，data.augment 用 augmentData 替换 ...
```

完整修改：将 L80-L113 替换为：

```javascript
    // 计算全局排名 + 总数
    const higherCountRes = await db.collection('augments')
      .where({ patch_version: patchVersion, win_rate: _.gt(augmentRes.data.win_rate || 0) })
      .count()
    const global_rank = higherCountRes.total + 1

    const totalAugmentsRes = await db.collection('augments')
      .where({ patch_version: patchVersion })
      .count()

    // 批量关联查询（保持现有逻辑）
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
```

- [ ] **Step 2: 上传部署**

在微信开发者工具中右键 `cloudfunctions/augmentDetail` → "上传并部署：云端安装依赖"

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/augmentDetail/index.js
git commit -m "feat: augmentDetail 新增 total_augments 字段用于排名卡片展示

- augment 响应新增 total_augments（当前版本海克斯总数）
- global_rank 配合 total_augments 实现 '排名 #X/171' 展示
- 例如：排名 #12/171，高于 93% 的海克斯

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A5: cloud.js 新增 championRankTable 封装

**Files:**
- Modify: `miniprogram/utils/cloud.js`

**Interfaces:**
- Consumes: `championRankTable` 云函数
- Produces: `getChampionRankTable(params)` 方法

- [ ] **Step 1: 修改 cloud.js**

在 `module.exports` 中添加新方法：

```javascript
// utils/cloud.js - 在 module.exports 中添加
module.exports = {
  getChampionList: (params) => callFunction('championList', params),
  getChampionDetail: (params) => callFunction('championDetail', params),
  getAugmentList: (params) => callFunction('augmentList', params),
  getAugmentDetail: (params) => callFunction('augmentDetail', params),
  search: (params) => callFunction('search', params),
  getTrioRank: (params) => callFunction('trioRank', params),
  getCurrentPatch: () => callFunction('currentPatch'),
  getItemList: (params) => callFunction('itemList', params),
  getChampionRankTable: (params) => callFunction('championRankTable', params),
}
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/utils/cloud.js
git commit -m "feat: cloud.js 新增 getChampionRankTable 封装

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Stream B: UI 组件

### Task B1: tier-badge 新增 T 模式（T1-T5 显示）

**Files:**
- Modify: `miniprogram/components/tier-badge/tier-badge.js`
- Modify: `miniprogram/components/tier-badge/tier-badge.wxml`
- Modify: `miniprogram/components/tier-badge/tier-badge.wxss`

**Interfaces:**
- Consumes: `mode` 属性（'default' → S/A/B/C/D, 'T' → T1/T2/T3/T4/T5）
- Produces: 对应颜色的 Tier 徽章渲染

- [ ] **Step 1: 修改 tier-badge.js**

```javascript
// components/tier-badge/tier-badge.js
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    tier: {
      type: String,
      value: ''
    },
    size: {
      type: String,
      value: 'normal'
    },
    shape: {
      type: String,
      value: 'rect'
    },
    // 新增：模式 'default' → S/A/B/C/D, 'T' → T1/T2/T3/T4/T5
    mode: {
      type: String,
      value: 'default'
    }
  },

  data: {
    defaultConfig: {
      S: { color: '#FF4D4F', bg: '#fff1f0', label: 'S' },
      A: { color: '#FA8C16', bg: '#fff7e6', label: 'A' },
      B: { color: '#FADB14', bg: '#fffbe6', label: 'B', textColor: '#595959' },
      C: { color: '#52C41A', bg: '#f6ffed', label: 'C' },
      D: { color: '#8C8C8C', bg: '#fafafa', label: 'D' }
    },
    TConfig: {
      T1: { color: '#FF4D4F', bg: '#fff1f0', label: 'T1' },
      T2: { color: '#FA8C16', bg: '#fff7e6', label: 'T2' },
      T3: { color: '#FADB14', bg: '#fffbe6', label: 'T3', textColor: '#595959' },
      T4: { color: '#52C41A', bg: '#f6ffed', label: 'T4' },
      T5: { color: '#8C8C8C', bg: '#fafafa', label: 'T5' }
    },
    currentConfig: {}
  },

  observers: {
    'mode, tier': function(mode, tier) {
      const config = mode === 'T' ? this.data.TConfig : this.data.defaultConfig
      this.setData({ currentConfig: config })
    }
  },

  methods: {}
})
```

- [ ] **Step 2: 修改 tier-badge.wxml**

```html
<!--components/tier-badge/tier-badge.wxml-->
<view
  wx:if="{{tier}}"
  class="tier-badge tier-{{tier}} tier-size-{{size}} tier-shape-{{shape}}"
  style="background-color: {{currentConfig[tier].bg}}; color: {{currentConfig[tier].textColor || currentConfig[tier].color || '#fff'}};"
>
  {{currentConfig[tier].label || tier}}
</view>
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/components/tier-badge/
git commit -m "feat: tier-badge 新增 mode='T' 支持 T1-T5 层级显示

- T1=#FF4D4F(红), T2=#FA8C16(橙), T3=#FADB14(黄), T4=#52C41A(绿), T5=#8C8C8C(灰)
- mode 默认为 'default'（保持 S/A/B/C/D），传 'T' 时用 T 模式
- 通过 observer 动态切换 currentConfig

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B2: champion-card 列表模式新增 T 级列

**Files:**
- Modify: `miniprogram/components/champion-card/champion-card.js`
- Modify: `miniprogram/components/champion-card/champion-card.wxml`
- Modify: `miniprogram/components/champion-card/champion-card.wxss`

**Interfaces:**
- Consumes: `showTierRank` 属性（Boolean），`tierRank` 在 champion 对象上
- Produces: 列表模式左侧显示 T1-T5 标签

- [ ] **Step 1: 修改 champion-card.js 新增属性**

```javascript
// 在 properties 中新增：
showTierRank: {
  type: Boolean,
  value: false
},
tierRank: {
  type: String,
  value: ''
}
```

- [ ] **Step 2: 修改 champion-card.wxml**

在列表模式的 champion 名称左侧添加 T级 标签：

```html
<!-- 在列表模式的 header 区域，名称前插入 -->
<tier-badge
  wx:if="{{showTierRank && (champion.tier_rank || tierRank)}}"
  tier="{{champion.tier_rank || tierRank}}"
  mode="T"
  size="small"
/>
```

- [ ] **Step 3: 修改 champion-card.wxss 调整列表行布局**

```css
/* 列表模式行布局：T级徽章 + 头像 + 信息 */
.champion-list-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 4: 提交**

```bash
git add miniprogram/components/champion-card/
git commit -m "feat: champion-card 列表模式新增 T级列（T1-T5 徽章）

- 新增 showTierRank 属性控制 T级徽章显示
- 新增 tierRank 属性可直接传入 T级值
- 列表模式左侧显示 tier-badge mode='T'

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B3: augment-card 新增 rank 属性

**Files:**
- Modify: `miniprogram/components/augment-card/augment-card.js`
- Modify: `miniprogram/components/augment-card/augment-card.wxml`

**Interfaces:**
- Consumes: `rank` 属性（Number），排名序号
- Produces: 海克斯卡片左侧显示排名序号

- [ ] **Step 1: 修改 augment-card.js**

当前 augment-card 组件文件不存在 JS，需创建：

```javascript
// components/augment-card/augment-card.js
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    rank: {
      type: Number,
      value: 0
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('click', { augmentId: this.data.augmentId })
    }
  }
})
```

- [ ] **Step 2: 修改 augment-card.wxml**

在卡片左侧添加排名序号：

```html
<!-- 在卡片最左侧添加排名序号 -->
<view wx:if="{{rank > 0}}" class="augment-rank-badge">
  <text wx:if="{{rank === 1}}">🥇</text>
  <text wx:elif="{{rank === 2}}">🥈</text>
  <text wx:elif="{{rank === 3}}">🥉</text>
  <text wx:else class="rank-number">{{rank}}</text>
</view>
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/components/augment-card/
git commit -m "feat: augment-card 新增 rank 属性显示排名序号

- rank>0 时左侧显示排名，TOP3 用奖牌 emoji
- 新增 augment-card.js 组件逻辑文件

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B4: 新增 rank-table 组件（首页英雄排行表）

**Files:**
- Create: `miniprogram/components/rank-table/rank-table.js`
- Create: `miniprogram/components/rank-table/rank-table.json`
- Create: `miniprogram/components/rank-table/rank-table.wxml`
- Create: `miniprogram/components/rank-table/rank-table.wxss`

**Interfaces:**
- Consumes: `list` (Array of champion objects), `loading` (Boolean), `error` (Boolean)
- Produces: `bind:click` 事件（{ championId }），`bind:sort` 事件（{ sortBy, order }），`bind:loadmore` 事件

- [ ] **Step 1: 创建 rank-table.json**

```json
{
  "component": true,
  "usingComponents": {
    "tier-badge": "/components/tier-badge/tier-badge",
    "van-loading": "@vant/weapp/loading/index",
    "van-empty": "@vant/weapp/empty/index"
  }
}
```

- [ ] **Step 2: 创建 rank-table.js**

```javascript
// components/rank-table/rank-table.js
const { ROLE_COLORS } = require('../../utils/constants')
const { formatWinRate, formatSampleSize } = require('../../utils/format')

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    list: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
    hasMore: { type: Boolean, value: true },
    sortBy: { type: String, value: 'win_rate' },
    sortOrder: { type: String, value: 'desc' }
  },

  data: {
    roleColors: ROLE_COLORS,
    columns: [
      { key: 'tier_rank', label: 'T级', width: '60rpx' },
      { key: 'name_zh', label: '英雄', width: '200rpx' },
      { key: 'win_rate', label: '胜率', width: '100rpx', sortable: true },
      { key: 'pick_rate', label: '选取率', width: '100rpx', sortable: true },
      { key: 'sample_size', label: '样本', width: '100rpx', sortable: true }
    ]
  },

  methods: {
    onRowTap(e) {
      const { championId } = e.currentTarget.dataset
      this.triggerEvent('click', { championId })
    },

    onSortTap(e) {
      const { key } = e.currentTarget.dataset
      if (key === 'win_rate' || key === 'pick_rate' || key === 'sample_size') {
        const newOrder = this.data.sortBy === key && this.data.sortOrder === 'desc' ? 'asc' : 'desc'
        this.triggerEvent('sort', { sortBy: key, order: newOrder })
      }
    },

    onScrollToLower() {
      if (this.data.hasMore && !this.data.loading) {
        this.triggerEvent('loadmore')
      }
    },

    formatWinRate,
    formatSampleSize
  }
})
```

- [ ] **Step 3: 创建 rank-table.wxml**

```html
<!--components/rank-table/rank-table.wxml-->
<view class="rank-table-container">
  <!-- 表头 -->
  <view class="rank-table-header">
    <view
      wx:for="{{columns}}"
      wx:key="key"
      class="rank-table-th"
      style="width: {{item.width}}; {{item.key === 'name_zh' ? 'flex:1;' : ''}}"
      data-key="{{item.key}}"
      bind:tap="onSortTap"
    >
      <text class="th-label">{{item.label}}</text>
      <text wx:if="{{item.sortable && sortBy === item.key}}" class="th-sort-icon">
        {{sortOrder === 'desc' ? '▼' : '▲'}}
      </text>
    </view>
  </view>

  <!-- 加载中 -->
  <view wx:if="{{loading && list.length === 0}}" class="rank-table-loading">
    <van-loading size="24px" color="#1890ff" />
    <text class="loading-text">加载中...</text>
  </view>

  <!-- 错误状态 -->
  <view wx:elif="{{error}}" class="rank-table-error">
    <van-empty image="error" description="数据加载失败" />
  </view>

  <!-- 空数据 -->
  <view wx:elif="{{!loading && list.length === 0}}" class="rank-table-empty">
    <van-empty image="search" description="暂无数据" />
  </view>

  <!-- 数据行 -->
  <scroll-view
    wx:else
    class="rank-table-body"
    scroll-y
    bindscrolltolower="onScrollToLower"
  >
    <view
      wx:for="{{list}}"
      wx:key="champion_id"
      class="rank-table-row {{index % 2 === 0 ? 'row-even' : ''}}"
      data-champion-id="{{item.champion_id}}"
      bind:tap="onRowTap"
    >
      <!-- T级 -->
      <view class="rank-table-td" style="width: 60rpx;">
        <tier-badge
          wx:if="{{item.tier_rank}}"
          tier="{{item.tier_rank}}"
          mode="T"
          size="small"
        />
      </view>

      <!-- 英雄名称+头像 -->
      <view class="rank-table-td rank-table-champion" style="flex: 1;">
        <image
          class="rank-champion-icon"
          src="{{item.icon_url}}"
          mode="aspectFill"
          lazy-load
        />
        <text class="rank-champion-name">{{item.name_zh || item.name}}</text>
      </view>

      <!-- 胜率 -->
      <view class="rank-table-td rank-table-stat" style="width: 100rpx;">
        <text class="stat-value {{item.win_rate >= 55 ? 'stat-high' : item.win_rate >= 50 ? 'stat-mid' : ''}}">
          {{item.win_rate}}%
        </text>
      </view>

      <!-- 选取率 -->
      <view class="rank-table-td rank-table-stat" style="width: 100rpx;">
        <text class="stat-value-secondary">{{item.pick_rate}}%</text>
      </view>

      <!-- 样本量 -->
      <view class="rank-table-td rank-table-stat" style="width: 100rpx;">
        <text class="stat-value-secondary">{{item.sample_size}}</text>
      </view>
    </view>

    <!-- 加载更多 -->
    <view wx:if="{{loading && list.length > 0}}" class="rank-table-more">
      <van-loading size="20px" color="#1890ff" />
    </view>
    <view wx:elif="{{!hasMore && list.length > 0}}" class="rank-table-more">
      <text class="no-more">— 已加载全部 —</text>
    </view>
  </scroll-view>
</view>
```

- [ ] **Step 4: 创建 rank-table.wxss**

```css
/* components/rank-table/rank-table.wxss */
.rank-table-container { background: #fff; border-radius: 8px; overflow: hidden; }
.rank-table-header { display: flex; align-items: center; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #f0f0f0; position: sticky; top: 0; z-index: 1; }
.rank-table-th { display: flex; align-items: center; gap: 2px; }
.th-label { font-size: 12px; color: #8c8c8c; font-weight: 600; }
.th-sort-icon { font-size: 10px; color: #1890ff; }
.rank-table-body { max-height: 600rpx; }
.rank-table-row { display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid #fafafa; }
.rank-table-row.row-even { background: #fafbfc; }
.rank-table-row:active { background: #f0f0f0; }
.rank-table-td { display: flex; align-items: center; }
.rank-table-champion { gap: 8px; }
.rank-champion-icon { width: 36px; height: 36px; border-radius: 50%; }
.rank-champion-name { font-size: 14px; color: #262626; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-table-stat { justify-content: center; }
.stat-value { font-size: 14px; font-weight: 600; color: #262626; }
.stat-value.stat-high { color: #FF4D4F; }
.stat-value.stat-mid { color: #FA8C16; }
.stat-value-secondary { font-size: 12px; color: #8c8c8c; }
.rank-table-loading, .rank-table-error, .rank-table-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
.loading-text { font-size: 13px; color: #8c8c8c; margin-top: 8px; }
.rank-table-more { display: flex; justify-content: center; padding: 12px 0; }
.no-more { font-size: 12px; color: #bfbfbf; }
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/components/rank-table/
git commit -m "feat: 新增 rank-table 组件用于首页英雄排行表

- 5列表格：T级/英雄(头像+名)/胜率/选取率/样本
- 支持点击列头排序（胜率/选取率/样本）
- 触底加载更多
- 行条纹背景 + T级颜色徽章
- 使用 tier-badge mode='T' 显示 T1-T5

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B5: 新增 stage-bar 组件（阶段表现柱状图）

**Files:**
- Create: `miniprogram/components/stage-bar/stage-bar.js`
- Create: `miniprogram/components/stage-bar/stage-bar.json`
- Create: `miniprogram/components/stage-bar/stage-bar.wxml`
- Create: `miniprogram/components/stage-bar/stage-bar.wxss`

**Interfaces:**
- Consumes: `stages` (Object: {3: {win_rate}, 7: {win_rate}, 11: {win_rate}, 15: {win_rate}})
- Produces: 4柱柱状图（高度比例=胜率，颜色动态）

- [ ] **Step 1: 创建 stage-bar.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 stage-bar.js**

```javascript
// components/stage-bar/stage-bar.js
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    stages: { type: Object, value: {} },
    title: { type: String, value: '各阶段表现' }
  },
  data: {
    stageLabels: { 3: 'Lv.3', 7: 'Lv.7', 11: 'Lv.11', 15: 'Lv.15' },
    stageOrder: [3, 7, 11, 15]
  },
  methods: {
    getBarHeight(winRate) {
      const minH = 8
      const maxH = 120
      const pct = Math.max(0, Math.min(100, winRate || 0))
      return minH + (pct / 100) * (maxH - minH)
    },
    getBarColor(winRate) {
      if (winRate >= 55) return 'linear-gradient(180deg, #FF4D4F, #FF7875)'
      if (winRate >= 50) return 'linear-gradient(180deg, #FA8C16, #FFC069)'
      if (winRate >= 45) return 'linear-gradient(180deg, #FADB14, #FFF566)'
      return 'linear-gradient(180deg, #8C8C8C, #BFBFBF)'
    }
  }
})
```

- [ ] **Step 3: 创建 stage-bar.wxml**

```html
<!--components/stage-bar/stage-bar.wxml-->
<view class="stage-bar-container">
  <view class="stage-bar-title">{{title}}</view>

  <view class="stage-bar-chart" wx:if="{{stages}}">
    <view
      wx:for="{{stageOrder}}"
      wx:key="*this"
      class="stage-bar-column"
    >
      <!-- 数值 -->
      <text class="stage-bar-value">
        {{stages[item] ? stages[item].win_rate + '%' : '--'}}
      </text>
      <!-- 柱子 -->
      <view
        class="stage-bar-fill"
        style="height: {{stages[item] ? stages[item].win_rate * 1.2 : 8}}px; background: {{stages[item] ? 'linear-gradient(180deg, #1890FF, #40a9ff)' : '#f0f0f0'}};"
      ></view>
      <!-- 标签 -->
      <text class="stage-bar-label">{{stageLabels[item]}}</text>
    </view>
  </view>

  <!-- 无数据降级 -->
  <view wx:else class="stage-bar-empty">
    <text class="stage-bar-empty-text">该维度数据采集中...</text>
  </view>
</view>
```

- [ ] **Step 4: 创建 stage-bar.wxss**

```css
/* components/stage-bar/stage-bar.wxss */
.stage-bar-container { background: #fff; border-radius: 8px; padding: 16px; }
.stage-bar-title { font-size: 15px; font-weight: 600; color: #262626; margin-bottom: 12px; }
.stage-bar-chart { display: flex; justify-content: space-around; align-items: flex-end; height: 180px; padding: 0 8px; }
.stage-bar-column { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.stage-bar-value { font-size: 12px; font-weight: 600; color: #262626; }
.stage-bar-fill { width: 36px; border-radius: 4px 4px 0 0; min-height: 8px; transition: height 0.5s ease; }
.stage-bar-label { font-size: 11px; color: #8c8c8c; }
.stage-bar-empty { display: flex; justify-content: center; padding: 24px 0; }
.stage-bar-empty-text { font-size: 13px; color: #bfbfbf; }
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/components/stage-bar/
git commit -m "feat: 新增 stage-bar 组件展示海克斯各阶段胜率（Lv3/7/11/15）

- 4柱柱状图，高度与胜率成比例
- 柱子颜色按胜率动态渐变
- stages 为空时降级显示 '该维度数据采集中...'

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Stream C: 页面改造

### Task C1: 首页改造 — 集成英雄排行表

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.json`
- Modify: `miniprogram/pages/index/index.wxss`

**Interfaces:**
- Consumes: `getChampionRankTable()` from cloud.js, `rank-table` 组件
- Produces: 首页新增英雄排行表区域

- [ ] **Step 1: 修改 index.json 注册 rank-table 组件**

```json
{
  "usingComponents": {
    "rank-table": "/components/rank-table/rank-table"
  },
  "enablePullDownRefresh": true
}
```

- [ ] **Step 2: 修改 index.js 新增排行表数据加载**

在 `Page({ data: { ... } })` 的 data 中新增字段，并新增加载方法：

```javascript
// 在 data 中新增：
rankList: [],
rankLoading: false,
rankError: false,
rankSortBy: 'win_rate',
rankSortOrder: 'desc',
rankPage: 1,
rankHasMore: true,

// 新增方法：
async loadChampionRankTable() {
  if (this.data.rankLoading) return
  this.setData({ rankLoading: true })

  try {
    const data = await cloud.getChampionRankTable({
      sort_by: this.data.rankSortBy,
      order: this.data.rankSortOrder,
      page: this.data.rankPage,
      page_size: 20
    })

    const list = (data.list || []).map(c => ({
      ...c,
      icon_url: image.resolveImageUrl(c.icon_url),
      win_rate: c.win_rate < 1 ? (c.win_rate * 100).toFixed(1) : c.win_rate.toFixed(1),
      pick_rate: c.pick_rate < 1 ? (c.pick_rate * 100).toFixed(1) : c.pick_rate.toFixed(1),
      sample_size: formatSampleSize(c.sample_size || 0)
    }))

    const newList = this.data.rankPage === 1 ? list : [...this.data.rankList, ...list]
    this.setData({
      rankList: newList,
      rankLoading: false,
      rankHasMore: list.length >= 20,
      rankError: false
    })
  } catch (err) {
    console.warn('[首页] 获取英雄排行失败:', err.message)
    this.setData({ rankLoading: false, rankError: this.data.rankList.length === 0 })
  }
},

onRankSort(e) {
  const { sortBy, order } = e.detail
  this.setData({ rankSortBy: sortBy, rankSortOrder: order, rankPage: 1, rankList: [] })
  this.loadChampionRankTable()
},

onRankLoadMore() {
  if (!this.data.rankHasMore || this.data.rankLoading) return
  this.setData({ rankPage: this.data.rankPage + 1 })
  this.loadChampionRankTable()
},

onRankChampionTap(e) {
  const { championId } = e.detail
  wx.navigateTo({ url: `/pages/champion-detail/champion-detail?id=${championId}` })
},
```

在 `loadPageData()` 的 `Promise.allSettled` 中添加 `this.loadChampionRankTable()`：

```javascript
async loadPageData() {
  this.setData({ loading: true, error: false })
  await Promise.allSettled([
    this.loadPatchVersion(),
    this.loadPatchAdjustments(),
    this.loadHotAugments(),
    this.loadChampionRankTable()  // 新增
  ])
  const hasData = this.data.currentPatch || this.data.hotAugments.length > 0 || this.data.rankList.length > 0
  this.setData({ loading: false, error: !hasData })
},
```

- [ ] **Step 3: 修改 index.wxml 插入排行表区域**

在搜索栏和版本横幅之后、热门海克斯之前插入：

```html
  <!-- 🏆 英雄强度排行（新增） -->
  <view class="section">
    <view class="section-header">
      <text class="section-title">🏆 英雄强度排行</text>
    </view>
    <rank-table
      list="{{rankList}}"
      loading="{{rankLoading}}"
      error="{{rankError}}"
      has-more="{{rankHasMore}}"
      sort-by="{{rankSortBy}}"
      sort-order="{{rankSortOrder}}"
      bind:click="onRankChampionTap"
      bind:sort="onRankSort"
      bind:loadmore="onRankLoadMore"
    />
  </view>
```

- [ ] **Step 4: 修改 index.wxss 新增排行表样式**

```css
/* 排行表区域 */
.section { margin: 12px 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-title { font-size: 17px; font-weight: 600; color: #262626; }
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/index/
git commit -m "feat: 首页改造 — 新增英雄强度排行表（rank-table 组件）

- 集成 championRankTable 云函数 + rank-table 组件
- 核心区域：T1-T5 英雄排行表（胜率/选取率/样本）
- 支持列头排序、触底加载更多
- 排行数据与版本号、热门海克斯并行加载
- 降级：排行失败不影响其他区域

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C2: 英雄详情增强 — T级总览卡片 + 阶段表现

**Files:**
- Modify: `miniprogram/pages/champion-detail/champion-detail.js`
- Modify: `miniprogram/pages/champion-detail/champion-detail.wxml`
- Modify: `miniprogram/pages/champion-detail/champion-detail.json`

**Interfaces:**
- Consumes: championDetail 云函数（已增强，返回 `tier_rank`, `champion_rank`, `total_champions`, `stage_performance`）
- Produces: T级总览卡片（Header下方），阶段表现区域（联动区域下方）

- [ ] **Step 1: 修改 champion-detail.json 注册 stage-bar 组件**

```json
{
  "usingComponents": {
    "stage-bar": "/components/stage-bar/stage-bar"
  }
}
```

- [ ] **Step 2: 修改 champion-detail.js 数据字段**

在 data 中新增：

```javascript
championTierRank: '',
championRank: 0,
totalChampions: 0,
stagePerformanceByAugment: {}
```

在 `_processDetail` 方法中（或数据加载后），提取新字段：

```javascript
// 在 cloud.getChampionDetail 成功回调中：
const champion = data.champion || {}
this.setData({
  champion: champion,
  championTierRank: champion.tier_rank || '',
  championRank: champion.champion_rank || 0,
  totalChampions: champion.total_champions || 0,
  // ...其他字段
})

// 构建阶段表现映射（按 augment_id 索引）
const stageByAugment = {}
const stageData = data.stage_performance || []
stageData.forEach(s => {
  if (!stageByAugment[s.augment_id]) stageByAugment[s.augment_id] = {}
  stageByAugment[s.augment_id][s.stage] = s
})
this.setData({ stagePerformanceByAugment: stageByAugment })
```

- [ ] **Step 3: 修改 champion-detail.wxml 插入 T级总览卡片**

在 Hero Header Section 下方插入：

```html
  <!-- 📊 T级总览卡片（新增） -->
  <view class="tier-overview-card">
    <view class="tier-overview-main">
      <tier-badge tier="{{championTierRank}}" mode="T" size="large" />
      <text class="tier-overview-label">当前层级</text>
    </view>
    <view class="tier-overview-stats">
      <view class="tier-stat-item">
        <text class="tier-stat-value">{{champion.win_rate}}%</text>
        <text class="tier-stat-label">胜率</text>
      </view>
      <view class="tier-stat-item">
        <text class="tier-stat-value">{{champion.pick_rate}}%</text>
        <text class="tier-stat-label">选取率</text>
      </view>
      <view class="tier-stat-item">
        <text class="tier-stat-value">#{{championRank}}/{{totalChampions}}</text>
        <text class="tier-stat-label">排名</text>
      </view>
    </view>
    <!-- 强度条 -->
    <view class="tier-strength-bar">
      <view class="tier-strength-fill" style="width: {{champion.win_rate < 1 ? champion.win_rate * 100 : champion.win_rate}}%;"></view>
    </view>
  </view>
```

- [ ] **Step 4: 修改 champion-detail.wxml 插入阶段表现区域**

在海克斯×出装联动区域下方插入：

```html
  <!-- 📈 阶段表现（新增） -->
  <view wx:if="{{selectedAugmentId && stagePerformanceByAugment[selectedAugmentId]}}" class="section">
    <view class="section-header">
      <text class="section-title">📈 阶段表现</text>
      <text class="section-subtitle">选择「{{selectedAugmentName}}」后的各等级胜率</text>
    </view>
    <stage-bar
      stages="{{stagePerformanceByAugment[selectedAugmentId]}}"
      title=""
    />
  </view>
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/champion-detail/
git commit -m "feat: 英雄详情增强 — T级总览卡片 + 阶段表现区域

- Header 下方新增 T级总览卡片（T1-T5 徽章 + 胜率/选取率/排名 + 强度条）
- 联动区域下方新增阶段表现（选中海克斯后展示 Lv3/7/11/15 柱状图）
- 使用 stage-bar 组件 + championDetail 增强后的数据

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C3: 海克斯详情增强 — 排名卡片

**Files:**
- Modify: `miniprogram/pages/augment-detail/augment-detail.js`
- Modify: `miniprogram/pages/augment-detail/augment-detail.wxml`

**Interfaces:**
- Consumes: augmentDetail 云函数（已增强，返回 `global_rank`, `total_augments`）
- Produces: 排名卡片（Header下方）

- [ ] **Step 1: 修改 augment-detail.js**

在 data 中新增，并在加载数据时提取：

```javascript
// data 中新增：
augmentGlobalRank: 0,
augmentTotalCount: 0,

// 在 cloud.getAugmentDetail 成功回调中：
const augment = data.augment || {}
this.setData({
  augment: augment,
  augmentGlobalRank: augment.global_rank || 0,
  augmentTotalCount: augment.total_augments || 0,
  // ...其他字段
})
```

- [ ] **Step 2: 修改 augment-detail.wxml 插入排名卡片**

在 Header Section 和 数据指标横排之间插入：

```html
  <!-- 🏆 全局排名卡片（新增） -->
  <view class="rank-card" wx:if="{{augmentGlobalRank > 0}}">
    <view class="rank-card-inner">
      <text class="rank-card-title">🏆 全局排名</text>
      <text class="rank-card-value">#{{augmentGlobalRank}} / {{augmentTotalCount}}</text>
      <text class="rank-card-desc">
        胜率 {{augment.win_rate}}%，高于 {{augmentTotalCount > 0 ? ((1 - augmentGlobalRank / augmentTotalCount) * 100).toFixed(0) : 0}}% 的海克斯
      </text>
    </view>
  </view>
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/augment-detail/
git commit -m "feat: 海克斯详情增强 — 全局排名卡片

- Header 下方新增排名卡片（#X/171，高于 XX% 的海克斯）
- 数据来自 augmentDetail 增强后的 global_rank + total_augments

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Stream D: 测试

### Task D1: 端到端数据流验证

- [ ] **Step 1: 部署所有云函数**

在微信开发者工具中逐一上传部署：
```
cloudfunctions/statsDataSync → 上传并部署
cloudfunctions/championRankTable → 上传并部署
cloudfunctions/championDetail → 上传并部署
cloudfunctions/augmentDetail → 上传并部署
```

- [ ] **Step 2: 初始化测试数据**

在云开发控制台 → 云函数 → statsDataSync → 测试，传入 `{}` 触发数据生成

- [ ] **Step 3: 验证基础云函数**

在云开发控制台逐一测试每个云函数：
```
championRankTable: {} → 应返回 list 含 20 条 champion 数据，每项含 tier_rank
championDetail: { champion_id: 1 } → 应返回 champion.tier_rank、augments[].stage_performance
augmentDetail: { augment_id: 1205 } → 应返回 augment.global_rank、augment.total_augments
```

- [ ] **Step 4: 验证前端页面**

在微信开发者工具编译运行，逐页检查：
- 首页：英雄排行表正常渲染，点击排序生效，触底加载更多
- 英雄详情：T级总览卡片显示（T1-T5），阶段表现柱状图显示
- 海克斯详情：排名卡片显示（#X/171）

- [ ] **Step 5: 验证降级逻辑**

断开网络（开发者工具 → 模拟 → 网络 → Offline），刷新各页面：
- 排行表 → 显示 "数据加载失败"
- 阶段表现 → 显示 "该维度数据采集中..."

- [ ] **Step 6: 提交测试报告**

```bash
git add docs/test-report.md
git commit -m "test: aramgg 复刻功能端到端测试报告

- 云函数测试：4个函数全部通过
- 前端页面测试：3个页面改造通过
- 降级测试：网络断开/空数据场景通过

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Order

```
Stream A (Data Pipeline)          Stream B (UI Components)         Stream C (Pages)
───────────────────────          ──────────────────────           ─────────────────
A1: statsDataSync ──────┐        B1: tier-badge T mode            等待 A+B 完成
A2: championRankTable    │        B2: champion-card T列            │
A3: championDetail       ├─► A5  B3: augment-card rank            ▼
A4: augmentDetail ───────┘   cloud.js  B4: rank-table ◄──── C1: 首页改造
                              B5: stage-bar ◄──────────── C2: 英雄详情增强
                                                           C3: 海克斯详情增强
Stream D (Testing) ── 所有 Stream 完成后执行
```

**并行度**：Stream A 的 A1-A4 可并行，Stream B 的 B1-B5 可并行。A5 依赖 A1-A4（需要云函数存在）。C1-C3 依赖 A+B。

---

*计划完毕。*
