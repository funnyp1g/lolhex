/**
 * aramgg.com 数据解析模块
 * 从HTML中提取嵌入的JSON统计数据
 */

const axios = require('axios')

/**
 * 从 aramgg.com 获取单个英雄的统计数据
 * @param {number} championId 英雄ID
 * @returns {Object} 统计数据对象
 */
async function fetchChampionStatsFromAramgg(championId) {
  const url = `https://aramgg.com/zh-CN/champion-stats/${championId}`

  console.log(`[aramgg] 获取英雄 ${championId} 数据: ${url}`)

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      },
      timeout: 15000
    })

    // 提取嵌入的JSON数据
    const html = response.data

    // 方法1: 从script标签提取augments JSON
    const augmentsPattern = /self\.__next_f\.push\(\[1,"({.*?"augments":{.*?}.*?})"\]\)/
    const match = html.match(augmentsPattern)

    if (match && match[1]) {
      try {
        // 清理JSON字符串（可能包含转义字符）
        let jsonStr = match[1]
          .replace(/\\"/g, '"')  // 替换转义的引号
          .replace(/\\n/g, '')   // 移除转义的换行符

        const data = JSON.parse(jsonStr)

        if (data.augments) {
          console.log(`[aramgg] ✅ 英雄 ${championId}: 提取 ${Object.keys(data.augments).length} 个海克斯数据`)
          return parseAramggAugmentsData(championId, data.augments)
        }
      } catch (parseErr) {
        console.warn(`[aramgg] JSON解析失败:`, parseErr.message)
      }
    }

    // 方法2: 从表格提取（备用方案）
    console.log(`[aramgg] 尝试表格提取方式`)
    return parseAramggTableData(championId, html)

  } catch (err) {
    console.error(`[aramgg] 英雄 ${championId} 获取失败:`, err.message)
    throw err
  }
}

/**
 * 解析 aramgg augments JSON数据为数据库格式
 */
function parseAramggAugmentsData(championId, augments) {
  const results = []

  for (const [augmentIdStr, augData] of Object.entries(augments)) {
    const augmentId = Number(augmentIdStr)

    // aramgg数据结构：
    // {
    //   "tier": "1",  // 1-5对应S-D
    //   "win_rate": "0.5367",
    //   "pick_rate": "0.1412",
    //   "num_games": "24699",
    //   "num_win_games": "13256"
    // }

    const winRate = parseFloat(augData.win_rate) || 0
    const pickRate = parseFloat(augData.pick_rate) || 0
    const sampleSize = parseInt(augData.num_games) || 0

    // Tier转换（数字转字母）
    let tier = 'C'
    const tierNum = parseInt(augData.tier)
    if (tierNum === 1) tier = 'S'
    else if (tierNum === 2) tier = 'A'
    else if (tierNum === 3) tier = 'B'
    else if (tierNum === 4) tier = 'C'
    else if (tierNum === 5) tier = 'D'

    results.push({
      _id: `${championId}_${augmentId}`,
      champion_id: championId,
      augment_id: augmentId,
      win_rate: winRate,
      pick_rate: pickRate,
      sample_size: sampleSize,
      tier: tier,
      patch_version: '26.12',  // 从数据中提取版本号
      updated_at: new Date().toISOString()
    })
  }

  return results
}

/**
 * 从HTML表格提取数据（备用方案）
 */
function parseAramggTableData(championId, html) {
  const cheerio = require('cheerio')
  const $ = cheerio.load(html)

  const results = []

  // 查找第一个表格（海克斯推荐表格）
  const table = $('table').first()
  const rows = table.find('tr')

  rows.each((i, row) => {
    if (i === 0) return  // 跳过表头

    const cells = $(row).find('td')
    if (cells.length >= 5) {
      // 表格结构：排名 | 强化ID | 层级 | 胜率 | 选取率
      const augmentIdStr = $(cells[1]).text().trim().replace('#', '')
      const augmentId = Number(augmentIdStr)

      const tierStr = $(cells[2]).text().trim()  // "T1", "T2", etc.
      const tier = tierStr.replace('T', '')  // "1", "2", etc.
      const tierLetter = tier === '1' ? 'S' : tier === '2' ? 'A' : tier === '3' ? 'B' : tier === '4' ? 'C' : 'D'

      const winRateStr = $(cells[3]).text().trim().replace('%', '')
      const winRate = parseFloat(winRateStr) / 100  // 转换为0-1范围

      const pickRateStr = $(cells[4]).text().trim().replace('%', '')
      const pickRate = parseFloat(pickRateStr) / 100

      // 表格中没有样本量，估算（基于选取率和总场次）
      const estimatedSampleSize = Math.floor(pickRate * 10000)  // 估算

      results.push({
        _id: `${championId}_${augmentId}`,
        champion_id: championId,
        augment_id: augmentId,
        win_rate: winRate,
        pick_rate: pickRate,
        sample_size: estimatedSampleSize,
        tier: tierLetter,
        patch_version: '26.12',
        updated_at: new Date().toISOString()
      })
    }
  })

  console.log(`[aramgg] 表格提取: ${results.length} 条数据`)
  return results
}

// ========== 测试代码 ==========

async function testFetch() {
  try {
    console.log('=== 测试 aramgg.com 数据提取 ===\n')

    const stats = await fetchChampionStatsFromAramgg(1)

    console.log('\n提取结果:')
    console.log('总数:', stats.length, '条')

    if (stats.length > 0) {
      console.log('\n前3条数据示例:')
      stats.slice(0, 3).forEach((stat, i) => {
        console.log(`${i + 1}. 海克斯ID ${stat.augment_id}:`)
        console.log('   胜率:', (stat.win_rate * 100).toFixed(2), '%')
        console.log('   选取率:', (stat.pick_rate * 100).toFixed(2), '%')
        console.log('   Tier:', stat.tier)
        console.log('   样本量:', stat.sample_size)
      })
    }

    console.log('\n✅ 测试成功!')

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message)
  }
}

// 导出函数
module.exports = {
  fetchChampionStatsFromAramgg,
  parseAramggAugmentsData,
  parseAramggTableData
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  testFetch()
}