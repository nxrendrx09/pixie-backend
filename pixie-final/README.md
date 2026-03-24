# Pixie — Your Personal AI
### Tech: Gemini AI (free) + Render (free) + MongoDB Atlas (free)
### Total monthly cost: ₹0 for AI + ₹0 for hosting + ₹0 for DB = ₹0 🎉
### Only cost: ElevenLabs voice = $5/month (optional — works without it too)

---

## BEFORE YOU START — Install these (one time only)

1. **Node.js** → go to https://nodejs.org → download LTS → install
2. **Verify** → open VS Code terminal (Ctrl+`) → type `node --version` → should show v18+
3. **Install Expo** → in terminal: `npm install -g expo-cli`
4. **Install Expo Go app** on your phone → Play Store (Android) + App Store (iPhone)

---

## STEP 1 — Get Your API Keys (15 min)

### A) Gemini API Key (FREE — 1500 requests/day)
1. Go to → https://aistudio.google.com
2. Sign in with your Google account
3. Click **"Get API Key"** → **"Create API key in new project"**
4. Copy the key — looks like: `AIzaSy...`

### B) ElevenLabs Voice Key (optional but recommended)
1. Go to → https://elevenlabs.io
2. Sign up free → click your profile picture → **"API Keys"**
3. Copy your key
4. Go to → https://elevenlabs.io/voice-library
5. Search **"Indian female"** → pick a voice you like → click it
6. Copy the **Voice ID** from the URL bar (the long string after /voice/)

### C) MongoDB Atlas (FREE database)
1. Go to → https://mongodb.com/atlas → Sign up
2. Create a **FREE cluster** (M0 Sandbox — no credit card needed)
3. **Database Access** → Add New Database User → set username + password → note them down
4. **Network Access** → Add IP Address → click **"Allow Access from Anywhere"** (0.0.0.0/0)
5. Click **Connect** → **Drivers** → copy the connection string
   - It looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/`
   - Replace `<password>` with your actual password
   - Add `pixie` at the end: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/pixie`

---

## STEP 2 — Set Up Backend Locally (5 min)

Open VS Code → File → Open Folder → select the `pixie-final/backend` folder

In terminal:
```bash
npm install
```

Create your `.env` file:
1. Find the file called `.env.example` in the backend folder
2. Duplicate it and rename the copy to `.env`
3. Fill it in:
```
GEMINI_API_KEY=AIzaSy_your_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=XB0fDUnXU5powFXDhCwa
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/pixie
```

Test it works locally:
```bash
npm run dev
```
You should see:
```
🚀 Pixie is live on port 3001
✅ MongoDB connected
```
Press Ctrl+C to stop. Now deploy it.

---

## STEP 3 — Push to GitHub (3 min)

1. Go to → https://github.com → New repository → name it `pixie-backend` → Create
2. In VS Code terminal (inside backend folder):
```bash
git init
git add .
git commit -m "Pixie backend initial"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pixie-backend.git
git push -u origin main
```
**Important:** Make sure `.env` is NOT pushed (it's in .gitignore already)

---

## STEP 4 — Deploy to Render.com (FREE — 5 min)

1. Go to → https://render.com → Sign up with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your `pixie-backend` GitHub repo
4. Settings:
   - **Name:** pixie-backend (or anything you like)
   - **Region:** Singapore (closest to India)
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free ✅
5. Click **"Advanced"** → **"Add Environment Variable"** → add each key from your `.env`:
   - `GEMINI_API_KEY` = your gemini key
   - `ELEVENLABS_API_KEY` = your elevenlabs key
   - `ELEVENLABS_VOICE_ID` = your voice id
   - `MONGODB_URI` = your mongodb connection string
6. Click **"Create Web Service"**
7. Wait 2-3 minutes → Render gives you a URL like:
   **`https://pixie-backend.onrender.com`**
8. Visit `https://pixie-backend.onrender.com/health` — you should see: `{"status":"✅ Pixie is alive!"}`

---

## STEP 5 — Connect Mobile App (5 min)

Open `pixie-final/mobile/App.js` in VS Code

Find line 14:
```javascript
const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com';
```
Replace with your actual Render URL:
```javascript
const BACKEND_URL = 'https://pixie-backend.onrender.com';
```

In terminal (inside mobile folder):
```bash
npm install
npx expo start
```

A QR code appears → scan it:
- **Android:** Open Expo Go app → scan
- **iPhone:** Open Camera app → point at QR → tap the link

**Pixie opens on your phone!** 🎉

---

## STEP 6 — Connect Web App (2 min)

Open `pixie-final/web/index.html`

Find this line near the bottom:
```javascript
const BACKEND = 'https://YOUR-APP-NAME.onrender.com';
```
Replace with your Render URL.

To use it locally: just open `index.html` in Chrome — done!

To deploy web app (optional, for access from any laptop):
1. Go to → https://vercel.com → Sign up with GitHub
2. Push the `web` folder to a GitHub repo
3. Import on Vercel → Deploy → get a URL

---

## WHAT PIXIE CAN DO RIGHT NOW

✅ Chat in natural Hinglish
✅ Remember everything you tell her (forever, across sessions)
✅ Indian female voice (ElevenLabs)
✅ See photos you send — camera + gallery
✅ Sync between mobile and laptop in real-time
✅ Morning briefing every day at 7 AM
✅ Detect your mood and adjust her response
✅ Never sleeps (keep-alive ping built in)

---

## TOTAL COST BREAKDOWN

| Service | Cost |
|---|---|
| Gemini AI (1500 req/day free) | ₹0 |
| Render.com (free tier) | ₹0 |
| MongoDB Atlas (512MB free) | ₹0 |
| Vercel web hosting | ₹0 |
| ElevenLabs voice | $5/mo (optional) |
| **TOTAL** | **₹0 — $5/mo** |

---

## TROUBLESHOOTING

**"Cannot connect to Pixie"**
→ Check the Render URL is correct in App.js and index.html
→ Visit your-render-url.onrender.com/health — if it loads, backend is fine

**"Pixie takes 30-50 seconds to reply first time"**
→ Normal — Render free tier has a cold start. After first message it's fast.
→ The keep-alive ping prevents this during active use

**"No voice / audio"**
→ Check ELEVENLABS_API_KEY is set in Render environment variables
→ Pixie still works without voice — just no audio

**"MongoDB error in logs"**
→ Go to MongoDB Atlas → Network Access → confirm 0.0.0.0/0 is there

**Need help with any step?** Ask me — I'll debug it with you!
