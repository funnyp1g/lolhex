// utils/constants.js - Constants and configuration

// ===== Tier Colors Mapping =====
const TIER_COLORS = {
  S: '#e6a817',
  A: '#f5a623',
  B: '#1890ff',
  C: '#52c41a',
  D: '#8c8c8c'
}

const TIER_BG_COLORS = {
  S: '#fff8e1',
  A: '#fff3e0',
  B: '#e6f7ff',
  C: '#f0fff0',
  D: '#f0f0f0'
}

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D']

// ===== Augment Rarity =====
const RARITY = {
  PRISMATIC: 'prismatic',
  GOLD: 'gold',
  SILVER: 'silver'
}

const RARITY_COLORS = {
  prismatic: '#e6a817',
  gold: '#f5a623',
  silver: '#8c8c8c'
}

const RARITY_BG_COLORS = {
  prismatic: '#fff8e1',
  gold: '#fff3e0',
  silver: '#f0f0f0'
}

const RARITY_LABELS = {
  prismatic: '棱彩级',
  gold: '黄金级',
  silver: '白银级'
}

const RARITY_ICONS = {
  prismatic: '💎',
  gold: '🥇',
  silver: '🥈'
}

// ===== Champion Roles =====
const CHAMPION_ROLES = {
  TANK: '坦克',
  FIGHTER: '战士',
  MAGE: '法师',
  ASSASSIN: '刺客',
  MARKSMAN: '射手',
  SUPPORT: '辅助'
}

const ROLE_COLORS = {
  '坦克': '#8c8c8c',
  '战士': '#f5222d',
  '法师': '#1890ff',
  '刺客': '#722ed1',
  '射手': '#faad14',
  '辅助': '#52c41a'
}

// ===== Item Slots =====
const ITEM_SLOTS = {
  CORE: 'core',
  BOOTS: 'boots',
  FULL_BUILD: 'full_build'
}

const ITEM_SLOT_LABELS = {
  core: '核心装',
  boots: '鞋子',
  full_build: '神装'
}

// ===== Sort Options =====
const SORT_OPTIONS = {
  WIN_RATE: 'win_rate',
  PICK_RATE: 'pick_rate',
  SAMPLE_SIZE: 'sample_size'
}

const SORT_LABELS = {
  win_rate: '胜率',
  pick_rate: '选取率',
  sample_size: '热度'
}

// ===== API Endpoints (for cloud function reference) =====
const API_ENDPOINTS = {
  DATA_DRAGON: 'https://ddragon.leagueoflegends.com',
  COMMUNITY_DRAGON: 'https://raw.communitydragon.org/latest',
  BLITZ_API: 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol',
  HEXTECH_CN: 'https://hextech.dtodo.cn/data',
  UTILS_IESDEV: 'https://utils.iesdev.com/static/json/lol/mayham'
}

// ===== Cache Keys =====
const CACHE_KEYS = {
  CURRENT_PATCH: 'current_patch',
  CHAMPION_LIST: 'champion_list',
  AUGMENT_LIST: 'augment_list',
  ITEM_LIST: 'item_list',
  SEARCH_HISTORY: 'search_history'
}

// ===== Cache TTL (seconds) =====
const CACHE_TTL = {
  PATCH: 86400,         // 24 hours
  CHAMPION_LIST: 3600,  // 1 hour
  AUGMENT_LIST: 3600,   // 1 hour
  ITEM_LIST: 86400,     // 24 hours (rarely changes)
  DETAIL: 1800,         // 30 minutes
  SEARCH_HISTORY: 0     // No expiry (manual clear)
}

// ===== Pagination =====
const PAGE_SIZE = 20

// ===== Search =====
const MAX_SEARCH_HISTORY = 10

module.exports = {
  TIER_COLORS,
  TIER_BG_COLORS,
  TIER_ORDER,
  RARITY,
  RARITY_COLORS,
  RARITY_BG_COLORS,
  RARITY_LABELS,
  RARITY_ICONS,
  CHAMPION_ROLES,
  ROLE_COLORS,
  ITEM_SLOTS,
  ITEM_SLOT_LABELS,
  SORT_OPTIONS,
  SORT_LABELS,
  API_ENDPOINTS,
  CACHE_KEYS,
  CACHE_TTL,
  PAGE_SIZE,
  MAX_SEARCH_HISTORY
}
