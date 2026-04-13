const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// =============================
// إعدادات Green API
// =============================
const INSTANCE_ID = process.env.INSTANCE_ID;
const INSTANCE_TOKEN = process.env.INSTANCE_TOKEN;
const GREEN_API = `https://api.green-api.com/waInstance${INSTANCE_ID}`;

// =============================
// بيانات العقارات
// =============================
const properties = [
  { id: 1, type: 'شقة', neighborhood: 'المونسية', rooms: 4, area: 175, floor: 2, furnished: false, price: 42000, available: true },
  { id: 2, type: 'شقة', neighborhood: 'النخيل', rooms: 3, area: 155, floor: 1, furnished: true, price: 48000, available: true },
  { id: 3, type: 'فيلا', neighborhood: 'الروضة', rooms: 6, area: 380, floor: null, furnished: false, price: 110000, available: true },
  { id: 4, type: 'شقة', neighborhood: 'المونسية', rooms: 3, area: 140, floor: 3, furnished: false, price: 36000, available: true },
  { id: 5, type: 'دور', neighborhood: 'المونسية', rooms: 5, area: 250, floor: 1, furnished: false, price: 65000, available: true }
];

const OFFICE_PHONE = process.env.OFFICE_PHONE || '05XXXXXXXX';
const OFFICE_NAME = process.env.OFFICE_NAME || 'مكتب المونسية العقاري';

const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = { step: 'start', filters: {} };
  }
  return sessions[chatId];
}

function resetSession(chatId) {
  sessions[chatId] = { step: 'start', filters: {} };
}

async function sendMessage(chatId, message) {
  try {
    await axios.post(`${GREEN_API}/sendMessage/${INSTANCE_TOKEN}`, {
      chatId,
      message,
    });
  } catch (err) {
    console.error('خطأ في الإرسال:', err.message);
  }
}

function filterProperties(filters) {
  return properties.filter(p => {
    if (!p.available) return false;
    if (filters.type && p.type !== filters.type) return false;
    if (filters.neighborhood && p.neighborhood !== filters.neighborhood) return false;
    if (filters.rooms && p.rooms !== filters.rooms) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    return true;
  });
}

function formatProperty(p) {
  const furnished = p.furnished ? 'مفروش ✅' : 'غير مفروش';
  const floor = p.floor ? `الدور ${p.floor}` : 'مستقل';
  return (
    `🏢 *${p.type} — حي ${p.neighborhood}*\n` +
    `📐 المساحة: ${p.area} م²\n` +
    `🛏 الغرف: ${p.rooms} غرف\n` +
    `🏗 الدور: ${floor}\n` +
    `🛋 ${furnished}\n` +
    `💰 الإيجار السنوي: *${p.price.toLocaleString()} ريال*`
  );
}

async function handleMessage(chatId, text) {
  const session = getSession(chatId);
  const msg = text.trim();

  if (msg === 'قائمة' || msg === 'البداية' || msg === 'مرحبا' || msg === 'مرحباً' || msg === 'هلا') {
    resetSession(chatId);
    await sendMessage(chatId,
      `أهلاً وسهلاً 👋\nهذا *${OFFICE_NAME}*\n\n` +
      `كيف أقدر أساعدك؟\n\n` +
      `1️⃣ أبحث عن شقة\n` +
      `2️⃣ أبحث عن فيلا\n` +
      `3️⃣ أبحث عن دور\n` +
      `4️⃣ عرض جميع العقارات\n\n` +
      `اكتب رقم الاختيار أو اكتب نوع العقار مباشرة`
    );
    session.step = 'choose_type';
    return;
  }

  if (session.step === 'start' || session.step === 'choose_type') {
    let type = null;
    if (msg === '1' || msg.includes('شقة') || msg.includes('شقه')) type = 'شقة';
    else if (msg === '2' || msg.includes('فيلا')) type = 'فيلا';
    else if (msg === '3' || msg.includes('دور')) type = 'دور';
    else if (msg === '4' || msg.includes('الكل')) {
      const all = filterProperties({});
      if (all.length === 0) {
        await sendMessage(chatId, 'لا توجد عقارات متاحة حالياً.');
        return;
      }
      await sendMessage(chatId, `وجدت *${all.length} عقارات* متاحة:\n\n` + all.map(formatProperty).join('\n\n──────────\n\n'));
      resetSession(chatId);
      return;
    }

    if (!type) {
      await sendMessage(chatId, 'الرجاء اختيار نوع العقار (1-4) أو اكتب "قائمة" للبداية.');
      return;
    }
    session.filters.type = type;
    session.step = 'choose_neighborhood';
    await sendMessage(chatId, `ممتاز! أي حي تفضل؟\n1️⃣ المونسية\n2️⃣ النخيل\n3️⃣ الروضة\n4️⃣ أي حي`);
    return;
  }

  if (session.step === 'choose_neighborhood') {
    if (msg === '1' || msg.includes('المونسية')) session.filters.neighborhood = 'المونسية';
    else if (msg === '2' || msg.includes('النخيل')) session.filters.neighborhood = 'النخيل';
    else if (msg === '3' || msg.includes('الروضة')) session.filters.neighborhood = 'الروضة';
    else session.filters.neighborhood = null;

    session.step = 'choose_rooms';
    await sendMessage(chatId, `كم عدد الغرف؟\n1️⃣ 3 غرف\n2️⃣ 4 غرف\n3️⃣ 5 غرف أو أكثر\n4️⃣ غير محدد`);
    return;
  }

  if (session.step === 'choose_rooms') {
    if (msg === '1') session.filters.rooms = 3;
    else if (msg === '2') session.filters.rooms = 4;
    else if (msg === '3') session.filters.rooms = 5;
    else session.filters.rooms = null;

    const results = filterProperties(session.filters);
    if (results.length === 0) {
      await sendMessage(chatId, `لم أجد طلبك حالياً. تواصل معنا: ${OFFICE_PHONE}`);
      resetSession(chatId);
      return;
    }
    await sendMessage(chatId, `🎯 النتائج:\n\n` + results.map(formatProperty).join('\n\n──────────\n\n'));
    resetSession(chatId);
    return;
  }
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (!body || body.typeWebhook !== 'incomingMessageReceived') return;
  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage;
  if (!chatId || !text || chatId.includes('@g.us')) return;
  await handleMessage(chatId, text);
});

app.get('/', (req, res) => res.send('البوت يعمل ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`البوت يعمل على البورت ${PORT}`));
