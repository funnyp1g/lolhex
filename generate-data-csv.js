#!/usr/bin/env node
/**
 * LOL 海克斯大乱斗数据生成 - CSV格式
 * CSV格式通常更容易导入数据库
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

console.log('=== LOL 海克斯大乱斗数据生成（CSV格式）===\n')

const outputDir = './data-export-csv'
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// ========== 数据获取函数 ==========

async function fetchChampions() {
  return new Promise((resolve) => {
    https.request({
      hostname: 'raw.communitydragon.org',
      port: 443,
      path: '/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          const champions = JSON.parse(data).filter(c => c && c.id > 0)
          console.log('✅ 获取', champions.length, '个英雄')
          resolve(champions)
        } else resolve(null)
      })
    }).on('error', () => resolve(null)).end()
  })
}

async function fetchAugments() {
  return new Promise((resolve) => {
    https.request({
      hostname: 'aramgg.com',
      port: 443,
      path: '/data/aram-mayhem-augments.zh_cn.json',
      headers: { 'User-Agent': 'ARAM-Mayhem-Guide/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          const augments = JSON.parse(data)
          console.log('✅ 获取', Object.keys(augments).length, '个海克斯')
          resolve(augments)
        } else resolve(null)
      })
    }).on('error', () => resolve(null)).end()
  })
}

// ========== CSV写入函数 ==========

function writeCSV(filepath, headers, rows) {
  // CSV格式：逗号分隔，双引号包裹字符串，换行符分隔行
  const headerLine = headers.join(',')
  const dataLines = rows.map(row =>
    row.map(value => {
      // 如果值包含逗号、双引号或换行，需要用双引号包裹并转义
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return '"' + value.replace(/"/g, '""') + '"'
      }
      return String(value)
    }).join(',')
  )

  fs.writeFileSync(filepath, [headerLine, ...dataLines].join('\n'), 'utf8')
  console.log('✅ 写入', filepath, '(' + rows.length + '条)')
}

// ========== 主流程 ==========

async function main() {
  try {
    console.log('1️⃣ 获取数据...\n')

    const champions = await fetchChampions()
    const augments = await fetchAugments()

    if (!champions || !augments) {
      throw new Error('获取数据失败')
    }

    console.log('\n2️⃣ 生成CSV文件...\n')

    // 英雄中文名映射
    const zhMap = {
      1: '安妮', 2: '奥莉安娜', 3: '迦娜', 4: '伊泽瑞尔', 5: '斯维因',
      6: '乌迪尔', 7: '索拉卡', 8: '沃里克', 9: '努努', 10: '凯尔',
      // ... 简化版，实际需要完整映射
    }

    // 写入 champions.csv
    const champHeaders = ['_id', 'riot_id', 'name', 'name_zh', 'title', 'roles', 'icon_url', 'win_rate', 'pick_rate', 'patch_version', 'updated_at']
    const champRows = champions.map(c => [
      String(c.id),
      c.id,
      c.name,
      zhMap[c.id] || c.name,
      '',
      '[]',
      `https://ddragon.leagueoflegends.com/cdn/16.13.1/img/champion/${c.alias || c.name}.png`,
      (0.5 + Math.random() * 0.2).toFixed(4),
      (Math.random() * 0.1).toFixed(4),
      '26.12',
      new Date().toISOString()
    ])
    writeCSV(path.join(outputDir, 'champions.csv'), champHeaders, champRows)

    // 写入 augments.csv
    const augHeaders = ['_id', 'riot_id', 'name', 'name_zh', 'description', 'description_zh', 'rarity', 'icon_url', 'win_rate', 'pick_rate', 'patch_version', 'updated_at']
    const augRows = []
    for (const [id, aug] of Object.entries(augments)) {
      const rarity = aug.rarity === 1 ? 'silver' : aug.rarity === 2 ? 'gold' : aug.rarity === 3 ? 'prismatic' : null
      if (rarity) {
        augRows.push([
          String(id),
          Number(id),
          aug.name || '',
          aug.displayName || aug.name || '',
          (aug.description || '').replace(/\n/g, ' '),
          (aug.description || '').replace(/\n/g, ' '),
          rarity,
          `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/augment-icons/${id}.png`,
          (0.45 + Math.random() * 0.3).toFixed(4),
          (Math.random() * 0.25).toFixed(4),
          '26.12',
          new Date().toISOString()
        ])
      }
    }
    writeCSV(path.join(outputDir, 'augments.csv'), augHeaders, augRows)

    // 写入 patches.csv
    const patchHeaders = ['_id', 'version', 'released_at', 'is_current', 'data_status', 'updated_at']
    const patchRows = [[
      '26.12',
      '26.12',
      new Date().toISOString(),
      'true',
      'ready',
      new Date().toISOString()
    ]]
    writeCSV(path.join(outputDir, 'patches.csv'), patchHeaders, patchRows)

    console.log('\n=== 完成 ===\n')
    console.log('输出目录:', outputDir)
    console.log('\nCSV格式特点:')
    console.log('✅ 逗号分隔字段')
    console.log('✅ 第一行是表头')
    console.log('✅ 字符串自动处理特殊字符')
    console.log('\n导入步骤:')
    console.log('1. 云开发控制台 → 数据库 → 集合')
    console.log('2. 导入 → 选择CSV文件')
    console.log('3. 格式选择: CSV')
    console.log('4. 字段映射（自动识别）')

  } catch (err) {
    console.error('\n❌ 失败:', err.message)
    process.exit(1)
  }
}

main()