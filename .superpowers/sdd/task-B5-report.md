# Task B5: stage-bar 组件 — 完成报告

**状态**: 完成
**日期**: 2026-06-27

## 创建的文件

| 文件 | 路径 |
|------|------|
| stage-bar.json | `miniprogram/components/stage-bar/stage-bar.json` |
| stage-bar.js | `miniprogram/components/stage-bar/stage-bar.js` |
| stage-bar.wxml | `miniprogram/components/stage-bar/stage-bar.wxml` |
| stage-bar.wxss | `miniprogram/components/stage-bar/stage-bar.wxss` |

## 组件接口

### Properties
- `stages` (Object, default `{}`): 阶段数据，格式 `{ 3: { win_rate: 52.5 }, 7: { win_rate: 54.1 }, 11: { win_rate: 50.3 }, 15: { win_rate: 48.7 } }`
- `title` (String, default `'各阶段表现'`): 图表标题

### Data
- `stageLabels`: `{ 3: 'Lv.3', 7: 'Lv.7', 11: 'Lv.11', 15: 'Lv.15' }`
- `stageOrder`: `[3, 7, 11, 15]`

### Methods
- `getBarHeight(winRate)`: 胜率映射为柱高 (8px–120px)
- `getBarColor(winRate)`: 胜率映射为渐变颜色 (红/橙/黄/灰)

## 功能要点

1. **4柱柱状图**: 按 stageOrder [3, 7, 11, 15] 渲染4列
2. **数值显示**: 每柱顶部显示 `win_rate%`
3. **柱高比例**: 柱高与胜率成正比例 (`win_rate * 1.2` px)
4. **颜色渐变**: 蓝色渐变 `linear-gradient(180deg, #1890FF, #40a9ff)`
5. **空状态降级**: stages 为空时显示 "该维度数据采集中..."
6. **动画过渡**: 柱高变化有 0.5s ease 过渡

## 样式规格

- 容器: 白色背景, 8px圆角, 16px内边距
- 图表区: flex横向布局, 180px高度, 柱底对齐
- 柱宽: 36px, 顶部圆角 4px, 最小高度 8px
- 数值文字: 12px, 加粗600, 深色 #262626
- 标签文字: 11px, 灰色 #8c8c8c

## 使用方式

```html
<stage-bar
  stages="{{stagePerformanceByAugment[selectedAugmentId]}}"
  title="各阶段表现"
/>
```

其中 `stages` 数据来源于 `championDetail` 云函数返回的 `stage_performance` 数组，经前端按 `augment_id` 分组后传入。
