const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require('puppeteer-extra')
const express = require('express')
const axios = require('axios')
const multer = require('multer')
const fs = require('fs')
const FormData = require('form-data')
require('dotenv').config()

puppeteer.use(StealthPlugin())

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Tạo thư mục uploads nếu chưa có
const uploadDir = 'uploads'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const upload = multer({ dest: uploadDir }) // File tạm được lưu vào thư mục 'uploads'
const PORT = process.env.PORT || 3000

let page = null
let mLoaded = false

// Gửi tin nhắn text
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  try {
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
    return res.data.ok
  } catch (err) {
    console.error('Error sending text:', err.response?.data || err.message)
    return false
  }
}

// Gửi file bất kỳ qua Telegram
async function sendTelegramFile(filePath, fileName) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  const url = `https://api.telegram.org/bot${token}/sendDocument`
  try {
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', fs.createReadStream(filePath), fileName)

    const res = await axios.post(url, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })

    return res.data.ok
  } catch (err) {
    console.error('Error sending file:', err.response?.data || err.message)
    return false
  } finally {
    // Dọn file sau khi gửi
    fs.unlink(filePath, (e) => {
      if (e) console.error('Error deleting temp file:', e.message)
    })
  }
}

// Endpoint POST /data (text)
app.post('/data', async (req, res) => {
  const data = req.body
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const ok = await sendTelegramMessage(text)
  res.status(ok ? 200 : 500).json({
    status: ok ? 'ok' : 'error',
    message: ok ? 'Text sent to Telegram' : 'Failed to send'
  })
})

// Endpoint POST /upload (file)
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' })
  }

  const { path, originalname } = req.file
  const ok = await sendTelegramFile(path, originalname)

  res.status(ok ? 200 : 500).json({
    status: ok ? 'ok' : 'error',
    message: ok ? 'File sent to Telegram' : 'Failed to send file'
  })
})

// Route thử nút (nếu cần)
// Nếu bạn dùng hàm sendTelegramMessageWithButtons, nhớ định nghĩa nó nhé
app.get('/send-buttons', async (req, res) => {
  const text = "Tin nhắn có nút inline:"
  // Giả sử bạn đã có hàm sendTelegramMessageWithButtons
  if (typeof sendTelegramMessageWithButtons !== 'function') {
    return res.status(501).send('Chưa có hàm sendTelegramMessageWithButtons')
  }
  const success = await sendTelegramMessageWithButtons(text)
  res.status(success ? 200 : 500).send(success ? 'Đã gửi' : 'Lỗi')
})

// Auto reload page mỗi 30 phút
setInterval(async () => {
  await pageReload()
}, 30 * 60 * 1000)

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

// Dummy reload page
async function pageReload() {
  if (page) {
    try {
      await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] })
      console.log('Page reloaded at', new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Reload error:', e.message)
    }
  }
}
