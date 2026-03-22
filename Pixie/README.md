# Pixie — Your Personal AI Assistant
## Complete Setup Guide (No coding experience needed)

---

## STEP 1 — Install Node.js
1. Go to https://nodejs.org
2. Download the "LTS" version (big green button)
3. Install it (just click Next, Next, Finish)
4. Open VS Code terminal (Ctrl+`) and type:
   ```
   node --version
   ```
   You should see something like v20.x.x ✅

---

## STEP 2 — Get Your API Keys (15 minutes)

### A) Anthropic (Claude AI)
1. Go to https://console.anthropic.com
2. Sign up → Go to "API Keys" → Create Key
3. Copy the key (starts with sk-ant-...)
4. Add $5 credit in Billing section

### B) ElevenLabs (Indian Voice)
1. Go to https://elevenlabs.io
2. Sign up free → Click your profile → "API Key"
3. Copy the key
4. Go to "Voice Library" → search "Indian" → pick a female voice
5. Click the voice → copy the Voice ID from the URL

### C) MongoDB Atlas (Database)
1. Go to https://mongodb.com/atlas
2. Sign up free → Create a FREE cluster (M0)
3. Database Access → Add user with password
4. Network Access → Add IP → "Allow from anywhere" (0.0.0.0/0)
5. Click Connect → Drivers → Copy the connection string
   Looks like: mongodb+srv://username:password@cluster.mongodb.net/pixie

---

## STEP 3 — Set Up the Backend

Open VS Code, open the `pixie/backend` folder, then in terminal:

```bash
npm install
```

Then create your `.env` file:
1. In VS Code, rename `.env.example` to `.env`
2. Fill in your keys:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key-here
ELEVENLABS_VOICE_ID=your-voice-id-here
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pixie
```

Test it runs locally:
```bash
npm run dev
```
You should see: 🚀 Pixie backend running on port 3001 ✅

---

## STEP 4 — Deploy Backend to Railway

1. Go to https://railway.app → Sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your pixie repository → Select the `backend` folder
4. Add your environment variables (same as .env) in Railway's Variables tab
5. Railway gives you a URL like: https://pixie-backend.up.railway.app
6. **Copy this URL** — you'll need it in Step 5 and 6

---

## STEP 5 — Set Up the Mobile App

In VS Code terminal, go to `pixie/mobile`:
```bash
npm install
```

Open `App.js` and find this line:
```javascript
const BACKEND_URL = 'https://YOUR-RAILWAY-URL.up.railway.app';
```
Replace it with your actual Railway URL from Step 4.

Install Expo Go on your phone:
- Android: Play Store → search "Expo Go"
- iPhone: App Store → search "Expo Go"

Then run:
```bash
npx expo start
```
Scan the QR code with:
- Android: Expo Go app
- iPhone: Camera app → tap the link

**Your Pixie app opens on your phone!** 🎉

---

## STEP 6 — Set Up the Web App (Laptop)

Open `pixie/web/index.html` and find this line:
```javascript
const BACKEND = 'https://YOUR-RAILWAY-URL.up.railway.app';
```
Replace with your Railway URL.

To deploy to Vercel (free):
1. Go to https://vercel.com → Sign up with GitHub
2. "Add New Project" → Import your repo → Set root to `web` folder
3. Deploy → Vercel gives you a URL like: https://pixie-web.vercel.app

Or just open `index.html` directly in Chrome to test locally!

---

## YOU'RE DONE! Here's what Pixie can do now:

✅ Chat with you in Hinglish naturally
✅ Speak back in Indian female voice
✅ Remember things you tell her (permanent memory)
✅ See photos you send her (camera + gallery)
✅ Sync across mobile and laptop in real-time
✅ Morning briefing every day at 7 AM
✅ Detect your mood and adjust her tone

---

## Troubleshooting

**"Cannot connect to backend"**
→ Check your Railway URL is correct in App.js and index.html

**"No voice audio"**
→ Check your ElevenLabs API key in Railway Variables

**"MongoDB error"**
→ Make sure you allowed 0.0.0.0/0 in MongoDB Network Access

**Need help?** Just ask me — I'll debug it with you!
