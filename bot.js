const express = require(‘express’);
const axios = require(‘axios’);

const app = express();
app.use(express.json());

// =============================
// إعدادات Green API
// =============================
const INSTANCE_ID = process.env.INSTANCE_ID;
const INSTANCE_TOKEN = process.env.INSTANCE_TOKEN;
const GREEN_API = `https://api.green-api.com/waInstance${INSTANCE_ID}`;

// =============================
// بيانات العقارات - تعديلها حسب كل مكتب
// =============================
const properties = [
{
id: 1,
type: ‘شقة’,
neighborhood: ‘المونسية’,
rooms: 4,
area: 175,
floor: 2,
furnished: false,
price: 42000,
available: true,
},
{
id: 2,
type: ‘شقة’,
neighborhood: ‘النخيل’,
rooms: 3,
area: 155,
floor: 1,
furnished: true,
price: 48000,
available: true,
},
{
id: 3,
type: ‘فيلا’,
neighborhood: ‘الروضة’,
rooms: 6,
area: 380,
floor: null,
furnished: false,
price: 110000,
available: true,
},
{
id: 4,
type: ‘شقة’,
neighborhood: ‘المونسية’,
rooms: 3,
area: 140,
floor: 3,
furnished: false,
price: 36000,
available: true,
},
{
id: 5,
type: ‘دور’,
neighborhood: ‘المونسية’,
rooms: 5,
area: 250,
floor: 1,
furnished: false,
price: 65000,
available: true,
},
];

// رقم المكتب - يظهر للعميل عند الاهتمام
const OFFICE_PHONE = process.env.OFFICE_PHONE || ‘05XXXXXXXX’;
const OFFICE_NAME = process.env.OFFICE_NAME || ‘مكتب المونسية العقاري’;

// =============================
// حالة المحادثات
// =============================
const sessions = {};

function getSession(chatId) {
if (!sessions[chatId]) {
sessions[chatId] = { step: ‘start’, filters: {} };
}
return sessions[chatId];
}

function resetSession(chatId) {
sessions[chatId] = { step: ‘start’, filters: {} };
}

// =============================
// إرسال رسالة
// =============================
async function sendMessage(chatId, message) {
try {
await axios.post(`${GREEN_API}/sendMessage/${INSTANCE_TOKEN}`, {
chatId,
message,
});
} catch (err) {
console.error(‘خطأ في الإرسال:’, err.message);
}
}

// =============================
// فلترة العقارات
// =============================
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

// =============================
// تنسيق كارت العقار
// =============================
function formatProperty(p) {
const furnished = p.furnished ? ‘مفروش ✅’ : ‘غير مفروش’;
const floor = p.floor ? `الدور ${p.floor}` : ‘مستقل’;
return (
`🏢 *${p.type} — حي ${p.neighborhood}*\n` +
`📐 المساحة: ${p.area} م²\n` +
`🛏 الغرف: ${p.rooms} غرف\n` +
`🏗 الدور: ${floor}\n` +
`🛋 ${furnished}\n` +
`💰 الإيجار السنوي: *${p.price.toLocaleString()} ريال*`
);
}

// =============================
// معالجة الرسائل
// =============================
async function handleMessage(chatId, text) {
const session = getSession(chatId);
const msg = text.trim();

// إعادة تشغيل
if (msg === ‘قائمة’ || msg === ‘البداية’ || msg === ‘مرحبا’ || msg === ‘مرحباً’ || msg === ‘هلا’) {
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
sessions[chatId].step = ‘choose_type’;
return;
}

// الخطوة الأولى - اختيار النوع
if (session.step === ‘start’ || session.step === ‘choose_type’) {
let type = null;

```
if (msg === '1' || msg.includes('شقة') || msg.includes('شقه')) type = 'شقة';
else if (msg === '2' || msg.includes('فيلا') || msg.includes('villa')) type = 'فيلا';
else if (msg === '3' || msg.includes('دور')) type = 'دور';
else if (msg === '4' || msg.includes('الكل') || msg.includes('جميع')) {
  // عرض الكل
  const all = filterProperties({});
  if (all.length === 0) {
    await sendMessage(chatId, 'لا توجد عقارات متاحة حالياً، سيتم التواصل معك قريباً.');
    return;
  }
  await sendMessage(chatId, `وجدت *${all.length} عقارات* متاحة:\n\n` + all.map(formatProperty).join('\n\n──────────\n\n'));
  await sendMessage(chatId, `للتواصل مع المكتب:\n📞 *${OFFICE_PHONE}*\n\nلبحث جديد اكتب: *قائمة*`);
  resetSession(chatId);
  return;
}

if (!type) {
  // أول رسالة - رحب
  await sendMessage(chatId,
    `أهلاً وسهلاً 👋\nهذا *${OFFICE_NAME}*\n\n` +
    `كيف أقدر أساعدك؟\n\n` +
    `1️⃣ أبحث عن شقة\n` +
    `2️⃣ أبحث عن فيلا\n` +
    `3️⃣ أبحث عن دور\n` +
    `4️⃣ عرض جميع العقارات\n\n` +
    `اكتب رقم الاختيار`
  );
  sessions[chatId].step = 'choose_type';
  return;
}

session.filters.type = type;
session.step = 'choose_neighborhood';

await sendMessage(chatId,
  `ممتاز! 👍\nأي حي تفضل؟\n\n` +
  `1️⃣ المونسية\n` +
  `2️⃣ النخيل\n` +
  `3️⃣ الروضة\n` +
  `4️⃣ أي حي\n\n` +
  `اكتب رقم الاختيار أو اسم الحي`
);
return;
```

}

// الخطوة الثانية - اختيار الحي
if (session.step === ‘choose_neighborhood’) {
if (msg === ‘1’ || msg.includes(‘المونسية’) || msg.includes(‘المونسيه’)) {
session.filters.neighborhood = ‘المونسية’;
} else if (msg === ‘2’ || msg.includes(‘النخيل’)) {
session.filters.neighborhood = ‘النخيل’;
} else if (msg === ‘3’ || msg.includes(‘الروضة’) || msg.includes(‘الروضه’)) {
session.filters.neighborhood = ‘الروضة’;
} else if (msg === ‘4’ || msg.includes(‘أي’) || msg.includes(‘اي’)) {
session.filters.neighborhood = null;
} else {
// حي غير معروف - نبحث فيه
session.filters.neighborhood = msg;
}

```
session.step = 'choose_rooms';
await sendMessage(chatId,
  `تمام 🏘️\nكم عدد الغرف؟\n\n` +
  `1️⃣ 3 غرف\n` +
  `2️⃣ 4 غرف\n` +
  `3️⃣ 5 غرف أو أكثر\n` +
  `4️⃣ غير محدد\n\n` +
  `اكتب رقم الاختيار`
);
return;
```

}

// الخطوة الثالثة - عدد الغرف
if (session.step === ‘choose_rooms’) {
if (msg === ‘1’ || msg.includes(‘3’)) session.filters.rooms = 3;
else if (msg === ‘2’ || msg.includes(‘4’)) session.filters.rooms = 4;
else if (msg === ‘3’ || msg.includes(‘5’) || msg.includes(‘6’)) session.filters.rooms = 5;
else session.filters.rooms = null;

```
// ابحث عن نتائج
const results = filterProperties(session.filters);

if (results.length === 0) {
  await sendMessage(chatId,
    `😔 لم أجد عقارات بهذه المواصفات حالياً.\n\n` +
    `سأبلغ المكتب بطلبك وسيتواصلون معك.\n` +
    `📞 أو تواصل مباشرة: *${OFFICE_PHONE}*\n\n` +
    `لبحث جديد اكتب: *قائمة*`
  );
  resetSession(chatId);
  return;
}

await sendMessage(chatId, `🎯 وجدت *${results.length} عقار${results.length > 1 ? 'ات' : ''}* مناسب${results.length > 1 ? 'ة' : ''}:\n\n` + results.map(formatProperty).join('\n\n──────────\n\n'));

session.step = 'show_results';
await sendMessage(chatId,
  `هل أحد العروض مناسب لك؟\n\n` +
  `1️⃣ نعم، أبي أتواصل مع المكتب\n` +
  `2️⃣ أبحث بمواصفات مختلفة\n\n` +
  `اكتب رقم الاختيار`
);
return;
```

}

// الخطوة الرابعة - بعد عرض النتائج
if (session.step === ‘show_results’) {
if (msg === ‘1’ || msg.includes(‘نعم’) || msg.includes(‘تواصل’) || msg.includes(‘اتصل’)) {
await sendMessage(chatId,
`ممتاز! 🎉\nللتواصل المباشر مع المكتب:\n\n` +
`📞 *${OFFICE_PHONE}*\n\n` +
`أو اضغط هنا للاتصال:\n` +
`https://wa.me/966${OFFICE_PHONE.replace('0', '')}\n\n` +
`شكراً لتواصلك مع *${OFFICE_NAME}* 🏢`
);
resetSession(chatId);
} else {
resetSession(chatId);
await sendMessage(chatId,
`حسناً، لنبدأ بحثاً جديداً 🔄\n\n` +
`ما نوع العقار الذي تبحث عنه؟\n\n` +
`1️⃣ شقة\n2️⃣ فيلا\n3️⃣ دور\n4️⃣ جميع العقارات`
);
sessions[chatId].step = ‘choose_type’;
}
return;
}

// رسالة غير معروفة
await sendMessage(chatId,
`أهلاً 👋\nاكتب *قائمة* للبدء أو اختر:\n\n` +
`1️⃣ شقة\n2️⃣ فيلا\n3️⃣ دور\n4️⃣ جميع العقارات`
);
sessions[chatId].step = ‘choose_type’;
}

// =============================
// Webhook - استقبال الرسائل
// =============================
app.post(’/webhook’, async (req, res) => {
res.sendStatus(200);

const body = req.body;
if (!body || body.typeWebhook !== ‘incomingMessageReceived’) return;

const chatId = body.senderData?.chatId;
const text = body.messageData?.textMessageData?.textMessage;

if (!chatId || !text) return;
if (chatId.includes(’@g.us’)) return; // تجاهل رسائل المجموعات

console.log(`رسالة من ${chatId}: ${text}`);
await handleMessage(chatId, text);
});

// Health check
app.get(’/’, (req, res) => res.send(‘البوت يعمل ✅’));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`البوت يعمل على البورت ${PORT}`));
