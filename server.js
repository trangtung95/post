const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const app = express();

// Giới hạn nhận data lớn 10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });
const PORT = process.env.PORT || 3000;

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
      text,
      parse_mode: 'HTML',
    });
    console.log('✅ Tin nhắn text đã gửi Telegram thành công!');
    return res.data.ok;
  } catch (err) {
    console.error('❌ Lỗi gửi text:', err.response?.data || err.message);
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
    console.error('❌ Lỗi gửi file:', err.response?.data || err.message);
    return false;
  } finally {
    fs.unlink(filePath, (e) => {
      if (e) console.error('🗑️ Xóa file tạm thất bại:', e.message);
      else console.log(`🧹 Đã dọn dẹp file tạm: ${filePath}`);
    });
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

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT} - Sẵn sàng bắn data lớn vô Telegram!`);
});

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT} - Sẵn sàng bắn data lớn vô Telegram! Chạy nhanh như ninja!`);
});
