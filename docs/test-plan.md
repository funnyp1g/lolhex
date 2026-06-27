# 海克斯大乱斗图鉴 - 测试计划

> 版本：1.0.0  
> 日期：2026-06-25  
> 编写：Agent 5（集成测试）  
> 状态：初版

---

## 目录

- [A. 云函数单元测试](#a-云函数单元测试)
- [B. 前后端集成测试](#b-前后端集成测试)
- [C. UI 验收测试](#c-ui-验收测试)
- [D. 数据管道测试](#d-数据管道测试)
- [E. 性能测试](#e-性能测试)
- [附录：测试环境要求](#附录测试环境要求)

---

## A. 云函数单元测试

### A.1 championList（英雄列表查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-CL-01 | 默认参数查询 | `{}` | code=0，返回按 win_rate 降序排列的英雄列表，默认 page=1, page_size=20 | P0 |
| CF-CL-02 | 按胜率升序排序 | `{ sort_by: 'win_rate', order: 'asc' }` | code=0，列表按 win_rate 升序 | P0 |
| CF-CL-03 | 按选取率排序 | `{ sort_by: 'pick_rate', order: 'desc' }` | code=0，列表按 pick_rate 降序 | P0 |
| CF-CL-04 | 非法 sort_by 字段 | `{ sort_by: 'invalid_field' }` | code=1001，返回参数校验错误 | P0 |
| CF-CL-05 | 非法 order 值 | `{ order: 'sideways' }` | code=1001，返回参数校验错误 | P0 |
| CF-CL-06 | 分页查询第二页 | `{ page: 2, page_size: 10 }` | code=0，返回第 11-20 条数据 | P0 |
| CF-CL-07 | page_size 超限 | `{ page_size: 100 }` | code=0，page_size 被限制为 50 | P1 |
| CF-CL-08 | 指定版本号 | `{ patch: '14.24' }` | code=0，查询 14.24 版本数据 | P1 |
| CF-CL-09 | 非法 patch 格式 | `{ patch: 'invalid' }` | code=1001，返回格式错误 | P1 |
| CF-CL-10 | patches 集合为空 | 删除 patches 中 is_current 记录 | code=2000，返回服务器内部错误 | P2 |
| CF-CL-11 | 返回字段验证 | 正常请求 | 返回列表字段仅包含 `_id, riot_id, name, name_zh, title, roles, icon_url, win_rate, pick_rate`，无冗余字段 | P1 |
| CF-CL-12 | 分页元数据验证 | 正常请求 | meta 中包含 `patch_version` 和 `timestamp`，data 包含 `total, total_pages` | P1 |

### A.2 championDetail（英雄详情查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-CD-01 | 正常查询 | `{ champion_id: 266 }` (数字) | code=0，返回英雄基础信息 + augments + items + augment_items_linkage | P0 |
| CF-CD-02 | champion_id 为字符串 | `{ champion_id: "266" }` | code=1001，返回 "champion_id 为必填数字" | P0 |
| CF-CD-03 | champion_id 缺失 | `{}` | code=1001，返回参数错误 | P0 |
| CF-CD-04 | champion_id 为 null | `{ champion_id: null }` | code=1001，返回参数错误 | P0 |
| CF-CD-05 | 英雄不存在 | `{ champion_id: 999999 }` | code=1002，返回 "英雄不存在" | P1 |
| CF-CD-06 | 并行查询验证 | 正常查询 | 4 个集合（champions, champion_augments, champion_items, augment_items）并行查询 | P1 |
| CF-CD-07 | 关联查询名称填充 | 正常查询 | augments 中每条记录包含 `augment_name_zh, rarity, icon_url` | P1 |
| CF-CD-08 | 空 augment_ids 处理 | 英雄无关联海克斯 | augment 返回空数组，不触发关联查询 | P1 |
| CF-CD-09 | augment_items 联动数据 | 正常查询 | augment_items_linkage 包含联动数据，已关联名称 | P1 |
| CF-CD-10 | 海克斯按胜率降序 | 正常查询 | augments 列表按 win_rate 降序排列，最多 50 条 | P1 |
| CF-CD-11 | 装备按胜率降序 | 正常查询 | items 列表按 win_rate 降序排列，最多 30 条 | P1 |

### A.3 augmentList（海克斯列表查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-AL-01 | 默认查询 | `{}` | code=0，返回全部海克斯列表 | P0 |
| CF-AL-02 | 棱彩级筛选 | `{ rarity: 'prismatic' }` | code=0，仅返回 prismatic 稀有度 | P0 |
| CF-AL-03 | 黄金级筛选 | `{ rarity: 'gold' }` | code=0，仅返回 gold 稀有度 | P0 |
| CF-AL-04 | 白银级筛选 | `{ rarity: 'silver' }` | code=0，仅返回 silver 稀有度 | P0 |
| CF-AL-05 | 非法 rarity 值 | `{ rarity: 'diamond' }` | code=1001，参数校验错误 | P0 |
| CF-AL-06 | 排序 + 筛选组合 | `{ rarity: 'gold', sort_by: 'pick_rate', order: 'asc' }` | code=0，黄金级按选取率升序 | P1 |
| CF-AL-07 | 分页验证 | `{ page: 1, page_size: 5 }` | code=0，返回 5 条，total_pages 正确 | P1 |

### A.4 augmentDetail（海克斯详情查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-AD-01 | 正常查询 | `{ augment_id: 1 }` (数字) | code=0，返回海克斯信息 + best_champions + worst_champions + items | P0 |
| CF-AD-02 | augment_id 为字符串 | `{ augment_id: "1" }` | code=1001，返回 "augment_id 为必填数字" | P0 |
| CF-AD-03 | augment_id 缺失 | `{}` | code=1001，参数错误 | P0 |
| CF-AD-04 | 海克斯不存在 | `{ augment_id: 999999 }` | code=1002，返回 "海克斯不存在" | P1 |
| CF-AD-05 | 全局排名计算 | 正常查询 | global_rank 为胜率高于该海克斯的海克斯数 + 1 | P1 |
| CF-AD-06 | 最佳英雄 TOP10 | 正常查询 | best_champions 最多 10 条，按 win_rate 降序 | P1 |
| CF-AD-07 | 最差英雄 BOTTOM5 | 正常查询 | worst_champions 最多 5 条，按 win_rate 升序 | P1 |
| CF-AD-08 | 推荐装备查询 | 正常查询 | items 仅查询 champion_id=null 的全局数据，最多 30 条 | P1 |
| CF-AD-09 | 英雄名称关联 | 正常查询 | best/worst champions 包含 champion_name_zh 和 icon_url | P1 |

### A.5 trioRank（组合排行查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-TR-01 | 默认查询（全局组合） | `{}` | code=0，返回 champion_id=null 的全局组合 | P0 |
| CF-TR-02 | 按英雄筛选 | `{ champion_id: 266 }` | code=0，返回指定英雄的组合 | P0 |
| CF-TR-03 | 最低样本量过滤 | 正常查询 | 仅返回 sample_size >= 50 的组合 | P1 |
| CF-TR-04 | 排序字段验证 | `{ sort_by: 'invalid' }` | code=1001，参数校验错误 | P0 |
| CF-TR-05 | 海克斯名称关联 | 正常查询 | augment_names_zh 和 augment_icons 正确填充 | P1 |
| CF-TR-06 | augment_ids 始终为 3 个 | 正常查询 | 返回列表中每条记录 augment_ids 长度为 3 | P1 |

### A.6 search（搜索）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-SR-01 | 中文关键词搜索英雄 | `{ keyword: '盖伦' }` | code=0，返回含 "盖伦" 的英雄 | P0 |
| CF-SR-02 | 英文关键词搜索 | `{ keyword: 'garen' }` | code=0，返回 name 含 "garen" 的英雄 | P0 |
| CF-SR-03 | 搜索海克斯 | `{ keyword: '电刀' }` | code=0，返回含 "电刀" 的海克斯 | P0 |
| CF-SR-04 | 空关键词 | `{ keyword: '' }` | code=1001，返回参数错误 | P0 |
| CF-SR-05 | keyword 为 null | `{ keyword: null }` | code=1001，返回参数错误 | P0 |
| CF-SR-06 | 特殊字符处理 | `{ keyword: 'test(1)' }` | code=0，特殊字符被转义，不触发正则错误 | P1 |
| CF-SR-07 | limit 参数 | `{ keyword: 'test', limit: 5 }` | 每类最多返回 5 条 | P1 |
| CF-SR-08 | limit 超限 | `{ keyword: 'test', limit: 100 }` | limit 被限制为 20 | P1 |
| CF-SR-09 | 结果类型标记 | 正常搜索 | 英雄标记 type='champion'，海克斯标记 type='augment' | P1 |
| CF-SR-10 | 无匹配结果 | `{ keyword: 'xxxxxx不存在' }` | code=0，results 为空数组 | P1 |

### A.7 currentPatch（当前版本查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-CP-01 | 正常查询 | `{}` | code=0，返回 is_current=true 的 patches 记录 | P0 |
| CF-CP-02 | 无当前版本 | 删除 patches 中 is_current 记录 | code=1003，返回 "版本数据未初始化" | P0 |
| CF-CP-03 | 返回数据字段验证 | 正常查询 | data 包含 version, is_current, data_status 等字段 | P1 |

### A.8 itemList（装备列表查询）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-IL-01 | 默认查询 | `{}` | code=0，返回装备列表 | P0 |
| CF-IL-02 | 按类别筛选 | `{ category: 'boots' }` | code=0，仅返回鞋子类装备 | P1 |
| CF-IL-03 | 分页验证 | `{ page: 1, page_size: 10 }` | code=0，分页正确 | P1 |

### A.9 staticDataSync（静态数据同步）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-SS-01 | 完整同步流程 | `{}` | code=0，champions/augments/items/patches 集合数据更新 | P0 |
| CF-SS-02 | Community Dragon 数据拉取 | 正常网络 | 成功拉取英雄、海克斯、装备静态数据 | P0 |
| CF-SS-03 | Data Dragon 中文本地化 | 正常网络 | 中文名称正确写入 name_zh 字段 | P1 |
| CF-SS-04 | hextech.dtodo.cn 降级 | 该接口不可用 | 不影响整体同步，graceful degradation | P1 |
| CF-SS-05 | 批量 upsert | 大量数据 | batchUpsert 按 20 条一批写入，幂等性 | P1 |
| CF-SS-06 | patches 记录更新 | 同步完成 | patches 中 is_current=true 的记录 updated_at 更新 | P1 |

### A.10 statsDataSync（统计数据同步）

| 测试编号 | 测试项 | 输入参数 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| CF-ST-01 | 主数据源同步 | `{}` (iesdev 可用) | code=0，data_source='iesdev' | P0 |
| CF-ST-02 | 主源失败回退到 aramgg | iesdev 不可用 | data_source='aramgg'，数据正常写入 | P0 |
| CF-ST-03 | 双源失败回退到 arammayhem | iesdev+aramgg 不可用 | data_source='arammayhem' | P1 |
| CF-ST-04 | 全部数据源失败 | 三个源均不可用 | code=2001，patches 标记 data_status='stale' | P0 |
| CF-ST-05 | 数据清洗 - 最小样本量 | 含 sample_size < 30 的数据 | 低样本量记录被过滤，不写入数据库 | P0 |
| CF-ST-06 | 数据清洗 - 异常胜率 | 含 win_rate < 10% 或 > 90% 的数据 | 胜率被钳制在 [10, 90] 范围内 | P1 |
| CF-ST-07 | 数据清洗 - 小数转百分比 | 原始数据为 0.52 | 写入数据库为 52.00 | P1 |
| CF-ST-08 | champion_augments 写入 | 正常同步 | 写入格式正确，_id 为 `championId_augmentId_patchVersion` | P0 |
| CF-ST-09 | champion_items 写入 | 正常同步 | 写入格式正确，包含 slot 和 is_core 字段 | P0 |
| CF-ST-10 | augment_trios 写入 | 正常同步 | augment_ids 按升序排列，长度严格为 3 | P0 |
| CF-ST-11 | champions 全局胜率更新 | 正常同步 | champions 集合 win_rate 更新为加权平均胜率 | P1 |
| CF-ST-12 | augments 全局胜率更新 | 正常同步 | augments 集合 win_rate 更新为加权平均胜率 | P1 |
| CF-ST-13 | 版本状态更新 | 同步完成 | patches.data_status 从 'syncing' 变为 'ready' | P1 |
| CF-ST-14 | augment_items 写入验证 | 正常同步 | **验证是否写入 augment_items 集合**（预期：无数据写入） | P0 |

---

## B. 前后端集成测试

### B.1 cloud.js 封装层

| 测试编号 | 测试项 | 测试方法 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| INT-CF-01 | cloud.js 导出函数完整性 | 检查 module.exports | 包含 getChampionList, getChampionDetail, getAugmentList, getAugmentDetail, search, getTrioRank, getCurrentPatch，**共 7 个** | P0 |
| INT-CF-02 | 缺失 itemList 封装 | 检查 cloud.js | ** itemList 未在 cloud.js 中导出 **，前端无法调用 itemList 云函数 | P0 |
| INT-CF-03 | 错误响应处理 | 模拟云函数返回 code!=0 | 抛出错误，触发 wx.showToast 提示 | P0 |
| INT-CF-04 | 返回值格式 | 正常调用 | callFunction 返回 `res.result.data`（已解包） | P0 |

### B.2 参数名匹配验证

| 测试编号 | 测试项 | 前端调用 | 云函数期望 | 预期结果 | 优先级 |
|---------|--------|---------|-----------|---------|-------|
| INT-PM-01 | championList 排序参数名 | 前端传 `sort_order` | championList 解构 `order` | **不匹配**：sort_order 被忽略，排序始终使用默认值 'desc' | P0 |
| INT-PM-02 | augmentList 排序参数名 | 前端传 `sort_order` | augmentList 解构 `order` | **不匹配**：同上 | P0 |
| INT-PM-03 | championDetail ID 类型 | 前端传字符串 id | championDetail 验证 `typeof === 'number'` | **不匹配**：字符串 ID 触发 code=1001 | P0 |
| INT-PM-04 | augmentDetail ID 类型 | 前端传字符串 id | augmentDetail 验证 `typeof === 'number'` | **不匹配**：字符串 ID 触发 code=1001 | P0 |
| INT-PM-05 | currentPatch 返回值字段 | 前端读 `data.patch` | currentPatch 返回 `data.version` (patches 文档字段) | **不匹配**：`data.patch` 为 undefined | P0 |
| INT-PM-06 | championList 角色筛选 | 前端传 `role` 参数 | championList 未处理 `role` 参数 | **不匹配**：角色筛选在服务端无效 | P1 |
| INT-PM-07 | championList 关键词搜索 | 前端传 `keyword` 参数 | championList 未处理 `keyword` 参数 | **不匹配**：搜索在服务端无效 | P1 |
| INT-PM-08 | trioRank champion_id 类型 | combo 页面传字符串 | trioRank 未做类型校验但数据库存数字 | **潜在不匹配**：字符串与数字比较可能失败 | P1 |

### B.3 页面-云函数数据流

| 测试编号 | 测试页 | 测试项 | 验证点 | 优先级 |
|---------|--------|--------|-------|-------|
| INT-PG-01 | index | 版本号显示 | cloud.getCurrentPatch() → data.patch vs data.version | P0 |
| INT-PG-02 | index | 热门海克斯加载 | getAugmentList 传 sort_order 参数是否生效 | P0 |
| INT-PG-03 | champion-list | 列表加载 | getChampionList 返回格式匹配 | P0 |
| INT-PG-04 | champion-list | 排序切换 | sort_order 参数名不匹配导致排序方向无法切换 | P0 |
| INT-PG-05 | champion-list | 角色筛选 | role 参数在服务端被忽略 | P1 |
| INT-PG-06 | champion-detail | 页面加载 | champion_id 字符串 vs 云函数数字校验 | P0 |
| INT-PG-07 | champion-detail | 海克斯分组 | augment 按 rarity 分组逻辑正确性 | P1 |
| INT-PG-08 | champion-detail | 装备分组 | item 按 slot 分组逻辑正确性 | P1 |
| INT-PG-09 | champion-detail | 联动数据 | augment_items 集合无数据（数据管道缺失） | P0 |
| INT-PG-10 | augment-list | 列表加载 | getAugmentList 返回格式匹配 | P0 |
| INT-PG-11 | augment-list | 稀有度筛选 | rarity 参数正确传递 | P0 |
| INT-PG-12 | augment-list | 排序切换 | sort_order vs order 不匹配 | P0 |
| INT-PG-13 | augment-detail | 页面加载 | augment_id 字符串 vs 云函数数字校验 | P0 |
| INT-PG-14 | augment-detail | 最佳/最差英雄 | best_champions/worst_champions 数据格式 | P1 |
| INT-PG-15 | augment-detail | 推荐装备 | augment_items 集合无数据 | P0 |
| INT-PG-16 | combo | 组合加载 | getTrioRank 返回格式匹配 | P0 |
| INT-PG-17 | combo | 英雄筛选 | champion_id 字符串 vs 数据库数字 | P1 |
| INT-PG-18 | search | 搜索功能 | search 云函数参数和返回格式 | P0 |
| INT-PG-19 | search | Mock 降级 | 云函数失败时 mock 数据是否正常渲染 | P1 |
| INT-PG-20 | settings | 版本号显示 | 同 INT-PG-01，data.patch vs data.version | P0 |

### B.4 Mock 降级测试

| 测试编号 | 测试页 | 测试项 | 预期结果 | 优先级 |
|---------|--------|--------|---------|-------|
| INT-MK-01 | index | 云函数全部失败 | 降级到 mockData，页面正常显示 | P0 |
| INT-MK-02 | champion-list | 云函数失败 | 降级到 mockData.champions | P0 |
| INT-MK-03 | champion-detail | 云函数失败 | 降级到 mockData 关联查询 | P1 |
| INT-MK-04 | augment-list | 云函数失败 | 降级到 mockData.augments | P0 |
| INT-MK-05 | augment-detail | 云函数失败 | 降级到 mockData 关联查询 | P1 |
| INT-MK-06 | combo | 云函数失败 | 降级到 mockData.augment_trios | P0 |
| INT-MK-07 | search | 云函数失败 | 降级到 mockData 本地搜索 | P0 |
| INT-MK-08 | settings | 云函数失败 | 降级到缓存或 mockData.CURRENT_PATCH | P1 |
| INT-MK-09 | champion-detail | 英雄不在 mock 中 | 设置 error=true | P1 |
| INT-MK-10 | augment-detail | 海克斯不在 mock 中 | 设置 error=true | P1 |

---

## C. UI 验收测试

### C.1 首页（index）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-IDX-01 | 搜索栏 | 显示搜索入口，点击跳转到 search 页 | P0 |
| UI-IDX-02 | 版本号显示 | 显示当前版本号（需确认 data.patch 问题已修复） | P0 |
| UI-IDX-03 | 快速入口 | 3 个快速入口（英雄/海克斯/组合），点击跳转正确 | P0 |
| UI-IDX-04 | 热门海克斯列表 | 展示胜率前 5 的海克斯卡片 | P0 |
| UI-IDX-05 | 下拉刷新 | 下拉触发数据刷新，清除缓存重新请求 | P1 |
| UI-IDX-06 | 加载骨架屏 | 加载中显示 loading-skeleton | P1 |
| UI-IDX-07 | TabBar 显示 | 5 个 Tab（首页/英雄/海克斯/组合/设置），选中高亮正确 | P0 |

### C.2 英雄列表页（champion-list）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-CL-01 | 列表展示 | 英雄卡片列表，显示头像、名称、角色、胜率 | P0 |
| UI-CL-02 | 排序切换 | 胜率/选取率排序切换按钮 | P0 |
| UI-CL-03 | 角色筛选 | 角色标签筛选，选中后列表更新 | P0 |
| UI-CL-04 | 列表/网格切换 | viewMode 切换，布局变化 | P1 |
| UI-CL-05 | 分页加载 | 滚动到底部加载更多 | P0 |
| UI-CL-06 | 下拉刷新 | 下拉触发刷新 | P1 |
| UI-CL-07 | 点击英雄 | 跳转到英雄详情页 | P0 |
| UI-CL-08 | Tier 徽章 | 根据 tier 值显示对应颜色和字母 | P1 |
| UI-CL-09 | 胜率进度条 | rate-bar 显示胜率，颜色按阈值变化 | P1 |

### C.3 英雄详情页（champion-detail）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-CD-01 | 英雄信息 | 显示头像、名称、称号、角色、全局胜率/选取率 | P0 |
| UI-CD-02 | 推荐海克斯 Tab | 棱彩级/黄金级/白银级 Tab 切换 | P0 |
| UI-CD-03 | 海克斯卡片 | 显示海克斯图标、名称、稀有度、胜率、Tier | P0 |
| UI-CD-04 | 推荐装备分组 | 核心装/鞋子/神装 分组显示 | P0 |
| UI-CD-05 | 装备卡片 | 显示装备图标、名称、胜率 | P1 |
| UI-CD-06 | 海克斯-装备联动 | 联动数据展示（依赖 augment_items 集合有数据） | P1 |
| UI-CD-07 | 下拉刷新 | 下拉重新加载详情 | P1 |
| UI-CD-08 | 海克斯点击 | 点击海克斯卡片跳转到海克斯详情 | P0 |
| UI-CD-09 | 角色颜色 | 不同角色显示不同颜色标签 | P1 |

### C.4 海克斯列表页（augment-list）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-AL-01 | 列表展示 | 海克斯卡片列表，显示图标、名称、稀有度、胜率 | P0 |
| UI-AL-02 | 稀有度筛选 | 全部/棱彩/黄金/白银 Tab 切换 | P0 |
| UI-AL-03 | 排序切换 | 胜率/选取率排序切换 | P0 |
| UI-AL-04 | 分页加载 | 滚动加载更多 | P0 |
| UI-AL-05 | 点击海克斯 | 跳转到海克斯详情页 | P0 |

### C.5 海克斯详情页（augment-detail）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-AD-01 | 海克斯信息 | 显示图标、名称、稀有度、胜率、选取率、全局排名 | P0 |
| UI-AD-02 | 最佳适配英雄 | TOP5 英雄列表，显示胜率 | P0 |
| UI-AD-03 | 最差适配英雄 | 显示最差英雄，红色警示 | P1 |
| UI-AD-04 | 推荐装备 | 装备列表显示 | P1 |
| UI-AD-05 | 英雄点击 | 点击英雄跳转到英雄详情 | P0 |
| UI-AD-06 | 胜率进度条 | rate-bar 颜色按阈值变化 | P1 |

### C.6 组合推荐页（combo）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-CB-01 | 组合列表 | 展示三海克斯组合卡片 | P0 |
| UI-CB-02 | 英雄下拉筛选 | 选择英雄后列表刷新 | P0 |
| UI-CB-03 | 排序切换 | 胜率/热度排序 | P1 |
| UI-CB-04 | 海克斯图标 | 三个海克斯图标并排显示 | P0 |
| UI-CB-05 | 分页加载 | 滚动加载更多 | P1 |

### C.7 搜索页（search）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-SR-01 | 搜索输入 | 输入框实时搜索，300ms 防抖 | P0 |
| UI-SR-02 | 搜索历史 | 显示历史搜索记录 | P0 |
| UI-SR-03 | 清空历史 | 点击清空，确认弹框后清空 | P1 |
| UI-SR-04 | 结果分类 | 英雄结果和海克斯结果分区显示 | P0 |
| UI-SR-05 | 点击英雄结果 | 跳转英雄详情 | P0 |
| UI-SR-06 | 点击海克斯结果 | 跳转海克斯详情 | P0 |
| UI-SR-07 | 回车搜索 | 回车保存历史并搜索 | P1 |
| UI-SR-08 | 空输入 | 清空输入框时结果清空 | P1 |

### C.8 设置页（settings）

| 测试编号 | 测试项 | 验收标准 | 优先级 |
|---------|--------|---------|-------|
| UI-ST-01 | 版本号显示 | 显示当前数据版本号 | P0 |
| UI-ST-02 | 缓存大小 | 显示当前缓存占用空间 | P0 |
| UI-ST-03 | 清除缓存 | 点击清除缓存，弹框确认后清空 | P0 |
| UI-ST-04 | 刷新数据 | 点击刷新，清除列表缓存 | P1 |
| UI-ST-05 | 数据源说明 | 弹框显示数据源信息 | P1 |
| UI-ST-06 | 意见反馈 | 弹框显示联系方式 | P2 |
| UI-ST-07 | 关于 | 弹框显示应用信息 | P2 |

### C.9 公共组件

| 测试编号 | 组件 | 测试项 | 验收标准 | 优先级 |
|---------|------|--------|---------|-------|
| UI-CM-01 | tier-badge | Tier 显示 | 根据 tier 值显示对应颜色和字母 | P0 |
| UI-CM-02 | tier-badge | 形状切换 | circle/rectangle 形状正确 | P1 |
| UI-CM-03 | rate-bar | 胜率颜色 | ≥55% 红色，≥50% 橙色，≥45% 黄色，<45% 灰色 | P0 |
| UI-CM-04 | rate-bar | 进度条宽度 | 宽度与 value 值成比例 | P0 |
| UI-CM-05 | augment-card | 信息展示 | 图标+名称+稀有度+胜率+描述 | P0 |
| UI-CM-06 | augment-card | 点击导航 | 点击跳转到海克斯详情 | P0 |
| UI-CM-07 | champion-card | 信息展示 | 头像+名称+角色+胜率 | P0 |
| UI-CM-08 | champion-card | 模式切换 | list/grid 模式布局不同 | P1 |
| UI-CM-09 | item-card | 装备展示 | 图标+名称+胜率 | P0 |
| UI-CM-10 | item-card | 详情弹框 | 点击显示 popup 详情 | P1 |
| UI-CM-11 | loading-skeleton | 骨架屏动画 | animated=true 时显示脉冲动画 | P1 |
| UI-CM-12 | loading-skeleton | 类型切换 | avatar/list/card 不同类型布局 | P1 |

---

## D. 数据管道测试

### D.1 staticDataSync 数据同步

| 测试编号 | 测试项 | 验证方法 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| DP-SS-01 | 英雄静态数据完整性 | 同步后查询 champions 集合 | 包含 name, name_zh, title, roles, icon_url 字段 | P0 |
| DP-SS-02 | 海克斯静态数据完整性 | 同步后查询 augments 集合 | 包含 name, name_zh, rarity, icon_url, description_zh 字段 | P0 |
| DP-SS-03 | 装备静态数据完整性 | 同步后查询 items 集合 | 包含 name, name_zh, icon_url, category 字段 | P0 |
| DP-SS-04 | 版本记录正确性 | 同步后查询 patches 集合 | is_current=true 的记录存在且 version 格式正确 | P0 |
| DP-SS-05 | 中文名称验证 | 检查英雄 name_zh | 中文名称正确（如 "盖伦" 而非 "Garen"） | P1 |
| DP-SS-06 | 稀有度值域验证 | 检查 augments.rarity | 仅包含 prismatic/gold/silver 三个值 | P1 |
| DP-SS-07 | 幂等性验证 | 连续执行两次 staticDataSync | 数据不重复，_id 冲突时覆盖更新 | P1 |

### D.2 statsDataSync 数据同步

| 测试编号 | 测试项 | 验证方法 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| DP-ST-01 | champion_augments 数据完整性 | 同步后查询 | 包含 champion_id, augment_id, win_rate, pick_rate, sample_size, tier, patch_version | P0 |
| DP-ST-02 | champion_items 数据完整性 | 同步后查询 | 包含 champion_id, item_id, win_rate, pick_rate, sample_size, tier, slot, is_core | P0 |
| DP-ST-03 | augment_trios 数据完整性 | 同步后查询 | 包含 augment_ids(长度3), champion_id, win_rate, sample_size, tier | P0 |
| DP-ST-04 | augment_items 数据验证 | 同步后查询 augment_items 集合 | **预期：集合为空**（statsDataSync 未写入该集合） | P0 |
| DP-ST-05 | 数据一致性：样本量 | 检查所有统计数据记录 | sample_size >= 30（MIN_SAMPLE_SIZE） | P0 |
| DP-ST-06 | 数据一致性：胜率范围 | 检查所有胜率字段 | 10 <= win_rate <= 90（百分比值） | P0 |
| DP-ST-07 | 数据一致性：tier 计算 | 验证 tier 字段 | S(>=60)/A(>=55)/B(>=50)/C(>=45)/D(<45) | P1 |
| DP-ST-08 | 全局胜率更新验证 | 对比 champions 集合 win_rate | 与 champion_augments 加权平均一致 | P1 |
| DP-ST-09 | 海克斯全局胜率更新 | 对比 augments 集合 win_rate | 与 champion_augments 加权平均一致 | P1 |
| DP-ST-10 | 版本过滤 | 查询各集合 | 所有记录 patch_version 一致 | P1 |

### D.3 数据源降级测试

| 测试编号 | 测试项 | 模拟条件 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| DP-FL-01 | 主源失败降级 | iesdev API 超时 | 自动切换到 aramgg，日志记录 | P0 |
| DP-FL-02 | 双源失败降级 | iesdev + aramgg 超时 | 自动切换到 arammayhem | P1 |
| DP-FL-03 | 全源失败处理 | 三个源均超时 | 返回 code=2001，patches 标记 stale | P0 |
| DP-FL-04 | hextech.dtodo.cn 降级 | 该接口不可达 | staticDataSync 其他数据正常同步 | P1 |
| DP-FL-05 | 部分英雄请求失败 | 个别英雄 API 返回错误 | 跳过失败英雄，继续同步其他英雄 | P1 |

---

## E. 性能测试

### E.1 云函数性能

| 测试编号 | 测试项 | 指标 | 目标值 | 优先级 |
|---------|--------|------|-------|-------|
| PERF-01 | championList 响应时间 | P95 | < 500ms | P0 |
| PERF-02 | championDetail 响应时间 | P95 | < 1000ms（4 集合并行） | P0 |
| PERF-03 | augmentList 响应时间 | P95 | < 500ms | P0 |
| PERF-04 | augmentDetail 响应时间 | P95 | < 1000ms | P0 |
| PERF-05 | search 响应时间 | P95 | < 800ms（正则搜索） | P0 |
| PERF-06 | trioRank 响应时间 | P95 | < 800ms | P1 |
| PERF-07 | currentPatch 响应时间 | P95 | < 200ms | P1 |
| PERF-08 | staticDataSync 执行时间 | 总耗时 | < 120s（全量同步） | P1 |
| PERF-09 | statsDataSync 执行时间 | 总耗时 | < 300s（全量同步） | P1 |

### E.2 前端性能

| 测试编号 | 测试项 | 指标 | 目标值 | 优先级 |
|---------|--------|------|-------|-------|
| PERF-10 | 首页加载时间 | 首屏渲染 | < 2s（含网络请求） | P0 |
| PERF-11 | 列表页首屏 | 首屏渲染 | < 1.5s | P0 |
| PERF-12 | 详情页加载 | 首屏渲染 | < 2s | P0 |
| PERF-13 | 搜索防抖 | 输入响应 | 300ms 防抖，不卡顿 | P1 |
| PERF-14 | 分页加载 | 加载更多 | < 1s 加载完成，无白屏 | P1 |
| PERF-15 | 缓存命中 | 缓存读取 | < 10ms | P1 |
| PERF-16 | 缓存未命中 | 网络请求+渲染 | < 3s | P1 |

### E.3 数据库性能

| 测试编号 | 测试项 | 验证方法 | 预期结果 | 优先级 |
|---------|--------|---------|---------|-------|
| PERF-17 | 索引有效性 | 检查查询是否命中索引 | champions(patch_version, win_rate) 索引命中 | P1 |
| PERF-18 | 批量写入性能 | batchUpsert 20 条/批 | 单批写入 < 500ms | P1 |
| PERF-19 | 大集合查询性能 | champions 集合 170+ 条 | 分页查询 < 200ms | P1 |
| PERF-20 | 正则搜索性能 | search 正则匹配 | 单表搜索 < 500ms | P1 |

---

## 附录：测试环境要求

### 测试工具

| 工具 | 用途 |
|------|------|
| 微信开发者工具 | 小程序前端调试、云函数本地调试 |
| 云开发控制台 | 数据库管理、云函数日志查看 |
| Postman/curl | 云函数直接调用测试 |

### 测试数据准备

1. **静态数据**：执行 staticDataSync 确保 champions, augments, items, patches 集合有数据
2. **统计数据**：执行 statsDataSync 确保 champion_augments, champion_items, augment_trios 集合有数据
3. **Mock 数据**：使用 mock/data.js 中的 3 个英雄、5 个海克斯、5 个装备作为基本测试数据

### 测试账号

- 需一个有云开发权限的微信小程序测试账号
- 云环境 ID：需替换 `app.js` 中的 `'lol-hex-cloud'` 占位符为实际环境 ID

### 已知阻塞项

> **全部已修复！** 以下缺陷在 BUG-001~BUG-009 修复中已全部解决：
>
> 1. ~~**`sort_order` vs `order` 参数名不匹配**~~ — ✅ 已修复：前端统一使用 `order`
> 2. ~~**`champion_id` / `augment_id` 字符串 vs 数字类型不匹配**~~ — ✅ 已修复：前端 Number() 转换
> 3. ~~**`data.patch` vs `data.version` 字段名不匹配**~~ — ✅ 已修复：前端改为 `data.version`
> 4. ~~**augment_items 数据管道缺失**~~ — ✅ 已修复：statsDataSync 新增 augment_items 写入
> 5. ~~**cloud.js 缺少 itemList 封装**~~ — ✅ 已修复：已添加 `getItemList` 导出
