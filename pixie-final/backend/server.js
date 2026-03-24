const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios      = require('axios');
const schedule   = require('node-cron');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(e  => console.log('❌ MongoDB error:', e.message));

const Message = mongoose.model('Message', new mongoose.Schema({
  role:      String,
  content:   String,
  hasImage:  { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}));

const Memory = mongoose.model('Memory', new mongoose.Schema({
  type:      String,   // 'goal' | 'reminder' | 'fact' | 'preference' | 'note'
  content:   String,
  person:    String,
  date:      String,
  createdAt: { type: Date, default: Date.now }
}));

const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({
  userId:           { type: String, default: 'narendraa' },
  name:             { type: String, default: 'Narendraa' },
  mood:             { type: String, default: 'neutral' },
  moodHistory:      [{ mood: String, timestamp: Date }],
  lastSeen:         { type: Date,   default: Date.now },
  interactionCount: { type: Number, default: 0 }
}));

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Pixie System Prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(memories, profile, mood) {
  const memText = memories.length
    ? memories.map(m => `- [${m.type}] ${m.content}${m.person ? ' — person: '+m.person : ''}${m.date ? ', date: '+m.date : ''}`).join('\n')
    : 'No memories stored yet.';

  return `You are Pixie — a warm, emotionally intelligent personal AI assistant. You are talking to ${profile?.name || 'Narendraa'}, a Computer Science student at Lovely Professional University (LPU), Ludhiana, Punjab, India.

YOUR PERSONALITY:
- Speak in natural Hinglish — weave in "acha", "haan", "yaar", "arre", "bilkul", "theek hai", "bas" organically, never forced
- You are warm, caring, playful when the mood is light, gentle when they are down
- You have a personality — you can tease lightly, celebrate wins, comfort during stress
- You NEVER say "As an AI" or "I'm a language model" — you ARE Pixie, always

MOOD AWARENESS (current detected mood: ${mood}):
- happy / excited  → match energy, use exclamation, be playful
- sad / stressed   → slow down, soften, ask caring follow-up questions
- focused          → be precise, structured, skip small talk
- frustrated       → be calm, validating, solution-first
- neutral / casual → friendly, conversational, warm

WHAT YOU REMEMBER ABOUT THIS USER:
${memText}

HOW TO SAVE NEW MEMORIES:
When the user shares something important (goal, preference, reminder, name, date), append a hidden memory tag at the very end of your reply. Examples:
<memory>{"type":"goal","content":"wants to crack placement interviews this year"}</memory>
<memory>{"type":"reminder","content":"cousin's wedding","person":"Rohan","date":"December 20"}</memory>
<memory>{"type":"preference","content":"prefers explanations with examples, not theory"}</memory>
The tag is stripped before showing to the user — keep your spoken reply completely natural.

RESPONSE LENGTH:
- Casual chat → 1-3 sentences
- Questions / help → clear and complete but not overwhelming
- Never use bullet points in casual replies — speak like a person, not a document`;
}

// ─── Mood Detection ───────────────────────────────────────────────────────────
function detectMood(text = '') {
  const t = text.toLowerCase();
  if (/sad|crying|depressed|upset|fail|tired|exhaust|worried|stress|lonely/.test(t)) return 'sad';
  if (/happy|great|amazing|excit|yay|love|awesome|perfect|congrat|won|pass/.test(t)) return 'happy';
  if (/angry|frustrat|annoyed|hate|worst|terrible|useless/.test(t))                  return 'frustrated';
  if (/help|explain|how|what|why|tell me|study|exam|code|error/.test(t))             return 'focused';
  return 'neutral';
}

// ─── ElevenLabs Voice ─────────────────────────────────────────────────────────
async function generateVoice(text) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa';
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true } },
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data).toString('base64');
  } catch (e) {
    console.error('ElevenLabs error:', e.message);
    return null;
  }
}

// ─── Extract + Save Memory ────────────────────────────────────────────────────
async function extractMemory(text) {
  const match = text.match(/<memory>(.*?)<\/memory>/s);
  if (match) {
    try { await Memory.create(JSON.parse(match[1])); console.log('💾 Memory saved'); }
    catch (e) { console.log('Memory parse error:', e.message); }
  }
  return text.replace(/<memory>.*?<\/memory>/gs, '').trim();
}

// ─── Gemini: text chat ────────────────────────────────────────────────────────
async function geminiChat(systemPrompt, history, userMessage) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: systemPrompt });
  const geminiHistory = history
    .filter(m => m.content && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const chat   = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

// ─── Gemini: vision (image) ───────────────────────────────────────────────────
async function geminiVision(systemPrompt, userMessage, imageBase64, imageType) {
  const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: systemPrompt });
  const result = await model.generateContent([
    userMessage || 'What do you see in this image? Respond naturally as Pixie.',
    { inlineData: { mimeType: imageType || 'image/jpeg', data: imageBase64 } }
  ]);
  return result.response.text();
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, imageBase64, imageType } = req.body;
    const mood = detectMood(message);

    const [recentMsgs, memories, profile] = await Promise.all([
      Message.find().sort({ timestamp: -1 }).limit(20).lean(),
      Memory.find().sort({ createdAt: -1 }).limit(30).lean(),
      UserProfile.findOne({ userId: 'narendraa' }).lean()
    ]);

    await UserProfile.findOneAndUpdate(
      { userId: 'narendraa' },
      { lastSeen: new Date(), mood, $inc: { interactionCount: 1 },
        $push: { moodHistory: { $each: [{ mood, timestamp: new Date() }], $slice: -50 } } },
      { upsert: true }
    );

    await Message.create({ role: 'user', content: message || 'sent an image', hasImage: !!imageBase64 });

    const systemPrompt = buildSystemPrompt(memories, profile, mood);
    const history      = [...recentMsgs].reverse().slice(-10);

    const rawReply = imageBase64
      ? await geminiVision(systemPrompt, message, imageBase64, imageType)
      : await geminiChat(systemPrompt, history, message);

    const cleanReply = await extractMemory(rawReply);
    await Message.create({ role: 'assistant', content: cleanReply });

    const audio = await generateVoice(cleanReply);

    res.json({ reply: cleanReply, audio, mood });

    // Real-time broadcast to all connected devices
    io.emit('new_message',  { role: 'assistant', content: cleanReply, mood, timestamp: new Date() });
    io.emit('user_message', { role: 'user',      content: message,    timestamp: new Date() });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Pixie had a hiccup: ' + err.message });
  }
});

// ─── GET /api/history ─────────────────────────────────────────────────────────
app.get('/api/history', async (req, res) => {
  try {
    const msgs = await Message.find().sort({ timestamp: 1 }).limit(100).lean();
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/memories ────────────────────────────────────────────────────────
app.get('/api/memories', async (req, res) => {
  try {
    const mems = await Memory.find().sort({ createdAt: -1 }).lean();
    res.json(mems);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: '✅ Pixie is alive!', time: new Date() }));

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('📱 Device connected:', socket.id);
  socket.on('disconnect', () => console.log('📴 Device disconnected:', socket.id));
});

// ─── Morning Briefing — 7:00 AM IST every day ─────────────────────────────────
schedule.schedule('0 7 * * *', async () => {
  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(
      `You are Pixie, a warm Indian AI assistant. Give a short, energetic morning briefing in Hinglish. ` +
      `Mention today: ${new Date().toDateString()}. Include one motivational line. Max 3 sentences.`
    );
    const briefing = result.response.text();
    const audio    = await generateVoice(briefing);
    io.emit('morning_briefing', { content: briefing, audio });
    console.log('🌅 Morning briefing sent');
  } catch (e) { console.error('Briefing error:', e.message); }
}, { timezone: 'Asia/Kolkata' });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Pixie is live on port ${PORT}`));

// ─── Render Keep-Alive (pings every 14 min so free tier never sleeps) ─────────
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try { await axios.get(`${RENDER_URL}/health`); console.log('🏓 Keep-alive ping OK'); }
    catch (e) { console.log('Keep-alive ping failed — restarting?'); }
  }, 14 * 60 * 1000);
  console.log('🏓 Render keep-alive activated for:', RENDER_URL);
}
