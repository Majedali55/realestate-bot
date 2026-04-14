const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const INSTANCE_ID = process.env.INSTANCE_ID;
const INSTANCE_TOKEN = process.env.INSTANCE_TOKEN;
const GREEN_API = `https://api.green-api.com/waInstance${INSTANCE_ID}`;
const OFFICE_PHONE = process.env.OFFICE_PHONE || '05XXXXXXXX';
const OFFICE_NAME = process.env.OFFICE_NAME || 'مكتب المونسية العقاري';

const SHEET_ID = '17GagpV9kw4X3EmPp3q9zfVAauCP_GxahhErkFO9eayY';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

let propertiesCache = [];
let lastFetch = 0;

async function fetchProperties() {
  const now = Date.now();
  if (now - lastFetch < 5 * 60 * 1000 && propertiesCache.length > 0) return propertiesCache;
  try {
    const res = await axios.get(SHEET_URL);
    const lines = res.data.trim().split('\n');
    propertiesCache = lines.slice(1).map((row, i) => {
      const cols = row.split(',').map(c => c.replace(/"/g, '').trim());
      return {
        id: i + 1,
        type: cols[1] || '',
        neighborhood: cols[2] || '',
        rooms: parseInt(cols[3]) || 0,
        area: parseInt(cols[4]) || 0,
        price: parseInt(cols[5]) || 0,
        furnished: cols[6] === 'نعم',
        available: cols[7] === 'نعم',
      };
    }).filter(p => p.available && p.type);
    lastFetch = now;
    console.log(`تم تحميل ${propertiesCache.length} عقار`);
  } catch (err) {
    console.error('خطأ في الشيت:', err.message);
  }
  return propertiesCache;
}

const sessions = {};
function getSession(id) {
  if (!sessions[id]) sessions[id] = { step: 'start', filters: {} };
  return sessions[id];
}
function resetSession(id) { sessions[id] = { step: 'start', filters: {} }; }

async function sendMessage(chatId, message) {
  try {
    await axios.post(`${GREEN_API}/sendMessage/${INSTANCE_TOKEN}`, { chatId, message });
  } catch (err) {
    console.error('خطأ إرسال:', err.message);
  }
}

function filterProperties(properties, filters) {
  return properties.filter(p => {
    if (filters.type && p.type !== filters.type) return false;
    if (filters.neighborhood && p.neighborhood !== filters.neighborhood) return false;
    if (filters.rooms && p.rooms !== filters.rooms) return false;
    return true;
  });
}

function formatProperty(p) {
  return (
    `*${p.type} - حي ${p.neighborhood}*\n` +
    `المساحة: ${p.area} م²\n` +
    `الغرف: ${p.rooms}\n` +
    `${p.furnished ? 'مفروش' : 'غير مفروش'}\n` +
    `الايجار: *${p.price.toLocaleString()} ريال/سنة*`
  );
}

async function handleMessage(chatId, text) {
  const session = getSession(chatId);
  const msg = text.trim();
  const properties = await fetchProperties();
  const greetings = ['قائمة','البداية','مرحبا','مرحباً','هلا','اهلا','أهلا','السلام'];

  if (greetings.some(w => msg.includes(w)) || session.step === 'start') {
    resetSession(chatId);
    sessions[chatId].step = 'choose_type';
    await sendMessage(chatId,
      `أهلاً وسهلاً في *${OFFICE_NAME}* 👋\n\n` +
      `1 - شقة\n2 - فيلا\n3 - دور\n4 - عرض الكل\n\nاكتب رقم اختيارك`
    );
    return;
  }

  if (session.step === 'choose_type') {
    let type = null;
    if (msg === '1' || msg.includes('شقة') || msg.includes('شقه')) type = 'شقة';
    else if (msg === '2' || msg.includes('فيلا')) type = 'فيلا';
    else if (msg === '3' || msg.includes('دور')) type = 'دور';
    else if (msg === '4') {
      if (!properties.length) { await sendMessage(chatId, 'لا يوجد عقارات متاحة.\n' + OFFICE_PHONE); return; }
      await sendMessage(chatId, properties.map(formatProperty).join('\n\n---\n\n'));
      await sendMessage(chatId, `للتواصل: *${OFFICE_PHONE}*`);
      resetSession(chatId);
      return;
    }
    if (!type) { await sendMessage(chatId, 'اكتب رقم من 1 الى 4'); return; }

    session.filters.type = type;
    const hoods = [...new Set(properties.filter(p => p.type === type).map(p => p.neighborhood))];
    if (!hoods.length) {
      await sendMessage(chatId, `لا يوجد ${type} متاحة.\nللتواصل: *${OFFICE_PHONE}*`);
      resetSession(chatId); return;
    }
    session.neighborhoodOptions = hoods;
    session.step = 'choose_neighborhood';
    const list = hoods.map((n, i) => `${i+1} - ${n}`).join('\n');
    await sendMessage(chatId, `اختر الحي:\n\n${list}\n${hoods.length+1} - أي حي`);
    return;
  }

  if (session.step === 'choose_neighborhood') {
    const opts = session.neighborhoodOptions || [];
    const num = parseInt(msg);
    if (num >= 1 && num <= opts.length) session.filters.neighborhood = opts[num-1];
    else session.filters.neighborhood = null;
    session.step = 'choose_rooms';
    await sendMessage(chatId, `عدد الغرف:\n\n1 - 3 غرف\n2 - 4 غرف\n3 - 5 غرف+\n4 - غير محدد`);
    return;
  }

  if (session.step === 'choose_rooms') {
    if (msg === '1') session.filters.rooms = 3;
    else if (msg === '2') session.filters.rooms = 4;
    else if (msg === '3') session.filters.rooms = 5;
    else session.filters.rooms = null;

    const results = filterProperties(properties, session.filters);
    if (!results.length) {
      await sendMessage(chatId, `لم نجد عقارات بهذه المواصفات.\nتواصل معنا: *${OFFICE_PHONE}*\n\nاكتب "قائمة" لبحث جديد`);
      resetSession(chatId); return;
    }
    await sendMessage(chatId, `وجدنا ${results.length} عقار:\n\n` + results.map(formatProperty).join('\n\n---\n\n'));
    session.step = 'show_results';
    await sendMessage(chatId, `هل يناسبك احد العروض؟\n1 - نعم ابي اتواصل\n2 - بحث جديد`);
    return;
  }

  if (session.step === 'show_results') {
    if (msg === '1' || msg.includes('نعم')) {
      await sendMessage(chatId, `للتواصل مع المكتب:\n📞 *${OFFICE_PHONE}*\n\nشكراً لك 🏢`);
    } else {
      sessions[chatId] = { step: 'choose_type', filters: {} };
      await sendMessage(chatId, `اختر نوع العقار:\n1 - شقة\n2 - فيلا\n3 - دور\n4 - الكل`);
      return;
    }
    resetSession(chatId); return;
  }

  await sendMessage(chatId, `اكتب "مرحبا" للبداية 👋`);
  resetSession(chatId);
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

app.get('/', (req, res) => res.send('البوت يعمل'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`البوت على البورت ${PORT}`);
  await fetchProperties();
});
