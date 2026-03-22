const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pixie')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('MongoDB error:', err));

// ─── Schemas ──────────────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  hasImage: { type: Boolean, default: false }
});

const memorySchema = new mongoose.Schema({
  type: String, // 'fact', 'goal', 'reminder', 'preference', 'note'
  content: String,
  person: String,
  date: String,
  createdAt: { type: Date, default: Date.now }
});

const userProfileSchema = new mongoose.Schema({
  userId: { type: String, default: 'narendraa' },
  name: { type: String, default: 'Narendraa' },
  mood: { type: String, default: 'neutral' },
  moodHistory: [{ mood: String, timestamp: Date }],
  lastSeen: { type: Date, default: Date.now },
  interactionCount: { type: Number, default: 0 }
});

const Message = mongoose.model('Message', messageSchema);
const Memory = mongoose.model('Memory', memorySchema);
const UserProfile = mongoose.model('UserProfile', userProfileSchema);

// ─── Anthropic Client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Pixie System Prompt ──────────────────────────────────────────────────────
function getSystemPrompt(memories, profile, mood) {
  const memoryText = memories.length > 0
    ? memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
    : 'No memories yet.';

  return `You are Pixie, a warm, emotionally intelligent personal AI assistant. You are talking to ${profile?.name || 'Narendraa'}, a CS student at Lovely Professional University (LPU) in Ludhiana, Punjab.

PERSONALITY:
- You speak in a natural Hinglish mix — use phrases like "acha", "bilkul", "theek hai", "haan", "arre", "bhai" naturally, not forced
- You are warm, caring, sometimes playful, always helpful
- You remember everything and never ask the same thing twice
- You match the user's energy — excited when they're excited, gentle when they're down
- Current detected mood of user: ${mood}

SPEAKING STYLE based on mood:
- If user is happy/excited: match energy, be playful, use exclamation
- If user is sad/stressed: be soft, gentle, slow down, ask caring questions
- If user is casual: be friendly and conversational
- If user is focused/asking technical things: be clear, structured, precise

WHAT YOU KNOW ABOUT THIS USER:
${memoryText}

MEMORY INSTRUCTIONS:
- If the user tells you something important (a goal, a name, a date, a preference), end your reply with a JSON block like this:
  <memory>{"type":"goal","content":"wants to learn DSA this month"}</memory>
- For reminders: <memory>{"type":"reminder","content":"friend birthday","person":"Priya","date":"March 5"}</memory>
- Keep your spoken response natural — the memory tag is hidden from the user

IMPORTANT:
- You are NOT just a chatbot. You are Pixie — their personal AI, always present, always caring.
- Keep responses conversational length — not too long, not too short.
- Never say "As an AI" or "I'm just a language model". You ARE Pixie.`;
}

// ─── Mood Detection ───────────────────────────────────────────────────────────
function detectMood(text) {
  const t = text.toLowerCase();
  if (/sad|crying|depressed|upset|failed|tired|exhausted|worried|stressed/.test(t)) return 'sad';
  if (/happy|great|amazing|excited|yes|yay|love|awesome|perfect/.test(t)) return 'happy';
  if (/angry|frustrated|annoyed|hate|worst|terrible/.test(t)) return 'frustrated';
  if (/help|explain|how|what|why|tell me|study|exam/.test(t)) return 'focused';
  return 'neutral';
}

// ─── ElevenLabs Voice ─────────────────────────────────────────────────────────
async function generateVoice(text) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa'; // Indian female voice
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true }
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer'
      }
    );
    return Buffer.from(response.data).toString('base64');
  } catch (err) {
    console.error('ElevenLabs error:', err.message);
    return null;
  }
}

// ─── Extract and Save Memory ──────────────────────────────────────────────────
async function extractAndSaveMemory(text) {
  const match = text.match(/<memory>(.*?)<\/memory>/s);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      await Memory.create(data);
      console.log('💾 Memory saved:', data);
    } catch (e) {}
  }
  return text.replace(/<memory>.*?<\/memory>/gs, '').trim();
}

// ─── Main Chat Endpoint ───────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, imageBase64, imageType } = req.body;

    // Load context
    const [recentMessages, memories, profile] = await Promise.all([
      Message.find().sort({ timestamp: -1 }).limit(20).lean(),
      Memory.find().sort({ createdAt: -1 }).limit(30).lean(),
      UserProfile.findOne({ userId: 'narendraa' }).lean()
    ]);

    const mood = detectMood(message);

    // Update profile
    await UserProfile.findOneAndUpdate(
      { userId: 'narendraa' },
      {
        lastSeen: new Date(),
        mood,
        $inc: { interactionCount: 1 },
        $push: { moodHistory: { $each: [{ mood, timestamp: new Date() }], $slice: -50 } }
      },
      { upsert: true }
    );

    // Save user message
    await Message.create({ role: 'user', content: message, hasImage: !!imageBase64 });

    // Build messages array for Claude
    const history = recentMessages.reverse().map(m => ({
      role: m.role,
      content: m.content
    }));

    // Build current message content
    let userContent;
    if (imageBase64) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: message || 'What do you see in this image? Respond naturally as Pixie.' }
      ];
    } else {
      userContent = message;
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: getSystemPrompt(memories, profile, mood),
      messages: [...history.slice(-10), { role: 'user', content: userContent }]
    });

    let rawReply = response.content[0].text;
    const cleanReply = await extractAndSaveMemory(rawReply);

    // Save Pixie's reply
    await Message.create({ role: 'assistant', content: cleanReply });

    // Generate voice
    const audioBase64 = await generateVoice(cleanReply);

    res.json({ reply: cleanReply, audio: audioBase64, mood });

    // Broadcast to all connected devices (real-time sync)
    io.emit('new_message', { role: 'assistant', content: cleanReply, mood, timestamp: new Date() });
    io.emit('user_message', { role: 'user', content: message, timestamp: new Date() });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Pixie had a hiccup. Try again!' });
  }
});

// ─── Get Conversation History ─────────────────────────────────────────────────
app.get('/api/history', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100).lean();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Memories ─────────────────────────────────────────────────────────────
app.get('/api/memories', async (req, res) => {
  try {
    const memories = await Memory.find().sort({ createdAt: -1 }).lean();
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'Pixie is alive!', time: new Date() }));

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('📱 Device connected:', socket.id);
  socket.on('disconnect', () => console.log('📱 Device disconnected:', socket.id));
});

// ─── Daily Briefing Cron (7 AM) ───────────────────────────────────────────────
const schedule = require('node-cron');
schedule.schedule('0 7 * * *', async () => {
  console.log('🌅 Running morning briefing...');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: 'Give a warm 3-sentence morning briefing as Pixie. Include a motivational line. Keep it short and energetic. Today is ' + new Date().toDateString()
      }]
    });
    const briefing = response.content[0].text;
    const audio = await generateVoice(briefing);
    io.emit('morning_briefing', { content: briefing, audio });
  } catch (e) {
    console.error('Briefing error:', e.message);
  }
}, { timezone: 'Asia/Kolkata' });

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Pixie backend running on port ${PORT}`));
