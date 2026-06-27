# 产品需求文档（PRD）

# 英雄联盟海克斯大乱斗图鉴查询小程序

| 属性 | 内容 |
|------|------|
| 产品名称 | 海克斯大乱斗图鉴（暂定） |
| 版本 | v1.0 |
| 平台 | 微信小程序 |
| 文档日期 | 2026-06-25 |
| 文档状态 | 初稿 |

---

## 1. 产品概述

### 1.1 背景

英雄联盟海克斯大乱斗（ARAM Mayhem）模式于2025年底上线，引入了海克斯强化（Hextech Augments）系统。玩家在游戏中达到特定等级（7/11/15级）后可选择强化，强化选择直接影响出装路径和打法策略。目前市场上缺乏一个**专门针对国服环境**、**数据准确**、**体验流畅**的海克斯大乱斗图鉴工具。

### 1.2 产品定位

一款面向英雄联盟玩家的微信小程序工具，提供海克斯大乱斗模式下的**英雄适配海克斯查询**、**装备推荐**和**强化组合分析**服务，帮助玩家在对局中快速做出最优决策。

### 1.3 目标用户

| 用户画像 | 描述 | 核心需求 |
|----------|------|----------|
| 休闲玩家 | 偶尔玩大乱斗，不了解强化机制 | 快速知道该选什么强化、出什么装备 |
| 中度玩家 | 经常玩大乱斗，想提升胜率 | 了解英雄×强化的最佳搭配 |
| 硬核玩家 | 追求极致数据，研究流派build | 三海克斯组合分析、动态出装推荐 |

### 1.4 产品目标

| 目标 | 衡量指标 | 目标值 |
|------|----------|--------|
| 验证市场需求 | 上线30天用户数 | ≥ 5,000 DAU |
| 用户留存 | 7日留存率 | ≥ 30% |
| 数据价值感知 | 用户评分 | ≥ 4.5/5 |
| 使用频率 | 日均打开次数/人 | ≥ 2次 |

---

## 2. 竞品分析

### 2.1 现有竞品

| 竞品 | 形态 | 优势 | 劣势 |
|------|------|------|------|
| **ARAM.GG** | 网站 | 数据最全面，每日更新，3800万+场样本 | 英文为主，无小程序形态，国服数据覆盖有限 |
| **ARAM Mayhem 一图流小程序** | 微信小程序 | 已有市场验证，172位英雄一图流 | 仅静态展示，无动态查询，不随版本频繁更新 |
| **ARAM-tool** | GitHub开源 | 基于Gemini AI智能分析 | 技术产品，普通用户无法使用 |
| **OP.GG海斗模式** | 网站 | 品牌知名度高 | 装备推荐准确性差（直接套用排位数据），不适合国服 |
| **掌上英雄联盟** | APP | 国服官方数据，装备推荐准确 | 数据获取不透明，无独立API |

### 2.2 差异化机会

```
┌─────────────────────────────────────────────────────────┐
│                 我们的差异化定位                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. 国服专属数据        — 使用国服服务器数据，非海外服套用  │
│  2. 海克斯×出装联动推荐  — 根据已选海克斯动态推荐装备        │
│  3. 三海克斯组合分析     — 展示三强化组合的胜率排名          │
│  4. 小程序即开即用       — 对局中手机快速查询，无需切屏       │
│  5. 版本实时更新         — 跟随国服版本更新，数据延迟<24h    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 功能需求

### 3.1 功能架构图

```
海克斯大乱斗图鉴
├── 🏠 首页
│   ├── 搜索栏（英雄名/海克斯名）
│   ├── 版本信息展示（当前版本号 + 更新时间）
│   ├── 热门推荐（本周胜率最高强化 TOP5）
│   └── 快速入口（英雄查询 / 海克斯查询 / 组合推荐）
│
├── 🦸 英雄图鉴
│   ├── 英雄列表（按胜率/热度排序）
│   ├── 英雄详情页
│   │   ├── 基础信息（头像、称号、定位）
│   │   ├── 推荐海克斯（按 Silver/Gold/Prismatic 分级）
│   │   │   └── 每项显示：胜率、选取率、Tier评级
│   │   ├── 推荐装备（核心装 / 鞋子 / 神装方案）
│   │   └── 海克斯×出装联动（选择某海克斯后的推荐装备变化）
│   └── 英雄对比（选择2个英雄对比同一海克斯表现）
│
├── ⚡ 海克斯百科
│   ├── 海克斯列表（按胜率/选取率排序，分稀有度Tab）
│   ├── 海克斯详情页
│   │   ├── 基础信息（名称、图标、稀有度、效果描述）
│   │   ├── 全局胜率 & 选取率
│   │   ├── 最适配英雄 TOP10（该强化在这些英雄上胜率最高）
│   │   ├── 最不适配英雄 BOTTOM5
│   │   └── 推荐装备（选择该强化后的最优出装路径）
│   └── 版本变更历史（该强化在历史版本中的胜率变化趋势）
│
├── 🎯 组合推荐
│   ├── 三海克斯组合 TOP50（按胜率排序）
│   ├── 按英雄筛选组合（选择英雄 → 查看该英雄最佳三强化组合）
│   └── 按流派筛选（坦克流/暴击流/AP流/特效流...）
│
├── 🔍 智能查询
│   ├── 输入英雄名 → 返回海克斯+装备推荐卡片
│   ├── 输入海克斯名 → 返回适配英雄+装备推荐卡片
│   └── 语音/图片识别（v2.0 规划）
│
└── ⚙️ 设置
    ├── 数据源说明
    ├── 反馈入口
    └── 关于/版本信息
```

### 3.2 核心功能详细描述

#### 3.2.1 英雄详情页（P0 - 核心功能）

**用户故事：** 作为玩家，我在进入大乱斗选英雄后，想快速查看该英雄最适合哪些海克斯强化，以及推荐出装。

**页面结构：**

```
┌──────────────────────────────────────┐
│  [英雄头像] 亚索                      │
│  定位：战士/刺客    胜率：52.3%       │
├──────────────────────────────────────┤
│                                      │
│  ⚡ 推荐海克斯                        │
│  ┌─────────────────────────────────┐ │
│  │ 💎 棱彩级 (Prismatic)           │ │
│  │ 1. 无限循环  胜率63.9% 选率1.6% S│ │
│  │ 2. 坦克引擎  胜率61.2% 选率1.1% S│ │
│  │ 3. 会心治疗  胜率58.7% 选率0.8% A│ │
│  ├─────────────────────────────────┤ │
│  │ 🥇 黄金级 (Gold)               │ │
│  │ 1. 毁坏仪式  胜率60.0% 选率5.1% S│ │
│  │ 2. 重量打击  胜率56.4% 选率3.2% A│ │
│  │ ...                             │ │
│  ├─────────────────────────────────┤ │
│  │ 🥈 白银级 (Silver)             │ │
│  │ 1. ...                          │ │
│  └─────────────────────────────────┘ │
│                                      │
│  🛡️ 推荐装备                         │
│  ┌─────────────────────────────────┐ │
│  │ 核心装：毁坏仪式 → 无尽之刃      │ │
│  │ 鞋子：  狂战士胫甲               │ │
│  │ 神装：  毁坏仪式 + 无尽 + 盾弓   │ │
│  └─────────────────────────────────┘ │
│                                      │
│  🔗 海克斯×出装联动                   │
│  ┌─────────────────────────────────┐ │
│  │ [选择海克斯 ▼]                  │ │
│  │ → 选择「毁坏仪式」后：          │ │
│  │   核心：毁坏仪式                 │ │
│  │   搭配：暴击书 + 无尽之刃       │ │
│  │   胜率：60.0%（5,286场）        │ │
│  │ → 选择「会心治疗」后：          │ │
│  │   核心：暴击书 + 吸血枪         │ │
│  │   胜率：58.7%（2,104场）        │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**交互说明：**
- 英雄列表支持按胜率、选取率、热度排序
- 海克斯按稀有度分Tab展示，默认展示棱彩级
- 点击海克斯名称跳转到海克斯详情页
- 点击装备名称展示装备详情浮层（属性、合成路径）
- 海克斯×出装联动区域支持下拉选择不同海克斯查看对应出装

#### 3.2.2 海克斯详情页（P0）

**用户故事：** 作为玩家，我在对局中遇到海克斯选择时，想快速查看这个强化适合哪些英雄、该怎么出装。

**页面内容：**
- 强化名称、图标、稀有度标识
- 效果描述文本
- 全局胜率 / 选取率 / 排名
- 最适配英雄 TOP10（英雄头像 + 胜率 + 选取率）
- 最不适配英雄 BOTTOM5（避免踩坑）
- 选择该强化后的推荐装备路径
- 版本胜率趋势图（折线图）

#### 3.2.3 组合推荐页（P1）

**用户故事：** 作为硬核玩家，我想了解当前版本最强的三海克斯组合是什么。

**页面内容：**
- 三海克斯组合排行榜（按胜率排序）
- 每个组合展示：三个强化图标 + 组合胜率 + 样本数
- 支持按英雄筛选（某英雄最佳组合）
- 支持按流派标签筛选（坦克流/暴击流/AP流）

#### 3.2.4 搜索功能（P0）

**用户故事：** 作为玩家，我想在5秒内找到我需要的信息。

**功能要求：**
- 支持英雄名称模糊搜索（中英文、别名）
- 支持海克斯名称模糊搜索
- 搜索结果实时联想（输入时下拉提示）
- 搜索结果以卡片形式展示（英雄卡片/海克斯卡片）
- 搜索历史缓存（最近10条）

---

## 4. 数据来源方案

### 4.1 数据分层架构

```
┌─────────────────────────────────────────────┐
│              前端展示层                       │
│         (微信原生小程序)                      │
│    本地缓存 (wx.setStorageSync)              │
└──────────────────┬──────────────────────────┘
                   │ wx.cloud.callFunction()
┌──────────────────┴──────────────────────────┐
│              微信云开发层                     │
│                                             │
│  ┌────────────┐  ┌───────────────────────┐  │
│  │  云函数     │  │  云数据库              │  │
│  │  (业务逻辑  │  │  (英雄/装备/海克斯     │  │
│  │   + 数据    │  │   文档型存储)          │  │
│  │   聚合)     │  │                       │  │
│  └────────────┘  └───────────────────────┘  │
│                                             │
│  ┌────────────┐  ┌───────────────────────┐  │
│  │  云存储     │  │  定时触发器            │  │
│  │  (图片/图标 │  │  (每日数据采集)        │  │
│  │   静态资源) │  │                       │  │
│  └────────────┘  └───────────────────────┘  │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (云函数内调用)
┌──────────────────┴──────────────────────────┐
│              外部数据源                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Community │ │Data      │ │data.v2.      │ │
│  │Dragon    │ │Dragon    │ │iesdev.com    │ │
│  │(静态数据) │ │(中文数据) │ │(统计数据)    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└─────────────────────────────────────────────┘
```

### 4.2 各层数据源详情

#### 第一层：静态数据（英雄/装备/强化基础信息）

| 数据源 | 端点 | 数据内容 | 更新频率 | 可靠性 |
|--------|------|----------|----------|--------|
| **Community Dragon** | `raw.communitydragon.org/latest/.../champion-summary.json` | 英雄ID、名称、图标 | 每版本 | ⭐⭐⭐⭐⭐ |
| **Community Dragon** | `raw.communitydragon.org/latest/.../items.json` | 装备ID、名称、描述、合成路径、价格 | 每版本 | ⭐⭐⭐⭐⭐ |
| **Community Dragon** | `raw.communitydragon.org/latest/.../cherry-augments.json` | 强化ID、名称、描述、图标、稀有度 | 每版本 | ⭐⭐⭐⭐⭐ |
| **Data Dragon** | `ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/champion.json` | 英雄中文名称、背景故事 | 每版本 | ⭐⭐⭐⭐⭐ |
| **Data Dragon** | `ddragon.leagueoflegends.com/cdn/{ver}/data/zh_CN/item.json` | 装备中文名称、描述 | 每版本 | ⭐⭐⭐⭐⭐ |
| **hextech.dtodo.cn** | `/data/aram-mayhem-augments.zh_cn.json` | 海克斯强化中文翻译 | 每版本 | ⭐⭐⭐ |

#### 第二层：统计数据（胜率/选取率/推荐）

| 数据源 | 获取方式 | 数据内容 | 更新频率 | 可靠性 | 风险 |
|--------|----------|----------|----------|--------|------|
| **data.v2.iesdev.com** ⭐首选 | HTTP API 调用 | 英雄维度：物品胜率/选取率/tier、强化胜率/选取率/tier、三强化组合 | 实时 | ⭐⭐⭐⭐ | ⚠️ 非官方API，无SLA |
| **aramgg.com** ⭐备选 | 网页抓取 | 英雄×强化胜率、装备推荐、英雄胜率排行、协同组合 | 每日 | ⭐⭐⭐⭐ | ⚠️ 网页结构变动风险 |
| **arammayhem.com** | 网页抓取 | 强化胜率/选取率、英雄×强化组合 | 每日 | ⭐⭐⭐ | ⚠️ 数据源为中国服 |
| **utils.iesdev.com** | HTTP API 调用 | 海克斯组合中文静态数据 | 每版本 | ⭐⭐⭐ | ⚠️ 非官方 |

**首选 API 调用示例：**

```
# 获取英雄 ARAM Mayhem 数据
GET https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=777

# 返回结构（关键字段）
{
  "items": [
    {
      "item_id": 3153,
      "item_name": "Ruination",
      "win_rate": 0.600,
      "pick_rate": 0.051,
      "sample_size": 8656,
      "tier": "S"
    }
  ],
  "augments": [
    {
      "augment_id": 1205,
      "augment_name": "ADAPt",
      "win_rate": 0.639,
      "pick_rate": 0.016,
      "tier": "S"
    }
  ],
  "augment_trios": [
    {
      "augments": [1205, 1141, 1089],
      "win_rate": 0.682,
      "sample_size": 234,
      "tier": "S"
    }
  ]
}
```

#### 第三层：中文辅助数据

| 数据源 | 用途 | 备注 |
|--------|------|------|
| hextech.dtodo.cn | 海克斯强化中文名称映射 | 社区维护 |
| utils.iesdev.com | 海克斯组合中文数据 | Blitz.gg 静态资源 |
| Data Dragon zh_CN | 英雄/装备中文本地化 | Riot 官方 |

### 4.3 数据采集管道设计

```
┌───────────────────────────────────────────────────────────┐
│                 云函数定时触发器                             │
│            (每日凌晨 3:00 自动执行)                          │
└────────────┬──────────────────────────────┬───────────────┘
             │                              │
    ┌────────┴────────┐           ┌─────────┴─────────┐
    │  静态数据更新     │           │   统计数据更新      │
    │  (每版本触发)     │           │   (每日定时触发)    │
    └────────┬────────┘           └─────────┬─────────┘
             │                              │
    ┌────────┴────────┐           ┌─────────┴─────────┐
    │ 云函数:          │           │ 云函数:            │
    │ staticDataSync  │           │ statsDataSync     │
    │                 │           │                   │
    │ 1. Community    │           │ 1. 调用            │
    │    Dragon 拉取  │           │    data.v2.       │
    │ 2. Data Dragon  │           │    iesdev.com API │
    │    zh_CN 拉取   │           │ 2. 抓取 aramgg   │
    │ 3. hextech.     │           │ 3. 数据清洗/聚合   │
    │    dtoto.cn 拉取│           │                   │
    └────────┬────────┘           └─────────┬─────────┘
             │                              │
             └──────────┬───────────────────┘
                        │
               ┌────────┴────────┐
               │   云数据库存储    │
               │  (文档型集合)    │
               └────────┬────────┘
                        │
               ┌────────┴────────┐
               │   前端本地缓存   │
               │  (wx.setStorage)│
               └────────┬────────┘
                        │
               ┌────────┴────────┐
               │   小程序页面渲染  │
               └─────────────────┘
```

**云函数示例结构：**

```
cloudfunctions/
├── staticDataSync/     # 静态数据同步（每版本触发）
│   └── index.js
├── statsDataSync/      # 统计数据同步（每日触发）
│   └── index.js
├── championDetail/     # 英雄详情查询
│   └── index.js
├── augmentDetail/      # 海克斯详情查询
│   └── index.js
├── search/             # 搜索服务
│   └── index.js
└── comboRecommend/     # 组合推荐
    └── index.js
```

### 4.4 数据源容灾方案

```
主数据源: data.v2.iesdev.com (Blitz.gg API)
    │
    ├── 请求失败 ──→ 云函数内切换至备用源
    │                  │
    │           ┌──────┴──────────────────┐
    │           │ 备用源1: aramgg.com 抓取  │
    │           │ 备用源2: arammayhem.com   │
    │           │ 备用源3: 本地LCU采集       │
    │           └───────────────────────────┘
    │
    └── 所有在线源失败 ──→ 使用云数据库中最后缓存数据
                           （标记"数据更新于 XX"）
```

**云开发特有保障机制：**

- 云函数内可直接发起 HTTPS 请求（`axios` / `node-fetch`），无需额外网关
- 云数据库天然持久化，数据更新前自动保留旧版本，无需担心数据库宕机
- 小程序端可通过 `wx.cloud.callFunction` 的 `success/fail` 回调实现前端降级逻辑

---

## 5. 技术选型

### 5.1 整体技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                       客户端                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  微信原生小程序 (WXML + WXSS + JavaScript/TypeScript) │  │
│  │  - 英雄列表页 / 详情页                                 │  │
│  │  - 海克斯百科页 / 详情页                                │  │
│  │  - 组合推荐页                                          │  │
│  │  - 搜索页                                              │  │
│  │  - 本地缓存层 (wx.setStorageSync)                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ wx.cloud.callFunction()
┌─────────────────────────┴───────────────────────────────────┐
│                      微信云开发环境                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  云函数层 (Node.js)                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │ 业务查询函数 │  │ 数据采集函数 │  │ 搜索聚合函数 │ │    │
│  │  │ (英雄/海克斯 │  │ (定时触发    │  │ (模糊匹配    │ │    │
│  │  │  /组合查询)  │  │  数据同步)   │  │  /结果排序)  │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  数据层                                              │    │
│  │  ┌──────────────────┐  ┌─────────────────────────┐  │    │
│  │  │ 云数据库          │  │  云存储                  │  │    │
│  │  │ (文档型，存储英雄  │  │  (英雄头像/装备图标/     │  │    │
│  │  │  /装备/海克斯数据) │  │   海克斯图标等静态资源)  │  │    │
│  │  └──────────────────┘  └─────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │ HTTPS (云函数内发起)
┌─────────────────────────┴───────────────────────────────────┐
│                      外部数据源                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │Community     │  │Data Dragon   │  │data.v2.iesdev.com  │ │
│  │Dragon        │  │(中文本地化)   │  │(统计数据API)        │ │
│  │(静态数据)     │  │              │  │                    │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 技术选型详细对比与决策

#### 5.2.1 小程序框架

| 方案 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| **原生微信小程序** | 性能最优、无框架开销、与云开发无缝集成、官方文档完善 | 无法跨端 | ⭐⭐⭐⭐⭐ |
| Taro 3 (React) | 跨端能力强、React生态丰富 | 编译产物体积大、与云开发集成需额外适配 | ⭐⭐⭐ |
| uni-app (Vue) | Vue语法易上手 | 跨端兼容性偶有问题、框架开销 | ⭐⭐⭐ |

**决策：选用原生微信小程序（WXML + WXSS + JavaScript）**

理由：
- 本产品仅面向微信小程序，无跨端需求，无需引入第三方框架
- 原生框架与微信云开发 API 直接集成（`wx.cloud.*`），无需额外适配层
- 包体积最小，启动速度最快，适合对局中快速查询场景
- 官方持续维护，稳定性有保障，社区资源丰富

#### 5.2.2 后端服务方案

| 方案 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| **微信云开发（云函数）** | 免运维、与小程序无缝集成、按量付费、免域名备案 | 有调用次数/执行时长上限 | ⭐⭐⭐⭐⭐ |
| 腾讯云轻量服务器 + NestJS | 灵活度高、可承载复杂业务 | 需运维、需备案、成本高 | ⭐⭐⭐ |
| 腾讯云 Serverless (SCF) | 免运维、按量付费 | 与小程序集成需额外配置 | ⭐⭐⭐⭐ |

**决策：微信云开发 - 云函数（Node.js）**

理由：
- 小程序 + 云开发是微信官方推荐的「一站式」开发模式，天然集成
- 云函数内可直接调用云数据库、云存储，无需配置网络/鉴权
- 免服务器运维、免域名备案、免 SSL 证书配置
- 支持定时触发器（云函数 Cron），完全满足每日数据采集需求
- Node.js 环境可直接使用 `axios`、`cheerio` 等库进行数据抓取

#### 5.2.3 数据库选型

| 方案 | 适用场景 | 推荐度 |
|------|----------|--------|
| **微信云数据库** | 云开发内置文档数据库，免运维，与云函数直接集成 | ⭐⭐⭐⭐⭐ |
| PostgreSQL（腾讯云） | 结构化关系型数据，需自建/购买云服务 | ⭐⭐⭐ |
| MongoDB（自建） | 文档型，需运维 | ⭐⭐ |

**决策：微信云数据库（文档型，类 MongoDB）**

理由：
- 云开发内置数据库，云函数内直接通过 `cloud.database()` 读写，无需配置连接
- 英雄×海克斯×装备的嵌套结构天然适合文档模型（一个英雄文档内嵌推荐数据）
- 支持索引、聚合查询、正则搜索，满足本项目查询需求
- 免运维、自动备份、按存储/读写入计费，成本极低
- 数据量预估（~170 英雄 × ~100 海克斯 = ~17,000 条核心数据）远未达到云数据库上限（基础版 2GB，可存数十万条）

#### 5.2.4 缓存方案

| 层级 | 方案 | 用途 |
|------|------|------|
| 前端本地缓存 | `wx.setStorageSync` | 热点数据（英雄列表、版本信息）缓存到本地，减少网络请求 |
| 云函数内存缓存 | 云函数运行时内存 | 单次函数执行内的临时数据复用 |
| 云数据库缓存集合 | 预聚合结果存储 | 将复杂的聚合查询结果存入 `cache_*` 集合，避免重复计算 |
| CDN 缓存 | 云存储 + CDN | 英雄头像、装备图标等静态资源，自动 CDN 加速 |

**策略说明：**
- 英雄列表、海克斯列表等数据每日更新一次，小程序启动时拉取并缓存本地
- 详情页数据通过云函数查询云数据库，响应时间 < 200ms
- 无需独立 Redis，云开发架构下的三层缓存已足够覆盖本项目的访问规模

#### 5.2.5 部署方案

| 方案 | 优势 | 推荐度 |
|------|------|--------|
| **微信云开发** | 与小程序深度集成、免运维、免备案、一键部署、按量付费 | ⭐⭐⭐⭐⭐ |
| 腾讯云轻量应用服务器 | 灵活度高、可自建 Docker 环境 | ⭐⭐⭐ |
| 腾讯云 Serverless (SCF) | 免运维、按量付费 | ⭐⭐⭐⭐ |

**决策：微信云开发（全程使用，无需自建服务器）**

理由：
- 云开发是微信官方提供的小程序一站式后端方案，无需购买/管理服务器
- 云函数通过微信开发者工具一键上传部署，无 Docker、无 CI/CD 配置负担
- 免域名备案、免 SSL 证书申请、免 Nginx 配置
- 基础版（¥19.9/月）即可支撑 MVP 阶段，规模化后可平滑升级至专业版
- 与小程序共享微信账号体系，用户鉴权零成本

### 5.3 完整技术栈汇总

```
┌───────────┬─────────────────────────────────────────────┐
│                    技术栈一览                              │
├───────────┼─────────────────────────────────────────────┤
│ 小程序前端 │ 微信原生小程序（WXML + WXSS + JavaScript）    │
│ UI 组件库  │ Vant Weapp                                   │
│ 图表库    │ ECharts 小程序版（echarts-for-weixin）          │
│ 后端服务   │ 微信云开发 - 云函数（Node.js）                  │
│ 数据库    │ 微信云开发 - 云数据库（文档型）                   │
│ 文件存储   │ 微信云开发 - 云存储                             │
│ 定时任务   │ 云函数定时触发器（每日数据采集）                  │
│ 数据采集   │ axios + cheerio（云函数内运行）                 │
│ 前端缓存   │ wx.setStorageSync + 云数据库缓存集合            │
│ 部署      │ 微信开发者工具一键部署（云函数）                  │
│ 监控      │ 微信云开发控制台 + 小程序性能监控                 │
└───────────┴─────────────────────────────────────────────┘
```

---

## 6. 数据模型设计

### 6.1 云数据库集合设计

> 微信云数据库为文档型数据库（类 MongoDB），每个集合（Collection）存储一类文档（Document）。
> 以下为各集合的文档结构设计。

#### 6.1.1 champions 集合（英雄）

```javascript
// 集合名：champions
// 文档示例（一个英雄一条文档）
{
  _id: "777",                        // 云数据库主键，使用 Riot ID 字符串
  riot_id: 777,
  name: "Yasuo",
  name_zh: "亚索",
  title: "疾风剑豪",
  roles: ["战士", "刺客"],
  icon_url: "cloud://xxx/champions/777.png",  // 云存储文件 ID
  win_rate: 52.3,                    // 全局胜率（每次数据同步时更新）
  pick_rate: 8.7,                    // 全局选取率
  patch_version: "26.12",            // 当前适用版本
  updated_at: new Date()
}
```

#### 6.1.2 augments 集合（海克斯强化）

```javascript
// 集合名：augments
{
  _id: "1205",
  riot_id: 1205,
  name: "INFINITE_LOOP",
  name_zh: "无限循环",
  description: "...",
  description_zh: "技能命中后缩短冷却...",
  rarity: "prismatic",              // silver / gold / prismatic
  icon_url: "cloud://xxx/augments/1205.png",
  win_rate: 55.2,
  pick_rate: 3.1,
  patch_version: "26.12",
  updated_at: new Date()
}
```

#### 6.1.3 items 集合（装备）

```javascript
// 集合名：items
{
  _id: "3153",
  riot_id: 3153,
  name: "Ruination",
  name_zh: "毁坏仪式",
  description: "...",
  description_zh: "...",
  price: 3200,
  icon_url: "cloud://xxx/items/3153.png",
  from_ids: [1037, 3044],           // 合成来源装备 ID
  to_ids: [],                       // 可升级为
  categories: ["AttackDamage", "LifeSteal"],
  patch_version: "26.12",
  updated_at: new Date()
}
```

#### 6.1.4 champion_augments 集合（英雄×海克斯适配，核心数据）

```javascript
// 集合名：champion_augments
// 每条文档表示：某英雄 × 某海克斯 的统计数据
{
  _id: "777_1205_26.12",            // 复合主键：英雄ID_强化ID_版本
  champion_id: 777,
  augment_id: 1205,
  win_rate: 63.9,
  pick_rate: 1.6,
  sample_size: 2340,
  tier: "S",                         // S / A / B / C / D
  patch_version: "26.12",
  updated_at: new Date()
}

// 建议索引：
// { champion_id: 1, patch_version: 1 }    // 按英雄查询
// { augment_id: 1, patch_version: 1 }     // 按海克斯查询
// { champion_id: 1, tier: 1 }             // 按 Tier 排序
```

#### 6.1.5 champion_items 集合（英雄×装备推荐）

```javascript
// 集合名：champion_items
{
  _id: "777_3153_26.12",
  champion_id: 777,
  item_id: 3153,
  win_rate: 60.0,
  pick_rate: 5.1,
  sample_size: 8656,
  tier: "S",
  is_core: true,                     // 是否核心装
  slot: "core",                      // core / boots / full_build
  patch_version: "26.12",
  updated_at: new Date()
}

// 建议索引：
// { champion_id: 1, patch_version: 1, slot: 1 }
```

#### 6.1.6 augment_items 集合（海克斯×装备联动，差异化功能）

```javascript
// 集合名：augment_items
{
  _id: "1205_3153_777_26.12",
  augment_id: 1205,
  champion_id: 777,                  // null 表示全局数据
  item_id: 3153,
  win_rate: 61.2,
  pick_rate: 3.4,
  sample_size: 1230,
  tier: "S",
  patch_version: "26.12",
  updated_at: new Date()
}

// 建议索引：
// { augment_id: 1, patch_version: 1 }
// { augment_id: 1, champion_id: 1 }
```

#### 6.1.7 augment_trios 集合（三海克斯组合）

```javascript
// 集合名：augment_trios
{
  _id: "1205_1141_1089_777_26.12",
  augment_ids: [1205, 1141, 1089],  // 三个强化 ID（升序排列，便于去重）
  champion_id: 777,                  // null 表示全局
  win_rate: 68.2,
  sample_size: 234,
  tier: "S",
  patch_version: "26.12",
  updated_at: new Date()
}

// 建议索引：
// { champion_id: 1, patch_version: 1, win_rate: -1 }
```

#### 6.1.8 patches 集合（版本记录）

```javascript
// 集合名：patches
{
  _id: "26.12",
  version: "26.12",
  released_at: new Date("2026-06-20"),
  is_current: true,
  updated_at: new Date()
}
```

### 6.2 索引策略

```javascript
// 云数据库索引通过控制台或云函数初始化脚本创建

// champion_augments 集合
db.champion_augments.createIndex({ champion_id: 1, patch_version: 1 })
db.champion_augments.createIndex({ augment_id: 1, patch_version: 1 })
db.champion_augments.createIndex({ champion_id: 1, tier: 1 })

// champion_items 集合
db.champion_items.createIndex({ champion_id: 1, patch_version: 1, slot: 1 })

// augment_trios 集合
db.augment_trios.createIndex({ champion_id: 1, patch_version: 1, win_rate: -1 })

// augment_items 集合
db.augment_items.createIndex({ augment_id: 1, patch_version: 1 })
db.augment_items.createIndex({ augment_id: 1, champion_id: 1 })

// champions 集合（用于搜索）
db.champions.createIndex({ name_zh: 1 })
db.champions.createIndex({ name: 1 })

// augments 集合（用于搜索）
db.augments.createIndex({ name_zh: 1 })
db.augments.createIndex({ name: 1 })
```

### 6.3 数据聚合查询示例

```javascript
// 云函数中查询「某英雄的推荐海克斯（按胜率降序）」
const db = cloud.database()
const _ = db.command

const result = await db.collection('champion_augments')
  .where({
    champion_id: 777,
    patch_version: '26.12'
  })
  .orderBy('win_rate', 'desc')
  .limit(100)
  .get()

// 前端按 rarity 分组展示（Prismatic / Gold / Silver）
// 可通过 augment_id 关联查询 augments 集合获取稀有度信息
```

---

## 7. 云函数接口设计

### 7.1 云函数概览

> 小程序端统一通过 `wx.cloud.callFunction()` 调用云函数，无需配置域名和 HTTPS。
> 每个云函数对应一个独立的业务模块。

| 云函数名 | 调用方式 | 说明 |
|----------|----------|------|
| `championList` | `wx.cloud.callFunction({ name: 'championList', data: {...} })` | 获取英雄列表（支持排序） |
| `championDetail` | `wx.cloud.callFunction({ name: 'championDetail', data: {...} })` | 获取英雄详情+推荐海克斯+推荐装备 |
| `augmentList` | `wx.cloud.callFunction({ name: 'augmentList', data: {...} })` | 获取海克斯列表（支持稀有度筛选） |
| `augmentDetail` | `wx.cloud.callFunction({ name: 'augmentDetail', data: {...} })` | 获取海克斯详情+适配英雄+推荐装备 |
| `itemList` | `wx.cloud.callFunction({ name: 'itemList', data: {...} })` | 获取装备列表 |
| `trioRank` | `wx.cloud.callFunction({ name: 'trioRank', data: {...} })` | 获取三海克斯组合排行 |
| `search` | `wx.cloud.callFunction({ name: 'search', data: {...} })` | 模糊搜索英雄/海克斯 |
| `currentPatch` | `wx.cloud.callFunction({ name: 'currentPatch', data: {...} })` | 获取当前版本信息 |

### 7.2 核心云函数详细设计

#### championDetail（英雄详情）

**小程序端调用：**
```javascript
const res = await wx.cloud.callFunction({
  name: 'championDetail',
  data: {
    champion_id: 777,
    patch: '26.12'
  }
})
```

**云函数内部逻辑（Node.js）：**
```javascript
// cloudfunctions/championDetail/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { champion_id, patch } = event

  // 1. 查询英雄基础信息
  const champion = await db.collection('champions')
    .doc(String(champion_id))
    .get()

  // 2. 查询推荐海克斯（按胜率排序）
  const augments = await db.collection('champion_augments')
    .where({ champion_id, patch_version: patch })
    .orderBy('win_rate', 'desc')
    .limit(50)
    .get()

  // 3. 查询推荐装备
  const items = await db.collection('champion_items')
    .where({ champion_id, patch_version: patch })
    .orderBy('win_rate', 'desc')
    .limit(30)
    .get()

  // 4. 查询海克斯×出装联动
  const linkage = await db.collection('augment_items')
    .where({ champion_id, patch_version: patch })
    .orderBy('win_rate', 'desc')
    .limit(50)
    .get()

  return {
    code: 0,
    data: {
      champion: champion.data,
      augments: augments.data,
      items: items.data,
      augment_items_linkage: linkage.data,
      patch_version: patch
    }
  }
}
```

**响应结构（与前端约定）：**
```json
{
  "code": 0,
  "data": {
    "champion": {
      "_id": "777",
      "name": "Yasuo",
      "name_zh": "亚索",
      "title": "疾风剑豪",
      "roles": ["战士", "刺客"],
      "icon_url": "cloud://xxx/champions/777.png",
      "win_rate": 52.3,
      "pick_rate": 8.7
    },
    "augments": [
      {
        "augment_id": 1205,
        "win_rate": 63.9,
        "pick_rate": 1.6,
        "tier": "S",
        "sample_size": 2340
      }
    ],
    "items": [
      {
        "item_id": 3153,
        "win_rate": 60.0,
        "pick_rate": 5.1,
        "tier": "S",
        "slot": "core"
      }
    ],
    "augment_items_linkage": [
      {
        "augment_id": 1205,
        "item_id": 6676,
        "win_rate": 61.2
      }
    ],
    "patch_version": "26.12"
  }
}
```

#### search（搜索）

**小程序端调用：**
```javascript
const res = await wx.cloud.callFunction({
  name: 'search',
  data: {
    keyword: '亚索',
    limit: 10
  }
})
```

**云函数内部逻辑：**
```javascript
// cloudfunctions/search/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { keyword, limit = 10 } = event

  // 英雄名称模糊搜索（正则匹配）
  const champions = await db.collection('champions')
    .where(_.or([
      { name_zh: db.RegExp({ regexp: keyword, options: 'i' }) },
      { name: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
    .limit(limit)
    .get()

  // 海克斯名称模糊搜索
  const augments = await db.collection('augments')
    .where(_.or([
      { name_zh: db.RegExp({ regexp: keyword, options: 'i' }) },
      { name: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
    .limit(limit)
    .get()

  return {
    code: 0,
    data: {
      results: [
        ...champions.data.map(c => ({ type: 'champion', ...c })),
        ...augments.data.map(a => ({ type: 'augment', ...a }))
      ]
    }
  }
}
```

### 7.3 前端调用封装

```javascript
// utils/cloud.js
// 封装云函数调用，统一错误处理

const callFunction = (name, data = {}) => {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '请求失败')
      }
      return res.result.data
    })
    .catch(err => {
      console.error(`[云函数 ${name}] 调用失败:`, err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
      throw err
    })
}

module.exports = {
  getChampionList: (params) => callFunction('championList', params),
  getChampionDetail: (params) => callFunction('championDetail', params),
  getAugmentList: (params) => callFunction('augmentList', params),
  getAugmentDetail: (params) => callFunction('augmentDetail', params),
  search: (params) => callFunction('search', params),
  getTrioRank: (params) => callFunction('trioRank', params),
  getCurrentPatch: () => callFunction('currentPatch'),
}
```

---

## 8. 风险评估与合规

### 8.1 TOS合规风险评估

| 风险点 | 风险等级 | 说明 | 缓解措施 |
|--------|----------|------|----------|
| Riot禁止展示强化胜率 | 🔴 高 | 官方条款明确禁止第三方展示Augment胜率 | 1. 不使用Riot官方API密钥<br>2. 通过网页抓取获取数据<br>3. 标注"数据来源于社区统计"<br>4. 避免直接引用Riot品牌 |
| 数据来源合规 | 🟡 中 | 抓取第三方网站可能涉及其ToS | 1. 优先使用公开API（data.v2.iesdev.com）<br>2. 遵守robots.txt<br>3. 控制抓取频率 |
| 小程序审核 | 🟡 中 | 微信小程序可能涉及游戏相关审核 | 1. 定位为"工具类"而非"游戏辅助"<br>2. 不提供自动化功能<br>3. 确保内容合规 |
| 数据准确性 | 🟡 中 | 非官方数据源可能存在偏差 | 1. 多源交叉验证<br>2. 标注样本量<br>3. 提供用户反馈渠道 |

### 8.2 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| data.v2.iesdev.com API 关闭 | 核心数据源中断 | 多源容灾 + 本地数据缓存 + LCU采集备份方案 |
| aramgg.com 反爬升级 | 备用数据源中断 | 降低抓取频率 + 使用headless browser + IP池 |
| Riot 开放官方API | 数据格局变化（利好） | 快速接入官方API，提升数据权威性 |
| 版本更新导致数据结构变化 | 数据解析失败 | 监控数据管道 + 版本变更告警 + 快速修复流程 |

### 8.3 合规建议

1. **不使用 Riot 品牌名称**作为小程序名称（如"英雄联盟XX"）
2. **明确标注**"本工具非 Riot Games 官方产品"
3. **数据来源声明**："统计数据来源于社区对战数据聚合，仅供参考"
4. **不售卖数据**，通过广告或增值服务变现
5. **保留数据溯源能力**，记录每条数据的来源和采集时间

---

## 9. 开发计划

### 9.1 里程碑规划

```
Phase 1: MVP (4周)                     Phase 2: 完善 (4周)
├── 第1周: 项目搭建                     ├── 第5周: 组合推荐功能
│   ├── 小程序项目初始化                 │   ├── 三海克斯组合排行
│   │   (微信开发者工具 + 云开发环境)    │   ├── 按英雄筛选组合
│   ├── 云数据库集合设计                 │   └── 按流派筛选
│   └── 云函数骨架搭建                   │
├── 第2周: 核心数据采集                   ├── 第6周: 海克斯×出装联动
│   ├── staticDataSync 云函数            │   ├── 联动推荐算法
│   │   (Community Dragon + Data Dragon) │   ├── 联动数据展示
│   ├── statsDataSync 云函数             │   └── 单元测试
│   │   (data.v2.iesdev.com 统计数据)    │
│   └── 数据清洗写入云数据库              ├── 第7周: 搜索 & 优化
│                                       │   ├── 搜索云函数
├── 第3周: 核心功能开发                   │   ├── 性能优化
│   ├── 英雄列表页 & 详情页               │   └── 本地缓存策略
│   ├── 海克斯列表页 & 详情页             │
│   └── 业务查询云函数                   └── 第8周: 测试 & 上线
│                                       │   ├── 全面测试
├── 第4周: 联调 & 测试                   │   ├── 小程序提审
│   ├── 前后端联调（云函数调试）          │   └── 正式上线
│   ├── 小程序提审                       
│   └── 灰度发布                        
```

### 9.2 后续迭代（v1.1+）

| 版本 | 功能 | 优先级 |
|------|------|--------|
| v1.1 | 收藏功能（收藏英雄/强化） | P1 |
| v1.1 | 版本更新推送（新强化/数据变动通知） | P1 |
| v1.2 | 对局记录关联（输入召唤师名查看个人数据） | P2 |
| v1.2 | 阵容推荐（基于队友选择推荐海克斯+出装） | P2 |
| v2.0 | AI 智能推荐（基于阵容/敌方阵容推荐策略） | P2 |
| v2.0 | 语音查询 | P3 |

---

## 10. 成本估算

### 10.1 初期成本（MVP阶段）

| 项目 | 费用/月 | 说明 |
|------|---------|------|
| 微信云开发基础版 | ¥19.9 | 含云函数、云数据库（2GB）、云存储（5GB） |
| 微信小程序认证 | ¥300/年 ≈ ¥25/月 | 企业认证（一次性） |
| 域名（可选） | ¥0 | 云开发无需自定义域名 |
| SSL证书 | ¥0 | 云开发自动管理 |
| 服务器运维 | ¥0 | 云开发免运维 |
| **合计** | **≈ ¥45/月** |  |

> 💡 如使用微信云开发免费额度（基础版限免活动），MVP 阶段成本可降至 **¥25/月**（仅小程序认证费）

### 10.2 规模化成本（DAU 1万+）

| 项目 | 费用/月 | 说明 |
|------|---------|------|
| 微信云开发专业版 | ¥68 | 含更多云函数调用次数、更大数据库/存储空间 |
| 微信云开发专业版（额外流量包） | ¥30-50 | 如超出基础流量配额 |
| **合计** | **≈ ¥100-120/月** |  |

### 10.3 成本对比（原方案 vs 云开发方案）

```
月成本对比（MVP阶段）

原方案（自建服务器）    云开发方案
┌──────────────┐      ┌──────────────┐
│   ¥150/月    │      │   ¥45/月     │
│              │      │              │
│ - 服务器 ¥65 │      │ - 云开发 ¥20 │
│ - Redis  ¥30 │      │ - 认证   ¥25 │
│ - COS    ¥8  │      │              │
│ - 域名   ¥4  │      │  节省 70%    │
│ - 认证   ¥25 │      │              │
└──────────────┘      └──────────────┘

规模化阶段（DAU 1万+）

原方案                 云开发方案
┌──────────────┐      ┌──────────────┐
│  ¥700/月     │      │  ¥110/月     │
│              │      │              │
│ - 服务器 ¥250│      │ - 专业版 ¥68 │
│ - Redis  ¥125│      │ - 流量包 ¥42 │
│ - PG     ¥200│      │              │
│ - CDN    ¥75 │      │  节省 84%    │
└──────────────┘      └──────────────┘
```

---

## 11. 成功指标

### 11.1 核心KPI

| 指标 | 定义 | 目标值（上线90天） |
|------|------|---------------------|
| DAU | 日活跃用户数 | ≥ 5,000 |
| 7日留存 | 第7天回访率 | ≥ 30% |
| 平均停留时长 | 单次访问停留时间 | ≥ 2分钟 |
| 搜索成功率 | 搜索后有点击行为 | ≥ 85% |
| 用户评分 | 小程序评分 | ≥ 4.5/5 |

### 11.2 数据质量指标

| 指标 | 目标值 |
|------|--------|
| 数据更新延迟 | < 24小时（版本更新后） |
| 云函数响应时间 | P99 < 300ms |
| 服务可用性 | ≥ 99.5% |
| 数据准确率 | ≥ 95%（与源站对比） |

---

## 12. 附录

### 12.1 关键数据源链接

| 数据源 | URL | 用途 |
|--------|-----|------|
| Community Dragon | https://www.communitydragon.org/documentation | 静态数据 |
| Data Dragon | https://developer.riotgames.com/docs/lol | 中文本地化 |
| ARAM.GG | https://aramgg.com | 统计数据主源 |
| ARAM Mayhem | https://arammayhem.com | 统计数据备源 |
| Blitz.gg Data API | data.v2.iesdev.com | 结构化统计API |
| hextech.dtodo.cn | hextech.dtodo.cn/data/aram-mayhem-augments.zh_cn.json | 中文强化数据 |
| utils.iesdev.com | utils.iesdev.com/static/json/lol/mayham/ | 中文组合数据 |
| Lanternko DB | https://github.com/Lanternko/ARAM-Mayhem-Database | 开源采集方案参考 |
| ARAM-tool | https://github.com/MJ33520/ARAM-tool | AI推荐方案参考 |

### 12.2 相关 GitHub Issues（Riot 开发者关系）

| Issue | 内容 | 影响 |
|-------|------|------|
| #1035 | queue参数过滤返回空 | Match API使用受限 |
| #1109 | ARAM Mayhem返回403 | 官方API无法获取Mayhem数据 |
| #1154 | 请求开放ARAM Mayhem API | Riot暂未开放 |
| #1157 | Arena增强数据不完整 | 数据字段不完整 |

### 12.3 术语表

| 术语 | 解释 |
|------|------|
| ARAM | All Random All Mid，即大乱斗模式 |
| ARAM Mayhem / 海克斯大乱斗 | 带海克斯强化系统的大乱斗新模式（queueId=2400） |
| Augment / 海克斯强化 | 游戏中选择的增强效果，分Silver/Gold/Prismatic三个稀有度 |
| LCU API | League Client Update API，本地客户端API |
| Community Dragon (CDragon) | 社区维护的游戏数据提取项目 |
| Data Dragon (DDragon) | Riot官方静态数据服务 |
| Tier | 评级，S > A > B > C > D |
| Win Rate | 胜率 |
| Pick Rate | 选取率 |
| Sample Size | 样本量 |
| Patch | 游戏版本补丁 |
