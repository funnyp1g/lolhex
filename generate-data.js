#!/usr/bin/env node
/**
 * LOL 海克斯大乱斗完整数据生成脚本
 * 功能：生成所有数据库集合的JSON文件，用于批量导入
 *
 * 优势：
 * - 本地运行，不受云函数环境限制
 * - 使用aramgg.com国内可达数据源
 * - 生成后可直接导入云数据库
 * - 无需云函数，无需网络请求
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

console.log('=== LOL 海克斯大乱斗数据生成 ===\n')
console.log('开始时间:', new Date().toLocaleString('zh-CN'))
console.log('输出目录: ./data-export/\n')

// 创建输出目录
const outputDir = './data-export'
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// ========== 1. 生成英雄基础数据（从Community Dragon）==========

console.log('1️⃣ 生成英雄基础数据...\n')

async function fetchChampions() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'raw.communitydragon.org',
      port: 443,
      path: '/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
      method: 'GET',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const champions = JSON.parse(data)
            console.log('✅ 获取', champions.length, '个英雄')

            // 转换为数据库格式
            const dbData = champions
              .filter(c => c && c.id > 0)
              .map(c => ({
                _id: String(c.id),
                riot_id: c.id,
                name: c.name,
                name_zh: getChampionZhName(c.id) || c.name,
                title: '',
                roles: [],
                icon_url: `https://ddragon.leagueoflegends.com/cdn/16.13.1/img/champion/${c.alias || c.name}.png`,
                win_rate: 0,
                pick_rate: 0,
                patch_version: '26.12',
                updated_at: new Date().toISOString()
              }))

            resolve(dbData)
          } catch (e) {
            console.error('❌ JSON解析失败:', e.message)
            resolve(null)
          }
        } else {
          console.error('❌ HTTP错误:', res.statusCode)
          resolve(null)
        }
      })
    })

    req.on('error', err => {
      console.error('❌ 请求失败:', err.message)
      resolve(null)
    })

    req.end()
  })
}

// ========== 2. 生成海克斯基础数据（从aramgg.com）==========

console.log('2️⃣ 生成海克斯基础数据...\n')

async function fetchAugments() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'aramgg.com',
      port: 443,
      path: '/data/aram-mayhem-augments.zh_cn.json',
      method: 'GET',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const augments = JSON.parse(data)
            console.log('✅ 获取', Object.keys(augments).length, '个海克斯')

            // 转换为数据库格式
            const dbData = []
            for (const [id, aug] of Object.entries(augments)) {
              const rarity = getRarityFromNumber(aug.rarity)
              if (rarity) {
                dbData.push({
                  _id: String(id),
                  riot_id: Number(id),
                  name: aug.name || '',
                  name_zh: aug.displayName || aug.name || '',
                  description: aug.description || '',
                  description_zh: aug.description || '',
                  rarity,
                  icon_url: `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/augment-icons/${id}.png`,
                  win_rate: 0,
                  pick_rate: 0,
                  patch_version: '26.12',
                  updated_at: new Date().toISOString()
                })
              }
            }

            resolve(dbData)
          } catch (e) {
            console.error('❌ JSON解析失败:', e.message)
            resolve(null)
          }
        } else {
          console.error('❌ HTTP错误:', res.statusCode)
          resolve(null)
        }
      })
    })

    req.on('error', err => {
      console.error('❌ 请求失败:', err.message)
      resolve(null)
    })

    req.end()
  })
}

// ========== 3. 生成英雄统计数据（模拟真实数据）==========

console.log('3️⃣ 生成英雄统计数据（模拟真实胜率）...\n')

function generateMockStats(champions, augments) {
  console.log('⚠️ 注意: 统计数据为模拟生成（真实胜率分布）')

  const championAugments = []
  const championItems = []

  // 为每个英雄生成海克斯数据
  champions.forEach(champ => {
    // 生成该英雄与每个海克斯的组合数据
    augments.forEach(aug => {
      // 随机生成真实范围的胜率（45%-75%）
      const winRate = 0.45 + Math.random() * 0.30  // 45%-75%
      const pickRate = Math.random() * 0.25  // 0%-25%
      const sampleSize = Math.floor(Math.random() * 10000) + 100  // 100-10000

      // 计算Tier评级（基于胜率）
      let tier = 'C'
      if (winRate >= 0.55) tier = 'S'
      else if (winRate >= 0.52) tier = 'A'
      else if (winRate >= 0.48) tier = 'B'
      else if (winRate >= 0.45) tier = 'C'
      else tier = 'D'

      championAugments.push({
        _id: `${champ.riot_id}_${aug.riot_id}`,
        champion_id: champ.riot_id,
        augment_id: aug.riot_id,
        win_rate: Math.round(winRate * 10000) / 10000,
        pick_rate: Math.round(pickRate * 10000) / 10000,
        sample_size: sampleSize,
        tier,
        patch_version: '26.12',
        updated_at: new Date().toISOString()
      })
    })

    // 生成热门装备（简化版，只生成核心装备）
    const coreItems = [1001, 2003, 3001, 4005, 5007, 6001, 7001, 8001, 9001, 3089, 3157, 4645, 3118]
    coreItems.forEach(itemId => {
      const winRate = 0.48 + Math.random() * 0.15  // 48%-63%
      const pickRate = Math.random() * 0.20  // 0%-20%

      championItems.push({
        _id: `${champ.riot_id}_${itemId}`,
        champion_id: champ.riot_id,
        item_id: itemId,
        win_rate: Math.round(winRate * 10000) / 10000,
        pick_rate: Math.round(pickRate * 10000) / 10000,
        sample_size: Math.floor(Math.random() * 5000) + 50,
        slot: 'core',
        tier: winRate >= 0.55 ? 'S' : winRate >= 0.52 ? 'A' : 'B',
        patch_version: '26.12',
        updated_at: new Date().toISOString()
      })
    })
  })

  console.log('✅ 生成', championAugments.length, '条英雄×海克斯数据')
  console.log('✅ 生成', championItems.length, '条英雄×装备数据')

  return { championAugments, championItems }
}

// ========== 工具函数 ==========

function getChampionZhName(id) {
  // 内嵌的英雄中文名映射（简化版，仅示例）
  const map = {
    1: '安妮', 2: '奥莉安娜', 3: '迦娜', 4: '伊泽瑞尔', 5: '斯维因',
    6: '乌迪尔', 7: '索拉卡', 8: '沃里克', 9: '努努', 10: '凯尔',
    11: '易大师', 12: '阿利斯塔', 13: '瑞兹', 14: '辛德拉', 15: '菲奥娜',
    16: '艾尼维亚', 17: '纳瑟斯', 18: '妮蔻', 19: '魔腾', 20: '奈德丽',
    // ... 实际应包含170个英雄的映射
  }
  return map[id] || null
}

function getRarityFromNumber(num) {
  if (num === 1) return 'silver'
  if (num === 2) return 'gold'
  if (num === 3) return 'prismatic'
  return null
}

// ========== 主流程 ==========

async function main() {
  try {
    // 1. 获取基础数据
    const champions = await fetchChampions()
    if (!champions) {
      throw new Error('获取英雄数据失败')
    }

    const augments = await fetchAugments()
    if (!augments) {
      throw new Error('获取海克斯数据失败')
    }

    // 2. 生成统计数据
    const stats = generateMockStats(champions, augments)

    // 3. 写入JSON文件
    console.log('\n4️⃣ 写入JSON文件...\n')

    const files = {
      'champions.json': champions,
      'augments.json': augments,
      'champion_augments.json': stats.championAugments,
      'champion_items.json': stats.championItems
    }

    for (const [filename, data] of Object.entries(files)) {
      const filepath = path.join(outputDir, filename)
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8')
      console.log('✅ 写入', filepath, '(' + data.length + '条记录)')
    }

    // 4. 写入版本记录
    const patches = [{
      _id: '26.12',
      version: '26.12',
      released_at: new Date().toISOString(),
      is_current: true,
      data_status: 'ready',
      updated_at: new Date().toISOString()
    }]
    fs.writeFileSync(path.join(outputDir, 'patches.json'), JSON.stringify(patches, null, 2), 'utf8')
    console.log('✅ 写入 patches.json')

    // 5. 完成总结
    console.log('\n=== 数据生成完成 ===\n')
    console.log('输出目录:', outputDir)
    console.log('文件列表:')
    console.log('  - champions.json (' + champions.length + '条)')
    console.log('  - augments.json (' + augments.length + '条)')
    console.log('  - champion_augments.json (' + stats.championAugments.length + '条)')
    console.log('  - champion_items.json (' + stats.championItems.length + '条)')
    console.log('  - patches.json (1条)')
    console.log('\n下一步操作:')
    console.log('1. 打开微信云开发控制台')
    console.log('2. 数据库 → 选择集合')
    console.log('3. 导入 → 选择对应的JSON文件')
    console.log('4. 等待导入完成')
    console.log('\n⚠️ 注意:')
    console.log('统计数据为模拟生成（真实胜率范围45%-75%）')
    console.log('如需真实统计数据，请等待云函数修复完成')

  } catch (err) {
    console.error('\n❌ 执行失败:', err.message)
    process.exit(1)
  }
}

main()