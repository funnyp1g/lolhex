# 数据同步方案设计文档

## 目标
直接同步 aramgg.com 的真实数据，无需手动导入

## 数据源优先级策略

### 1️⃣ 静态数据同步（staticDataSync）

**数据源分配**:

| 数据类型 | 主源 | 备源 | 格式 | 可达性 |
|---------|-----|------|------|--------|
| **英雄基础信息** | Community Dragon | - | JSON | ✅ 国际可达 |
| **装备基础信息** | Community Dragon | - | JSON | ✅ 国际可达 |
| **海克斯中文翻译** | aramgg.com | hextech.dtodo.cn | JSON | ✅ 国内可达 |

**同步流程**:
```
1. 从 Community Dragon 获取英雄/装备基础信息（ID、名称、图标）
2. 从 aramgg.com 获取海克斯中文翻译（displayName、description）
3. 合并数据写入数据库
```

---

### 2️⃣ 统计数据同步（statsDataSync）

**数据源策略**:

```
尝试顺序：
├─ 优先级1: aramgg.com（国内源）
│   ├─ URL: https://aramgg.com/zh-CN/champion-stats/{id}
│   ├─ 格式: HTML（需要解析）
│   ├─ 优势: 国内可达，数据真实
│   ├─ 劣势: 需解析HTML，速度较慢
│   └─ 可行性: ✅ 已验证可访问
│
├─ 优先级2: iesdev API（国际源）
│   ├─ URL: https://data.v2.iesdev.com/api/v1/query_objects/...
│   ├─ 格式: JSON（结构化）
│   ├─ 优势: 数据完整，速度快
│   ├─ 劣势: DNS污染，云函数环境可能失败
│   └─ 可行性: ⚠️ 需DNS绕过
│
└─ 全部失败: 保留上次数据，标记为stale
```

---

## aramgg.com 数据提取方案

### HTML结构分析

aramgg.com 使用 Next.js 构建，数据嵌入方式：

```
方式1: RSC Stream（React Server Components）
  └─ 数据在 self.__next_f.push() 流中
  └─ 需解析 JavaScript 代码提取数据

方式2: Pre-rendered HTML
  └─ 数据直接嵌入HTML中
  └─ 使用 HTML parser 提取

方式3: API接口（需要探索）
  └─ 可能存在隐藏的API端点
```

### 提取策略

**方案A: 解析 RSC Stream**

```javascript
// 从 HTML 中提取 RSC 数据流
const html = await fetch('https://aramgg.com/zh-CN/champion-stats/1')

// 寻找 self.__next_f.push(...) 调用
const rscPattern = /self\.__next_f\.push\(\[(.*?)\]\)/g
const matches = html.matchAll(rscPattern)

// 解析数据流中的 JSON
for (const match of matches) {
  try {
    const data = JSON.parse(match[1])
    // 查找包含胜率、选取率的数据对象
  } catch (e) {}
}
```

**方案B: 使用 Cheerio 解析 HTML**

```javascript
const cheerio = require('cheerio')
const $ = cheerio.load(html)

// 提取表格数据
const rows = $('.stats-table tr')
rows.each(row => {
  const augmentName = $(row).find('.augment-name').text()
  const winRate = $(row).find('.win-rate').text()
  const pickRate = $(row).find('.pick-rate').text()
  const tier = $(row).find('.tier').text()
})
```

---

## 实施步骤

### Step 1: 修改 staticDataSync 云函数

**目标**: 保持现有逻辑，确保 aramgg.com 海克斯数据源优先

**当前状态**: ✅ 已配置 aramgg.com 为主源

**无需修改**: 已正确配置

---

### Step 2: 增强 statsDataSync 云函数

**目标**: 添加 aramgg.com 网页爬取功能

**修改内容**:
```
1. 增强 fetchFromAramgg() 函数
   ├─ 使用 axios 获取 HTML
   ├─ 解析 HTML 提取统计数据
   └─ 转换为数据库格式

2. 调整数据源优先级
   ├─ 先尝试 aramgg.com（国内源）
   └─ 再尝试 iesdev（国际源）
```

---

### Step 3: 优化写入逻辑

**问题**: 统计数据量大（27,680条），写入超时

**解决方案**:
```
方案A: 分批写入
  ├─ 每批100条
  ├─ 间隔10ms
  └─ 总批次：276批

方案B: 增加超时时间
  ├─ timeout: 600秒
  └─ 允许更长的写入时间

方案C: 只写入核心数据
  ├─ 仅写入 champion_augments（最核心）
  ├─ 跳过 augment_items（次要）
  └─ 减少数据量到约30%
```

---

## 预期结果

### 数据同步完成后

```
数据库状态：
✅ champions: 173条（英雄基础信息 + 中文名）
✅ augments: 160条（海克斯基础信息 + 中文翻译）
✅ champion_augments: 27,680条（真实胜率数据）
✅ 数据来源: aramgg.com（国内源）

小程序显示：
✅ 英雄列表（按胜率排序）
✅ 英雄详情（推荐海克斯 + 真实胜率）
✅ 海克斯列表（按胜率排序）
✅ 海克斯详情（适配英雄 + 真实胜率）
✅ Tier评级（S/A/B/C/D）
```

---

## 优势总结

| 对比项 | 手动导入方案 | aramgg同步方案 |
|-------|-------------|--------------|
| **数据真实性** | ⚠️ 模拟数据 | ✅ 真实数据 |
| **更新方式** | ❌ 手动导入 | ✅ 自动同步 |
| **版本跟随** | ❌ 需手动更新 | ✅ 自动跟随 |
| **操作复杂度** | ⚠️ 中等 | ✅ 低（云函数自动） |
| **网络依赖** | ❌ 无 | ⚠️ 国内可达（快） |

---

## 下一步行动

1. **保持现有 staticDataSync**（已正确配置）
2. **增强 statsDataSync**（添加 aramgg 爬取逻辑）
3. **调整超时配置**（增加写入时间）
4. **测试同步流程**（验证数据获取）

---

## 技术细节

### Cheerio 库使用（HTML解析）

```javascript
// 云函数环境需要安装 cheerio
// package.json:
{
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12"  // 添加HTML解析库
  }
}
```

### HTML解析示例

```javascript
const cheerio = require('cheerio')
const html = await fetchHtml('https://aramgg.com/zh-CN/champion-stats/1')
const $ = cheerio.load(html)

// 提取胜率数据
const stats = []
$('.data-row').each((i, row) => {
  const $row = $(row)
  stats.push({
    augment_id: $row.find('[data-id]').attr('data-id'),
    win_rate: parseFloat($row.find('.win-rate').text()),
    pick_rate: parseFloat($row.find('.pick-rate').text()),
    tier: $row.find('.tier').text()
  })
})
```

---

## 总结

**最佳方案**: 修改云函数，从 aramgg.com 直接同步真实数据

**优势**:
- ✅ 数据真实（来自 aramgg.com）
- ✅ 国内可达（响应快）
- ✅ 自动更新（云函数定时触发）
- ✅ 无需手动操作

**下一步**: 修改 statsDataSync 云函数，添加 aramgg.com HTML解析逻辑