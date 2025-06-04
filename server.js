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
  console.log('📂 Thư mục uploads đã được tạo, khỏi lo bị lỗi "folder not found" nhé!');
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
    console.log('🚀 Puppeteer đã sẵn sàng, trang mới đã mở! Ready to stealth-mode!');
  } catch (e) {
    console.error('💥 Lỗi khởi tạo Puppeteer:', e);
  }
})();

// Hàm gửi tin nhắn text Telegram
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình! Nhớ check lại file .env nha!');
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
    console.error('❌ Lỗi gửi text:', err.response?.data || err.message, 'Telegram có vẻ đang giận đấy! 😢');
    return false;
  }
}

// Hàm gửi file Telegram
async function sendTelegramFile(filePath, fileName) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình! File sẽ không đi đâu cả.');
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
    // Xóa file tạm, dọn dẹp sạch sẽ như vệ sinh nhà cửa
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
    console.warn('⚠️ Telegram BOT_TOKEN hoặc CHAT_ID chưa được cấu hình! Muốn nút không hiện được đâu.');
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
      text,
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
    message: ok ? 'Text đã gửi Telegram' : 'Gửi text thất bại, Telegram trốn rồi!',
  });
});

// Endpoint upload file gửi Telegram - Bỏ qua lỗi nếu có, vẫn trả 200 OK cho client
app.post('/upload', upload.single('file'), async (req, res) => {
  // Kiểm tra có file chưa
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      message: 'Chưa upload file nào cả! Nhớ gửi file nha!',
    });
  }

  const { path: filePath, originalname: fileName } = req.file;

  try {
    // Thử gửi file lên Telegram
    const sentOk = await sendTelegramFile(filePath, fileName);

    if (!sentOk) {
      // Nếu gửi không thành công, vẫn log cảnh báo
      console.warn(`⚠️ Gửi file "${fileName}" lên Telegram thất bại, nhưng sẽ bỏ qua lỗi này.`);
    } else {
      console.log(`✅ Gửi file "${fileName}" lên Telegram thành công.`);
    }
  } catch (error) {
    // Nếu có lỗi bất ngờ khi gửi file, log lỗi nhưng không trả lỗi về client
    console.error(`❌ Lỗi khi gửi file "${fileName}" lên Telegram, bỏ qua lỗi:`, error.message);
  }

  // Trả về 200 dù gửi file Telegram có thành công hay không
  res.status(200).json({
    status: 'ok',
    message: 'File đã nhận và xử lý. Nếu Telegram có lỗi, mình vẫn không làm bạn phiền!',
  });
});

// Route thử gửi nút inline
app.get('/send-buttons', async (req, res) => {
  const text = 'Tin nhắn có nút inline:';
  const success = await sendTelegramMessageWithButtons(text);
  res.status(success ? 200 : 500).send(success ? 'Đã gửi nút!' : 'Lỗi gửi nút, có vẻ Telegram không vui!');
});

// Auto reload page mỗi 30 phút, tránh page bị ngủ quên như sinh viên mùa hè
setInterval(async () => {
  if (!page) {
    console.warn('⚠️ Page chưa được khởi tạo, không thể reload! Nên kiểm tra lại!');
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
  console.log(`🚀 Server chạy tại http://localhost:${PORT} - Sẵn sàng bắn data lớn vô Telegram! Chạy nhanh như ninja!`);
});
