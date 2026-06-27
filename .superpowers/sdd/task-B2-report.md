# Task B2 Report: champion-card list mode T-tier column

## Status: COMPLETE

## What was implemented

### 1. champion-card.js -- Added new properties
- `showTierRank` (Boolean, default `false`): controls whether the T-tier badge is shown in list mode
- `tierRank` (String, default `''`): allows directly passing a T-tier value (e.g. "T1"-"T5"), used as fallback when `champion.tier_rank` is not available

### 2. champion-card.wxml -- Inserted T-tier badge in list mode
- Added `<tier-badge>` component in the title row, before the champion name text
- Conditional rendering: `wx:if="{{showTierRank && (champion.tier_rank || tierRank)}}"`
- Uses `mode="T"` to render T1-T5 labels with corresponding colors
- Uses `size="small"` for compact inline display
- Falls back from `champion.tier_rank` to the `tierRank` property

### 3. champion-card.wxss -- Added list row layout class
- Added `.champion-list-row` class with flexbox layout (`display: flex; align-items: center; gap: 8px`) for the T-badge + avatar + info horizontal row pattern

## Files modified
| File | Change |
|------|--------|
| `miniprogram/components/champion-card/champion-card.js` | Added `showTierRank` and `tierRank` properties |
| `miniprogram/components/champion-card/champion-card.wxml` | Added tier-badge with `mode="T"` in list mode title row |
| `miniprogram/components/champion-card/champion-card.wxss` | Added `.champion-list-row` layout class |

## Dependencies
- Depends on Task B1 (tier-badge mode="T" support) -- already completed
- The tier-badge component already has `mode: 'T'` with T1-T5 config mapping

## Concerns
- None. Implementation is straightforward property additions and template adjustment.
- The `.champion-list-row` CSS class is defined but not yet used as a wrapper class on any element -- it is available for future use when the list card layout is restructured to wrap the T-badge, avatar, and body in a dedicated row container.

## Usage
```html
<!-- In a page using champion-card in list mode with T-tier display -->
<champion-card
  champion="{{item}}"
  mode="list"
  showTierRank="{{true}}"
/>
```
The component will read `champion.tier_rank` (expected from cloud function responses like `championRankTable`) and render a T1-T5 colored badge before the champion name.

## Commits
No commits made (working tree changes not yet committed).
