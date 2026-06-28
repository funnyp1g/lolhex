# 复刻 aramgg.com 核心功能 — 设计文档

| 属性 | 内容 |
|------|------|
| 版本 | v1.0 |
| 日期 | 2026-06-27 |
| 参考源站 | https://aramgg.com/zh-CN |
| 范围 | 核心数据功能（英雄+海克斯+排行，不含论坛/博客/客户端） |
| 数据策略 | 从 aramgg.com RSC 接口直接抓取装备配置数据；英雄/海克斯基础数据沿用现有管道 |
| 更新日期 | 2026-06-28（装备配置数据管道完成） |

---

## 1. 调研结论

### 1.1 aramgg.com 结构

- **技术栈**：Next.js (Turbopack) SSR，CDN: cdn.dtodo.cn
- **数据源**：
  - 英雄聚合统计：`aramgg.com/data/champions-stats.json`（公开 JSON，173英雄的胜率/选取率/Tier）
  - 装备配置 (builds)：Next.js RSC 服务端渲染（`/zh-CN/champion-stats/{id}` + Header `RSC: 1`），不提供公开 JSON 文件
  - 海克斯数据：`aramgg.com/data/aram-mayhem-augments.zh_cn.json`
- **核心页面**：首页（英雄排行表）、champion-stats/{id}（英雄详情）、augments、augments/{id}（海克斯详情）

### 1.2 关键差异

| 维度 | aramgg.com | 现有项目 | 动作 |
|------|-----------|----------|------|
| 首页 | 英雄 T1-T5 排行主表 | 热门强化卡片+快速入口 | **改造** |
| 英雄详情 | T级总览 + 推荐海克斯 + 推荐装备 + 升级装备 | 推荐海克斯+推荐装备+联动 | **增强** |
| 海克斯详情 | 胜率/选取率 + 各阶段表现 + 最佳英雄 | 胜率/选取率 + 最佳/最差英雄 + 推荐装备 | **增强** |
| 数据维度 | T1-T5 层级 | S/A/B/C/D Tier | **映射对齐** |
| 阶段表现 | Lv3/7/11/15 胜率趋势 | 无 | **新增** |

### 1.3 不复刻的内容

- 攻略博客（30+篇）
- 桌面客户端（OCR 识别）
- 论坛/社区
- 隐私政策/联系页

---

## 2. 数据管道增强

### 2.1 新增集合：champion_stage_performance

```
{
  _id: "777_1205_3_26.12",          // champion_augment_stage_patch
  champion_id: 777,
  augment_id: 1205,
  stage: 3,                          // 3 | 7 | 11 | 15
  win_rate: 58.2,
  pick_rate: 12.5,
  sample_size: 8500,
  patch_version: "26.12",
  updated_at: Date
}
```

索引：`{ champion_id: 1, augment_id: 1, patch_version: 1, stage: 1 }`

### 2.2 云函数变更

| 云函数 | 变更类型 | 说明 |
|--------|---------|------|
| `championRankTable` | **新增** | 首页英雄排行表专用，全量英雄 T级+胜率+选取率+样本 |
| `championDetail` | 增强 | 新增返回 `tier_rank`（T1-T5）、`stage_performance` |
| `augmentDetail` | 增强 | 新增返回 `stage_performance`、`global_rank` 卡片数据 |
| `statsDataSync` | 增强 | 新增 `champion_stage_performance` 集合写入逻辑 |

### 2.3 Tier 映射

```
S → T1（胜率 ≥ 55%）
A → T2（胜率 ≥ 52%）
B → T3（胜率 ≥ 49%）
C → T4（胜率 ≥ 46%）
D → T5（胜率 < 46%）
```

### 2.4 阶段表现数据策略

- 优先从 iesdev API 提取（如果响应包含 per-stage 数据）
- 如果 API 不提供，从 `champion_augments` 按等级维度聚合计算
- 最终降级方案：前端用静态占位 + "该维度数据采集中" 提示

---

## 3. 装备配置数据管道（aramgg RSC 抓取）

> **更新于 2026-06-28**。aramgg 的装备配置数据（3件套核心装备 + 出门装 + 情境装备）仅通过 Next.js RSC（React Server Components）服务端渲染，不提供公开 JSON 文件。已建立完整抓取→丰富→转换管道。

### 3.1 数据来源

| 数据 | 来源 | 格式 |
|------|------|------|
| 英雄列表 | `https://aramgg.com/data/champions-stats.json` | JSON（173英雄ID） |
| 装备配置 (builds) | `https://aramgg.com/zh-CN/champion-stats/{id}` + Header `RSC: 1` | 纯文本含内嵌JSON |
| 装备中文名→ID | DDragon `ITEM_CN_MAP`（615条）+ aramgg coreItems（436条覆盖） | 反向查找表 |
| 成装ID过滤 | CDragon `items.json`（筛选 `from`非空 + `priceTotal≥700`） | 228个成装ID |

### 3.2 builds 数据结构（aramgg RSC 内嵌格式）

```json
{
  "1": [{
    "tags": ["AP"],
    "games": 8759,
    "winRate": 0.519,
    "pickRate": 0.720,
    "coreItems": [
      { "itemIds": [3118,3020,4646], "itemNames": ["残疫","法师之靴","风暴狂涌"], "winRate": 0.536 },
      { "itemIds": [3118,3020,6653], "itemNames": ["残疫","法师之靴","兰德里的折磨"], "winRate": 0.549 },
      { "itemIds": [6655,3020,4646], "itemNames": ["卢登的回声","法师之靴","风暴狂涌"], "winRate": 0.461 }
    ],
    "startingItems": ["复用型药水","遗失的章节"],
    "situationalItems": ["法师之靴","残疫","影焰","风暴狂涌","卢登的回声","兰德里的折磨"]
  }]
}
```

**关键理解**：aramgg 的「核心装备」是 **3件套组合胜率**（3件一起出时的胜率），不是单品胜率。我们的 `champion_items` 存的是单品数据，因此装备区改为直接从 aramgg 抓取 builds 数据展示。

### 3.3 更新管道（3步脚本）

每次版本更新时执行：

```bash
# 步骤1：抓取 173 个英雄的 builds 数据（~50秒）
node scripts/scrape_builds.js
# 输出: data-export/champion-builds.json（687KB）

# 步骤2：丰富图标 — 解析中文名→item ID + DDragon图标URL
node scripts/enrich_builds.js
# 使用: ITEM_CN_MAP + coreItems 覆盖（coreItems优先）

# 步骤3：转换为云函数 JS 模块
node scripts/convert_builds.js
# 输出: cloudfunctions/championDetail/data/champion-builds.js（1097KB）
```

**管道完成后部署**：championDetail 云函数重新上传（"云端安装依赖"方式）。

### 3.4 成装过滤

`cloudfunctions/championDetail/data/completed-item-ids.js` — 228个成装ID，源自 CDragon `items.json`。云函数在返回 `champion_items` 查询结果时过滤：`.filter(i => COMPLETED_ITEM_IDS.has(Number(i.item_id)))`。用于降级方案（无 builds 数据时显示单品）。

### 3.5 云函数内的数据流

```
championDetail 云函数
  ├── champions 集合 → 英雄基础信息
  ├── champion_augments 集合 → 推荐海克斯
  ├── champion_items 集合 → 单品装备（降级用，已做成装过滤）
  ├── champion-builds.js (嵌入式) → builds 装备配置（1:1复刻aramgg）
  ├── completed-item-ids.js → 成装白名单
  └── champion_stage_performance → 阶段表现
```

### 3.6 前端装备展示结构

```
装备配置
  └── Build Group (按流派: AP/AD/Tank...)
        ├── 流派标签 + 场次 + 胜率 + 选取率
        ├── 核心装备: 3个卡片，每卡片=3件大图+名称+组合胜率
        ├── 出门装: 横排图标+名称
        └── 备选装备: 横排图标+名称（与出门装一致）
```

---

## 4. 页面功能设计

### 4.1 首页改造

```
┌─────────────────────────────────────────┐
│ 🔍 搜索英雄 / 海克斯...                  │  保留
├─────────────────────────────────────────┤
│ 📊 当前版本 26.12 | 更新于 06-27         │  保留
├─────────────────────────────────────────┤
│                                         │
│  🏆 英雄强度排行                         │  新增主内容
│  ┌─────────────────────────────────┐    │
│  │ 排序: [胜率▼]  筛选: [全部角色▼] │    │
│  ├────┬──────────┬──────┬────┬────┤    │
│  │ T级│ 英雄     │ 胜率 │选取│样本│    │
│  ├────┼──────────┼──────┼────┼────┤    │
│  │ T1 │ 🖼 亚索  │52.3%│8.7%│52K │    │  前20条，触底加载更多
│  └────┴──────────┴──────┴────┴────┘    │
│                                         │
├─────────────────────────────────────────┤
│  ⚡ 热门海克斯 TOP5          查看更多 >  │  保留
├─────────────────────────────────────────┤
│  📌 快速入口                            │  保留
└─────────────────────────────────────────┘
```

**新增云函数**：`championRankTable`
- 输入：`{ sort_by, order, role, page, page_size }`
- 输出：`{ list: [...], total, page, total_pages }`
- 每个 item：`{ champion_id, name_zh, icon_url, roles, tier_rank, win_rate, pick_rate, sample_size }`

### 4.2 英雄详情页增强

**保留区域**：Header、推荐海克斯（棱彩/黄金/白银 Tab）、推荐装备（核心装/鞋子/神装）、海克斯×出装联动

**新增区域**：

1. **T级总览卡片**（Header 下方）：
   - 显示 `tier_rank`（T1-T5）、全局胜率、选取率、排名（#X/170）
   - 强度条可视化

2. **阶段表现区域**（联动区域下方）：
   - 选中的海克斯在各等级的胜率变化
   - 4 个阶段条（Lv3/7/11/15）+ 数值

### 4.3 海克斯详情页增强

**保留区域**：Header、数据指标横排、最佳英雄 TOP10、最差英雄 BOTTOM5、推荐装备、版本趋势图

**新增区域**：

1. **全局排名卡片**（Header 下方）：
   - 排名 #X/171 + 胜率 + "高于 XX% 的海克斯"

2. **各阶段表现图表**（版本趋势图下方）：
   - 折线图或柱状图：X轴=等级(3/7/11/15)，Y轴=胜率

### 4.4 其他页面

| 页面 | 变更 |
|------|------|
| 英雄列表 | 列表模式新增 T级列 |
| 海克斯列表 | 新增 T级列 |
| 组合推荐 | 保持现有，确保数据对齐 |
| 搜索 | 保持现有 |
| 设置 | 保持现有 |

---

## 5. UI 组件变更

### 5.1 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `rank-table` | `components/rank-table/` | 首页英雄排行表（5列，排序/筛选/分页） |
| `stage-bar` | `components/stage-bar/` | 阶段表现柱状图（4柱，高度比例=胜率） |

### 5.2 修改组件

| 组件 | 变更 |
|------|------|
| `tier-badge` | 新增 `mode='T'` 支持 T1-T5 显示，配色：T1=#FF4D4F T2=#FA8C16 T3=#FADB14 T4=#52C41A T5=#8C8C8C |
| `champion-card` | 列表模式新增可选 T级列显示 |
| `augment-card` | 新增 `rank` 属性，左侧显示排名序号 |

### 5.3 页面样式调整

- 首页：排行表 sticky header + 行条纹背景
- 英雄详情：T级总览卡片渐变背景 + 阶段表现横条
- 海克斯详情：全局排名卡片 + 阶段表现图表区域

---

## 6. 实施优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | 首页英雄排行表 | aramgg 最核心特征，用户感知最强 |
| P0 | 英雄详情 T级总览 | T1-T5 层级展示 |
| P1 | tier-badge T模式 | 全局组件变更，依赖方多 |
| P1 | 海克斯详情排名卡片 | 补充 ranking 维度 |
| P2 | 阶段表现数据+展示 | 依赖数据管道增强 |
| P2 | 云函数增强 | championRankTable 新增 + 现有函数增强 |

---

## 7. 风险与假设

| 风险 | 缓解 |
|------|------|
| iesdev API 不提供阶段数据 | 前端降级为占位提示，后续版本迭代 |
| T1-T5 分位计算与 aramgg 有偏差 | 以现有 tier 字段映射为准，标注计算方法 |
| 排行表性能（170行渲染） | 虚拟列表 / 分页加载 |
