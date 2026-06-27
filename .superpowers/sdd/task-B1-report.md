# Task B1 Report: tier-badge 新增 T 模式

## What was implemented

Modified the `tier-badge` component to support a new `mode` property with two values:

- **`'default'`** (default): renders S/A/B/C/D tier badges -- the existing behavior, fully backward compatible
- **`'T'`**: renders T1/T2/T3/T4/T5 tier badges with the specified colors

### Changes made

**`miniprogram/components/tier-badge/tier-badge.js`**
- Added `mode` property (type String, default `'default'`)
- Renamed `data.tierConfig` to `data.defaultConfig` (same S/A/B/C/D values)
- Added `data.TConfig` with T1-T5 entries:
  - T1: `#FF4D4F` (red)
  - T2: `#FA8C16` (orange)
  - T3: `#FADB14` (yellow, dark text)
  - T4: `#52C41A` (green)
  - T5: `#8C8C8C` (gray)
- Added `data.currentConfig` (populated by observer)
- Added `observers` block watching `'mode, tier'` to dynamically set `currentConfig` to either `TConfig` or `defaultConfig`

**`miniprogram/components/tier-badge/tier-badge.wxml`**
- Changed style binding from `tierConfig[tier]` to `currentConfig[tier]`
- Changed display text from `{{tier}}` to `{{currentConfig[tier].label || tier}}`

### Backward compatibility

Existing usages (champion-detail, augment-card, combo page, etc.) only pass `tier` and `size` properties. Since `mode` defaults to `'default'`, the observer selects `defaultConfig` as `currentConfig`, and behavior is identical to before. No existing callers were modified.

## Status

**DONE**

## Concerns

- The WXSS file was listed in the plan's "Files" header but had no specific CSS changes in the task steps. No WXSS modifications were made -- the existing styles apply correctly to both modes since they use the same class structure and only the inline `style` attributes change.
- The observer fires on both `mode` and `tier` changes. In practice `mode` rarely changes (it's set once per usage), but the `tier` change trigger is harmless -- it just re-sets the same config reference.

## Commits made

```
b8a5358 feat: tier-badge 新增 mode='T' 支持 T1-T5 层级显示
```

Files changed:
- `miniprogram/components/tier-badge/tier-badge.js` (+21/-2)
- `miniprogram/components/tier-badge/tier-badge.wxml` (+2/-1)
