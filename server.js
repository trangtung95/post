const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const app = express();

// Giới hạn nhận data lớn 10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Tạo thư mục uploads nếu chưa có
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

const PORT = process.env.PORT || 3000;

let browser = null;
let page = null;
let mLoaded = false;

// Khởi tạo Puppeteer ngay khi server chạy
(async () => {
  try {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    mLoaded = true;
    console.log('🚀 Puppeteer đã sẵn sàng, trang mới đã mở!');
  } catch (e) {
    console.error('💥 Lỗi khởi tạo Puppeteer:', e);
  }
})();

// Hàm gửi tin nhắn text Telegram
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình!');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    });
    console.log('✅ Tin nhắn text đã gửi Telegram thành công!');
    return res.data.ok;
  } catch (err) {
    console.error('❌ Lỗi gửi text:', err.response?.data || err.message, 'Telegram có vẻ đang giận đấy!');
    return false;
  }
}

// Hàm gửi file Telegram
async function sendTelegramFile(filePath, fileName) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình!');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', fs.createReadStream(filePath), fileName);

    const res = await axios.post(url, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`✅ File "${fileName}" đã gửi Telegram thành công!`);
    return res.data.ok;
  } catch (err) {
    console.error('❌ Lỗi gửi file:', err.response?.data || err.message, 'Telegram đang chơi trò trốn tìm!');
    return false;
  } finally {
    // Xóa file tạm
    fs.unlink(filePath, (e) => {
      if (e) console.error('🗑️ Xóa file tạm thất bại:', e.message);
      else console.log(`🧹 Đã dọn dẹp file tạm: ${filePath}`);
    });
  }
}

// Hàm gửi tin nhắn Telegram có nút inline
async function sendTelegramMessageWithButtons(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình!');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const buttons = {
    inline_keyboard: [
      [{ text: 'Nhấn đi!', callback_data: 'clicked' }],
      [{ text: 'Thoát', callback_data: 'exit' }],
    ],
  };

  try {
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      reply_markup: buttons,
      parse_mode: 'HTML',
    });
    console.log('✅ Tin nhắn có nút inline đã gửi thành công!');
    return res.data.ok;
  } catch (err) {
    console.error('❌ Lỗi gửi message với nút:', err.response?.data || err.message);
    return false;
  }
}

// Endpoint nhận text/data lớn gửi Telegram
app.post('/data', async (req, res) => {
  const data = req.body;
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const ok = await sendTelegramMessage(text);
  res.status(ok ? 200 : 500).json({
    status: ok ? 'ok' : 'error',
    message: ok ? 'Text đã gửi Telegram' : 'Gửi text thất bại',
  });
});

// Endpoint upload file gửi Telegram
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'Chưa upload file nào cả!' });
  }

  const { path, originalname } = req.file;
  const ok = await sendTelegramFile(path, originalname);

  res.status(ok ? 200 : 500).json({
    status: ok ? 'ok' : 'error',
    message: ok ? 'File đã gửi Telegram' : 'Gửi file thất bại',
  });
});

// Route thử gửi nút inline
app.get('/send-buttons', async (req, res) => {
  const text = 'Tin nhắn có nút inline:';
  const success = await sendTelegramMessageWithButtons(text);
  res.status(success ? 200 : 500).send(success ? 'Đã gửi nút!' : 'Lỗi gửi nút');
});

// Auto reload page mỗi 30 phút
setInterval(async () => {
  if (!page) {
    console.warn('⚠️ Page chưa được khởi tạo, không thể reload!');
    return;
  }
  try {
    await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
    console.log('🔄 Trang đã reload lúc', new Date().toLocaleTimeString());
  } catch (e) {
    console.error('❌ Reload page lỗi:', e.message);
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT} - Sẵn sàng bắn data lớn vô Telegram!`);
});
