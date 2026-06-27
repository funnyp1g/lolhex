# Task A5 Report — cloud.js 新增 championRankTable 封装

**File modified:** `miniprogram/utils/cloud.js`

**Change made:** Added one line to the `module.exports` object:

```javascript
getChampionRankTable: (params) => callFunction('championRankTable', params),
```

This exposes the `championRankTable` cloud function through the existing `wx.cloud.callFunction` wrapper, consistent with the existing pattern used for all other cloud functions (`getChampionList`, `getChampionDetail`, `getAugmentList`, etc.).

**File now contains 13 methods in module.exports:**
1. `getChampionList`
2. `getChampionDetail`
3. `getAugmentList`
4. `getAugmentDetail`
5. `search`
6. `getTrioRank`
7. `getCurrentPatch`
8. `getItemList`
9. `getChampionRankTable` (new)

**Status:** Completed.
