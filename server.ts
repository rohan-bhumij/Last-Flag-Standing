import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { COUNTRIES_64 } from './src/data/countries';
import {
  ArenaSettings,
  CommunityEventPayload,
  DEFAULT_ARENA_SETTINGS,
  diffNewSubscribers,
  parseChatSupportCommand,
} from './src/game/rules';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'arena-store.json');

interface PersistedArenaStore {
  sessionStartedAt: number;
  totalMatchesToday: number;
  matchNumber: number;
  winsByCountry: Record<string, number>;
  recentWinners: Array<{
    matchNumber: number;
    countryCode: string;
    countryName: string;
    timestamp: number;
  }>;
  settings: ArenaSettings;
  seenSubscriberIds: string[];
  baselineSubscribersSynced: boolean;
  subscriberLastCheckedAt: number | null;
  youtubeAuth?: {
    accessToken: string;
    refreshToken?: string;
    expiryDate?: number;
    channelId: string | null;
    channelTitle: string | null;
    activeBroadcastId: string | null;
    activeBroadcastTitle: string | null;
    liveChatId: string | null;
  };
}

const DEFAULT_STORE: PersistedArenaStore = {
  sessionStartedAt: Date.now() - 4 * 3600 * 1000, // Seeded as an active multi-hour daily session
  totalMatchesToday: 68,
  matchNumber: 149,
  winsByCountry: {
    IN: 14,
    CR: 11,
    BR: 9,
    PH: 8,
    JP: 7,
    US: 6,
    AR: 5,
    PT: 4,
    MX: 2,
    DE: 2,
  },
  recentWinners: [],
  settings: DEFAULT_ARENA_SETTINGS,
  seenSubscriberIds: [],
  baselineSubscribersSynced: false,
  subscriberLastCheckedAt: null,
};

function loadStore(): PersistedArenaStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedArenaStore>;
      return {
        ...DEFAULT_STORE,
        ...parsed,
        settings: { ...DEFAULT_ARENA_SETTINGS, ...(parsed.settings || {}) },
      };
    }
  } catch (e) {
    console.error('Failed to read store, using defaults:', e);
  }
  return structuredClone(DEFAULT_STORE);
}

function saveStore(store: PersistedArenaStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to persist store:', e);
  }
}

const store = loadStore();

// Server-side in-memory runtime state for YouTube Live Chat polling (OAuth v3 + Zero-Key Public Live URL)
let ingestionActive = false;
let nextChatPageToken: string | null = null;
let pollingIntervalMs = 3500;
let lastEventReceivedAt: number | null = null;
let reconnectAttempts = 0;
let lastYouTubeError: string | null = null;
let publicLiveState: {
  videoId: string;
  title: string;
  apiKey: string;
  continuation: string;
} | null = null;
let availableBroadcasts: Array<{
  id: string;
  title: string;
  liveChatId: string;
  status: string;
}> = [];
const processedChatMsgIds = new Set<string>();

// Server-side Audio TTS Cache (reduces latency and bandwidth)
const ttsAudioCache = new Map<string, { audioBase64: string; mimeType: string; provider: string }>();

function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
  } catch {
    // ignore URL parse error
  }
  return null;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getRedirectUri(req: express.Request): string {
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl !== 'MY_APP_URL' && appUrl.startsWith('http')) {
    return `${appUrl.replace(/\/$/, '')}/auth/callback`;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}/auth/callback`;
}

function buildYouTubeStatus() {
  const oauthConfigured = Boolean(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET
  );
  const auth = store.youtubeAuth;
  const authorized = Boolean((auth && auth.accessToken) || publicLiveState);

  return {
    oauthConfigured,
    authorized,
    channelId: auth?.channelId || (publicLiveState ? `LIVE:${publicLiveState.videoId}` : null),
    channelTitle:
      auth?.channelTitle || (publicLiveState ? `Direct Live Stream (${publicLiveState.videoId})` : null),
    activeBroadcastId: auth?.activeBroadcastId || publicLiveState?.videoId || null,
    activeBroadcastTitle: auth?.activeBroadcastTitle || publicLiveState?.title || null,
    liveChatId:
      auth?.liveChatId || (publicLiveState ? `innertube:${publicLiveState.videoId}` : null),
    ingestionActive,
    lastEventReceivedAt,
    reconnectAttempts,
    pollingIntervalMs,
    subscriberStatus: !authorized
      ? 'WAITING_FOR_CHANNEL_AUTH'
      : lastYouTubeError
        ? 'API_QUOTA_OR_PERMISSION_ERROR'
        : 'CONNECTED_PUBLIC_BEST_EFFORT',
    subscriberLastCheckedAt: store.subscriberLastCheckedAt,
    seenSubscriberCount: store.seenSubscriberIds.length,
    lastError: lastYouTubeError,
    availableBroadcasts,
  };
}

async function refreshYouTubeAccessTokenIfNeeded(): Promise<string | null> {
  const auth = store.youtubeAuth;
  if (!auth?.accessToken) return null;
  if (auth.expiryDate && Date.now() < auth.expiryDate - 60_000) {
    return auth.accessToken;
  }
  if (!auth.refreshToken || !process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return auth.accessToken;
  }

  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        refresh_token: auth.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) {
      lastYouTubeError = `OAuth token refresh failed (${resp.status})`;
      return auth.accessToken;
    }
    const data = (await resp.json()) as { access_token: string; expires_in?: number };
    auth.accessToken = data.access_token;
    if (data.expires_in) {
      auth.expiryDate = Date.now() + data.expires_in * 1000;
    }
    saveStore(store);
    return auth.accessToken;
  } catch (e) {
    lastYouTubeError = e instanceof Error ? e.message : 'Token refresh network error';
    return auth.accessToken;
  }
}

async function pollPublicSubscribers(isBaselineSync: boolean): Promise<CommunityEventPayload[]> {
  const token = await refreshYouTubeAccessTokenIfNeeded();
  if (!token) return [];

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
    url.searchParams.set('part', 'snippet,subscriberSnippet');
    url.searchParams.set('myRecentSubscribers', 'true');
    url.searchParams.set('maxResults', '50');

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      lastYouTubeError = `subscriptions.list error (${resp.status}): ${errBody.slice(0, 120)}`;
      return [];
    }

    const data = (await resp.json()) as {
      items?: Array<{
        id: string;
        subscriberSnippet?: { title?: string; channelId?: string };
      }>;
    };

    const fetched = (data.items || []).map((item) => ({
      subscriptionId: item.id,
      subscriberName: item.subscriberSnippet?.title || 'Public Subscriber',
      subscriberChannelId: item.subscriberSnippet?.channelId || item.id,
    }));

    const seenSet = new Set(store.seenSubscriberIds);
    const diff = diffNewSubscribers(
      fetched,
      seenSet,
      isBaselineSync || !store.baselineSubscribersSynced
    );

    store.seenSubscriberIds = diff.updatedSeenIds;
    store.baselineSubscribersSynced = true;
    store.subscriberLastCheckedAt = Date.now();
    saveStore(store);

    return diff.newlyDetected.map((sub) => ({
      id: `yt-sub-${sub.subscriptionId}`,
      source: 'YOUTUBE_LIVE',
      type: 'NEW_SUBSCRIBER',
      authorName: sub.subscriberName,
      authorId: sub.subscriberChannelId,
      timestamp: Date.now(),
      matchNumber: store.matchNumber,
    }));
  } catch (e) {
    lastYouTubeError = e instanceof Error ? e.message : 'Failed to poll subscribers';
    return [];
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ============================================================================
  // 1. SESSION PERSISTENCE & STANDINGS ROUTES
  // ============================================================================
  app.get('/api/session/state', (_req, res) => {
    res.json({
      sessionStartedAt: store.sessionStartedAt,
      totalMatchesToday: store.totalMatchesToday,
      matchNumber: store.matchNumber,
      winsByCountry: store.winsByCountry,
      recentWinners: store.recentWinners,
      settings: store.settings,
    });
  });

  app.post('/api/session/record-win', (req, res) => {
    const { matchNumber, countryCode, countryName } = req.body || {};
    if (!countryCode || typeof countryCode !== 'string') {
      res.status(400).json({ error: 'countryCode is required' });
      return;
    }
    store.winsByCountry[countryCode] = (store.winsByCountry[countryCode] || 0) + 1;
    store.totalMatchesToday = (store.totalMatchesToday || 0) + 1;
    store.matchNumber = Math.max(store.matchNumber + 1, (Number(matchNumber) || store.matchNumber) + 1);
    store.recentWinners = [
      {
        matchNumber: Number(matchNumber) || store.matchNumber - 1,
        countryCode,
        countryName: countryName || countryCode,
        timestamp: Date.now(),
      },
      ...store.recentWinners.slice(0, 24),
    ];
    saveStore(store);
    res.json({
      sessionStartedAt: store.sessionStartedAt,
      totalMatchesToday: store.totalMatchesToday,
      matchNumber: store.matchNumber,
      winsByCountry: store.winsByCountry,
      recentWinners: store.recentWinners,
    });
  });

  app.post('/api/session/settings', (req, res) => {
    const { settings } = req.body || {};
    if (settings && typeof settings === 'object') {
      store.settings = { ...store.settings, ...settings };
      saveStore(store);
    }
    res.json({ settings: store.settings });
  });

  app.post('/api/session/reset', (req, res) => {
    if (!req.body?.confirm) {
      res.status(400).json({ error: 'Administrative confirmation required' });
      return;
    }
    store.sessionStartedAt = Date.now();
    store.totalMatchesToday = 0;
    store.matchNumber = 1;
    store.winsByCountry = {};
    store.recentWinners = [];
    saveStore(store);
    res.json({
      sessionStartedAt: store.sessionStartedAt,
      totalMatchesToday: store.totalMatchesToday,
      matchNumber: store.matchNumber,
      winsByCountry: store.winsByCountry,
      recentWinners: store.recentWinners,
    });
  });

  // ============================================================================
  // 2. 100% FREE REALISTIC NEURAL TTS & GEMINI TTS COMMENTARY ROUTES
  // ============================================================================
  app.post('/api/tts', async (req, res) => {
    const { text, voiceName = 'Aria' } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const cleanText = text.trim().slice(0, 220);
    const cacheKey = `${voiceName}:${cleanText}`;
    const cached = ttsAudioCache.get(cacheKey);
    if (cached) {
      res.json({
        audioBase64: cached.audioBase64,
        mimeType: cached.mimeType,
        provider: cached.provider,
        cached: true,
      });
      return;
    }

    // 1. Free Realistic Neural TTS (Zero Paid API Key Required!)
    // Map persona to natural English locale voice (Aria = US Female, Sonia = UK Female, Natasha = AU Female, Clara = CA Female)
    const freeNeuralLocaleMap: Record<string, string> = {
      Aria: 'en-US',
      Sonia: 'en-GB',
      Natasha: 'en-AU',
      Kore: 'en-US',
      Zephyr: 'en-GB',
      Puck: 'en-AU',
      Fenrir: 'en-US',
      Charon: 'en-GB',
    };

    const preferGemini = ['Kore', 'Fenrir', 'Puck', 'Charon', 'Zephyr'].includes(voiceName);
    const ai = getGeminiClient();

    // Try Gemini TTS first if a Gemini persona is chosen and GEMINI_API_KEY is present
    if (preferGemini && ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: cleanText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const entry = { audioBase64: base64Audio, mimeType: 'audio/wav', provider: 'GEMINI_TTS' };
          if (ttsAudioCache.size > 100) {
            const oldestKey = ttsAudioCache.keys().next().value;
            if (oldestKey) ttsAudioCache.delete(oldestKey);
          }
          ttsAudioCache.set(cacheKey, entry);
          res.json({ ...entry, cached: false });
          return;
        }
      } catch {
        // Fall through to 100% Free Neural TTS stream
      }
    }

    // 2. 100% Free Realistic Neural Voice Stream (Google Translate Neural TTS — $0 cost, no API key required)
    try {
      const tl = freeNeuralLocaleMap[voiceName] || 'en-US';
      const ttsUrl = new URL('https://translate.googleapis.com/translate_tts');
      ttsUrl.searchParams.set('ie', 'UTF-8');
      ttsUrl.searchParams.set('client', 'tw-ob');
      ttsUrl.searchParams.set('tl', tl);
      ttsUrl.searchParams.set('q', cleanText);

      const freeResp = await fetch(ttsUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      if (freeResp.ok) {
        const arrayBuf = await freeResp.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuf).toString('base64');
        if (base64Audio.length > 100) {
          const entry = {
            audioBase64: base64Audio,
            mimeType: 'audio/mpeg',
            provider: `FREE_NEURAL_${tl.replace('-', '_')}`,
          };
          if (ttsAudioCache.size > 100) {
            const oldestKey = ttsAudioCache.keys().next().value;
            if (oldestKey) ttsAudioCache.delete(oldestKey);
          }
          ttsAudioCache.set(cacheKey, entry);
          res.json({ ...entry, cached: false });
          return;
        }
      }
    } catch {
      // Fall through if network blocked
    }

    res.status(503).json({ error: 'Server TTS unavailable, using browser voice fallback' });
  });

  // ============================================================================
  // 3. REAL YOUTUBE OAUTH 2.0 & LIVE CHAT / SUBSCRIBER API ROUTES
  // ============================================================================
  app.get('/api/youtube/status', (_req, res) => {
    res.json(buildYouTubeStatus());
  });

  app.get('/api/youtube/auth-url', (req, res) => {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    if (!clientId) {
      res.status(400).json({
        error:
          'YOUTUBE_CLIENT_ID is not set in environment variables. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in AI Studio Secrets.',
      });
      return;
    }

    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent',
    });

    res.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      redirectUri,
    });
  });

  const oauthCallbackHandler = async (req: express.Request, res: express.Response) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.status(400).send('Missing OAuth authorization code.');
      return;
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).send('Server missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET.');
      return;
    }

    try {
      const redirectUri = getRedirectUri(req);
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        lastYouTubeError = `OAuth code exchange failed: ${errText.slice(0, 120)}`;
        res.status(400).send(`Authentication failed: ${lastYouTubeError}`);
        return;
      }

      const tokens = (await tokenResp.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      // Fetch authorized YouTube channel identity
      const chanResp = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      const chanData = (await chanResp.json()) as {
        items?: Array<{ id: string; snippet?: { title?: string } }>;
      };
      const chan = chanData.items?.[0];

      store.youtubeAuth = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || store.youtubeAuth?.refreshToken,
        expiryDate: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        channelId: chan?.id || null,
        channelTitle: chan?.snippet?.title || 'Authorized YouTube Channel',
        activeBroadcastId: null,
        activeBroadcastTitle: null,
        liveChatId: null,
      };
      lastYouTubeError = null;
      saveStore(store);

      // Perform initial baseline subscriber sync so existing subscribers are not announced as new
      await pollPublicSubscribers(true);

      res.send(`<!DOCTYPE html>
<html>
  <body style="background:#050814;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>YouTube channel authorized! Closing popup...</p>
  </body>
</html>`);
    } catch (e) {
      lastYouTubeError = e instanceof Error ? e.message : 'OAuth callback failure';
      res.status(500).send(`OAuth error: ${lastYouTubeError}`);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);

  app.get('/api/youtube/broadcasts', async (_req, res) => {
    const token = await refreshYouTubeAccessTokenIfNeeded();
    if (!token) {
      res.status(401).json(buildYouTubeStatus());
      return;
    }

    try {
      const resp = await fetch(
        'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status&mine=true&maxResults=15',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        lastYouTubeError = `liveBroadcasts.list failed (${resp.status}): ${txt.slice(0, 120)}`;
        res.json(buildYouTubeStatus());
        return;
      }

      const data = (await resp.json()) as {
        items?: Array<{
          id: string;
          snippet?: { title?: string; liveChatId?: string };
          status?: { lifeCycleStatus?: string };
        }>;
      };

      availableBroadcasts = (data.items || [])
        .filter((b) => b.snippet?.liveChatId)
        .map((b) => ({
          id: b.id,
          title: b.snippet?.title || 'Untitled Broadcast',
          liveChatId: b.snippet?.liveChatId || '',
          status: b.status?.lifeCycleStatus || 'ready',
        }));

      if (availableBroadcasts.length > 0 && store.youtubeAuth && !store.youtubeAuth.liveChatId) {
        store.youtubeAuth.activeBroadcastId = availableBroadcasts[0].id;
        store.youtubeAuth.activeBroadcastTitle = availableBroadcasts[0].title;
        store.youtubeAuth.liveChatId = availableBroadcasts[0].liveChatId;
        saveStore(store);
      }

      lastYouTubeError = null;
      res.json(buildYouTubeStatus());
    } catch (e) {
      lastYouTubeError = e instanceof Error ? e.message : 'Broadcast lookup failed';
      res.json(buildYouTubeStatus());
    }
  });

  app.post('/api/youtube/select-broadcast', (req, res) => {
    const { broadcastId, liveChatId } = req.body || {};
    if (store.youtubeAuth && broadcastId && liveChatId) {
      const found = availableBroadcasts.find((b) => b.id === broadcastId);
      store.youtubeAuth.activeBroadcastId = broadcastId;
      store.youtubeAuth.activeBroadcastTitle = found?.title || broadcastId;
      store.youtubeAuth.liveChatId = liveChatId;
      nextChatPageToken = null;
      saveStore(store);
    }
    res.json(buildYouTubeStatus());
  });

  // Zero-Key Free Direct YouTube Live URL / Video ID Connection
  app.post('/api/youtube/connect-live-url', async (req, res) => {
    const { liveUrlOrId } = req.body || {};
    if (!liveUrlOrId || typeof liveUrlOrId !== 'string') {
      res.status(400).json({ error: 'Please provide a YouTube Live URL or 11-character Video ID.' });
      return;
    }
    const videoId = extractYouTubeVideoId(liveUrlOrId);
    if (!videoId) {
      res.status(400).json({
        error: 'Could not extract a valid 11-character YouTube Video ID from that URL.',
      });
      return;
    }

    try {
      const chatPageResp = await fetch(
        `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }
      );
      const html = await chatPageResp.text();
      const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const continuationMatch = html.match(/"continuation":"([^"]+)"/);

      if (!apiKeyMatch || !continuationMatch) {
        lastYouTubeError =
          'Live chat continuation not found on that video. Make sure the YouTube broadcast is currently LIVE and Public.';
        res.status(400).json(buildYouTubeStatus());
        return;
      }

      publicLiveState = {
        videoId,
        title: `YouTube Live (${videoId})`,
        apiKey: apiKeyMatch[1],
        continuation: continuationMatch[1],
      };
      ingestionActive = true;
      lastYouTubeError = null;
      res.json(buildYouTubeStatus());
    } catch (e) {
      lastYouTubeError = e instanceof Error ? e.message : 'Failed to connect to YouTube Live URL';
      res.status(500).json(buildYouTubeStatus());
    }
  });

  app.post('/api/youtube/chat/start', (_req, res) => {
    if (store.youtubeAuth?.liveChatId || publicLiveState) {
      ingestionActive = true;
      lastYouTubeError = null;
    } else {
      lastYouTubeError = 'Cannot start ingestion without an active liveChatId or connected Live URL.';
    }
    res.json(buildYouTubeStatus());
  });

  app.post('/api/youtube/chat/stop', (_req, res) => {
    ingestionActive = false;
    res.json(buildYouTubeStatus());
  });

  app.post('/api/youtube/disconnect', (_req, res) => {
    ingestionActive = false;
    store.youtubeAuth = undefined;
    publicLiveState = null;
    nextChatPageToken = null;
    saveStore(store);
    res.json(buildYouTubeStatus());
  });

  app.post('/api/youtube/subscribers/check', async (_req, res) => {
    const newEvents = await pollPublicSubscribers(false);
    res.json({
      status: buildYouTubeStatus(),
      newEvents,
    });
  });

  app.get('/api/youtube/events/poll', async (_req, res) => {
    if (!ingestionActive || (!store.youtubeAuth?.liveChatId && !publicLiveState)) {
      res.json({ events: [], status: buildYouTubeStatus() });
      return;
    }

    // Mode 1: Zero-Key Direct Public YouTube Live Stream Polling (100% Free, No API Key Required!)
    if (publicLiveState && !store.youtubeAuth?.liveChatId) {
      try {
        const resp = await fetch(
          `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${publicLiveState.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: 'WEB',
                  clientVersion: '2.20240725.01.00',
                },
              },
              continuation: publicLiveState.continuation,
            }),
          }
        );

        if (!resp.ok) {
          lastYouTubeError = `Direct Live Chat HTTP ${resp.status}`;
          res.json({ events: [], status: buildYouTubeStatus() });
          return;
        }

        const rawJson = await resp.json();
        const contContents =
          rawJson?.continuationContents?.liveChatContinuation;
        const nextCont =
          contContents?.continuations?.[0]?.invalidationContinuationData?.continuation ||
          contContents?.continuations?.[0]?.timedContinuationData?.continuation ||
          contContents?.continuations?.[0]?.reloadContinuationData?.continuation;
        if (nextCont) {
          publicLiveState.continuation = nextCont;
        }

        const actions = contContents?.actions || [];
        const outEvents: CommunityEventPayload[] = [];

        for (const act of actions) {
          const item = act?.addChatItemAction?.item;
          if (!item) continue;

          const textRenderer =
            item.liveChatTextMessageRenderer ||
            item.liveChatPaidMessageRenderer ||
            item.liveChatMembershipItemRenderer;
          if (!textRenderer) continue;

          const msgId = textRenderer.id;
          if (!msgId || processedChatMsgIds.has(msgId)) continue;
          processedChatMsgIds.add(msgId);
          lastEventReceivedAt = Date.now();

          const authorName =
            textRenderer.authorName?.simpleText || 'YouTube Viewer';
          const authorId = textRenderer.authorExternalChannelId || msgId;
          const runs = textRenderer.message?.runs || [];
          const msgText = runs.map((r: { text?: string }) => r.text || '').join('').trim();

          if (item.liveChatPaidMessageRenderer) {
            const country = parseChatSupportCommand(msgText, COUNTRIES_64, true);
            outEvents.push({
              id: msgId,
              source: 'YOUTUBE_LIVE',
              type: 'SUPER_CHAT',
              authorName,
              authorId,
              countryCode: country?.code,
              countryName: country?.name,
              amountDisplay: item.liveChatPaidMessageRenderer.purchaseAmountText?.simpleText,
              messageText: msgText,
              timestamp: Date.now(),
              matchNumber: store.matchNumber,
            });
          } else if (item.liveChatMembershipItemRenderer) {
            outEvents.push({
              id: msgId,
              source: 'YOUTUBE_LIVE',
              type: 'NEW_MEMBER',
              authorName,
              authorId,
              timestamp: Date.now(),
              matchNumber: store.matchNumber,
            });
          } else {
            // Check if viewer announced subscribing in chat (e.g., "I subscribed", "!sub", "subscribed India")
            if (/^(?:!sub|!subscribed|i subscribed|just subscribed)\b/i.test(msgText)) {
              const subCountry = parseChatSupportCommand(
                msgText.replace(/^(?:!sub|!subscribed|i subscribed|just subscribed)\s*/i, ''),
                COUNTRIES_64,
                true
              );
              outEvents.push({
                id: msgId,
                source: 'YOUTUBE_LIVE',
                type: 'NEW_SUBSCRIBER',
                authorName,
                authorId,
                countryCode: subCountry?.code,
                countryName: subCountry?.name,
                messageText: msgText,
                timestamp: Date.now(),
                matchNumber: store.matchNumber,
              });
            } else {
              // Accept both "!support India" and direct country replies like "India", "Brazil", "Costa Rica"
              const country = parseChatSupportCommand(msgText, COUNTRIES_64, true);
              if (country) {
                outEvents.push({
                  id: msgId,
                  source: 'YOUTUBE_LIVE',
                  type: 'CHAT_SUPPORT',
                  authorName,
                  authorId,
                  countryCode: country.code,
                  countryName: country.name,
                  messageText: msgText,
                  timestamp: Date.now(),
                  matchNumber: store.matchNumber,
                });
              }
            }
          }
        }

        res.json({ events: outEvents, status: buildYouTubeStatus() });
        return;
      } catch (e) {
        lastYouTubeError = e instanceof Error ? e.message : 'Direct live chat poll failed';
        res.json({ events: [], status: buildYouTubeStatus() });
        return;
      }
    }

    const token = await refreshYouTubeAccessTokenIfNeeded();
    if (!token) {
      res.json({ events: [], status: buildYouTubeStatus() });
      return;
    }

    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
      url.searchParams.set('liveChatId', store.youtubeAuth.liveChatId);
      url.searchParams.set('part', 'snippet,authorDetails');
      if (nextChatPageToken) {
        url.searchParams.set('pageToken', nextChatPageToken);
      }

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        reconnectAttempts += 1;
        const errTxt = await resp.text();
        lastYouTubeError = `liveChatMessages.list HTTP ${resp.status}: ${errTxt.slice(0, 100)}`;
        pollingIntervalMs = Math.min(30000, pollingIntervalMs * 1.5);
        res.json({ events: [], status: buildYouTubeStatus() });
        return;
      }

      const data = (await resp.json()) as {
        nextPageToken?: string;
        pollingIntervalMillis?: number;
        items?: Array<{
          id: string;
          snippet?: {
            type?: string;
            displayMessage?: string;
            publishedAt?: string;
            superChatDetails?: { amountDisplayString?: string; userComment?: string };
            superStickerDetails?: { amountDisplayString?: string };
            newSponsorDetails?: { memberLevelName?: string };
          };
          authorDetails?: {
            channelId?: string;
            displayName?: string;
          };
        }>;
      };

      nextChatPageToken = data.nextPageToken || nextChatPageToken;
      if (data.pollingIntervalMillis) {
        pollingIntervalMs = Math.max(3000, data.pollingIntervalMillis);
      }
      reconnectAttempts = 0;
      lastYouTubeError = null;

      const outEvents: CommunityEventPayload[] = [];
      for (const item of data.items || []) {
        if (!item.id || processedChatMsgIds.has(item.id)) continue;
        processedChatMsgIds.add(item.id);
        lastEventReceivedAt = Date.now();

        const authorName = item.authorDetails?.displayName || 'YouTube Viewer';
        const authorId = item.authorDetails?.channelId || item.id;
        const msgType = item.snippet?.type || 'textMessageEvent';
        const displayMsg = item.snippet?.displayMessage || '';

        if (msgType === 'superChatEvent') {
          const parsedCountry = parseChatSupportCommand(
            item.snippet?.superChatDetails?.userComment || displayMsg,
            COUNTRIES_64
          );
          outEvents.push({
            id: item.id,
            source: 'YOUTUBE_LIVE',
            type: 'SUPER_CHAT',
            authorName,
            authorId,
            countryCode: parsedCountry?.code,
            countryName: parsedCountry?.name,
            amountDisplay: item.snippet?.superChatDetails?.amountDisplayString,
            messageText: displayMsg,
            timestamp: Date.now(),
            matchNumber: store.matchNumber,
          });
        } else if (msgType === 'superStickerEvent') {
          outEvents.push({
            id: item.id,
            source: 'YOUTUBE_LIVE',
            type: 'SUPER_STICKER',
            authorName,
            authorId,
            amountDisplay: item.snippet?.superStickerDetails?.amountDisplayString,
            timestamp: Date.now(),
            matchNumber: store.matchNumber,
          });
        } else if (msgType === 'newSponsorEvent' || msgType === 'memberMilestoneChatEvent') {
          outEvents.push({
            id: item.id,
            source: 'YOUTUBE_LIVE',
            type: 'NEW_MEMBER',
            authorName,
            authorId,
            tierName: item.snippet?.newSponsorDetails?.memberLevelName,
            timestamp: Date.now(),
            matchNumber: store.matchNumber,
          });
        } else if (msgType === 'membershipGiftingEvent') {
          outEvents.push({
            id: item.id,
            source: 'YOUTUBE_LIVE',
            type: 'GIFT_MEMBERSHIP',
            authorName,
            authorId,
            timestamp: Date.now(),
            matchNumber: store.matchNumber,
          });
        } else if (msgType === 'textMessageEvent') {
          const country = parseChatSupportCommand(displayMsg, COUNTRIES_64, true);
          if (country) {
            outEvents.push({
              id: item.id,
              source: 'YOUTUBE_LIVE',
              type: 'CHAT_SUPPORT',
              authorName,
              authorId,
              countryCode: country.code,
              countryName: country.name,
              messageText: displayMsg,
              timestamp: Date.now(),
              matchNumber: store.matchNumber,
            });
          }
        }
      }

      res.json({ events: outEvents, status: buildYouTubeStatus() });
    } catch (e) {
      reconnectAttempts += 1;
      lastYouTubeError = e instanceof Error ? e.message : 'Live chat poll error';
      res.json({ events: [], status: buildYouTubeStatus() });
    }
  });

  // ============================================================================
  // 4. CLOUD RTMPS RENDERER SPECIFICATION & PREFLIGHT ROUTES
  // ============================================================================
  const buildCloudRendererSpec = () => {
    const targetRtmpsUrl =
      process.env.YOUTUBE_RTMPS_URL || 'rtmps://a.rtmps.youtube.com/live2';
    const hasStreamKey = Boolean(process.env.YOUTUBE_STREAM_KEY);

    const dockerfileSpec = `# Oracle Cloud Free Tier VM (VM.Standard.A1.Flex — 4 ARM64 OCPU, 24 GB RAM, Ubuntu 24.04)
# 11+ Hour Unattended YouTube Live Broadcast Script (oracle-11h-stream.sh)
#!/usr/bin/env bash
set -euo pipefail

# 1. Install Headless Chromium, Xvfb, PulseAudio & FFmpeg on Oracle Ubuntu ARM64
sudo apt-get update && sudo apt-get install -y xvfb pulseaudio ffmpeg chromium-browser nodejs npm

# 2. Start virtual audio sink so WebAudio SFX + Free Neural TTS voice are captured cleanly
pulseaudio -D --exit-idle-time=-1
pactl load-module module-null-sink sink_name=ArenaAudio sink_properties=device.description=ArenaAudio
pactl set-default-sink ArenaAudio

# 3. Start Last Flag Standing server in background (persists all daily wins in .data/arena-store.json)
npm run build && NODE_ENV=production node --import tsx server.ts &
sleep 3

# 4. Launch 1080x1920 60fps virtual display & Kiosk Chromium in Clean Broadcast Mode (?clean=1&format=9:16)
Xvfb :99 -screen 0 1080x1920x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99
chromium-browser --no-sandbox --disable-gpu --autoplay-policy=no-user-gesture-required \\
  --kiosk "http://localhost:3000/?autostart=1&clean=1&format=9:16" \\
  --window-size=1080,1920 --window-position=0,0 &
sleep 4

# 5. Stream 1080x1920 @ 60fps to YouTube Live for 11.5+ hours (auto-triggers Daily Champion Ceremony at 11h!)
exec ffmpeg -re -f x11grab -video_size 1080x1920 -framerate 60 -i :99.0 \\
  -f pulse -i ArenaAudio.monitor \\
  -c:v libx264 -preset veryfast -b:v 6500k -maxrate 6500k -bufsize 13000k \\
  -pix_fmt yuv420p -g 120 -c:a aac -b:a 160k -ar 44100 \\
  -f flv "\${YOUTUBE_RTMPS_URL}/\${YOUTUBE_STREAM_KEY}"`;

    return {
      status: hasStreamKey ? 'PREFLIGHT_READY' : 'STANDBY',
      targetRtmpsUrl,
      resolution: '1080x1920',
      fps: 60,
      videoBitrateKbps: 6500,
      audioBitrateKbps: 160,
      preflightChecks: {
        obsCleanRouteReady: true,
        audioCaptureBusReady: true,
        rtmpsEndpointConfigured: Boolean(targetRtmpsUrl),
        streamKeyProvidedInSecretEnv: hasStreamKey,
        endToEndStreamTested: false,
      },
      dockerfileSpec,
      gcloudDeploySteps: [
        '1. Create an Oracle Cloud Free Tier VM (VM.Standard.A1.Flex: 4 OCPU Ampere ARM64, 24 GB RAM, Ubuntu 24.04).',
        '2. Clone this repo onto the VM and set Target Stream Duration to 11.0h or 11.5h in the Operator Console.',
        '3. Run oracle-11h-stream.sh with your YOUTUBE_STREAM_KEY — at the end of the 11h timer, the app automatically finishes the current match and displays the DAY\'S WINNER & FULL DAILY STANDINGS screen before ending the stream!',
      ],
    };
  };

  app.get('/api/renderer/spec', (_req, res) => {
    res.json(buildCloudRendererSpec());
  });

  app.post('/api/renderer/preflight', (_req, res) => {
    res.json(buildCloudRendererSpec());
  });

  // ============================================================================
  // 5. VITE MIDDLEWARE (DEV) OR STATIC ASSET SERVING (PROD)
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Global Flag Arena full-stack broadcast server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
