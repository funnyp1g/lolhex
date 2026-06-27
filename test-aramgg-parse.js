/**
 * aramgg.com 数据解析测试
 * 测试从HTML中提取英雄统计数据
 */

const axios = require('axios')
const cheerio = require('cheerio')

async function testAramggParsing() {
  try {
    console.log('测试从 aramgg.com 提取数据...\n')

    // 获取英雄1的详情页
    const url = 'https://aramgg.com/zh-CN/champion-stats/1'
    console.log('URL:', url)

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    })

    console.log('HTTP状态:', response.status)
    console.log('HTML长度:', response.data.length, 'bytes\n')

    // 使用 cheerio 解析HTML
    const $ = cheerio.load(response.data)

    // 方法1: 查找表格数据
    console.log('方法1: 查找表格数据')
    const tables = $('table')
    console.log('找到表格:', tables.length, '个')

    if (tables.length > 0) {
      tables.each((i, table) => {
        console.log(`\n表格 ${i + 1}:`)
        const rows = $(table).find('tr')
        console.log('行数:', rows.length)

        rows.each((j, row) => {
          if (j < 5) { // 只显示前5行
            const cells = $(row).find('td, th')
            const cellTexts = []
            cells.each((k, cell) => {
              cellTexts.push($(cell).text().trim().substring(0, 30))
            })
            console.log(`  行 ${j}:`, cellTexts.join(' | '))
          }
        })
      })
    }

    // 方法2: 查找数据容器
    console.log('\n\n方法2: 查找数据容器')
    const containers = $('[class*="augment"], [class*="stat"], [class*="data"]')
    console.log('找到数据容器:', containers.length, '个')

    if (containers.length > 0) {
      containers.each((i, container) => {
        if (i < 3) {
          const className = $(container).attr('class')
          const text = $(container).text().trim().substring(0, 100)
          console.log(`容器 ${i + 1}:`, className, '|', text)
        }
      })
    }

    // 方法3: 查找JSON数据
    console.log('\n\n方法3: 查找嵌入的JSON数据')
    const scripts = $('script')
    console.log('找到script标签:', scripts.length, '个')

    let foundData = false
    scripts.each((i, script) => {
      const content = $(script).html() || ''
      if (content.includes('win_rate') || content.includes('pick_rate') || content.includes('augments')) {
        console.log('\n✅ 找到包含数据的script标签!')
        console.log('位置:', i)
        console.log('内容长度:', content.length)
        console.log('内容片段:', content.substring(0, 500))
        foundData = true
      }
    })

    if (!foundData) {
      console.log('❌ 未在script标签中找到数据')
    }

    // 方法4: 查找特定类名
    console.log('\n\n方法4: 查找特定数据类名')
    const winRateElements = $('[class*="win"], [data-win]')
    const pickRateElements = $('[class*="pick"], [data-pick]')
    const tierElements = $('[class*="tier"], [data-tier]')

    console.log('胜率元素:', winRateElements.length)
    console.log('选取率元素:', pickRateElements.length)
    console.log('Tier元素:', tierElements.length)

    if (tierElements.length > 0) {
      console.log('\nTier数据示例:')
      tierElements.each((i, el) => {
        if (i < 10) {
          console.log('  ', $(el).text().trim(), '|', $(el).attr('class'))
        }
      })
    }

    // 总结
    console.log('\n\n=== 数据提取总结 ===')
    console.log('✅ HTML获取成功')
    console.log('表格数量:', tables.length)
    console.log('数据容器:', containers.length)
    console.log('嵌入JSON:', foundData ? '找到' : '未找到')
    console.log('胜率元素:', winRateElements.length)
    console.log('选取率元素:', pickRateElements.length)
    console.log('Tier元素:', tierElements.length)

  } catch (err) {
    console.error('\n❌ 错误:', err.message)
    if (err.response) {
      console.error('HTTP状态:', err.response.status)
    }
  }
}

testAramggParsing()