# Task B4 Report: 新增 rank-table 组件（首页英雄排行表）

**Status:** COMPLETED
**Date:** 2026-06-27

## Files Created

| File | Path |
|------|------|
| rank-table.json | `miniprogram/components/rank-table/rank-table.json` |
| rank-table.js | `miniprogram/components/rank-table/rank-table.js` |
| rank-table.wxml | `miniprogram/components/rank-table/rank-table.wxml` |
| rank-table.wxss | `miniprogram/components/rank-table/rank-table.wxss` |

## Component Overview

A 5-column data table component for displaying champion win-rate rankings, modeled after aramgg.com's homepage leaderboard layout. Columns: T级 (Tier), 英雄 (Champion), 胜率 (Win Rate), 选取率 (Pick Rate), 样本 (Sample Size).

## Implementation Details

### rank-table.json
Registers three child components:
- `tier-badge` (T1-T5 tier badge display with `mode="T"`)
- `van-loading` (Vant Weapp loading spinner)
- `van-empty` (Vant Weapp empty/error state)

### rank-table.js
- **Properties:** `list` (Array), `loading` (Boolean), `error` (Boolean), `hasMore` (Boolean), `sortBy` (String, default 'win_rate'), `sortOrder` (String, default 'desc')
- **Imports:** `ROLE_COLORS` from `../../utils/constants`, `formatWinRate` and `formatSampleSize` from `../../utils/format`
- **Methods:**
  - `onRowTap(e)` -- triggers `click` event with `{ championId }`
  - `onSortTap(e)` -- triggers `sort` event with `{ sortBy, order }`; toggles asc/desc on the same column
  - `onScrollToLower()` -- triggers `loadmore` event when `hasMore` is true and not currently loading
- **Data:** Column definition array with keys, labels, widths, and sortable flags

### rank-table.wxml
- Sticky header row with sort indicators (arrow up/down)
- Three stateful sections via `wx:if`/`wx:elif`:
  - Loading state: centered spinner + "加载中..." text (when `loading && list.length === 0`)
  - Error state: `van-empty` with "数据加载失败"
  - Empty state: `van-empty` with "暂无数据"
- Data rows inside `scroll-view` with `bindscrolltolower`
  - T级 column: `tier-badge` with `mode="T"` and `size="small"`
  - Champion column: circular 36px icon + name text
  - Win rate column: color-coded (`stat-high` red >=55%, `stat-mid` orange >=50%)
  - Pick rate and sample size columns: secondary styled
- Footer: "加载更多" spinner or "已加载全部" when no more data

### rank-table.wxss
- Container: white background, 8px border-radius
- Header: flex layout, sticky positioned, light gray background
- Body: max-height 600rpx with vertical scroll
- Striped rows: `row-even` class with `#fafbfc` background
- Active state: `#f0f0f0` on tap
- Stat values: bold 14px, with red/orange color coding for high/mid win rates
- Loading/error/empty states: centered flex-column with padding

## Dependencies
- Requires `tier-badge` component with `mode="T"` support (Task B1 -- already completed)
- Requires `van-loading` and `van-empty` from `@vant/weapp` (already in project)
- Requires `format.js` utilities (already in project at `miniprogram/utils/format.js`)

## Verification
- All 4 files confirmed on disk via glob check
- ES5-compatible syntax (uses `var` + `function` declarations, compatible with WeChat mini-program runtime)
- Component paths reference existing components correctly
- Import paths validated against existing project structure
