const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require('puppeteer-extra')
const express = require('express')
const axios = require('axios')
require('dotenv').config()

puppeteer.use(StealthPlugin())

const app = express()
app.use(express.json({ limit: '10mb' }))  // nhận JSON lớn thoải mái
app.use(express.urlencoded({ extended: true, limit: '10mb' })) // nhận form urlencoded

const PORT = process.env.PORT || 3000

let page = null  // Bỏ khởi tạo page ở đây, bạn tự quản lý bên ngoài
let mLoaded = false

// Reload page nếu có page
async function pageReload() {
  if (page) {
    try {
      await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] })
      console.log('Page reloaded at', new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Failed to reload page:', e)
    }
  } else {
    console.log('No page instance available for reload')
  }
}

// Gửi tin nhắn qua Telegram
async function sendTelegramMessage(text) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!token || !chatId) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in env')
      return false
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
    return res.data.ok
  } catch (err) {
    console.error('Error sending Telegram message:', err.message)
    return false
  }
}

app.post('/data', async (req, res) => {
  try {
    // Nhận dữ liệu bất kỳ từ body
    let data = req.body

    // Chuẩn bị nội dung gửi Telegram: stringify, giữ unicode
    let text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

    // Gửi lên Telegram
    const success = await sendTelegramMessage(text)

    if (success) {
      res.json({ status: 'ok', message: 'Data sent to Telegram' })
    } else {
      res.status(500).json({ status: 'error', message: 'Failed to send Telegram message' })
    }
  } catch (error) {
    console.error('Error /data:', error)
    res.status(500).json({ status: 'error', message: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

// Tự động reload page mỗi 30 phút
setInterval(async () => {
  await pageReload()
}, 30 * 60 * 1000)
