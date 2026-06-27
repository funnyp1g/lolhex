# 服务端设计文档

# 海克斯大乱斗图鉴 — 微信云开发后端

| 属性 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 对应 PRD | aram-mayhem-guide-prd.md §4 / §6 / §7 |
| 运行环境 | 微信云开发（Node.js 16+） |
| 文档日期 | 2026-06-25 |

---

## 目录

1. [架构概述](#1-架构概述)
2. [云数据库设计](#2-云数据库设计)
3. [云函数规格](#3-云函数规格)
4. [数据采集管道详细设计](#4-数据采集管道详细设计)
5. [定时触发器配置](#5-定时触发器配置)
6. [错误处理策略](#6-错误处理策略)
7. [性能优化](#7-性能优化)
8. [数据版本管理](#8-数据版本管理)

---

## 1. 架构概述

### 1.1 云开发整体架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                          微信小程序客户端                              │
│                                                                      │
│   页面层：英雄列表 / 英雄详情 / 海克斯百科 / 组合推荐 / 搜索          │
│   缓存层：wx.setStorageSync（英雄列表、版本信息、搜索结果）           │
│                                                                      │
│   调用方式：wx.cloud.callFunction({ name: 'xxx', data: {...} })      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                    wx.cloud API（免域名、免鉴权）
                                │
┌───────────────────────────────┴──────────────────────────────────────┐
│                        微信云开发环境                                  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     云函数层（Node.js）                          │  │
│  │                                                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │  │
│  │  │  业务查询函数  │  │  数据采集函数 │  │  搜索 & 聚合函数  │     │  │
│  │  │              │  │              │  │                  │     │  │
│  │  │ championList │  │staticDataSync│  │  search          │     │  │
│  │  │ championDetail│ │statsDataSync │  │  trioRank        │     │  │
│  │  │ augmentList  │  │              │  │  currentPatch    │     │  │
│  │  │ augmentDetail│  │  (定时触发)   │  │                  │     │  │
│  │  │ itemList     │  │              │  │                  │     │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘     │  │
│  └─────────┼──────────────────┼────────────────────┼──────────────┘  │
│            │                  │                    │                 │
│  ┌─────────┴──────────────────┴────────────────────┴──────────────┐  │
│  │                       云数据库（文档型）                          │  │
│  │                                                                │  │
│  │  champions       │ augments        │ items                     │  │
│  │  champion_augments│ champion_items │ augment_items             │  │
│  │  augment_trios   │ patches                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────┐  ┌──────────────────────────────────┐   │
│  │    云存储（静态资源）    │  │    定时触发器（Cron）             │   │
│  │  英雄头像 / 装备图标    │  │  statsDataSync → 每日 03:00      │   │
│  │  海克斯图标 / 其他资源  │  │  staticDataSync → 手动触发        │   │
│  └────────────────────────┘  └──────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                     云函数内 HTTPS 请求（axios）
                                │
┌───────────────────────────────┴──────────────────────────────────────┐
│                          外部数据源                                   │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Community Dragon │  │ Data Dragon  │  │ data.v2.iesdev.com    │  │
│  │ (静态:英雄/装备/  │  │ (中文本地化)  │  │ (统计数据 API - 主源)  │  │
│  │  海克斯基础信息)  │  │              │  │                       │  │
│  └─────────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │hextech.dtodo.cn │  │ aramgg.com   │  │ arammayhem.com        │  │
│  │ (海克斯中文翻译) │  │ (备用统计源)  │  │ (备用统计源)          │  │
│  └─────────────────┘  └──────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 请求流转链路

```
用户操作（如：点击英雄详情）
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ 小程序前端                                            │
│  1. 检查本地缓存 wx.getStorageSync('champion_777')    │
│  2. 缓存命中 → 直接渲染（< 50ms）                     │
│  3. 缓存未命中 → 调用云函数                            │
└──────────────────────┬───────────────────────────────┘
                       │ wx.cloud.callFunction({
                       │   name: 'championDetail',
                       │   data: { champion_id: 777, patch: '26.12' }
                       │ })
                       ▼
┌──────────────────────────────────────────────────────┐
│ 云函数 championDetail                                 │
│  1. 参数校验（champion_id 非空、patch 格式校验）       │
│  2. 查询云数据库（并行查询 4 个集合）                   │
│     ├── champions.doc(777)                            │
│     ├── champion_augments.where(champion_id, patch)   │
│     ├── champion_items.where(champion_id, patch)      │
│     └── augment_items.where(champion_id, patch)       │
│  3. 组装响应数据                                       │
│  4. 返回 { code: 0, data: {...} }                     │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ 小程序前端                                            │
│  1. 接收响应数据                                       │
│  2. 写入本地缓存                                       │
│  3. 渲染页面                                           │
└──────────────────────────────────────────────────────┘
```

### 1.3 云函数目录结构

```
cloudfunctions/
├── championList/          # 英雄列表查询
│   ├── index.js
│   ├── package.json
│   └── config.json
├── championDetail/        # 英雄详情查询
│   ├── index.js
│   ├── package.json
│   └── config.json
├── augmentList/           # 海克斯列表查询
│   ├── index.js
│   ├── package.json
│   └── config.json
├── augmentDetail/         # 海克斯详情查询
│   ├── index.js
│   ├── package.json
│   └── config.json
├── itemList/              # 装备列表查询
│   ├── index.js
│   ├── package.json
│   └── config.json
├── trioRank/              # 三海克斯组合排行
│   ├── index.js
│   ├── package.json
│   └── config.json
├── search/                # 模糊搜索
│   ├── index.js
│   ├── package.json
│   └── config.json
├── currentPatch/          # 当前版本信息
│   ├── index.js
│   ├── package.json
│   └── config.json
├── staticDataSync/        # 静态数据同步（每版本触发）
│   ├── index.js
│   ├── package.json
│   └── config.json
├── statsDataSync/         # 统计数据同步（每日触发）
│   ├── index.js
│   ├── package.json
│   └── config.json
└── shared/                # 共享工具模块
    ├── constants.js       # 常量定义
    ├── validators.js      # 参数校验
    ├── error-codes.js     # 错误码
    └── http-client.js     # HTTP 请求封装
```

### 1.4 共享依赖（package.json 通用模板）

```json
{
  "name": "championDetail",
  "version": "1.0.0",
  "description": "英雄详情查询云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

数据采集函数额外依赖：

```json
{
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

---

## 2. 云数据库设计

> 对应 PRD §6。微信云数据库为文档型数据库（类 MongoDB），每个集合（Collection）存储一类文档（Document）。
> 以下设计在 PRD §6 基础上补充了完整的字段类型定义、索引策略、数据量估算和读写模式。

### 2.1 集合总览

| 集合名称 | 文档用途 | 预估文档数 | 读频率 | 写频率 |
|----------|----------|-----------|--------|--------|
| `champions` | 英雄基础信息 + 全局胜率 | ~170 | 高 | 低（每版本） |
| `augments` | 海克斯强化基础信息 + 全局胜率 | ~170 | 高 | 低（每版本） |
| `items` | 装备基础信息 | ~250 | 中 | 低（每版本） |
| `champion_augments` | 英雄×海克斯适配统计 | ~17,000（170×100） | 高 | 中（每日） |
| `champion_items` | 英雄×装备推荐统计 | ~8,500（170×50） | 高 | 中（每日） |
| `augment_items` | 海克斯×装备联动统计 | ~25,000（170×100×部分） | 中 | 中（每日） |
| `augment_trios` | 三海克斯组合统计 | ~50,000+ | 中 | 中（每日） |
| `patches` | 版本记录 | ~20/年 | 低 | 低（每版本） |

> **总数据量估算**：~10 万条核心文档。云数据库基础版 2GB 空间完全满足，单条文档平均 ~500 字节，总存储约 50MB。

### 2.2 champions 集合（英雄）

**文档 Schema：**

```javascript
{
  _id: String,                    // 主键，riot_id 的字符串形式，如 "777"
  riot_id: Number,                // Riot Games 官方英雄 ID
  name: String,                   // 英文名，如 "Yasuo"
  name_zh: String,                // 中文名，如 "亚索"
  title: String,                  // 称号，如 "疾风剑豪"
  roles: [String],                // 定位标签，如 ["战士", "刺客"]
  icon_url: String,               // 云存储文件 ID，如 "cloud://xxx/champions/777.png"
  win_rate: Number,               // 全局胜率（百分比），如 52.3
  pick_rate: Number,              // 全局选取率（百分比），如 8.7
  patch_version: String,          // 当前适用版本号，如 "26.12"
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
// 控制台创建或通过初始化脚本创建
db.champions.createIndex({ name_zh: 1 })          // 中文名搜索
db.champions.createIndex({ name: 1 })              // 英文名搜索
db.champions.createIndex({ win_rate: -1 })         // 胜率排序
db.champions.createIndex({ pick_rate: -1 })        // 选取率排序
db.champions.createIndex({ patch_version: 1 })     // 版本过滤
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 英雄列表页 | `.where({patch_version}).orderBy(sort_by, order).skip().limit()` |
| 读取 | 英雄详情页 | `.doc(champion_id).get()` |
| 读取 | 搜索结果 | `.where({name_zh: /keyword/i})` 正则匹配 |
| 写入 | staticDataSync | `.doc(riot_id).set()` — upsert 模式 |
| 写入 | statsDataSync | `.doc(riot_id).update({win_rate, pick_rate})` — 局部更新 |

### 2.3 augments 集合（海克斯强化）

**文档 Schema：**

```javascript
{
  _id: String,                    // 主键，riot_id 的字符串形式，如 "1205"
  riot_id: Number,                // Riot Games 官方强化 ID
  name: String,                   // 英文内部名，如 "INFINITE_LOOP"
  name_zh: String,                // 中文名，如 "无限循环"
  description: String,            // 英文效果描述
  description_zh: String,         // 中文效果描述
  rarity: String,                 // 稀有度："silver" | "gold" | "prismatic"
  icon_url: String,               // 云存储文件 ID
  win_rate: Number,               // 全局胜率（百分比）
  pick_rate: Number,              // 全局选取率（百分比）
  patch_version: String,          // 当前适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
db.augments.createIndex({ name_zh: 1 })           // 中文名搜索
db.augments.createIndex({ name: 1 })               // 英文名搜索
db.augments.createIndex({ rarity: 1 })             // 稀有度筛选
db.augments.createIndex({ win_rate: -1 })          // 胜率排序
db.augments.createIndex({ pick_rate: -1 })         // 选取率排序
db.augments.createIndex({ patch_version: 1 })      // 版本过滤
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 海克斯列表（按稀有度） | `.where({rarity, patch_version}).orderBy(sort_by, order).skip().limit()` |
| 读取 | 海克斯详情页 | `.doc(augment_id).get()` |
| 读取 | 搜索结果 | `.where({name_zh: /keyword/i})` 正则匹配 |
| 写入 | staticDataSync | `.doc(riot_id).set()` — upsert 模式 |
| 写入 | statsDataSync | `.doc(riot_id).update({win_rate, pick_rate})` — 局部更新 |

### 2.4 items 集合（装备）

**文档 Schema：**

```javascript
{
  _id: String,                    // 主键，riot_id 的字符串形式，如 "3153"
  riot_id: Number,                // Riot Games 官方装备 ID
  name: String,                   // 英文名，如 "Ruination"
  name_zh: String,                // 中文名，如 "毁坏仪式"
  description: String,            // 英文描述
  description_zh: String,         // 中文描述
  price: Number,                  // 总价（金币），如 3200
  icon_url: String,               // 云存储文件 ID
  from_ids: [Number],             // 合成来源装备 ID 列表，如 [1037, 3044]
  to_ids: [Number],               // 可升级为的装备 ID 列表
  categories: [String],           // 标签分类，如 ["AttackDamage", "LifeSteal"]
  patch_version: String,          // 当前适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
db.items.createIndex({ name_zh: 1 })             // 中文名搜索
db.items.createIndex({ name: 1 })                 // 英文名搜索
db.items.createIndex({ categories: 1 })           // 分类筛选
db.items.createIndex({ patch_version: 1 })        // 版本过滤
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 装备列表页 | `.where({patch_version}).skip().limit()` |
| 读取 | 装备详情浮层 | `.doc(item_id).get()` |
| 写入 | staticDataSync | `.doc(riot_id).set()` — upsert 模式 |

### 2.5 champion_augments 集合（英雄×海克斯适配）

> 核心数据集合，每次数据同步时更新量最大。

**文档 Schema：**

```javascript
{
  _id: String,                    // 复合主键："{champion_id}_{augment_id}_{patch_version}"
                                  // 如 "777_1205_26.12"
  champion_id: Number,            // 英雄 ID（对应 champions.riot_id）
  augment_id: Number,             // 海克斯 ID（对应 augments.riot_id）
  win_rate: Number,               // 胜率（百分比），如 63.9
  pick_rate: Number,              // 选取率（百分比），如 1.6
  sample_size: Number,            // 样本场次，如 2340
  tier: String,                   // 评级："S" | "A" | "B" | "C" | "D"
  patch_version: String,          // 适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
// 主查询索引：按英雄查看推荐海克斯
db.champion_augments.createIndex({ champion_id: 1, patch_version: 1, win_rate: -1 })

// 反向查询索引：按海克斯查看适配英雄
db.champion_augments.createIndex({ augment_id: 1, patch_version: 1, win_rate: -1 })

// Tier 筛选索引
db.champion_augments.createIndex({ champion_id: 1, tier: 1, patch_version: 1 })

// 数据同步 upsert 索引
db.champion_augments.createIndex({ champion_id: 1, augment_id: 1, patch_version: 1 }, { unique: true })
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 英雄详情页-推荐海克斯 | `.where({champion_id, patch_version}).orderBy('win_rate','desc').limit(50)` |
| 读取 | 海克斯详情页-适配英雄 | `.where({augment_id, patch_version}).orderBy('win_rate','desc').limit(10)` |
| 读取 | 海克斯详情页-不适配英雄 | `.where({augment_id, patch_version}).orderBy('win_rate','asc').limit(5)` |
| 写入 | statsDataSync | 批量 upsert，按 `_id` 匹配，存在则更新，不存在则插入 |

**文档数量估算：**

```
170 英雄 × ~100 海克斯 = ~17,000 条/版本
历史保留 2 个版本 → ~34,000 条
```

### 2.6 champion_items 集合（英雄×装备推荐）

**文档 Schema：**

```javascript
{
  _id: String,                    // 复合主键："{champion_id}_{item_id}_{patch_version}"
  champion_id: Number,            // 英雄 ID
  item_id: Number,                // 装备 ID
  win_rate: Number,               // 胜率（百分比）
  pick_rate: Number,              // 选取率（百分比）
  sample_size: Number,            // 样本场次
  tier: String,                   // 评级："S" | "A" | "B" | "C" | "D"
  is_core: Boolean,               // 是否核心装备
  slot: String,                   // 装备槽位："core" | "boots" | "full_build"
  patch_version: String,          // 适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
db.champion_items.createIndex({ champion_id: 1, patch_version: 1, slot: 1 })
db.champion_items.createIndex({ champion_id: 1, patch_version: 1, win_rate: -1 })
db.champion_items.createIndex({ champion_id: 1, item_id: 1, patch_version: 1 }, { unique: true })
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 英雄详情页-推荐装备 | `.where({champion_id, patch_version}).orderBy('win_rate','desc').limit(30)` |
| 读取 | 英雄详情页-核心装备 | `.where({champion_id, patch_version, slot:'core'})` |
| 写入 | statsDataSync | 批量 upsert |

**文档数量估算：**

```
170 英雄 × ~50 常用装备 = ~8,500 条/版本
历史保留 2 个版本 → ~17,000 条
```

### 2.7 augment_items 集合（海克斯×装备联动）

> 差异化功能的核心数据：选择某海克斯后推荐出装如何变化。

**文档 Schema：**

```javascript
{
  _id: String,                    // 复合主键："{augment_id}_{item_id}_{champion_id}_{patch_version}"
                                  // champion_id 为 null 时表示全局数据
  augment_id: Number,             // 海克斯 ID
  champion_id: Number | null,     // 英雄 ID（null 表示全局）
  item_id: Number,                // 装备 ID
  win_rate: Number,               // 胜率（百分比）
  pick_rate: Number,              // 选取率（百分比）
  sample_size: Number,            // 样本场次
  tier: String,                   // 评级
  patch_version: String,          // 适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
db.augment_items.createIndex({ augment_id: 1, patch_version: 1, win_rate: -1 })
db.augment_items.createIndex({ augment_id: 1, champion_id: 1, patch_version: 1 })
db.augment_items.createIndex({ augment_id: 1, item_id: 1, champion_id: 1, patch_version: 1 }, { unique: true })
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 英雄详情-海克斯×出装联动 | `.where({champion_id, patch_version}).orderBy('win_rate','desc').limit(50)` |
| 读取 | 海克斯详情-推荐装备 | `.where({augment_id, patch_version}).orderBy('win_rate','desc').limit(30)` |
| 写入 | statsDataSync | 批量 upsert |

**文档数量估算：**

```
全局数据：~100 海克斯 × ~30 装备 = ~3,000
英雄维度：~170 英雄 × ~100 海克斯 × 少量装备 = ~20,000+
合计 ~25,000 条/版本，保留 2 版本 → ~50,000 条
```

### 2.8 augment_trios 集合（三海克斯组合）

**文档 Schema：**

```javascript
{
  _id: String,                    // 复合主键："{id1}_{id2}_{id3}_{champion_id}_{patch_version}"
                                  // augment_ids 升序排列确保唯一性
  augment_ids: [Number],          // 三个海克斯 ID（升序排列），如 [1089, 1141, 1205]
  champion_id: Number | null,     // 英雄 ID（null 表示全局组合）
  win_rate: Number,               // 组合胜率（百分比）
  sample_size: Number,            // 样本场次
  tier: String,                   // 评级
  patch_version: String,          // 适用版本号
  updated_at: Date                // 最后更新时间
}
```

**索引配置：**

```javascript
// 组合排行查询（按英雄 + 版本 + 胜率降序）
db.augment_trios.createIndex({ champion_id: 1, patch_version: 1, win_rate: -1 })

// 全局排行查询
db.augment_trios.createIndex({ patch_version: 1, win_rate: -1 })

// 唯一约束
db.augment_trios.createIndex({ augment_ids: 1, champion_id: 1, patch_version: 1 }, { unique: true })
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 组合推荐-全局排行 | `.where({champion_id:null, patch_version}).orderBy('win_rate','desc').skip().limit()` |
| 读取 | 组合推荐-按英雄筛选 | `.where({champion_id, patch_version}).orderBy('win_rate','desc').skip().limit()` |
| 写入 | statsDataSync | 批量 upsert |

**文档数量估算：**

```
C(100,3) ≈ 161,700 种组合（理论值），实际有数据的组合远少于此
预计 ~50,000 条/版本有统计意义
保留 2 版本 → ~100,000 条
```

### 2.9 patches 集合（版本记录）

**文档 Schema：**

```javascript
{
  _id: String,                    // 主键：版本号字符串，如 "26.12"
  version: String,                // 版本号
  released_at: Date,              // 版本发布日期
  is_current: Boolean,            // 是否为当前版本
  data_status: String,            // 数据同步状态："syncing" | "ready" | "error"
  stats_updated_at: Date,         // 统计数据最后同步时间
  static_updated_at: Date,        // 静态数据最后同步时间
  updated_at: Date                // 文档最后更新时间
}
```

**索引配置：**

```javascript
db.patches.createIndex({ is_current: 1 })         // 快速查找当前版本
db.patches.createIndex({ released_at: -1 })        // 版本时间线
```

**读写模式：**

| 操作 | 场景 | 查询方式 |
|------|------|----------|
| 读取 | 首页版本信息展示 | `.where({is_current:true}).limit(1).get()` |
| 读取 | 云函数获取当前版本 | `.where({is_current:true}).field({version:1}).get()` |
| 写入 | staticDataSync | 新版本插入 / 旧版本 `is_current` 置 false |

### 2.10 数据关联关系图

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  champions  │◄────────│  champion_augments    │────────►│  augments   │
│             │  champ_id│                      │ augment │             │
│  riot_id    │         │  win_rate / tier      │  _id    │  riot_id    │
│  name_zh    │         │  sample_size          │         │  name_zh    │
│  win_rate   │         └──────────────────────┘         │  rarity     │
│  pick_rate  │                                          └──────┬──────┘
└──────┬──────┘                                                  │
       │                                                         │
       │           ┌──────────────────────┐                      │
       │◄──────────│   champion_items     │                      │
       │  champ_id │                      │                      │
       │           │  win_rate / tier     │                      │
       │           │  slot: core/boots    │                      │
       │           └──────────┬───────────┘                      │
       │                      │ item_id                          │
       │                      ▼                                  │
       │           ┌──────────────────────┐                      │
       │           │      items           │                      │
       │           │  riot_id             │                      │
       │           │  name_zh / price     │                      │
       │           │  from_ids / to_ids   │                      │
       │           └──────────────────────┘                      │
       │                                                         │
       │           ┌──────────────────────┐                      │
       └──────────►│   augment_items      │◄─────────────────────┘
          champ_id │                      │  augment_id
                   │  海克斯×装备联动      │
                   │  win_rate / tier     │
                   └──────────────────────┘

                   ┌──────────────────────┐
                   │   augment_trios      │
                   │  augment_ids[3]      │
                   │  champion_id (nullable)│
                   │  win_rate / tier     │
                   └──────────────────────┘
```

---

## 3. 云函数规格

> 对应 PRD §7。以下对全部 10 个云函数给出完整规格定义。

### 3.1 统一响应格式

所有业务查询云函数返回统一格式：

```javascript
// 成功响应
{
  code: 0,
  message: "success",
  data: { ... },
  meta: {
    patch_version: "26.12",
    timestamp: 1719302400000
  }
}

// 失败响应
{
  code: 1001,
  message: "参数错误：champion_id 不能为空",
  data: null
}
```

### 3.2 championList — 英雄列表查询

**功能说明：** 获取英雄列表，支持按胜率/选取率排序，支持分页。

**输入参数：**

```javascript
{
  sort_by: String,     // 排序字段："win_rate" | "pick_rate"，默认 "win_rate"
  order: String,       // 排序方向："desc" | "asc"，默认 "desc"
  page: Number,        // 页码，从 1 开始，默认 1
  page_size: Number,   // 每页数量，默认 20，最大 50
  patch: String        // 版本号（可选），不传则取当前版本
}
```

**参数校验规则：**

```javascript
function validateChampionListParams(event) {
  const errors = []
  const validSortFields = ['win_rate', 'pick_rate']
  const validOrders = ['desc', 'asc']

  if (event.sort_by && !validSortFields.includes(event.sort_by)) {
    errors.push(`sort_by 必须为 ${validSortFields.join('/')} 之一`)
  }
  if (event.order && !validOrders.includes(event.order)) {
    errors.push(`order 必须为 ${validOrders.join('/')} 之一`)
  }
  if (event.page !== undefined && (event.page < 1 || !Number.isInteger(event.page))) {
    errors.push('page 必须为正整数')
  }
  if (event.page_size !== undefined && (event.page_size < 1 || event.page_size > 50)) {
    errors.push('page_size 范围为 1-50')
  }
  if (event.patch && !/^\d+\.\d+$/.test(event.patch)) {
    errors.push('patch 格式不正确，应为 "xx.xx"')
  }
  return errors
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    list: [
      {
        _id: "777",
        name: "Yasuo",
        name_zh: "亚索",
        title: "疾风剑豪",
        roles: ["战士", "刺客"],
        icon_url: "cloud://xxx/champions/777.png",
        win_rate: 52.3,
        pick_rate: 8.7
      }
      // ... 共 page_size 条
    ],
    total: 170,            // 当前版本英雄总数
    page: 1,
    page_size: 20,
    total_pages: 9         // 总页数
  },
  meta: { patch_version: "26.12", timestamp: 1719302400000 }
}
```

**数据库查询：**

```javascript
// cloudfunctions/championList/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const {
    sort_by = 'win_rate',
    order = 'desc',
    page = 1,
    page_size = 20,
    patch
  } = event

  // 1. 获取当前版本号（如果未指定）
  const patchVersion = patch || await getCurrentPatch()

  // 2. 查询总数
  const countResult = await db.collection('champions')
    .where({ patch_version: patchVersion })
    .count()
  const total = countResult.total

  // 3. 分页查询列表
  const skip = (page - 1) * page_size
  const listResult = await db.collection('champions')
    .where({ patch_version: patchVersion })
    .orderBy(sort_by, order)
    .skip(skip)
    .limit(page_size)
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
      page_size,
      total_pages: Math.ceil(total / page_size)
    },
    meta: {
      patch_version: patchVersion,
      timestamp: Date.now()
    }
  }
}

// 获取当前版本号的公共方法
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
```

**性能考量：**

- 使用 `.field()` 投影只返回必要字段，减少网络传输
- `champions` 集合仅 ~170 条文档，即使全量返回也仅 ~85KB
- 排序依赖索引 `{win_rate: -1}` / `{pick_rate: -1}`

---

### 3.3 championDetail — 英雄详情查询

**功能说明：** 获取指定英雄的完整信息，包括推荐海克斯、推荐装备、海克斯×出装联动。

**输入参数：**

```javascript
{
  champion_id: Number,     // 必填，英雄 Riot ID
  patch: String            // 可选，版本号
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    champion: {
      _id: "777",
      name: "Yasuo",
      name_zh: "亚索",
      title: "疾风剑豪",
      roles: ["战士", "刺客"],
      icon_url: "cloud://xxx/champions/777.png",
      win_rate: 52.3,
      pick_rate: 8.7
    },
    augments: [
      // 按稀有度分组、组内按胜率降序
      {
        augment_id: 1205,
        augment_name_zh: "无限循环",    // 关联查询 augments 集合
        rarity: "prismatic",
        win_rate: 63.9,
        pick_rate: 1.6,
        tier: "S",
        sample_size: 2340
      }
      // ...
    ],
    items: [
      {
        item_id: 3153,
        item_name_zh: "毁坏仪式",      // 关联查询 items 集合
        win_rate: 60.0,
        pick_rate: 5.1,
        tier: "S",
        is_core: true,
        slot: "core",
        sample_size: 8656
      }
      // ...
    ],
    augment_items_linkage: [
      {
        augment_id: 1205,
        augment_name_zh: "毁坏仪式",
        item_id: 6676,
        item_name_zh: "暴击书",
        win_rate: 61.2,
        pick_rate: 3.4,
        tier: "S",
        sample_size: 1230
      }
      // ...
    ],
    patch_version: "26.12"
  }
}
```

**数据库查询流程：**

```javascript
// cloudfunctions/championDetail/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { champion_id, patch } = event

  // 参数校验
  if (!champion_id || typeof champion_id !== 'number') {
    return { code: 1001, message: 'champion_id 为必填数字', data: null }
  }

  const patchVersion = patch || await getCurrentPatch()

  try {
    // 并行执行 4 个查询
    const [championRes, augmentsRes, itemsRes, linkageRes] = await Promise.all([
      // 1. 英雄基础信息
      db.collection('champions')
        .doc(String(champion_id))
        .get(),

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
      return { code: 1002, message: '英雄不存在', data: null }
    }

    // 批量关联查询 augment 和 item 的中文名/稀有度
    const augmentIds = augmentsRes.data.map(a => a.augment_id)
    const itemIds = [
      ...itemsRes.data.map(i => i.item_id),
      ...linkageRes.data.map(l => l.item_id)
    ]
    // 去重
    const uniqueItemIds = [...new Set(itemIds)]

    const [augmentInfoRes, itemInfoRes] = await Promise.all([
      augmentIds.length > 0
        ? db.collection('augments')
            .where({ riot_id: _.in(augmentIds) })
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

    // 构建 ID → 信息 映射
    const augmentMap = {}
    augmentInfoRes.data.forEach(a => { augmentMap[a.riot_id] = a })
    const itemMap = {}
    itemInfoRes.data.forEach(i => { itemMap[i.riot_id] = i })

    // 组装响应数据
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
    return { code: 2000, message: '服务器内部错误', data: null }
  }
}
```

**性能考量：**

- 4 个主查询并行执行（`Promise.all`），总耗时取决于最慢的单次查询
- 关联查询通过 `_.in()` 批量获取，避免逐条查询的 N+1 问题
- 预计总响应时间 < 200ms

---

### 3.4 augmentList — 海克斯列表查询

**功能说明：** 获取海克斯强化列表，支持稀有度筛选、排序、分页。

**输入参数：**

```javascript
{
  rarity: String,        // 可选，稀有度筛选："silver" | "gold" | "prismatic"
  sort_by: String,       // 排序字段："win_rate" | "pick_rate"，默认 "win_rate"
  order: String,         // 排序方向："desc" | "asc"，默认 "desc"
  page: Number,          // 页码，从 1 开始，默认 1
  page_size: Number,     // 每页数量，默认 20，最大 50
  patch: String          // 可选，版本号
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    list: [
      {
        _id: "1205",
        name: "INFINITE_LOOP",
        name_zh: "无限循环",
        rarity: "prismatic",
        icon_url: "cloud://xxx/augments/1205.png",
        win_rate: 55.2,
        pick_rate: 3.1
      }
    ],
    total: 45,              // 当前筛选条件下的总数
    page: 1,
    page_size: 20,
    total_pages: 3
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/augmentList/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const {
    rarity,
    sort_by = 'win_rate',
    order = 'desc',
    page = 1,
    page_size = 20,
    patch
  } = event

  // 参数校验
  const validRarities = ['silver', 'gold', 'prismatic']
  if (rarity && !validRarities.includes(rarity)) {
    return { code: 1001, message: `rarity 必须为 ${validRarities.join('/')} 之一`, data: null }
  }

  const patchVersion = patch || await getCurrentPatch()

  // 构建查询条件
  const where = { patch_version: patchVersion }
  if (rarity) {
    where.rarity = rarity
  }

  // 查询总数
  const countResult = await db.collection('augments')
    .where(where)
    .count()
  const total = countResult.total

  // 分页查询
  const skip = (page - 1) * page_size
  const listResult = await db.collection('augments')
    .where(where)
    .orderBy(sort_by, order)
    .skip(skip)
    .limit(page_size)
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
      page_size,
      total_pages: Math.ceil(total / page_size)
    },
    meta: { patch_version: patchVersion, timestamp: Date.now() }
  }
}
```

---

### 3.5 augmentDetail — 海克斯详情查询

**功能说明：** 获取指定海克斯的完整信息，包括最适配英雄、最不适配英雄、推荐装备。

**输入参数：**

```javascript
{
  augment_id: Number,      // 必填，海克斯 Riot ID
  patch: String            // 可选，版本号
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    augment: {
      _id: "1205",
      name: "INFINITE_LOOP",
      name_zh: "无限循环",
      description_zh: "技能命中后缩短冷却...",
      rarity: "prismatic",
      icon_url: "cloud://xxx/augments/1205.png",
      win_rate: 55.2,
      pick_rate: 3.1,
      global_rank: 12             // 全局排名
    },
    best_champions: [
      // 最适配英雄 TOP10（该强化在这些英雄上胜率最高）
      {
        champion_id: 777,
        champion_name_zh: "亚索",
        icon_url: "cloud://xxx/champions/777.png",
        win_rate: 63.9,
        pick_rate: 1.6,
        tier: "S",
        sample_size: 2340
      }
      // ... 共 10 条
    ],
    worst_champions: [
      // 最不适配英雄 BOTTOM5
      {
        champion_id: 12,
        champion_name_zh: "阿利斯塔",
        win_rate: 42.1,
        pick_rate: 0.8,
        tier: "D",
        sample_size: 1560
      }
      // ... 共 5 条
    ],
    items: [
      // 选择该强化后的推荐装备
      {
        item_id: 3153,
        item_name_zh: "毁坏仪式",
        icon_url: "cloud://xxx/items/3153.png",
        win_rate: 61.2,
        pick_rate: 3.4,
        tier: "S",
        sample_size: 1230
      }
      // ...
    ],
    patch_version: "26.12"
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/augmentDetail/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { augment_id, patch } = event

  if (!augment_id || typeof augment_id !== 'number') {
    return { code: 1001, message: 'augment_id 为必填数字', data: null }
  }

  const patchVersion = patch || await getCurrentPatch()

  try {
    // 并行查询
    const [augmentRes, bestRes, worstRes, itemsRes] = await Promise.all([
      // 1. 海克斯基础信息
      db.collection('augments').doc(String(augment_id)).get(),

      // 2. 最适配英雄 TOP10
      db.collection('champion_augments')
        .where({ augment_id, patch_version: patchVersion })
        .orderBy('win_rate', 'desc')
        .limit(10)
        .get(),

      // 3. 最不适配英雄 BOTTOM5
      db.collection('champion_augments')
        .where({ augment_id, patch_version: patchVersion })
        .orderBy('win_rate', 'asc')
        .limit(5)
        .get(),

      // 4. 推荐装备
      db.collection('augment_items')
        .where({
          augment_id,
          champion_id: null,        // 全局数据
          patch_version: patchVersion
        })
        .orderBy('win_rate', 'desc')
        .limit(30)
        .get()
    ])

    if (!augmentRes.data) {
      return { code: 1002, message: '海克斯不存在', data: null }
    }

    // 批量关联英雄和装备名称
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

    return {
      code: 0,
      message: 'success',
      data: {
        augment: augmentRes.data,
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
    return { code: 2000, message: '服务器内部错误', data: null }
  }
}
```

---

### 3.6 itemList — 装备列表查询

**功能说明：** 获取装备列表，支持分类筛选、分页。

**输入参数：**

```javascript
{
  category: String,      // 可选，分类筛选："AttackDamage" | "AbilityPower" | "Armor" | ...
  page: Number,          // 页码，默认 1
  page_size: Number      // 每页数量，默认 20，最大 50
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    list: [
      {
        _id: "3153",
        name: "Ruination",
        name_zh: "毁坏仪式",
        price: 3200,
        icon_url: "cloud://xxx/items/3153.png",
        categories: ["AttackDamage", "LifeSteal"]
      }
    ],
    total: 250,
    page: 1,
    page_size: 20,
    total_pages: 13
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/itemList/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const {
    category,
    page = 1,
    page_size = 20
  } = event

  const where = {}
  if (category) {
    where.categories = category    // 数组字段包含该值
  }

  const countResult = await db.collection('items')
    .where(where)
    .count()
  const total = countResult.total

  const skip = (page - 1) * page_size
  const listResult = await db.collection('items')
    .where(where)
    .skip(skip)
    .limit(page_size)
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
      page_size,
      total_pages: Math.ceil(total / page_size)
    },
    meta: { timestamp: Date.now() }
  }
}
```

---

### 3.7 trioRank — 三海克斯组合排行

**功能说明：** 获取三海克斯组合排行榜，支持按英雄、流派筛选。

**输入参数：**

```javascript
{
  champion_id: Number,     // 可选，英雄 ID 筛选
  playstyle: String,       // 可选，流派标签："tank" | "crit" | "ap" | "onhit"
  sort_by: String,         // 排序字段："win_rate" | "sample_size"，默认 "win_rate"
  page: Number,            // 页码，默认 1
  page_size: Number,       // 每页数量，默认 20，最大 50
  patch: String            // 可选，版本号
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    list: [
      {
        augment_ids: [1205, 1141, 1089],
        augment_names_zh: ["无限循环", "坦克引擎", "会心治疗"],  // 关联查询
        augment_icons: ["cloud://xxx/1205.png", "...", "..."],
        win_rate: 68.2,
        sample_size: 234,
        tier: "S"
      }
    ],
    total: 500,
    page: 1,
    page_size: 20,
    total_pages: 25
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/trioRank/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const {
    champion_id,
    playstyle,
    sort_by = 'win_rate',
    page = 1,
    page_size = 20,
    patch
  } = event

  const patchVersion = patch || await getCurrentPatch()

  // 构建查询条件
  const where = { patch_version: patchVersion }

  if (champion_id) {
    where.champion_id = champion_id
  } else {
    // 默认查全局组合（champion_id 为 null）
    where.champion_id = null
  }

  // 最低样本量过滤，避免小样本数据干扰
  where.sample_size = _.gte(50)

  // 查询总数
  const countResult = await db.collection('augment_trios')
    .where(where)
    .count()
  const total = countResult.total

  // 分页查询
  const skip = (page - 1) * page_size
  const listResult = await db.collection('augment_trios')
    .where(where)
    .orderBy(sort_by, 'desc')
    .skip(skip)
    .limit(page_size)
    .get()

  // 批量关联海克斯名称
  const allAugmentIds = new Set()
  listResult.data.forEach(t => t.augment_ids.forEach(id => allAugmentIds.add(id)))

  const augmentInfoRes = await db.collection('augments')
    .where({ riot_id: _.in([...allAugmentIds]) })
    .field({ riot_id: true, name_zh: true, icon_url: true })
    .get()

  const augmentMap = {}
  augmentInfoRes.data.forEach(a => {
    augmentMap[a.riot_id] = { name_zh: a.name_zh, icon_url: a.icon_url }
  })

  // 组装响应
  const list = listResult.data.map(t => ({
    augment_ids: t.augment_ids,
    augment_names_zh: t.augment_ids.map(id => augmentMap[id]?.name_zh || ''),
    augment_icons: t.augment_ids.map(id => augmentMap[id]?.icon_url || ''),
    win_rate: t.win_rate,
    sample_size: t.sample_size,
    tier: t.tier
  }))

  return {
    code: 0,
    message: 'success',
    data: {
      list,
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size)
    },
    meta: { patch_version: patchVersion, timestamp: Date.now() }
  }
}
```

---

### 3.8 search — 模糊搜索

**功能说明：** 模糊搜索英雄和海克斯，支持中英文、别名匹配。

**输入参数：**

```javascript
{
  keyword: String,       // 必填，搜索关键词（最少 1 个字符）
  limit: Number          // 可选，每种类型返回条数，默认 10，最大 20
}
```

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    results: [
      {
        type: "champion",
        _id: "777",
        name: "Yasuo",
        name_zh: "亚索",
        title: "疾风剑豪",
        icon_url: "cloud://xxx/champions/777.png",
        win_rate: 52.3
      },
      {
        type: "augment",
        _id: "1205",
        name: "INFINITE_LOOP",
        name_zh: "无限循环",
        rarity: "prismatic",
        icon_url: "cloud://xxx/augments/1205.png",
        win_rate: 55.2
      }
    ],
    total: 2               // 结果总数
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/search/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { keyword, limit = 10 } = event

  // 参数校验
  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return { code: 1001, message: 'keyword 不能为空', data: null }
  }

  const safeLimit = Math.min(Math.max(1, limit || 10), 20)
  const escapedKeyword = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  try {
    // 并行搜索英雄和海克斯
    const [championsRes, augmentsRes] = await Promise.all([
      db.collection('champions')
        .where(_.or([
          { name_zh: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { name: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { title: db.RegExp({ regexp: escapedKeyword, options: 'i' }) }
        ]))
        .field({
          _id: true, name: true, name_zh: true, title: true,
          icon_url: true, win_rate: true, roles: true
        })
        .limit(safeLimit)
        .get(),

      db.collection('augments')
        .where(_.or([
          { name_zh: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
          { name: db.RegExp({ regexp: escapedKeyword, options: 'i' }) }
        ]))
        .field({
          _id: true, name: true, name_zh: true, rarity: true,
          icon_url: true, win_rate: true
        })
        .limit(safeLimit)
        .get()
    ])

    // 合并结果，英雄在前、海克斯在后
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
    return { code: 2000, message: '搜索服务异常', data: null }
  }
}
```

**性能考量：**

- 正则搜索无法利用索引，但 `champions`（~170条）和 `augments`（~170条）集合极小
- 全表扫描耗时 < 10ms，可接受
- 对关键词进行正则转义，防止 ReDoS 攻击

---

### 3.9 currentPatch — 当前版本信息

**功能说明：** 获取当前数据版本号及状态信息。

**输入参数：** 无

**输出响应：**

```javascript
{
  code: 0,
  message: "success",
  data: {
    version: "26.12",
    released_at: "2026-06-20T00:00:00.000Z",
    is_current: true,
    data_status: "ready",
    stats_updated_at: "2026-06-25T03:00:12.000Z",
    static_updated_at: "2026-06-20T10:30:00.000Z"
  }
}
```

**实现代码：**

```javascript
// cloudfunctions/currentPatch/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const res = await db.collection('patches')
      .where({ is_current: true })
      .limit(1)
      .get()

    if (res.data.length === 0) {
      return { code: 1002, message: '版本数据未初始化', data: null }
    }

    return {
      code: 0,
      message: 'success',
      data: res.data[0]
    }
  } catch (err) {
    console.error('[currentPatch] 查询异常:', err)
    return { code: 2000, message: '服务器内部错误', data: null }
  }
}
```

---

## 4. 数据采集管道详细设计

> 对应 PRD §4.2 / §4.3 / §4.4。本节详细描述两个数据采集云函数的完整实现逻辑。

### 4.1 staticDataSync — 静态数据同步

**触发方式：** 手动触发（仅在版本更新时执行）

**数据源端点（来自 PRD §4.2）：**

| # | 数据源 | 完整 API 端点 | 获取内容 | 请求方式 |
|---|--------|--------------|----------|----------|
| 1 | Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json` | 英雄 ID、英文名、图标路径 | GET |
| 2 | Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json` | 装备 ID、名称、描述、价格、合成路径 | GET |
| 3 | Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` | 海克斯 ID、名称、描述、图标、稀有度 | GET |
| 4 | Data Dragon | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/champion.json` | 英雄中文名称、称号、背景故事 | GET |
| 5 | Data Dragon | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/item.json` | 装备中文名称、描述 | GET |
| 6 | hextech.dtodo.cn | `https://hextech.dtodo.cn/data/aram-mayhem-augments.zh_cn.json` | 海克斯强化中文翻译映射 | GET |

**请求头配置：**

```javascript
const DEFAULT_HEADERS = {
  'User-Agent': 'ARAM-Mayhem-Guide/1.0 (WeChat-MiniProgram)',
  'Accept': 'application/json'
}

// Data Dragon 请求无需特殊头
// Community Dragon 请求需设置 User-Agent 避免被 CDN 拒绝
```

**完整实现代码：**

```javascript
// cloudfunctions/staticDataSync/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const CDRAWN_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1'
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn'
const HEXTECH_BASE = 'https://hextech.dtodo.cn/data'

const ENDPOINTS = {
  championSummary: `${CDRAWN_BASE}/champion-summary.json`,
  items: `${CDRAWN_BASE}/items.json`,
  cherryAugments: `${CDRAWN_BASE}/cherry-augments.json`,
  // Data Dragon 端点需要拼接版本号，运行时动态生成
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { patch_version } = event  // 手动触发时传入版本号，如 "26.12"

  if (!patch_version || !/^\d+\.\d+$/.test(patch_version)) {
    return { code: 1001, message: 'patch_version 格式不正确', data: null }
  }

  console.log(`[staticDataSync] 开始同步版本 ${patch_version} 的静态数据`)

  try {
    // Step 1: 并行拉取所有数据源
    const [
      championSummary,
      itemsRaw,
      cherryAugments,
      ddChampion,
      ddItem,
      hextechZh
    ] = await Promise.all([
      fetchJSON(ENDPOINTS.championSummary),
      fetchJSON(ENDPOINTS.items),
      fetchJSON(ENDPOINTS.cherryAugments),
      fetchJSON(`${DDRAGON_BASE}/${patch_version}/data/zh_CN/champion.json`),
      fetchJSON(`${DDRAGON_BASE}/${patch_version}/data/zh_CN/item.json`),
      fetchJSON(`${HEXTECH_BASE}/aram-mayhem-augments.zh_cn.json`)
    ])

    console.log(`[staticDataSync] 数据拉取完成，开始转换和写入`)

    // Step 2: 转换并写入 champions 集合
    await syncChampions(championSummary, ddChampion, patch_version)

    // Step 3: 转换并写入 items 集合
    await syncItems(itemsRaw, ddItem, patch_version)

    // Step 4: 转换并写入 augments 集合
    await syncAugments(cherryAugments, hextechZh, patch_version)

    // Step 5: 更新 patches 集合
    await db.collection('patches').doc(patch_version).set({
      _id: patch_version,
      version: patch_version,
      released_at: new Date(),
      is_current: true,
      data_status: 'ready',
      static_updated_at: new Date(),
      updated_at: new Date()
    })

    // 将旧版本的 is_current 置为 false
    await db.collection('patches')
      .where({
        is_current: true,
        _id: _.neq(patch_version)
      })
      .update({
        data: { is_current: false, updated_at: new Date() }
      })

    console.log(`[staticDataSync] 版本 ${patch_version} 静态数据同步完成`)
    return { code: 0, message: 'success', data: { patch_version } }

  } catch (err) {
    console.error('[staticDataSync] 同步失败:', err)
    // 更新版本状态为 error
    await db.collection('patches')
      .where({ _id: patch_version })
      .update({ data: { data_status: 'error', updated_at: new Date() } })
      .catch(() => {})  // 忽略更新状态失败

    return { code: 2001, message: `静态数据同步失败: ${err.message}`, data: null }
  }
}

// ========== 数据转换与写入函数 ==========

/**
 * 同步英雄数据
 * 合并 Community Dragon（ID/英文名/图标）+ Data Dragon（中文名/称号）
 */
async function syncChampions(championSummary, ddChampion, patchVersion) {
  const ddData = ddChampion.data || {}

  // 构建 Data Dragon 中文名映射
  // DD 的 key 是 champion name（如 "Yasuo"），value 包含 name_zh 和 title
  const ddMap = {}
  for (const [key, val] of Object.entries(ddData)) {
    ddMap[key] = {
      name_zh: val.name,       // DD 的 name 字段就是中文名
      title: val.title          // DD 的 title 字段是中文称号
    }
  }

  const batch = championSummary.map(champ => {
    const ddInfo = ddMap[champ.name] || {}
    return {
      _id: String(champ.id),
      riot_id: champ.id,
      name: champ.name,
      name_zh: ddInfo.name_zh || champ.name,  // 降级使用英文名
      title: ddInfo.title || '',
      roles: [],               // 角色信息后续从其他源补充
      icon_url: `cloud://aram-mayhem-guide/champions/${champ.id}.png`,
      win_rate: 0,             // 统计数据后续由 statsDataSync 填充
      pick_rate: 0,
      patch_version: patchVersion,
      updated_at: new Date()
    }
  })

  // 批量 upsert（云数据库每次最多写入 20 条）
  await batchUpsert('champions', batch)
  console.log(`[staticDataSync] champions 写入 ${batch.length} 条`)
}

/**
 * 同步装备数据
 * 合并 Community Dragon（ID/英文名/价格/合成路径）+ Data Dragon（中文名/描述）
 */
async function syncItems(itemsRaw, ddItem, patchVersion) {
  const ddData = ddItem.data || {}

  // DD item 的 key 是装备名（如 "Boots"），需要匹配
  const ddMap = {}
  for (const [key, val] of Object.entries(ddData)) {
    ddMap[val.name] = {
      name_zh: val.name,         // 中文名称
      description_zh: val.description || ''
    }
  }

  const batch = itemsRaw
    .filter(item => item.id > 0)  // 过滤掉无效装备（id <= 0 的为基础组件）
    .map(item => {
      const ddInfo = ddMap[item.name] || {}
      return {
        _id: String(item.id),
        riot_id: item.id,
        name: item.name || '',
        name_zh: ddInfo.name_zh || item.name,
        description: item.description || '',
        description_zh: stripHtml(ddInfo.description_zh || ''),
        price: item.price?.total || 0,
        icon_url: `cloud://aram-mayhem-guide/items/${item.id}.png`,
        from_ids: (item.from || []).map(Number),
        to_ids: (item.to || []).map(Number),
        categories: item.categories || [],
        patch_version: patchVersion,
        updated_at: new Date()
      }
    })

  await batchUpsert('items', batch)
  console.log(`[staticDataSync] items 写入 ${batch.length} 条`)
}

/**
 * 同步海克斯强化数据
 * 合并 Community Dragon（ID/英文名/稀有度）+ hextech.dtodo.cn（中文名/描述）
 */
async function syncAugments(cherryAugments, hextechZh, patchVersion) {
  // 构建中文翻译映射
  // hextechZh 的格式假设为: { "1205": { "name": "无限循环", "description": "..." } }
  const zhMap = {}
  if (Array.isArray(hextechZh)) {
    hextechZh.forEach(a => {
      zhMap[a.id || a.riot_id] = {
        name_zh: a.name || a.name_zh || '',
        description_zh: a.description || a.description_zh || ''
      }
    })
  } else if (typeof hextechZh === 'object') {
    for (const [id, val] of Object.entries(hextechZh)) {
      zhMap[Number(id)] = {
        name_zh: val.name || '',
        description_zh: val.description || ''
      }
    }
  }

  // 稀有度映射
  const rarityMap = {
    1: 'silver',
    2: 'gold',
    3: 'prismatic'
  }

  const batch = cherryAugments
    .filter(a => a.id > 0)
    .map(augment => {
      const zhInfo = zhMap[augment.id] || {}
      return {
        _id: String(augment.id),
        riot_id: augment.id,
        name: augment.name || augment.apiName || '',
        name_zh: zhInfo.name_zh || augment.name,
        description: augment.description || '',
        description_zh: zhInfo.description_zh || stripHtml(augment.description || ''),
        rarity: rarityMap[augment.rarity] || augment.rarityName?.toLowerCase() || 'silver',
        icon_url: `cloud://aram-mayhem-guide/augments/${augment.id}.png`,
        win_rate: 0,
        pick_rate: 0,
        patch_version: patchVersion,
        updated_at: new Date()
      }
    })

  await batchUpsert('augments', batch)
  console.log(`[staticDataSync] augments 写入 ${batch.length} 条`)
}

// ========== 工具函数 ==========

/**
 * 批量 upsert 到云数据库
 * 云数据库单次写入限制 20 条，需分批执行
 */
async function batchUpsert(collectionName, docs, batchSize = 20) {
  const collection = db.collection(collectionName)

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    const promises = batch.map(doc =>
      collection.doc(doc._id).set(doc)  // set 方法实现 upsert
    )
    await Promise.all(promises)
  }
}

/**
 * HTTP GET 请求并解析 JSON
 * 含超时、重试逻辑
 */
async function fetchJSON(url, retries = 3, timeout = 10000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        timeout,
        responseType: 'json'
      })
      return response.data
    } catch (err) {
      console.warn(`[fetchJSON] 第 ${attempt} 次请求失败: ${url}`, err.message)
      if (attempt === retries) {
        throw new Error(`请求失败 (${retries} 次重试后): ${url} - ${err.message}`)
      }
      // 指数退避
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }
}

/** 去除 HTML 标签 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

/** 延迟函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

**数据转换规则汇总：**

| 源数据 | 目标字段 | 转换规则 |
|--------|----------|----------|
| CDragon champion-summary.id | champions.riot_id | 直接使用 |
| CDragon champion-summary.name | champions.name | 直接使用 |
| DDragon champion.data[key].name | champions.name_zh | key 匹配 champion.name |
| DDragon champion.data[key].title | champions.title | key 匹配 champion.name |
| CDragon items[].id | items.riot_id | 直接使用 |
| CDragon items[].price.total | items.price | 提取 total 字段 |
| CDragon items[].from | items.from_ids | 数组元素转 Number |
| DDragon item.data[key].name | items.name_zh | key 匹配 item.name |
| CDragon cherry-augments[].id | augments.riot_id | 直接使用 |
| CDragon cherry-augments[].rarity | augments.rarity | 1→silver, 2→gold, 3→prismatic |
| hextech.dtodo.cn[id].name | augments.name_zh | id 匹配 augment.id |

---

### 4.2 statsDataSync — 统计数据同步

**触发方式：** 定时触发，每日 03:00（Cron: `0 0 3 * * * *`）

**数据源优先级（来自 PRD §4.4）：**

```
主数据源: data.v2.iesdev.com (Blitz.gg 结构化 API)
    │
    ├── 请求失败 → 备用源1: aramgg.com 网页抓取
    │                  │
    │                  └── 请求失败 → 备用源2: arammayhem.com 网页抓取
    │
    └── 所有源失败 → 保留云数据库中上次缓存数据
                      （在 patches 集合标记 data_status: "stale"）
```

**主数据源 API 详情（data.v2.iesdev.com）：**

```
# 获取单个英雄的 ARAM Mayhem 统计数据
GET https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id={id}

# 请求头
User-Agent: ARAM-Mayhem-Guide/1.0
Accept: application/json

# 响应结构
{
  "items": [
    {
      "item_id": 3153,           // 装备 ID → champion_items.item_id
      "item_name": "Ruination",
      "win_rate": 0.600,         // 小数形式 → 需乘以 100 转为百分比
      "pick_rate": 0.051,        // 小数形式 → 需乘以 100 转为百分比
      "sample_size": 8656,       // 样本场次 → champion_items.sample_size
      "tier": "S"                // Tier 评级
    }
  ],
  "augments": [
    {
      "augment_id": 1205,        // 海克斯 ID → champion_augments.augment_id
      "augment_name": "ADAPt",
      "win_rate": 0.639,         // 小数 → 百分比
      "pick_rate": 0.016,
      "sample_size": 2340,
      "tier": "S"
    }
  ],
  "augment_trios": [
    {
      "augments": [1205, 1141, 1089],   // 三个海克斯 ID → augment_trios.augment_ids
      "win_rate": 0.682,
      "sample_size": 234,
      "tier": "S"
    }
  ]
}
```

**完整实现代码：**

```javascript
// cloudfunctions/statsDataSync/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')
const cheerio = require('cheerio')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const IESDEV_API = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion'
const ARAMGG_BASE = 'https://aramgg.com'
const ARAMMAYHEM_BASE = 'https://arammayhem.com'

const BATCH_SIZE = 20             // 云数据库批量写入上限
const MIN_SAMPLE_SIZE = 30        // 最小样本量过滤阈值
const REQUEST_TIMEOUT = 15000     // 单次请求超时（ms）
const REQUEST_DELAY = 200         // 请求间隔（ms），避免触发限流
const MAX_CONCURRENT = 5          // 最大并发请求数

// ========== 主函数 ==========
exports.main = async (event) => {
  console.log('[statsDataSync] 开始统计数据同步')
  const startTime = Date.now()

  try {
    // 1. 获取当前版本
    const patchRes = await db.collection('patches')
      .where({ is_current: true })
      .limit(1)
      .get()

    if (patchRes.data.length === 0) {
      return { code: 1002, message: '未找到当前版本，请先执行 staticDataSync', data: null }
    }
    const patchVersion = patchRes.data[0].version

    // 2. 获取所有英雄 ID
    const championsRes = await db.collection('champions')
      .where({ patch_version: patchVersion })
      .field({ riot_id: true })
      .get()
    const championIds = championsRes.data.map(c => c.riot_id)

    console.log(`[statsDataSync] 版本 ${patchVersion}，共 ${championIds.length} 个英雄待同步`)

    // 3. 尝试主数据源
    let dataSource = 'iesdev'
    let allStats
    try {
      allStats = await fetchFromIesdev(championIds)
      console.log(`[statsDataSync] 主数据源 iesdev 成功，获取 ${allStats.length} 条英雄数据`)
    } catch (primaryErr) {
      console.warn(`[statsDataSync] 主数据源失败: ${primaryErr.message}，切换备用源`)

      // 4. 尝试备用源1: aramgg.com
      try {
        allStats = await fetchFromAramgg(championIds)
        dataSource = 'aramgg'
        console.log(`[statsDataSync] 备用源 aramgg 成功`)
      } catch (fallback1Err) {
        console.warn(`[statsDataSync] 备用源1失败: ${fallback1Err.message}`)

        // 5. 尝试备用源2: arammayhem.com
        try {
          allStats = await fetchFromArammayhem(championIds)
          dataSource = 'arammayhem'
          console.log(`[statsDataSync] 备用源 arammayhem 成功`)
        } catch (fallback2Err) {
          console.error(`[statsDataSync] 所有数据源均失败`)
          // 标记数据为陈旧
          await db.collection('patches')
            .where({ is_current: true })
            .update({ data: { data_status: 'stale', updated_at: new Date() } })
          return { code: 2001, message: '所有数据源请求失败', data: null }
        }
      }
    }

    // 6. 数据清洗
    allStats = cleanStatsData(allStats)
    console.log(`[statsDataSync] 数据清洗完成，有效数据 ${allStats.length} 条`)

    // 7. 写入云数据库
    await writeToDatabase(allStats, patchVersion)

    // 8. 更新英雄全局胜率/选取率
    await updateChampionGlobalStats(allStats, patchVersion)

    // 9. 更新海克斯全局胜率/选取率
    await updateAugmentGlobalStats(allStats, patchVersion)

    // 10. 更新版本状态
    await db.collection('patches')
      .where({ is_current: true })
      .update({
        data: {
          data_status: 'ready',
          stats_updated_at: new Date(),
          updated_at: new Date()
        }
      })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[statsDataSync] 同步完成，数据源: ${dataSource}，耗时 ${elapsed}s`)

    return {
      code: 0,
      message: 'success',
      data: {
        patch_version: patchVersion,
        data_source: dataSource,
        champions_synced: allStats.length,
        elapsed_seconds: Number(elapsed)
      }
    }

  } catch (err) {
    console.error('[statsDataSync] 同步异常:', err)
    return { code: 2000, message: `同步异常: ${err.message}`, data: null }
  }
}

// ========== 主数据源：data.v2.iesdev.com ==========

/**
 * 从 iesdev API 逐个获取英雄统计数据
 * 采用限流策略：每次请求间隔 REQUEST_DELAY ms，最多 MAX_CONCURRENT 并发
 */
async function fetchFromIesdev(championIds) {
  const results = []

  // 分批并发请求
  for (let i = 0; i < championIds.length; i += MAX_CONCURRENT) {
    const batch = championIds.slice(i, i + MAX_CONCURRENT)

    const batchResults = await Promise.allSettled(
      batch.map(async (champId) => {
        await sleep(REQUEST_DELAY * Math.random())  // 随机延迟避免同时请求
        const url = `${IESDEV_API}?champion_id=${champId}`
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'ARAM-Mayhem-Guide/1.0',
            'Accept': 'application/json'
          },
          timeout: REQUEST_TIMEOUT
        })
        return {
          champion_id: champId,
          data: response.data
        }
      })
    )

    // 收集成功结果
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.data) {
        results.push(result.value)
      }
    })

    // 批次间延迟
    if (i + MAX_CONCURRENT < championIds.length) {
      await sleep(REQUEST_DELAY)
    }
  }

  return results
}

// ========== 备用源1：aramgg.com 网页抓取 ==========

/**
 * 从 aramgg.com 抓取英雄统计数据
 * 注意：网页结构可能随版本变化，需定期维护选择器
 */
async function fetchFromAramgg(championIds) {
  const results = []

  for (const champId of championIds) {
    try {
      await sleep(500 + Math.random() * 500)  // 更保守的请求间隔

      const response = await axios.get(`${ARAMGG_BASE}/champion/${champId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html'
        },
        timeout: REQUEST_TIMEOUT
      })

      const $ = cheerio.load(response.data)
      const champData = { champion_id: champId, data: { items: [], augments: [], augment_trios: [] } }

      // 解析装备数据（选择器需根据实际页面结构调整）
      $('.item-row').each((_, el) => {
        const itemData = {
          item_id: parseInt($(el).attr('data-item-id')),
          item_name: $(el).find('.item-name').text().trim(),
          win_rate: parseFloat($(el).find('.win-rate').text()) / 100,
          pick_rate: parseFloat($(el).find('.pick-rate').text()) / 100,
          sample_size: parseInt($(el).find('.sample-size').text().replace(/,/g, '')),
          tier: $(el).find('.tier').text().trim()
        }
        if (itemData.item_id) champData.data.items.push(itemData)
      })

      // 解析海克斯数据
      $('.augment-row').each((_, el) => {
        const augmentData = {
          augment_id: parseInt($(el).attr('data-augment-id')),
          augment_name: $(el).find('.augment-name').text().trim(),
          win_rate: parseFloat($(el).find('.win-rate').text()) / 100,
          pick_rate: parseFloat($(el).find('.pick-rate').text()) / 100,
          sample_size: parseInt($(el).find('.sample-size').text().replace(/,/g, '')),
          tier: $(el).find('.tier').text().trim()
        }
        if (augmentData.augment_id) champData.data.augments.push(augmentData)
      })

      results.push(champData)
    } catch (err) {
      console.warn(`[aramgg] 英雄 ${champId} 抓取失败:`, err.message)
    }
  }

  if (results.length === 0) {
    throw new Error('aramgg.com 抓取未获取到任何数据')
  }

  return results
}

// ========== 备用源2：arammayhem.com 网页抓取 ==========

/**
 * 从 arammayhem.com 抓取统计数据
 * 该源数据为中国服数据，与主数据源（Blitz.gg）存在差异
 */
async function fetchFromArammayhem(championIds) {
  const results = []

  for (const champId of championIds) {
    try {
      await sleep(800 + Math.random() * 500)

      const response = await axios.get(`${ARAMMAYHEM_BASE}/champion/${champId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html'
        },
        timeout: REQUEST_TIMEOUT
      })

      const $ = cheerio.load(response.data)
      const champData = { champion_id: champId, data: { items: [], augments: [], augment_trios: [] } }

      // 解析逻辑（选择器需根据实际页面调整）
      $('table.augments-table tr').each((_, el) => {
        const augmentData = {
          augment_id: parseInt($(el).attr('data-id')),
          augment_name: $(el).find('td.name').text().trim(),
          win_rate: parseFloat($(el).find('td.winrate').text()) / 100,
          pick_rate: parseFloat($(el).find('td.pickrate').text()) / 100,
          tier: $(el).find('td.tier').text().trim()
        }
        if (augmentData.augment_id) champData.data.augments.push(augmentData)
      })

      results.push(champData)
    } catch (err) {
      console.warn(`[arammayhem] 英雄 ${champId} 抓取失败:`, err.message)
    }
  }

  if (results.length === 0) {
    throw new Error('arammayhem.com 抓取未获取到任何数据')
  }

  return results
}

// ========== 数据清洗 ==========

/**
 * 清洗统计数据
 * 1. 移除样本量过小的记录
 * 2. 修正异常胜率（< 10% 或 > 90%）
 * 3. 统一数据格式
 */
function cleanStatsData(allStats) {
  return allStats.map(champStats => {
    const cleaned = { ...champStats, data: { ...champStats.data } }

    // 清洗 items
    if (cleaned.data.items) {
      cleaned.data.items = cleaned.data.items
        .filter(item => item.sample_size >= MIN_SAMPLE_SIZE)
        .map(item => ({
          ...item,
          win_rate: clamp(Math.round(item.win_rate * 10000) / 100, 10, 90),  // 百分比，保留2位小数
          pick_rate: Math.round(item.pick_rate * 10000) / 100,
          sample_size: Math.max(0, Math.floor(item.sample_size))
        }))
    }

    // 清洗 augments
    if (cleaned.data.augments) {
      cleaned.data.augments = cleaned.data.augments
        .filter(aug => aug.sample_size >= MIN_SAMPLE_SIZE)
        .map(aug => ({
          ...aug,
          win_rate: clamp(Math.round(aug.win_rate * 10000) / 100, 10, 90),
          pick_rate: Math.round(aug.pick_rate * 10000) / 100,
          sample_size: Math.max(0, Math.floor(aug.sample_size))
        }))
    }

    // 清洗 augment_trios
    if (cleaned.data.augment_trios) {
      cleaned.data.augment_trios = cleaned.data.augment_trios
        .filter(trio => trio.sample_size >= MIN_SAMPLE_SIZE)
        .map(trio => ({
          ...trio,
          augment_ids: (trio.augments || trio.augment_ids || []).sort((a, b) => a - b),  // 升序排列
          win_rate: clamp(Math.round(trio.win_rate * 10000) / 100, 10, 90),
          sample_size: Math.max(0, Math.floor(trio.sample_size))
        }))
    }

    return cleaned
  })
}

// ========== 数据库写入 ==========

/**
 * 将统计数据写入云数据库
 */
async function writeToDatabase(allStats, patchVersion) {
  const championAugmentsBatch = []
  const championItemsBatch = []
  const augmentTriosBatch = []

  // 将每个英雄的数据拆解为各集合的文档
  for (const champStats of allStats) {
    const champId = champStats.champion_id

    // champion_augments
    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        championAugmentsBatch.push({
          _id: `${champId}_${aug.augment_id}_${patchVersion}`,
          champion_id: champId,
          augment_id: aug.augment_id,
          win_rate: aug.win_rate,
          pick_rate: aug.pick_rate,
          sample_size: aug.sample_size,
          tier: aug.tier || calculateTier(aug.win_rate),
          patch_version: patchVersion,
          updated_at: new Date()
        })
      }
    }

    // champion_items
    if (champStats.data.items) {
      for (const item of champStats.data.items) {
        championItemsBatch.push({
          _id: `${champId}_${item.item_id}_${patchVersion}`,
          champion_id: champId,
          item_id: item.item_id,
          win_rate: item.win_rate,
          pick_rate: item.pick_rate,
          sample_size: item.sample_size,
          tier: item.tier || calculateTier(item.win_rate),
          is_core: item.tier === 'S' || item.tier === 'A',
          slot: determineSlot(item),
          patch_version: patchVersion,
          updated_at: new Date()
        })
      }
    }

    // augment_trios
    if (champStats.data.augment_trios) {
      for (const trio of champStats.data.augment_trios) {
        const sortedIds = (trio.augment_ids || []).sort((a, b) => a - b)
        if (sortedIds.length === 3) {
          augmentTriosBatch.push({
            _id: `${sortedIds.join('_')}_${champId}_${patchVersion}`,
            augment_ids: sortedIds,
            champion_id: champId,
            win_rate: trio.win_rate,
            sample_size: trio.sample_size,
            tier: trio.tier || calculateTier(trio.win_rate),
            patch_version: patchVersion,
            updated_at: new Date()
          })
        }
      }
    }
  }

  // 批量写入
  console.log(`[statsDataSync] 写入 champion_augments: ${championAugmentsBatch.length} 条`)
  await batchUpsert('champion_augments', championAugmentsBatch)

  console.log(`[statsDataSync] 写入 champion_items: ${championItemsBatch.length} 条`)
  await batchUpsert('champion_items', championItemsBatch)

  console.log(`[statsDataSync] 写入 augment_trios: ${augmentTriosBatch.length} 条`)
  await batchUpsert('augment_trios', augmentTriosBatch)
}

/**
 * 更新 champions 集合的全局胜率和选取率
 * 全局胜率 = 所有海克斯胜率的加权平均（按样本量加权）
 */
async function updateChampionGlobalStats(allStats, patchVersion) {
  for (const champStats of allStats) {
    const champId = champStats.champion_id

    // 计算全局胜率（海克斯胜率按样本量加权）
    let totalWeight = 0
    let weightedWinRate = 0
    let totalPickRate = 0

    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        totalWeight += aug.sample_size
        weightedWinRate += aug.win_rate * aug.sample_size
        totalPickRate += aug.pick_rate
      }
    }

    const globalWinRate = totalWeight > 0
      ? Math.round(weightedWinRate / totalWeight * 100) / 100
      : 0

    await db.collection('champions').doc(String(champId)).update({
      data: {
        win_rate: globalWinRate || 0,
        pick_rate: Math.round(totalPickRate * 100) / 100,
        updated_at: new Date()
      }
    }).catch(err => {
      console.warn(`[statsDataSync] 更新英雄 ${champId} 全局数据失败:`, err.message)
    })
  }
}

/**
 * 更新 augments 集合的全局胜率和选取率
 */
async function updateAugmentGlobalStats(allStats, patchVersion) {
  // 聚合所有英雄的同一海克斯数据
  const augmentAgg = {}

  for (const champStats of allStats) {
    if (champStats.data.augments) {
      for (const aug of champStats.data.augments) {
        if (!augmentAgg[aug.augment_id]) {
          augmentAgg[aug.augment_id] = { totalWeight: 0, weightedWinRate: 0, totalPickRate: 0 }
        }
        augmentAgg[aug.augment_id].totalWeight += aug.sample_size
        augmentAgg[aug.augment_id].weightedWinRate += aug.win_rate * aug.sample_size
        augmentAgg[aug.augment_id].totalPickRate += aug.pick_rate
      }
    }
  }

  // 写入 augments 集合
  for (const [augmentId, agg] of Object.entries(augmentAgg)) {
    const globalWinRate = agg.totalWeight > 0
      ? Math.round(agg.weightedWinRate / agg.totalWeight * 100) / 100
      : 0

    await db.collection('augments').doc(String(augmentId)).update({
      data: {
        win_rate: globalWinRate,
        pick_rate: Math.round(agg.totalPickRate * 100) / 100,
        updated_at: new Date()
      }
    }).catch(err => {
      console.warn(`[statsDataSync] 更新海克斯 ${augmentId} 全局数据失败:`, err.message)
    })
  }
}

// ========== 工具函数 ==========

/** 根据胜率自动计算 Tier */
function calculateTier(winRate) {
  if (winRate >= 60) return 'S'
  if (winRate >= 55) return 'A'
  if (winRate >= 50) return 'B'
  if (winRate >= 45) return 'C'
  return 'D'
}

/** 根据数据判断装备槽位 */
function determineSlot(item) {
  // 简化逻辑：选取率最高的前3件为 core，特定 ID 为 boots
  const bootIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
  if (bootIds.includes(item.item_id)) return 'boots'
  if (item.tier === 'S' || item.tier === 'A') return 'core'
  return 'full_build'
}

/** 数值钳制 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** 批量 upsert */
async function batchUpsert(collectionName, docs, batchSize = 20) {
  const collection = db.collection(collectionName)
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await Promise.all(batch.map(doc => collection.doc(doc._id).set(doc)))
  }
}

/** 延迟函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

## 5. 定时触发器配置

### 5.1 触发器配置总览

| 云函数 | 触发方式 | Cron 表达式 | 超时时间 | 重试策略 |
|--------|----------|-------------|----------|----------|
| `staticDataSync` | 手动触发 | 无 | 300s（5分钟） | 手动重试 |
| `statsDataSync` | 定时触发 | `0 0 3 * * * *` | 600s（10分钟） | 失败后 30 分钟重试 1 次 |

### 5.2 staticDataSync 触发器配置

```json
// cloudfunctions/staticDataSync/config.json
{
  "triggers": []
}
```

> staticDataSync **不使用定时触发器**，仅在游戏版本更新时手动触发。
> 触发方式：
> 1. 微信云开发控制台 → 云函数 → staticDataSync → 测试 → 传入 `{"patch_version": "26.13"}`
> 2. 或通过管理后台页面触发（v2.0 规划）

**触发时机判断：**

```javascript
// 管理员可通过 currentPatch 云函数检查当前版本
// 当 Riot 发布新版本后，手动调用 staticDataSync 并传入新版本号
// 云函数会：
// 1. 拉取新版本静态数据
// 2. 将新版本 patches 记录设为 is_current: true
// 3. 旧版本 is_current 设为 false
```

### 5.3 statsDataSync 触发器配置

```json
// cloudfunctions/statsDataSync/config.json
{
  "triggers": [
    {
      "name": "dailySync",
      "type": "timer",
      "config": "0 0 3 * * * *"
    }
  ]
}
```

**Cron 表达式解析：**

```
格式：秒 分 时 日 月 星期 年

0 0 3 * * * *
│ │ │ │ │ │ │
│ │ │ │ │ │ └── 年（省略表示每年）
│ │ │ │ │ └──── 星期（* = 每天）
│ │ │ │ └────── 月（* = 每月）
│ │ │ └──────── 日（* = 每日）
│ │ └────────── 时（3 = 凌晨3点）
│ └──────────── 分（0）
└────────────── 秒（0）

即：每天凌晨 3:00:00 执行
```

**为什么选择凌晨 3:00：**

- 国服版本更新通常在上午（8:00-12:00），凌晨采集确保获取前一天完整数据
- 凌晨为用户低谷期，减少数据采集对正常服务的影响
- 避免与其他定时任务冲突

### 5.4 超时与重试配置

```javascript
// 云函数超时设置（在云开发控制台配置）
// staticDataSync: 300 秒（需等待多个外部 API 响应）
// statsDataSync: 600 秒（需逐个英雄请求，总耗时较长）

// 重试策略实现（在 statsDataSync 内部实现）
const RETRY_CONFIG = {
  maxRetries: 1,              // 最多重试 1 次
  retryDelay: 30 * 60 * 1000, // 重试间隔 30 分钟
  retryOnStatusCodes: [2001]  // 仅对数据源失败重试
}
```

---

## 6. 错误处理策略

### 6.1 统一错误响应格式

所有云函数返回统一格式：

```javascript
{
  code: Number,       // 错误码，0 表示成功
  message: String,    // 人类可读的错误描述
  data: Any           // 业务数据（出错时为 null）
}
```

### 6.2 错误码定义

| 错误码 | 含义 | 触发场景 | 前端处理建议 |
|--------|------|----------|-------------|
| `0` | 成功 | 正常响应 | 渲染数据 |
| `1001` | 参数错误 | 缺少必填参数、参数格式不正确、值超出范围 | Toast 提示用户，检查输入 |
| `1002` | 数据不存在 | 查询的英雄/海克斯/装备不存在 | 显示 "数据不存在" 页面 |
| `1003` | 版本数据未初始化 | patches 集合为空，未执行过 staticDataSync | 提示 "数据初始化中，请稍后再试" |
| `2000` | 服务器内部错误 | 云函数运行时异常（未捕获的错误） | Toast "服务异常，请稍后重试" |
| `2001` | 外部 API 请求失败 | 统计数据源全部不可用 | Toast "数据更新中，当前展示缓存数据" |
| `2002` | 外部 API 超时 | 单次请求超过 REQUEST_TIMEOUT | Toast "网络超时，请稍后重试" |
| `2003` | 数据解析失败 | 外部 API 返回的数据格式异常 | Toast "数据格式异常，请联系管理员" |
| `3001` | 频率限制 | 同一用户短时间内调用过于频繁 | Toast "操作过于频繁，请稍后重试" |

### 6.3 前端统一错误处理封装

```javascript
// miniprogram/utils/cloud.js
// 统一云函数调用与错误处理

const ERROR_MESSAGES = {
  1001: '输入参数有误，请检查后重试',
  1002: '未找到相关数据',
  1003: '系统数据初始化中，请稍后再试',
  2000: '服务暂时不可用，请稍后重试',
  2001: '数据更新中，当前展示旧数据',
  2002: '网络超时，请检查网络后重试',
  2003: '数据异常，请联系反馈',
  3001: '操作过于频繁，请稍后再试'
}

const callFunction = (name, data = {}) => {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      const result = res.result

      if (result.code !== 0) {
        const message = ERROR_MESSAGES[result.code] || result.message || '请求失败'

        // 记录错误日志
        console.error(`[云函数 ${name}] 错误码 ${result.code}: ${result.message}`)

        // 非致命错误（2001/1003）使用警告提示，不抛异常
        if (result.code === 2001 || result.code === 1003) {
          wx.showToast({ title: message, icon: 'none', duration: 3000 })
          return result.data  // 返回缓存数据或 null
        }

        // 致命错误抛出异常
        throw new Error(message)
      }

      return result.data
    })
    .catch(err => {
      // 云函数调用级别失败（网络错误等）
      console.error(`[云函数 ${name}] 调用失败:`, err)
      wx.showToast({
        title: '网络连接失败，请检查网络',
        icon: 'none',
        duration: 2000
      })
      throw err
    })
}

module.exports = {
  callFunction,
  getChampionList: (params) => callFunction('championList', params),
  getChampionDetail: (params) => callFunction('championDetail', params),
  getAugmentList: (params) => callFunction('augmentList', params),
  getAugmentDetail: (params) => callFunction('augmentDetail', params),
  getItemList: (params) => callFunction('itemList', params),
  getTrioRank: (params) => callFunction('trioRank', params),
  search: (params) => callFunction('search', params),
  getCurrentPatch: () => callFunction('currentPatch', {}),
}
```

### 6.4 数据同步重试与熔断

```javascript
// cloudfunctions/shared/http-client.js
// 带重试和熔断机制的 HTTP 客户端

const axios = require('axios')

class HttpClientWithRetry {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3
    this.retryDelay = options.retryDelay || 2000
    this.timeout = options.timeout || 15000
    this.circuitBreakerThreshold = options.circuitBreakerThreshold || 5  // 连续失败 5 次触发熔断
    this.circuitBreakerResetTime = options.circuitBreakerResetTime || 60000  // 熔断恢复时间 60s

    this.failureCount = 0
    this.isCircuitOpen = false
    this.lastFailureTime = null
  }

  async get(url, config = {}) {
    // 熔断检查
    if (this.isCircuitOpen) {
      if (Date.now() - this.lastFailureTime < this.circuitBreakerResetTime) {
        throw new Error(`熔断中，拒绝请求: ${url}`)
      }
      // 超过恢复时间，尝试半开
      this.isCircuitOpen = false
      console.log(`[HttpClient] 熔断恢复，尝试重新请求: ${url}`)
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: this.timeout,
          ...config
        })

        // 请求成功，重置熔断计数
        this.failureCount = 0
        return response.data

      } catch (err) {
        this.failureCount++
        console.warn(`[HttpClient] 第 ${attempt}/${this.maxRetries} 次请求失败: ${url}`, err.message)

        // 达到熔断阈值
        if (this.failureCount >= this.circuitBreakerThreshold) {
          this.isCircuitOpen = true
          this.lastFailureTime = Date.now()
          console.error(`[HttpClient] 触发熔断，连续 ${this.failureCount} 次失败`)
          throw new Error(`熔断触发: ${url}`)
        }

        if (attempt === this.maxRetries) {
          throw err
        }

        // 指数退避
        await this.sleep(this.retryDelay * Math.pow(2, attempt - 1))
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { HttpClientWithRetry }
```

---

## 7. 性能优化

### 7.1 数据库查询优化

#### 索引使用原则

```javascript
// ✅ 正确：利用复合索引
// 索引：{ champion_id: 1, patch_version: 1, win_rate: -1 }
db.collection('champion_augments')
  .where({ champion_id: 777, patch_version: '26.12' })
  .orderBy('win_rate', 'desc')
  .limit(50)
  .get()

// ❌ 错误：未命中索引，全表扫描
// 如果只有 { champion_id: 1 } 索引，缺少 patch_version 过滤
db.collection('champion_augments')
  .where({ champion_id: 777 })
  .get()  // 返回所有版本的数据，再在内存中过滤
```

#### 字段投影（Projection）

```javascript
// ✅ 正确：只返回需要的字段
db.collection('champions')
  .where({ patch_version: '26.12' })
  .field({
    _id: true,
    name_zh: true,
    win_rate: true,
    pick_rate: true,
    icon_url: true
  })
  .get()

// ❌ 不推荐：返回全部字段（包括大文本字段 description_zh）
db.collection('champions')
  .where({ patch_version: '26.12' })
  .get()
```

#### 分页优化

```javascript
// 传统 skip/limit 分页（数据量小时可接受）
const skip = (page - 1) * page_size
db.collection('champion_augments')
  .where({ champion_id: 777, patch_version: '26.12' })
  .orderBy('win_rate', 'desc')
  .skip(skip)
  .limit(page_size)
  .get()

// 注意：云数据库 skip 上限为 5000
// 对于 augment_trios 等大集合，如 page > 250（page_size=20）
// 需改用游标分页：
db.collection('augment_trios')
  .where({
    champion_id: null,
    patch_version: '26.12',
    win_rate: _.lt(lastWinRate)  // 基于上一页最后一条的 win_rate
  })
  .orderBy('win_rate', 'desc')
  .limit(page_size)
  .get()
```

### 7.2 云函数内存缓存

```javascript
// 在单次云函数执行内缓存热点数据
// 避免同一函数内重复查询相同数据

// championDetail 云函数中的内存缓存示例
const memoryCache = new Map()

async function getAugmentInfo(augmentIds) {
  const cacheKey = 'augments_' + augmentIds.sort().join('_')

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)
  }

  const res = await db.collection('augments')
    .where({ riot_id: _.in(augmentIds) })
    .field({ riot_id: true, name_zh: true, rarity: true, icon_url: true })
    .get()

  const map = {}
  res.data.forEach(a => { map[a.riot_id] = a })
  memoryCache.set(cacheKey, map)
  return map
}
```

> 注意：云函数实例会复用语义上下文（warm start），因此内存缓存可在同实例多次调用间复用。
> 但不可依赖此缓存作为持久化方案，云函数实例随时可能被回收。

### 7.3 并行查询优化

```javascript
// ✅ championDetail 中 4 个独立查询并行执行
const [championRes, augmentsRes, itemsRes, linkageRes] = await Promise.all([
  db.collection('champions').doc(String(champion_id)).get(),
  db.collection('champion_augments')
    .where({ champion_id, patch_version: patchVersion })
    .orderBy('win_rate', 'desc').limit(50).get(),
  db.collection('champion_items')
    .where({ champion_id, patch_version: patchVersion })
    .orderBy('win_rate', 'desc').limit(30).get(),
  db.collection('augment_items')
    .where({ champion_id, patch_version: patchVersion })
    .orderBy('win_rate', 'desc').limit(50).get()
])

// ❌ 串行执行（总耗时 = 4 次查询之和）
const championRes = await db.collection('champions').doc(...)
const augmentsRes = await db.collection('champion_augments').where(...)
const itemsRes = await db.collection('champion_items').where(...)
const linkageRes = await db.collection('augment_items').where(...)
```

### 7.4 数据同步批处理

```javascript
// statsDataSync 中的批处理策略

// 1. 并发请求控制：最多 MAX_CONCURRENT 个并发
for (let i = 0; i < championIds.length; i += MAX_CONCURRENT) {
  const batch = championIds.slice(i, i + MAX_CONCURRENT)
  await Promise.allSettled(batch.map(id => fetchStats(id)))
  await sleep(REQUEST_DELAY)  // 批次间延迟
}

// 2. 批量写入控制：每批最多 20 条
async function batchUpsert(collectionName, docs, batchSize = 20) {
  const collection = db.collection(collectionName)
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await Promise.all(batch.map(doc => collection.doc(doc._id).set(doc)))
  }
}

// 3. 预分配内存：先收集所有数据，再批量写入
// 避免逐条写入时的频繁 I/O 开销
```

### 7.5 前端缓存策略

```javascript
// miniprogram/utils/cache.js

const CACHE_CONFIG = {
  championList: { ttl: 3600 * 1000 },    // 1 小时
  championDetail: { ttl: 1800 * 1000 },   // 30 分钟
  augmentList: { ttl: 3600 * 1000 },      // 1 小时
  augmentDetail: { ttl: 1800 * 1000 },    // 30 分钟
  currentPatch: { ttl: 600 * 1000 },      // 10 分钟
  search: { ttl: 300 * 1000 }             // 5 分钟
}

function setCache(key, data) {
  try {
    wx.setStorageSync(key, {
      data,
      timestamp: Date.now()
    })
  } catch (e) {
    console.warn('[Cache] 写入缓存失败:', e)
  }
}

function getCache(key) {
  try {
    const cached = wx.getStorageSync(key)
    if (!cached || !cached.timestamp) return null

    const config = CACHE_CONFIG[key.split('_')[0]]
    if (!config) return cached.data

    const isExpired = Date.now() - cached.timestamp > config.ttl
    return isExpired ? null : cached.data
  } catch (e) {
    return null
  }
}

module.exports = { setCache, getCache }
```

---

## 8. 数据版本管理

### 8.1 版本号体系

```
版本号格式：{major}.{minor}
示例：26.12 → 2026年第12个版本

国服版本更新节奏：约每 2 周一个版本
每年预计 ~24 个版本
```

### 8.2 版本切换流程

```
staticDataSync 执行流程（版本切换）：

1. 接收新版本号 patch_version = "26.13"

2. 拉取新版本静态数据，写入 champions/augments/items 集合
   - 使用 doc(id).set() 实现 upsert
   - 已存在的文档会被新版本数据覆盖
   - patch_version 字段更新为 "26.13"

3. 统计数据（champion_augments 等）暂不删除旧版本数据
   - 新数据写入时带新 patch_version
   - 旧版本数据通过 patch_version 字段隔离

4. 更新 patches 集合
   - 插入 { _id: "26.13", is_current: true, ... }
   - 将 "26.12" 的 is_current 设为 false

5. statsDataSync 下次执行时
   - 读取 is_current: true 的版本 → "26.13"
   - 所有统计数据写入新版本
```

### 8.3 数据隔离策略

```
云数据库中的文档通过 patch_version 字段实现版本隔离：

champion_augments 集合：
┌──────────────────────────────────────────────────┐
│  _id: "777_1205_26.12"                           │
│  champion_id: 777                                │
│  patch_version: "26.12"    ← 版本标识             │
├──────────────────────────────────────────────────┤
│  _id: "777_1205_26.13"                           │
│  champion_id: 777                                │
│  patch_version: "26.13"    ← 新版本数据           │
└──────────────────────────────────────────────────┘

查询时始终带上 patch_version 条件：
db.collection('champion_augments')
  .where({ champion_id: 777, patch_version: '26.13' })
  .get()
```

### 8.4 历史数据保留策略

| 数据类型 | 保留策略 | 清理方式 |
|----------|----------|----------|
| champions / augments / items | 仅保留当前版本 | staticDataSync 时覆盖更新，无历史残留 |
| champion_augments | 保留最近 2 个版本 | 手动清理或通过清理脚本删除 2 个版本前的数据 |
| champion_items | 保留最近 2 个版本 | 同上 |
| augment_items | 保留最近 2 个版本 | 同上 |
| augment_trios | 保留最近 2 个版本 | 同上 |
| patches | 永久保留 | 记录所有历史版本的时间线 |

**数据清理脚本（建议每月手动执行一次）：**

```javascript
// 清理 2 个版本前的旧数据
// 在云开发控制台的 "数据库" → "聚合" 中执行，或通过临时云函数调用

async function cleanupOldPatchData() {
  // 获取最近 2 个版本号
  const patchesRes = await db.collection('patches')
    .orderBy('released_at', 'desc')
    .limit(2)
    .field({ version: true })
    .get()

  const keepVersions = patchesRes.data.map(p => p.version)
  console.log('[Cleanup] 保留版本:', keepVersions)

  if (keepVersions.length < 2) return

  // 删除旧版本数据（逐集合清理）
  const collections = ['champion_augments', 'champion_items', 'augment_items', 'augment_trios']

  for (const collName of collections) {
    // 云数据库不支持 .where({ patch_version: _.nin(keepVersions) }).remove()
    // 需分批查询后逐条删除
    const oldDocs = await db.collection(collName)
      .where({
        patch_version: _.nin(keepVersions)
      })
      .field({ _id: true })
      .get()

    console.log(`[Cleanup] ${collName}: 待删除 ${oldDocs.data.length} 条`)

    for (const doc of oldDocs.data) {
      await db.collection(collName).doc(doc._id).remove()
    }
  }
}
```

### 8.5 版本状态机

```
版本数据的生命周期状态：

  [创建] ──→ syncing ──→ ready ──→ stale ──→ [被新版本替代]
                │                        │
                └── error ←──────────────┘
                       │
                       └── 手动重新触发 → syncing

状态说明：
- syncing:   staticDataSync 正在执行
- ready:     数据完整可用
- stale:     statsDataSync 执行失败，数据可能过时
- error:     staticDataSync 执行失败

前端展示逻辑：
- ready: 正常展示数据 + "数据更新于 XX:XX"
- stale: 展示数据 + ⚠️ "数据更新延迟，可能不够准确"
- error: 展示旧数据 + ⚠️ "数据同步异常，请联系管理员"
```

---

## 附录 A：云函数调用频率估算

| 云函数 | 单次耗时(预估) | DAU 5000 时日调用量 | 备注 |
|--------|---------------|-------------------|------|
| championList | ~50ms | ~15,000 | 首页+列表页，每用户 ~3 次 |
| championDetail | ~150ms | ~10,000 | 详情页，每用户 ~2 次 |
| augmentList | ~50ms | ~10,000 | 海克斯列表，每用户 ~2 次 |
| augmentDetail | ~150ms | ~7,500 | 海克斯详情，每用户 ~1.5 次 |
| itemList | ~50ms | ~5,000 | 装备列表，每用户 ~1 次 |
| trioRank | ~100ms | ~5,000 | 组合排行，每用户 ~1 次 |
| search | ~30ms | ~10,000 | 搜索，每用户 ~2 次 |
| currentPatch | ~20ms | ~5,000 | 版本信息，每用户 ~1 次 |
| **合计** | - | **~67,500** | 云开发基础版日调用上限 200 万次，余量充足 |

## 附录 B：云数据库存储估算

| 集合 | 单文档大小(预估) | 文档数(2版本) | 存储量 |
|------|-----------------|-------------|--------|
| champions | ~300B | 170 | ~50KB |
| augments | ~400B | 170 | ~66KB |
| items | ~500B | 250 | ~122KB |
| champion_augments | ~200B | 34,000 | ~6.5MB |
| champion_items | ~200B | 17,000 | ~3.3MB |
| augment_items | ~200B | 50,000 | ~9.5MB |
| augment_trios | ~200B | 100,000 | ~19MB |
| patches | ~200B | 24/年 | ~5KB |
| **合计** | - | ~201,610 | **~38.5MB** |

> 云数据库基础版 2GB 存储空间，实际使用 ~38.5MB，利用率 < 2%。
> 即使数据增长 10 倍，仍然在基础版容量范围内。

## 附录 C：外部 API 端点速查表

| 数据源 | 端点 URL | 用途 | 请求频率 |
|--------|---------|------|----------|
| Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json` | 英雄基础数据 | 每版本 1 次 |
| Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json` | 装备基础数据 | 每版本 1 次 |
| Community Dragon | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json` | 海克斯基础数据 | 每版本 1 次 |
| Data Dragon | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/champion.json` | 英雄中文本地化 | 每版本 1 次 |
| Data Dragon | `https://ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/item.json` | 装备中文本地化 | 每版本 1 次 |
| hextech.dtodo.cn | `https://hextech.dtodo.cn/data/aram-mayhem-augments.zh_cn.json` | 海克斯中文翻译 | 每版本 1 次 |
| iesdev API | `https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id={id}` | 英雄统计数据（主源） | 每日 ~170 次 |
| aramgg.com | `https://aramgg.com/champion/{id}` | 英雄统计数据（备源1） | 每日 ~170 次 |
| arammayhem.com | `https://arammayhem.com/champion/{id}` | 英雄统计数据（备源2） | 每日 ~170 次 |
