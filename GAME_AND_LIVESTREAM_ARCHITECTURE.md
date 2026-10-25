# Last Flag Standing / Flags War Arena — Complete Technical & Livestream Automation Reference

> **Purpose of this Document**: This file is a complete, authoritative technical specification of the **Last Flag Standing (Flags War Arena)** application. You can hand this file directly to an AI assistant (Gemini, ChatGPT, Claude) or DevOps engineer to deploy, automate, monitor, and run unattended 6–24+ hour YouTube Live broadcasts on an **Oracle Cloud Free Tier VM** (or any Linux VPS).

---

## 1. High-Level Overview

**Last Flag Standing** (configurable as **Flags War Arena**) is a real-time, physics-driven, interactive 64-country battle royale broadcast application built specifically for **YouTube Live vertical (`9:16`, `1080×1920`)** and **horizontal (`16:9`, `1920×1080`)** livestreams.

### Core Gameplay Loop
1. **64 Country Flag Tokens** spawn inside a rotating circular neon arena (`ArenaCanvas.tsx`) powered by a custom 60 FPS **Matter.js** physics engine and HTML5 2D Canvas renderer.
2. **Outer Arena & Deflectors**: A glowing cyan outer ring contains 6 inner purple radial deflector bars that rotate counter-clockwise, keeping flags in constant orbital motion and deflecting them toward the center.
3. **Central Circular Elimination Chamber**:
   - Located at the exact center `(380, 380)` of the `760×760` logical physics arena (`HATCH_RADIUS = 58`).
   - Cycles between **CLOSED** (sealed mechanical iris that bounces flags outward) and **OPEN** (a concentric circular black-hole aperture `PIT_OPEN_RADIUS = 52` that expands radially from the center).
   - **Countdown Ring**: A top-right circular timer counts down (`4`, `3` in gold `#eab308`; `2`, `1` in emerald `#10b981`; `!` in hot-magenta `#ff1f8e` when open).
4. **Fair Single-Elimination & Double-Draw Rule**:
   - Standard openings have a **Draw Quota of 1 flag** (**Single Draw**).
   - Every **4th chamber cycle** (while more than 6 countries remain), or when triggered by the operator, the arena announces **`DOUBLE DRAW`** (**Draw Quota of 2 flags**).
   - **Closest-to-Center Tiebreaker**: If multiple flags touch the circular opening on the same frame, all candidates are sorted by Euclidean distance to `(380, 380)`. Only the closest flag is captured into the pit, and once the cycle's draw quota (`1` or `2`) is met, the chamber **immediately snaps shut** and pushes any runner-up flags safely outside.
5. **Dynamic Pacing**:
   - As countries are eliminated (`64 → 2`), `computeDynamicArenaPacing()` automatically increases flag velocity and shortens the chamber countdown cycle so the final 1v1 showdown stays fast and exciting instead of stalling in a large empty circle.
6. **Fair Viewer Interaction (Chat Shields & Wild Card Revivals)**:
   - **Zero Random/Pre-Seeded Shields**: Every match starts with **0 shields**. Shields are never granted randomly by the game.
   - **Protection Shield (`🛡️`)**: Earned **only** when live chat viewers comment a country's name (or ISO code / `!support <country>`) **25 times** (configurable via `supportShieldThreshold`), or via Super Chat / Membership. When a shielded flag enters the open central chamber, the shield blocks elimination, plays a save fanfare, announces `SHIELD SAVED · [COUNTRY]`, and repels the flag outward.
   - **Wild Card Comeback Revival (`❤️`)**: If an eliminated country receives **more than 50 chat comments** (`supportCount > 50`, configurable via `supportReviveThreshold`), it earns a **Wild Card Comeback Revival**, respawns back into the arena with a `COMEBACK · [COUNTRY]` banner and spoken announcement. Strictly limited to **maximum 1 revival per country per match** (`revivesAwarded === 0`).
7. **Match Winner & Continuous Loop**:
   - When 63 countries are eliminated, the last remaining country is crowned the **Match Winner**.
   - The win is persisted to `.data/session-standings.json` via `POST /api/session/record-win`.
   - After a 6-second winner reveal countdown, the next 64-country match automatically begins (`New Match! Cycle # begins now!`).
8. **11+ Hour Marathon & End-of-Stream Daily Finale**:
   - Once the session elapsed time reaches `targetStreamDurationHours` (default `11.5` hours, configurable `1.0–24.0` hours, or triggered manually via key `[E]` / Operator Console), the broadcast transitions after the current match into the **Official End-of-Stream Daily Standings Finale Screen**, showcasing the **#1 Champion of the Day**, total match victories, win-share percentage, #2/#3 podium, and Ranks #4–#11 leaderboard.

---

## 2. Tech Stack & Project Structure

### Runtime & Frameworks
- **Runtime**: Node.js (ES Modules `"type": "module"`, executed via `tsx server.ts`)
- **Backend**: Express (`server.ts`) serving both REST API routes (`/api/*`, `/auth/callback`) and the frontend app (Vite middleware in dev; static `dist/` in production when `NODE_ENV=production`)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite 6
- **Physics & Rendering**: `matter-js` (`0.20.0`) + HTML5 `<canvas>` (`ArenaCanvas.tsx` & `StadiumBackdrop.tsx`)
- **Audio & TTS**: Web Audio API 6-bus procedural synthesizer (`src/audio/soundEngine.ts`) + 100% free Microsoft Edge Neural TTS proxy (`node-edge-tts` on `/api/tts`) with optional `@google/genai` Gemini 2.5 Flash TTS and browser `window.speechSynthesis` fallback

### Key Files & Directories
```text
├── server.ts                         # Express server, YouTube Live chat scraper/OAuth, Neural TTS route, session persistence
├── package.json                      # Scripts (dev, build, start, test, lint) and dependencies
├── .env.example                      # Environment variable template
├── .data/                            # Auto-created runtime persistence directory
│   ├── session-standings.json        # Persisted match number, daily win counts, recent winners, arena settings
│   └── youtube-runtime-state.json    # Persisted YouTube OAuth tokens, active broadcast/chat ID, deduplicated event IDs
└── src/
    ├── App.tsx                       # Main broadcast stage (540×960 scaled 9:16 stage & 16:9 stage), HUD, hotkeys, audio/API wiring
    ├── main.tsx                      # React DOM entry point
    ├── index.css                     # Tailwind CSS v4 imports, custom fonts (Barlow Condensed, Inter, JetBrains Mono), animations
    ├── audio/
    │   └── soundEngine.ts            # 6-channel Web Audio synthesizer, automatic speech ducking, priority TTS queue
    ├── components/
    │   ├── CountryFlagBadge.tsx      # SVG/Canvas crisp circular country flag badge with optional cyan shield ring
    │   ├── StadiumBackdrop.tsx       # Procedural HTML5 Canvas + SVG Messi (#10 Blue) vs Ronaldo (#7 Red) stadium rivalry backdrop
    │   └── OperatorConsoleModal.tsx  # 5-tab Broadcast Operator Console modal ([O] key)
    ├── data/
    │   └── countries.ts              # Authoritative 64-country roster, flag drawing recipes, and chat alias matcher
    └── game/
        ├── ArenaCanvas.tsx           # 60 FPS Matter.js physics simulation & central circular elimination chamber renderer
        ├── rules.ts                  # Pure game rules, dynamic pacing, chat parser, shield/revive tracker, commentary builders
        └── rules.test.ts             # Vitest unit test suite (10 tests covering all game rules)
```

---

## 3. Exact Commands (Install, Build, Run, Test)

| Task | Command | Notes |
| :--- | :--- | :--- |
| **Install dependencies** | `npm install` | Installs Express, React, Matter.js, `node-edge-tts`, `tsx`, Vite, etc. |
| **Build frontend for production** | `npm run build` | Compiles static frontend bundle into `dist/` |
| **Start in production mode** | `NODE_ENV=production PORT=3000 npm start` | Runs `tsx server.ts` serving `dist/` and `/api/*` on port `3000` |
| **Start in development mode** | `npm run dev` | Runs `tsx server.ts` with Vite middleware on port `3000` |
| **Run unit tests** | `npm test` | Runs Vitest suite (`src/game/rules.test.ts`) |
| **Typecheck / Lint** | `npm run lint` | Runs `tsc --noEmit` |

---

## 4. URL Query Parameters for Automated Headless Streaming

When launching the app in a headless browser (`chromium` / `google-chrome`) on a cloud VM or inside an OBS Browser Source, use URL query parameters to control startup behavior automatically without human clicks:

| Query Parameter | Values | Effect |
| :--- | :--- | :--- |
| `screen=title` | `title` (optional) | If omitted, the app **auto-starts directly into the live arena** (`playing`). |
| `clean=1` or `mode=obs` | `1` / `obs` | **Clean Broadcast Mode**: Hides the top-left operator toolbar and **hides the mouse cursor (`cursor-none`)** so Xvfb's pointer never appears over the center circle. |
| `format` | `9:16` (default) or `16:9` | Selects the vertical (`9:16`, `540×960` scaled to `1080×1920`) or horizontal (`16:9`, `1920×1080`) layout. |

**Recommended Headless Livestream URL (Vertical Shorts 1080×1920)**:
```text
http://localhost:3000/?autostart=1&clean=1&format=9:16
```

**Recommended Headless Livestream URL (Horizontal 1920×1080)**:
```text
http://localhost:3000/?autostart=1&clean=1&format=16:9
```

---

## 5. Responsive `540×960` → `1080×1920` Stage Scaling Architecture

To guarantee that the UI looks identical on a small laptop preview (`~400×710`), a standard `540×960` window, and a full HD **`1080×1920` YouTube livestream**, the vertical `9:16` broadcast stage uses a locked **`540px × 960px` logical reference canvas**:
- A `ResizeObserver` measures the viewport wrapper and computes `stageScale = Math.min(wrapperWidth / 540, wrapperHeight / 960)`.
- At `1080×1920`, `stageScale` is **`2.0`**, scaling all HUD cards (`LAST FLAG STANDING`, `COUNTRIES 64`, `REMAINING`, `50px` countdown ring, `CHAT SUPPORT`, `COMMENT WHERE ARE YOU FROM?`, `SAVE YOUR COUNTRY`, `524×524` circular arena, `ALL ELIMINATED` 2-row flag grid, and bottom footer) proportionally by `2.0x`.
- Inside `ArenaCanvas.tsx`, the canvas backing store automatically detects the visual transform scale (`rect.width / cssSize`) and renders the internal physics canvas at up to `2.25x` high-DPI resolution (`1710×1710` pixels) so flags, text, and neon rings remain razor-sharp at 1080p.

---

## 6. Backend API Endpoints (`server.ts`)

All state and integrations are served from the same Express process on port `3000`:

### Health & Session Standings
- **`GET /api/health`**: Returns `{ status: 'ok', uptime, timestamp, operatingMode }`.
- **`GET /api/session/standings`**: Returns `{ sessionStartedAt, totalMatchesToday, matchNumber, winsByCountry, recentWinners, settings }`.
- **`POST /api/session/record-win`**: Body `{ matchNumber, countryCode, countryName }`. Increments the country's daily win count, increments `totalMatchesToday` and `matchNumber`, and persists to `.data/session-standings.json`.
- **`POST /api/session/settings`**: Body `{ settings }`. Persists updated `ArenaSettings` to disk.
- **`POST /api/session/reset`**: Body `{ confirm: true }`. Resets `winsByCountry`, `totalMatchesToday`, `matchNumber = 1`, and `sessionStartedAt = Date.now()`.

### Spoken Announcer TTS (`/api/tts`)
- **`POST /api/tts`**: Body `{ text, voiceName }`.
  1. **Primary (100% Free, Zero API Key)**: Uses `node-edge-tts` (`en-US-AriaNeural`, `en-GB-SoniaNeural`, `en-AU-NatashaNeural`, `en-US-GuyNeural`, `en-US-ChristopherNeural`) and returns `{ audioBase64, mimeType: 'audio/mpeg', provider: 'EDGE_NEURAL_FREE' }`.
  2. **Secondary (Optional)**: Uses `@google/genai` (`gemini-2.5-flash-preview-tts`) if `GEMINI_API_KEY` is set.
  3. **Client Fallback**: If the server cannot reach Microsoft Edge TTS, `soundEngine.ts` automatically falls back to browser `window.speechSynthesis`.

### YouTube Live Chat & Subscriber Integration
The server supports **two ways** to connect to a live YouTube broadcast:

#### Method A — Zero-Key Public YouTube Live Scraper (Recommended, 100% Free, No API Quota)
- **`POST /api/youtube/connect-live-url`**:
  - Body: `{ "liveUrlOrId": "https://www.youtube.com/watch?v=YOUR_VIDEO_ID" }` (or just the 11-char video ID).
  - Scrapes the live stream watch page for `INNERTUBE_API_KEY` and initial `liveChatContinuation` token, then polls `youtubei/v1/live_chat/get_live_chat` every ~3.5 seconds.
  - Parses viewer chat messages for country names/aliases (`parseChatForCountrySupport`), Super Chats (`liveChatPaidMessageRenderer`), new memberships (`liveChatMembershipItemRenderer`), and subscriber chat triggers (`just subscribed`, `!subscribed`, `new subscriber`).
  - Automatically starts ingestion (`ingestionActive: true`) so the frontend switches to **`LIVE`** mode.

#### Method B — Official Google OAuth 2.0 YouTube Data API v3 (Optional)
- **`GET /api/youtube/auth-url`**: Generates Google OAuth 2.0 consent URL (`youtube.readonly` scope).
- **`GET /auth/callback`**: Handles OAuth code exchange and persists tokens to `.data/youtube-runtime-state.json`.
- **`GET /api/youtube/broadcasts`**: Lists active broadcasts on the authenticated channel.
- **`POST /api/youtube/select-broadcast`**: Body `{ broadcastId, liveChatId }`.
- **`POST /api/youtube/chat/start`** & **`POST /api/youtube/chat/stop`**: Starts/stops official API polling.
- **`POST /api/youtube/subscribers/check`**: Polls `subscriptions.list` (`myRecentSubscribers=true`) for public subscribers.

#### Polling Endpoint Used by Frontend
- **`GET /api/youtube/status`**: Returns connection status, `liveChatId`, `ingestionActive`, and `seenSubscriberCount`.
- **`GET /api/youtube/chat/events?since=<timestamp>`**: Polled by the React frontend every `2000ms` when `ingestionActive` is true; returns deduplicated `CommunityEventPayload[]` items.

---

## 7. Environment Variables (`.env`)

None of these are required to run the game or use the Zero-Key YouTube Live URL scraper + Free Edge Neural TTS. All are optional:

| Variable | Required? | Purpose |
| :--- | :--- | :--- |
| `PORT` | Optional (default `3000`) | HTTP port for the Express + Vite/static server |
| `NODE_ENV` | Set to `production` on VM | Serves pre-built `dist/` instead of Vite dev middleware |
| `GEMINI_API_KEY` | Optional | Fallback Gemini 2.5 Flash TTS if Edge Neural TTS is disabled |
| `YOUTUBE_CLIENT_ID` | Optional | Google Cloud OAuth 2.0 Client ID (only if using Method B OAuth instead of Zero-Key URL scraper) |
| `YOUTUBE_CLIENT_SECRET` | Optional | Google Cloud OAuth 2.0 Client Secret |
| `YOUTUBE_REDIRECT_URI` | Optional | OAuth Redirect URI (`http://<host>:3000/auth/callback`) |
| `YOUTUBE_RTMPS_URL` | Used by FFmpeg script | `rtmps://a.rtmp.youtube.com/live2` |
| `YOUTUBE_STREAM_KEY` | Used by FFmpeg script | Your YouTube Studio Live Stream Key (`xxxx-xxxx-xxxx-xxxx-xxxx`) |
| `OPERATOR_ACCESS_KEY` | Optional | Custom string if you add remote auth middleware to protect operator endpoints |

---

## 8. Automating a 6–24+ Hour YouTube Livestream on an Oracle Cloud Free Tier VM

Because **Last Flag Standing** renders real-time 60 FPS HTML5 Canvas physics and Web Audio API sound effects/speech inside the browser, streaming it from a headless Linux server requires:
1. **Node.js server** running the app on `http://localhost:3000`
2. **`Xvfb`** (X Virtual Framebuffer) providing an in-memory `1080x1920x24` display (`:99`)
3. **`PulseAudio`** providing a virtual audio sink (`virtual_speaker`) so Chromium's Web Audio mixer + TTS voice can be captured
4. **Headless `Chromium`** rendering `http://localhost:3000/?autostart=1&clean=1&format=9:16` in kiosk mode with `--autoplay-policy=no-user-gesture-required`
5. **`FFmpeg`** capturing X11 display `:99` (`x11grab`) + PulseAudio (`virtual_speaker.monitor`), encoding H.264 + AAC, and pushing to `rtmps://a.rtmp.youtube.com/live2/$YOUTUBE_STREAM_KEY`

### Recommended Oracle Cloud Free Tier Shape
- **Best Choice (100% Free Always-Free Tier)**: **Oracle Cloud Ampere A1 (`VM.Standard.A1.Flex`)** configured with **4 OCPUs and 24 GB RAM** running **Ubuntu 22.04 or 24.04 LTS (ARM64)**.
  - *Why*: 4 dedicated ARM Neoverse-N1 cores easily sustain 60 FPS Matter.js/Canvas rendering in Chromium + real-time 1080×1920 H.264 encoding in FFmpeg (`-preset veryfast`) with zero CPU throttling and 10 TB/month free outbound bandwidth.
  - *(Note: Avoid `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB RAM) as it does not have enough CPU/RAM for simultaneous Chromium + 1080p FFmpeg encoding).*

### Step-by-Step Automation Script for Ubuntu VM (`start-livestream.sh`)

#### 1. Install System Packages on Ubuntu
```bash
sudo apt-get update && sudo apt-get install -y \
  curl git build-essential xvfb pulseaudio pulseaudio-utils \
  ffmpeg chromium-browser fonts-liberation fonts-noto-color-emoji
```
*(If Node.js 20+ is not installed, install via NodeSource: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`)*

#### 2. Clone, Build & Start the Game Server
```bash
git clone https://github.com/rohan-bhumij/Last-Flag-Standing.git
cd Last-Flag-Standing
npm install
npm run build
```

#### 3. Connect Your YouTube Live Chat Automatically via CLI (Zero-Key Method)
Once your YouTube broadcast is created/live and you have its 11-character Video ID or Watch URL (`https://www.youtube.com/watch?v=VIDEO_ID`), you can connect the live chat scraper automatically from a script (without even opening the Operator Console UI!) by calling:
```bash
curl -X POST http://localhost:3000/api/youtube/connect-live-url \
  -H "Content-Type: application/json" \
  -d '{"liveUrlOrId": "https://www.youtube.com/watch?v=YOUR_YOUTUBE_VIDEO_ID"}'
```
You can also configure the channel header title (`FLAGS WAR ARENA` or `LAST FLAG STANDING`) and marathon duration via CLI:
```bash
curl -X POST http://localhost:3000/api/session/settings \
  -H "Content-Type: application/json" \
  -d '{"settings": {"channelTitle": "FLAGS WAR ARENA", "targetStreamDurationHours": 11.5}}'
```

#### 4. Complete All-in-One Headless Broadcast Script (`run-oracle-stream.sh`)
Save this script on your Oracle VM, set your `YOUTUBE_STREAM_KEY`, and run it inside `tmux` or as a `systemd` service:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================
export PORT=3000
export NODE_ENV=production
export DISPLAY=:99
export YOUTUBE_RTMPS_URL="${YOUTUBE_RTMPS_URL:-rtmps://a.rtmp.youtube.com/live2}"
export YOUTUBE_STREAM_KEY="${YOUTUBE_STREAM_KEY:?Set YOUTUBE_STREAM_KEY before running}"
export YOUTUBE_LIVE_WATCH_URL="${YOUTUBE_LIVE_WATCH_URL:-}" # Optional: https://www.youtube.com/watch?v=...

WIDTH=1080
HEIGHT=1920
FPS=30 # Use 30 or 60 depending on VM OCPU count (30 FPS uses half the CPU)

cleanup() {
  echo "Stopping broadcast pipeline..."
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. Start Express + Game Server in background
echo "[1/5] Starting Last Flag Standing server on port $PORT..."
npm start &
sleep 3

# Optional: Auto-connect YouTube Live Chat Scraper if YOUTUBE_LIVE_WATCH_URL is provided
if [ -n "$YOUTUBE_LIVE_WATCH_URL" ]; then
  echo "[1b/5] Connecting YouTube Live Chat Scraper to $YOUTUBE_LIVE_WATCH_URL..."
  curl -s -X POST "http://localhost:${PORT}/api/youtube/connect-live-url" \
    -H "Content-Type: application/json" \
    -d "{\"liveUrlOrId\": \"${YOUTUBE_LIVE_WATCH_URL}\"}" || true
fi

# 2. Start Virtual Framebuffer (1080x1920 24-bit color)
echo "[2/5] Starting Xvfb on $DISPLAY (${WIDTH}x${HEIGHT})..."
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 ${WIDTH}x${HEIGHT}x24 -ac +extension GLX +render -noreset &
sleep 2

# 3. Start PulseAudio Virtual Speaker Sink
echo "[3/5] Starting PulseAudio virtual_speaker sink..."
pulseaudio -D --exit-idle-time=-1 || true
pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description="Virtual_Speaker" || true
pactl set-default-sink virtual_speaker

# 4. Launch Headless Chromium in Clean Broadcast Mode (Cursor Hidden automatically via ?clean=1)
echo "[4/5] Launching Chromium on http://localhost:${PORT}/?autostart=1&clean=1&format=9:16..."
CHROME_BIN=$(command -v chromium-browser || command -v chromium || command -v google-chrome)
"$CHROME_BIN" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --kiosk \
  --window-position=0,0 \
  --window-size=${WIDTH},${HEIGHT} \
  --autoplay-policy=no-user-gesture-required \
  --hide-scrollbars \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  "http://localhost:${PORT}/?autostart=1&clean=1&format=9:16" &
sleep 5

# 5. Start FFmpeg X11 + PulseAudio Capture -> YouTube RTMPS
echo "[5/5] Starting FFmpeg RTMPS stream to YouTube..."
ffmpeg -loglevel info -y \
  -f x11grab -draw_mouse 0 -r ${FPS} -s ${WIDTH}x${HEIGHT} -i :99.0+0,0 \
  -f pulse -i virtual_speaker.monitor \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -b:v 4500k -maxrate 4500k -bufsize 9000k -g $((FPS * 2)) \
  -c:a aac -b:a 160k -ar 44100 \
  -f flv "${YOUTUBE_RTMPS_URL}/${YOUTUBE_STREAM_KEY}"
```

*(Note: `-draw_mouse 0` in FFmpeg combined with `cursor-none` in `?clean=1` mode doubly guarantees the X11 mouse cursor is never rendered in the video stream).*

---

## 9. Keyboard Shortcuts & Operator Controls Reference

When accessing the app interactively in a browser (without `?clean=1`), the operator can use these keyboard shortcuts:

| Key | Action |
| :--- | :--- |
| **`O`** | Open / close the 5-tab **Broadcast Operator Console** |
| **`Space`** | Force-open the central circular elimination chamber immediately (Single Draw) |
| **`D`** | Trigger **DOUBLE DRAW** (up to 2 flags eliminated in the current cycle) |
| **`R`** | Trigger **RAPID FIRE x4** |
| **`B`** | Trigger a **Wild Card Comeback Revival** for the top-supported eliminated country |
| **`E`** | Toggle the **End-of-Stream Daily Winner & Full Standings Finale** screen |
| **`V` / `H`** | Switch between Vertical `9:16` (`1080×1920`) and Horizontal `16:9` (`1920×1080`) broadcast formats |
| **`M`** | Mute / unmute master broadcast audio |
| **`P` / `Esc`** | Pause / resume the physics simulation |
| **`C`** *(Demo Mode)* | Simulate a new subscriber popup alert |
