#!/usr/bin/env node
/**
 * LOL 海克斯大乱斗数据生成脚本 - JSON Lines格式
 * 微信云数据库导入要求：每行一个JSON对象，不带数组包裹
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

console.log('=== LOL 海克斯大乱斗数据生成（JSON Lines格式）===\n')

const outputDir = './data-export-jsonlines'
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// ========== 获取数据函数 ==========

async function fetchChampions() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'raw.communitydragon.org',
      port: 443,
      path: '/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
      method: 'GET',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const champions = JSON.parse(data)
            console.log('✅ 获取', champions.length, '个英雄')
            resolve(champions.filter(c => c && c.id > 0))
          } catch (e) {
            resolve(null)
          }
        } else resolve(null)
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

async function fetchAugments() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'aramgg.com',
      port: 443,
      path: '/data/aram-mayhem-augments.zh_cn.json',
      method: 'GET',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const augments = JSON.parse(data)
            console.log('✅ 获取', Object.keys(augments).length, '个海克斯')
            resolve(augments)
          } catch (e) {
            resolve(null)
          }
        } else resolve(null)
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

// ========== 转换为数据库格式 ==========

function convertChampions(champions) {
  // 英雄中文名映射（内嵌）
  const zhMap = {
    1: '安妮', 2: '奥莉安娜', 3: '迦娜', 4: '伊泽瑞尔', 5: '斯维因',
    6: '乌迪尔', 7: '索拉卡', 8: '沃里克', 9: '努努', 10: '凯尔',
    11: '易大师', 12: '阿利斯塔', 13: '瑞兹', 14: '辛德拉', 15: '菲奥娜',
    16: '艾尼维亚', 17: '纳瑟斯', 18: '妮蔻', 19: '魔腾', 20: '奈德丽',
    21: '阿什', 22: '齐天大圣', 23: '凯隐', 24: '奥恩', 25: '齐勒斯',
    26: '薇', 27: '莫甘娜', 28: '厄运小姐', 29: '特朗德尔', 30: '卡萨丁',
    31: '卡莎', 32: '厄加特', 33: '卡莎佩雅', 34: '艾克', 35: '扎克',
    36: '莫德凯撒', 37: '塞恩', 38: '亚索', 39: '蔚', 40: '辛吉德',
    41: '奥拉夫', 42: '费德提克', 43: '卡尔玛', 44: '塔姆', 45: '雷克塞',
    46: '艾瑞莉娅', 47: '拉莫斯', 48: '阿兹尔', 49: '布兰德', 50: '维迦',
    51: '凯特琳', 52: '布莱克', 53: '德莱厄斯', 54: '吉格斯', 55: '雷恩加尔',
    56: '纳尔', 57: '潘森', 58: '菲兹', 59: '沃利贝尔', 60: '雷文',
    61: '卡西奥佩雅', 62: '斯派克', 63: '卢锡安', 64: '崔斯特', 65: '奎因',
    66: '玛尔扎哈', 67: '阿卡丽', 68: '塔莉垭', 69: '泰隆', 70: '卡特琳娜',
    71: '尤米', 72: '扎雅', 73: '诺提勒斯', 74: '黑默丁格', 75: '希瓦娜',
    76: '萨科', 77: '阿木木', 78: '波比', 79: '库奇', 80: '盖伦',
    81: '泰达米尔', 82: '杰斯', 83: '塞拉斯', 84: '塞韦恩', 85: '本利',
    86: '加里奥', 87: '拉克丝', 88: '卡密尔', 89: '伊芙琳', 90: '悠米',
    91: '卡莉斯塔', 92: '金克丝', 93: '辛吉德', 94: '黛安娜', 95: '玛尔扎哈',
    96: '克烈', 97: '泽拉斯', 98: '妮可', 99: '维克托', 100: '瑟提',
    101: '阿狸', 102: '莉莉娅', 103: '萨姆拉', 104: '格温', 105: '永恩',
    106: '阿克尚', 107: '薇古丝', 108: '尼达菲', 109: '米莉欧', 110: '祖尔',
    111: '萨勒芬妮', 112: '阿克塞', 113: '芙蕾雅', 114: '娜菲', 115: '蕾尔',
    116: '奎萨', 117: '维尔戈兹', 118: '桑卓', 119: '奥恩', 120: '克劳德',
    121: '约里克', 122: '特朗德尔', 123: '葛温', 124: '阿克尚', 125: '薇古丝',
    126: '本利', 127: '库奇', 128: '杰斯', 129: '雷文', 130: '费德提克',
    131: '崔斯特', 132: '黛安娜', 133: '布兰德', 134: '希瓦娜', 135: '塞韦恩',
    136: '伊芙琳', 137: '拉克丝', 138: '加里奥', 139: '悠米', 140: '盖伦',
    141: '卡密尔', 142: '泰达米尔', 143: '阿木木', 144: '波比', 145: '萨科',
    146: '库奇', 147: '本利', 148: '塞拉斯', 149: '拉克丝', 150: '黛安娜',
    151: '薇', 152: '金克丝', 153: '阿狸', 154: '悠米', 155: '阿卡丽',
    156: '诺提勒斯', 157: '卡西奥佩雅', 158: '维克托', 159: '辛吉德', 160: '玛尔扎哈',
    161: '克烈', 162: '莉莉娅', 163: '萨姆拉', 164: '格温', 165: '永恩',
    166: '阿克尚', 167: '薇古丝', 168: '尼达菲', 169: '米莉欧', 170: '祖尔'
  }

  return champions.map(c => ({
    _id: String(c.id),
    riot_id: c.id,
    name: c.name,
    name_zh: zhMap[c.id] || c.name,
    title: '',
    roles: [],
    icon_url: `https://ddragon.leagueoflegends.com/cdn/16.13.1/img/champion/${c.alias || c.name}.png`,
    win_rate: 0.5 + Math.random() * 0.2,  // 50%-70%
    pick_rate: Math.random() * 0.1,  // 0%-10%
    patch_version: '26.12',
    updated_at: new Date().toISOString()
  }))
}

function convertAugments(augments) {
  const dbData = []

  for (const [id, aug] of Object.entries(augments)) {
    const rarity = aug.rarity === 1 ? 'silver' : aug.rarity === 2 ? 'gold' : aug.rarity === 3 ? 'prismatic' : null

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
        win_rate: 0.45 + Math.random() * 0.3,  // 45%-75%
        pick_rate: Math.random() * 0.25,  // 0%-25%
        patch_version: '26.12',
        updated_at: new Date().toISOString()
      })
    }
  }

  return dbData
}

function generateStats(champions, augments) {
  const championAugments = []

  champions.forEach(champ => {
    augments.forEach(aug => {
      const winRate = 0.45 + Math.random() * 0.3  // 45%-75%
      const pickRate = Math.random() * 0.25  // 0%-25%
      const sampleSize = Math.floor(Math.random() * 10000) + 100  // 100-10000

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
  })

  return championAugments
}

// ========== 写入JSON Lines格式文件 ==========

function writeJsonLines(filepath, dataArray) {
  // 每行一个JSON对象，不带数组包裹
  const lines = dataArray.map(obj => JSON.stringify(obj))
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8')
  console.log('✅ 写入', filepath, '(' + dataArray.length + '条)')
}

// ========== 主流程 ==========

async function main() {
  try {
    console.log('1️⃣ 获取数据...\n')

    const champions = await fetchChampions()
    if (!champions) throw new Error('获取英雄失败')

    const augments = await fetchAugments()
    if (!augments) throw new Error('获取海克斯失败')

    console.log('\n2️⃣ 转换数据格式...\n')

    const championsData = convertChampions(champions)
    const augmentsData = convertAugments(augments)
    const statsData = generateStats(championsData, augmentsData)

    console.log('✅ 转换完成:')
    console.log('   - 英雄:', championsData.length, '条')
    console.log('   - 海克斯:', augmentsData.length, '条')
    console.log('   - 统计:', statsData.length, '条')

    console.log('\n3️⃣ 写入JSON Lines文件...\n')

    writeJsonLines(path.join(outputDir, 'champions.json'), championsData)
    writeJsonLines(path.join(outputDir, 'augments.json'), augmentsData)
    writeJsonLines(path.join(outputDir, 'champion_augments.json'), statsData)

    // patches集合
    const patchesData = [{
      _id: '26.12',
      version: '26.12',
      released_at: new Date().toISOString(),
      is_current: true,
      data_status: 'ready',
      updated_at: new Date().toISOString()
    }]
    writeJsonLines(path.join(outputDir, 'patches.json'), patchesData)

    console.log('\n=== 完成 ===\n')
    console.log('输出目录:', outputDir)
    console.log('\n文件格式: JSON Lines（每行一个JSON对象）')
    console.log('✅ 可直接导入微信云数据库')
    console.log('\n下一步:')
    console.log('1. 云开发控制台 → 数据库 → 集合')
    console.log('2. 导入 → 选择JSON文件')
    console.log('3. 格式选择: JSON Lines')
    console.log('4. 点击导入')

  } catch (err) {
    console.error('\n❌ 失败:', err.message)
    process.exit(1)
  }
}

main()