const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  clipboard,
  shell,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
  dialog,
  globalShortcut,
  session,
  net,
  safeStorage,
  powerMonitor,
} = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const dns = require('dns');
const os = require('os');
const fs = require('fs');
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
try { app.commandLine.appendSwitch('disable-ipv6'); } catch {}

function ignoreBrokenPipeError(err) {
  if (!err || err.code === 'EPIPE' || err.code === 'EOF' || err.code === 'ERR_STREAM_DESTROYED') {
    return;
  }
}
try { process.stdout?.on?.('error', ignoreBrokenPipeError); } catch {}
try { process.stderr?.on?.('error', ignoreBrokenPipeError); } catch {}
process.on('uncaughtException', (err) => {
  if (err && (err.code === 'EPIPE' || err.code === 'EOF' || err.code === 'ERR_STREAM_DESTROYED')) {
    return;
  }
  try {
    dialog.showErrorBox('Bedo Main Process Error', String(err?.stack || err?.message || err));
  } catch {}
});
const { DropShareServer } = require('./drop-share-server.cjs');
const { normalizeLanguage, getLocale, t: trMain } = require('./i18n.cjs');
const {
  GHelperBridgeClient,
  checkScheduledTaskStatus: checkGHelperTaskStatus,
  installScheduledTask: installGHelperTask,
  startScheduledTask: startGHelperTask,
  resolveGHelperToast,
  readGHelperStatus,
} = require('./ghelper-service.cjs');
const { createPerfMonitor } = require('./perf-monitor.cjs');
const { BedoService } = require('./bedo-service.cjs');
const { ensurePythonRuntimeBackground, getAvailablePythonExe, getPythonBootstrapStatus } = require('./python-bootstrap.cjs');
const { isKickStream, fetchKickStreamerCover } = require('./kick-cover.cjs');
const { queryWindowsBatteryEta } = require('./battery-eta.cjs');
const { createWindowsBannerSuppressor } = require('./win-banner-suppressor.cjs');
const { syncWindowsStartup } = require('./startup-policy.cjs');
const perfMonitor = createPerfMonitor();
let bedoService = null;
let windowsBannerSuppressor = null;

function getWindowsBannerSuppressor() {
  if (!windowsBannerSuppressor) {
    windowsBannerSuppressor = createWindowsBannerSuppressor({
      backupFilePath: path.join(app.getPath('userData'), 'windows-banner-backup.json'),
    });
  }
  return windowsBannerSuppressor;
}

function broadcastWindowsBannerStatus() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  try {
    const status = getWindowsBannerSuppressor().getStatusSync();
    settingsWindow.webContents.send('windows-banner-status-update', status);
  } catch {}
}

function syncWindowsBannerSuppressorBackground() {
  try {
    return getWindowsBannerSuppressor()
      .syncWithSettings(userSettings)
      .then((res) => {
        broadcastWindowsBannerStatus();
        return res;
      })
      .catch((err) => {
        console.warn('[win-banner-suppressor] sync failed:', err?.message || err);
        broadcastWindowsBannerStatus();
        return { ok: false, error: err?.message || String(err) };
      });
  } catch (err) {
    return Promise.resolve({ ok: false, error: err?.message || String(err) });
  }
}

// =========================================================================
// BEDO CHAT HISTORY (Persistent JSON in userData)
// =========================================================================
const MAX_BEDO_CHAT_HISTORY = 300;
const BEDO_SESSION_IDLE_MS = 45 * 60 * 1000;
let bedoChatHistoryCache = null;
let activeLiveBedoTurnId = null;
let activeBedoSessionId = null;
let explicitBedoSession = false;
let liveBedoSaveTimer = null;

function createBedoSessionId(ts = Date.now()) {
  return `sess_${ts}_${Math.random().toString(36).slice(2, 6)}`;
}

function getBedoChatHistoryPath() {
  return path.join(app.getPath('userData'), 'bedo-chat-history.json');
}

function _dedupeBedoChatHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const cleaned = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const u = String(item.userText || '').trim();
    const a = String(item.assistantText || '').trim();
    if (!u && !a) continue;
    // Drop orphaned empty-reply entry if an adjacent entry has the same userText within 60s
    if (!a) {
      const ts = Number(item.timestamp) || 0;
      const hasFilledSibling = entries.some(
        (other) =>
          other !== item &&
          String(other?.userText || '').trim().toLowerCase() === u.toLowerCase() &&
          String(other?.assistantText || '').trim().length > 0 &&
          Math.abs((Number(other?.timestamp) || 0) - ts) < 60000
      );
      if (hasFilledSibling) continue;
    }
    cleaned.push({ ...item });
  }

  // Assign sessionId to any legacy entries without one (chronologically grouped by 45-min gap)
  const chrono = [...cleaned].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  let curSess = null;
  let lastTs = 0;
  for (const item of chrono) {
    const ts = Number(item.timestamp) || Date.now();
    if (item.sessionId) {
      curSess = item.sessionId;
      lastTs = ts;
      continue;
    }
    if (!curSess || ts - lastTs > BEDO_SESSION_IDLE_MS) {
      curSess = createBedoSessionId(ts);
    }
    item.sessionId = curSess;
    lastTs = ts;
  }

  return cleaned.slice(0, MAX_BEDO_CHAT_HISTORY);
}

function ensureActiveBedoSessionId() {
  const list = loadBedoChatHistory();
  if (activeBedoSessionId) {
    if (explicitBedoSession) return activeBedoSessionId;
    const latestInSession = list.find((item) => item.sessionId === activeBedoSessionId);
    if (!latestInSession || Date.now() - (Number(latestInSession.timestamp) || 0) <= BEDO_SESSION_IDLE_MS) {
      return activeBedoSessionId;
    }
  }
  if (list.length > 0 && list[0].sessionId && Date.now() - (Number(list[0].timestamp) || 0) <= BEDO_SESSION_IDLE_MS) {
    activeBedoSessionId = list[0].sessionId;
    return activeBedoSessionId;
  }
  activeBedoSessionId = createBedoSessionId();
  return activeBedoSessionId;
}

function loadBedoChatHistory() {
  if (Array.isArray(bedoChatHistoryCache)) return bedoChatHistoryCache;
  try {
    const file = getBedoChatHistoryPath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(parsed)) {
        const cleaned = _dedupeBedoChatHistory(parsed);
        bedoChatHistoryCache = cleaned;
        if (cleaned.length !== parsed.length) {
          try {
            fs.writeFileSync(file, JSON.stringify(cleaned, null, 2), 'utf8');
          } catch {}
        }
        return bedoChatHistoryCache;
      }
    }
  } catch (err) {
    console.warn('[BedoChatHistory] load failed:', err?.message);
  }
  bedoChatHistoryCache = [];
  return bedoChatHistoryCache;
}

function broadcastBedoChatHistory(list) {
  const payload = Array.isArray(list) ? list : loadBedoChatHistory();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('bedo-chat-history-update', payload); } catch {}
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('bedo-chat-history-update', payload); } catch {}
  }
}

function broadcastBedoChatSync(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('bedo-chat-sync', payload); } catch {}
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('bedo-chat-sync', payload); } catch {}
  }
}

const _POISON_REPLY_RE = /(canlı internet erişimim|web arama aracım olmadığı|hızlıca bir arama yapıyorum|lütfen bekleyin|^(400|401|403|429|500):|API isteği başarısız|şu anda yoğun)/i;

function getCleanSessionTurns(sessionId, maxTurns = 6) {
  const list = loadBedoChatHistory();
  return list
    .filter((item) => {
      if (item.sessionId !== sessionId) return false;
      const u = String(item.userText || '').trim();
      const a = String(item.assistantText || '').trim();
      if (!u || !a) return false;
      if (_POISON_REPLY_RE.test(a)) return false;
      return true;
    })
    .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
    .slice(-maxTurns)
    .map((item) => ({
      userText: String(item.userText || '').trim().slice(0, 600),
      assistantText: String(item.assistantText || '').trim().slice(0, 900),
    }));
}

function loadUserMemoryContextForPrompt() {
  const lines = [];
  if (userSettings.userName && String(userSettings.userName).trim()) {
    lines.push(`- Kullanıcı adı: ${String(userSettings.userName).trim()}`);
  }
  try {
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'bedo-runtime', 'memory', 'memory.json') : '',
      path.join(__dirname, 'bedo-runtime', 'memory', 'memory.json'),
    ].filter(Boolean);
    const memFile = candidates.find((p) => fs.existsSync(p));
    if (memFile) {
      const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
      for (const [cat, bucket] of Object.entries(mem || {})) {
        if (cat === 'whatsapp_contacts' || !bucket) continue;
        if (typeof bucket === 'object') {
          for (const [k, v] of Object.entries(bucket)) {
            const val = v && typeof v === 'object' ? v.value ?? JSON.stringify(v) : v;
            if (val) lines.push(`- ${cat}/${k}: ${String(val).slice(0, 180)}`);
          }
        } else {
          lines.push(`- ${cat}: ${String(bucket).slice(0, 180)}`);
        }
      }
    }
  } catch {}
  return lines.length > 0 ? `[KULLANICI HAFIZASI]\n${lines.slice(0, 18).join('\n')}\n\n` : '';
}

function flushBedoChatHistoryToDisk() {
  if (liveBedoSaveTimer) {
    clearTimeout(liveBedoSaveTimer);
    liveBedoSaveTimer = null;
  }
  const list = loadBedoChatHistory();
  try {
    const file = getBedoChatHistoryPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('[BedoChatHistory] save failed:', err?.message);
  }
}

function scheduleBedoChatHistorySave() {
  if (liveBedoSaveTimer) clearTimeout(liveBedoSaveTimer);
  liveBedoSaveTimer = setTimeout(() => {
    flushBedoChatHistoryToDisk();
  }, 450);
}

function appendBedoChatEntry({ sessionId: explicitSid = '', userText = '', assistantText = '', provider = 'Bedo', source = 'text', timestamp = Date.now() }) {
  const cleanUser = String(userText || '').trim();
  const cleanAssistant = String(assistantText || '').trim();
  if (!cleanUser && !cleanAssistant) return null;
  const list = loadBedoChatHistory();
  if (explicitSid) {
    activeBedoSessionId = explicitSid;
    explicitBedoSession = true;
  }
  const sessionId = explicitSid || ensureActiveBedoSessionId();
  const entry = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    userText: cleanUser,
    assistantText: cleanAssistant,
    provider: String(provider || 'Bedo'),
    source: source === 'voice' || source === 'vision' ? source : 'text',
    timestamp: Number(timestamp) || Date.now(),
  };
  bedoChatHistoryCache = [entry, ...list].slice(0, MAX_BEDO_CHAT_HISTORY);
  flushBedoChatHistoryToDisk();
  broadcastBedoChatHistory(bedoChatHistoryCache);
  return entry;
}

function upsertLiveBedoChatTurn(role, rawText, { isNewTurn = false, source = 'voice', provider = 'Bedo' } = {}) {
  const clean = String(rawText || '').trim();
  if (!clean) return;
  const list = loadBedoChatHistory();
  let target = activeLiveBedoTurnId ? list.find((item) => item.id === activeLiveBedoTurnId) : null;

  if (role === 'user') {
    const samePendingUser =
      target &&
      !target.assistantText &&
      Date.now() - Number(target.timestamp || 0) <= 20000 &&
      (target.userText.toLowerCase() === clean.toLowerCase() ||
        clean.toLowerCase().startsWith(target.userText.toLowerCase()) ||
        target.userText.toLowerCase().startsWith(clean.toLowerCase()));

    const shouldStartNew =
      !samePendingUser &&
      (isNewTurn ||
        !target ||
        Boolean(target.assistantText) ||
        Date.now() - Number(target.timestamp || 0) > 60000);
    if (shouldStartNew) {
      const sessionId = ensureActiveBedoSessionId();
      const entry = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        userText: clean,
        assistantText: '',
        provider: String(provider || 'Bedo'),
        source: source === 'text' ? 'text' : 'voice',
        timestamp: Date.now(),
      };
      activeLiveBedoTurnId = entry.id;
      bedoChatHistoryCache = [entry, ...list].slice(0, MAX_BEDO_CHAT_HISTORY);
    } else {
      target.userText = clean;
      if (source === 'text') target.source = 'text';
      target.timestamp = Date.now();
      bedoChatHistoryCache = [...list];
    }
  } else if (role === 'assistant') {
    if (!target) {
      const sessionId = ensureActiveBedoSessionId();
      const entry = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        userText: '',
        assistantText: clean,
        provider: String(provider || 'Bedo'),
        source: source === 'text' ? 'text' : 'voice',
        timestamp: Date.now(),
      };
      activeLiveBedoTurnId = entry.id;
      bedoChatHistoryCache = [entry, ...list].slice(0, MAX_BEDO_CHAT_HISTORY);
    } else {
      target.assistantText = clean;
      target.provider = String(provider || target.provider || 'Bedo');
      bedoChatHistoryCache = [...list];
    }
  }
  scheduleBedoChatHistorySave();
  broadcastBedoChatHistory(bedoChatHistoryCache);
}

function hasConfiguredGeminiKey() {
  return Boolean(String(userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim());
}

function buildDefaultBedoStartOptions({ startPaused = true } = {}) {
  return {
    apiKey: userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '',
    openaiApiKey: userSettings.codexApiKey || process.env.OPENAI_API_KEY || '',
    anthropicApiKey: userSettings.claudeApiKey || process.env.ANTHROPIC_API_KEY || '',
    voice: userSettings.bedoVoice || 'Charon',
    speakerVolume: Number.isFinite(Number(userSettings.bedoSpeakerVolume))
      ? Number(userSettings.bedoSpeakerVolume)
      : 1,
    speakerMuted: Boolean(userSettings.bedoSpeakerMuted),
    startPaused: Boolean(startPaused),
    enableWake: userSettings.bedoEnableWake !== false,
    enableClap: false,
  };
}

function getBedoService() {
  if (bedoService) return bedoService;
  bedoService = new BedoService();
  bedoService.on('event', (msg) => {
    if (msg?.type === 'wake' && mainWindow && !mainWindow.isDestroyed()) {
      try {
        if (!mainWindow.isVisible()) mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      } catch {}
    }
    try {
      if (msg?.type === 'user_transcript') {
        upsertLiveBedoChatTurn('user', msg.text, { isNewTurn: Boolean(msg.new_turn), source: 'voice' });
      } else if (msg?.type === 'assistant_transcript') {
        upsertLiveBedoChatTurn('assistant', msg.text, { source: 'voice' });
      } else if (msg?.type === 'log') {
        if (msg.role === 'user') {
          const cleanUser = String(msg.text || '').replace(/^Siz:\s*/i, '').trim();
          upsertLiveBedoChatTurn('user', cleanUser, {
            isNewTurn: msg.source !== 'voice',
            source: msg.source === 'voice' ? 'voice' : 'text',
          });
        } else if (msg.role === 'assistant') {
          const cleanAssistant = String(msg.text || '').replace(/^Bedo:\s*/i, '').trim();
          upsertLiveBedoChatTurn('assistant', cleanAssistant, { source: 'voice' });
        }
      }
    } catch {}
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bedo-event', msg);
    }
  });
  bedoService.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bedo-status', status);
    }
  });
  bedoService.on('stderr', (line) => {
    console.warn('[Bedo]', line);
  });
  return bedoService;
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('force_low_power_gpu');
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=192');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-print-preview');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-speech-synthesis-api');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disk-cache-size', '10485760');
app.commandLine.appendSwitch('media-cache-size', '10485760');
app.commandLine.appendSwitch('enable-features', 'TrimOnMemoryPressure');
app.commandLine.appendSwitch(
  'disable-features',
  'SpareRendererForSitePerProcess,InterestFeedContentSuggestions,AutofillServerCommunication,CertificateTransparencyComponentUpdater,MetricsReporting,OptimizationHints,MediaRouter'
);

// Handle Squirrel.Windows install / update / uninstall lifecycle events cleanly
function handleSquirrelEvent() {
  if (process.platform !== 'win32' || process.argv.length <= 1) return false;
  const squirrelCmd = process.argv[1];
  if (
    squirrelCmd !== '--squirrel-install' &&
    squirrelCmd !== '--squirrel-updated' &&
    squirrelCmd !== '--squirrel-uninstall' &&
    squirrelCmd !== '--squirrel-obsolete'
  ) {
    return false;
  }
  const appFolder = path.resolve(process.execPath, '..');
  const rootAtomFolder = path.resolve(appFolder, '..');
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
  const exeName = path.basename(process.execPath);
  const spawnUpdate = (args) => {
    try {
      const child = spawn(updateDotExe, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
    } catch {}
  };
  if (squirrelCmd === '--squirrel-install' || squirrelCmd === '--squirrel-updated') {
    spawnUpdate(['--createShortcut', exeName]);
    setTimeout(() => app.quit(), 400);
    return true;
  }
  if (squirrelCmd === '--squirrel-uninstall') {
    spawnUpdate(['--removeShortcut', exeName]);
    setTimeout(() => app.quit(), 400);
    return true;
  }
  if (squirrelCmd === '--squirrel-obsolete') {
    app.quit();
    return true;
  }
  return false;
}

if (handleSquirrelEvent()) {
  process.exit(0);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive();
      mainWindow.webContents.send('notch-hover-change', true);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.setSkipTaskbar(false);
      settingsWindow.show();
      settingsWindow.focus();
    }
  });
}

function trimWorkingSetAndGC() {
  try {
    if (global.gc) {
      global.gc();
    }
  } catch {}
}

const CANVAS_WIDTH = 780;
const CANVAS_HEIGHT = 396;

const MODE_DIMENSIONS = {
  idle: { bodyWidth: 136, height: 22, earRadius: 8, bottomRadius: 11, droplet: 0 },
  'idle-live': { bodyWidth: 184, height: 22, earRadius: 8, bottomRadius: 11, droplet: 0 },
  'mini-progress': { bodyWidth: 268, height: 12, earRadius: 7, bottomRadius: 6, droplet: 0 },
  hud: { bodyWidth: 312, height: 36, earRadius: 0, bottomRadius: 18, droplet: 0 },
  battery: { bodyWidth: 366, height: 60, earRadius: 0, bottomRadius: 24, droplet: 0 },
  'notif-toast': { bodyWidth: 396, height: 60, earRadius: 0, bottomRadius: 24, droplet: 0 },
  'music-bar': { bodyWidth: 350, height: 26, earRadius: 9, bottomRadius: 13, droplet: 0 },
  'focus-bar': { bodyWidth: 110, height: 26, earRadius: 8, bottomRadius: 13, droplet: 0 },
  'focus-bar-media': { bodyWidth: 104, height: 26, earRadius: 8, bottomRadius: 13, droplet: 1 },
  'bedo-live': { bodyWidth: 256, height: 32, earRadius: 10, bottomRadius: 16, droplet: 0 },
  expanded: { bodyWidth: 620, height: 286, earRadius: 0, bottomRadius: 24, droplet: 0 },
};

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let trayContextMenu = null;
let notificationTargetFocusTimer = null;
let ghelperBridgeClient = null;
let lastMediaTitle = '';
let lastMediaArtist = '';
let lastMediaSourceApp = '';
let cachedThumbnail = '';
let cachedThumbnailIsKick = false;
let cachedLyrics = [];
let lyricsCacheMap = new Map();
let lyricsRequestId = 0;
let lyricsLookupKey = '';
let coverCacheMap = new Map();

function setBoundedCache(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value);
}

async function fetchAlbumCover(title, artist, album) {
  if (!title) return '';
  if (isKickStream(title, artist, album)) {
    const kickCacheKey = `kick__${artist || ''}__${title}`.toLowerCase();
    if (coverCacheMap.has(kickCacheKey)) {
      return coverCacheMap.get(kickCacheKey);
    }
    const kickCover = await fetchKickStreamerCover(title, artist, album);
    if (kickCover) {
      setBoundedCache(coverCacheMap, kickCacheKey, kickCover, 40);
    }
    return kickCover;
  }

  const cleanTitle = (title || '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|music|video|audio|lyric|lyrics|live|performance|hd|4k|klip|akustik)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  const cacheKey = `${cleanArtist}__${cleanTitle}`.toLowerCase();
  if (coverCacheMap.has(cacheKey)) {
    return coverCacheMap.get(cacheKey);
  }

  const queryTerms = [
    cleanArtist && cleanTitle ? `${cleanArtist} ${cleanTitle}` : cleanTitle,
    cleanTitle,
  ];

  for (const q of queryTerms) {
    if (!q) continue;
    // 1. Try iTunes Search API (very fast, high quality 600x600 cover)
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`;
      const coverUrl = await new Promise((resolve) => {
        const req = https.get(
          itunesUrl,
          { headers: { 'User-Agent': 'TwoCode-DynamicIsland/1.0' }, timeout: 3500 },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.results && parsed.results.length > 0 && parsed.results[0].artworkUrl100) {
                  return resolve(parsed.results[0].artworkUrl100.replace('100x100bb', '600x600bb'));
                }
              } catch {}
              resolve('');
            });
          }
        );
        req.on('error', () => resolve(''));
        req.on('timeout', () => {
          req.destroy();
          resolve('');
        });
      });
      if (coverUrl) {
        setBoundedCache(coverCacheMap, cacheKey, coverUrl, 100);
        return coverUrl;
      }
    } catch {}

    // 2. Fallback Deezer
    try {
      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`;
      const coverUrl = await new Promise((resolve) => {
        const req = https.get(
          deezerUrl,
          { headers: { 'User-Agent': 'TwoCode-DynamicIsland/1.0' }, timeout: 3500 },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.data && parsed.data.length > 0 && parsed.data[0].album && parsed.data[0].album.cover_big) {
                  return resolve(parsed.data[0].album.cover_big);
                }
              } catch {}
              resolve('');
            });
          }
        );
        req.on('error', () => resolve(''));
        req.on('timeout', () => {
          req.destroy();
          resolve('');
        });
      });
      if (coverUrl) {
        setBoundedCache(coverCacheMap, cacheKey, coverUrl, 100);
        return coverUrl;
      }
    } catch {}
  }

  return '';
}
const EMPTY_MEDIA_STATE = {
  hasSession: false,
  title: '',
  artist: '',
  album: '',
  isPlaying: false,
  position: 0,
  duration: 0,
  sourceApp: '',
  thumbnail: '',
  lyrics: [],
};

let lastMediaState = { ...EMPTY_MEDIA_STATE };

function isBrowserMediaSource(sourceApp) {
  if (typeof sourceApp !== 'string' || !sourceApp.trim()) return false;
  return (
    /(?:chrome|msedge|microsoftedge|brave|opera|vivaldi|\barc\b|firefox|308046b0af4a39cb|0d797b6d|comet|zen|floorp|waterfox|librewolf|thorium|chromium|yandex)/i.test(sourceApp) &&
    !/_crx_/i.test(sourceApp)
  );
}

function resolveScriptPath(filename) {
  const unpackedDir = __dirname.replace(/app\.asar([\\/]|$)/i, 'app.asar.unpacked$1');
  const unpacked = path.join(unpackedDir, filename);
  if (unpacked !== path.join(__dirname, filename) && fs.existsSync(unpacked)) {
    return unpacked;
  }
  return path.join(__dirname, filename);
}

function checkBrowserMediaTabExists(sourceApp, title, artist) {
  return new Promise((resolve) => {
    const scriptPath = resolveScriptPath('win-focus-media.ps1');
    execFile(
      'powershell.exe',
      [
        '-WindowStyle', 'Hidden',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-SourceApp', sourceApp || '',
        '-Title', title || '',
        '-Artist', artist || '',
        '-CheckOnly',
      ],
      { windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(true);
        try {
          const parsed = JSON.parse(stdout.trim().split(/\r?\n/).pop());
          resolve(parsed?.exists !== false);
        } catch {
          resolve(true);
        }
      }
    );
  });
}

let clipboardHistory = [];
let lastClipboardText = '';
let lastClipboardImageKey = '';
const pendingApprovals = new Map();

let currentModeKey = 'idle';
let isHoveringNotch = false;
let isIgnoringMouse = true;
let leaveTimer = null;
let trimGcTimer = null;

// Current logical shape bounds for cursor hit-testing (visual morphing is GPU-composited in renderer)
let currentShape = { ...MODE_DIMENSIONS.idle };

function getDefaultUserName() {
  try {
    const raw = String(os.userInfo().username || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const genericOrSystem = new Set([
      'wdagutilityaccount',
      'administrator',
      'admin',
      'defaultaccount',
      'guest',
      'user',
      'owner',
      'system',
      'localservice',
      'networkservice',
      'pc',
      'default',
      'defaultuser0',
    ]);
    if (genericOrSystem.has(lower) || /^(desktop|laptop|win)-[a-z0-9]+$/i.test(raw)) {
      return '';
    }
    return raw;
  } catch {
    return '';
  }
}

// Persistent settings state shared between Dynamic Island & TwoCode Settings window
let userSettings = {
  userName: getDefaultUserName(),
  language: 'Turkish',
  theme: 'dark',
  onboardingCompleted: false,
  googleConnected: false,
  googleEmail: '',
  apps: [],
  islandOpenMode: 'On hover',
  islandSeeThrough: 4,
  outfit: 'None',
  bodyColor: 'Night',
  eyeColorName: 'White',
  eyeColorHex: '#ffffff',
  suppressWindowsBanners: false,
  lastSeenReleaseVersion: '',
  gameOptEnabled: true,
  gameOptHideIsland: true,
  gameOptPauseAnimations: true,
  gameOptDisableBlur: true,
  gameOptPauseBackgroundPolling: true,
  gameOptPauseBedoVoice: false,
  gameOptAllowHudAndNotifs: true,
  gameOptDeepHideWindow: false,
};

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'twocode-settings.json');
}

function getAgentIntegrationPaths() {
  const home = os.homedir();
  return {
    codex: path.join(home, '.codex', 'hooks.json'),
    antigravity: path.join(home, '.gemini', 'config', 'hooks.json'),
    claude: path.join(home, '.claude', 'settings.json'),
    hookScript: path.join(app.getPath('userData'), 'integrations', 'twocode-agent-hook.ps1'),
  };
}

function commandExistsOnPath(names) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = pathEnv.split(path.delimiter).map((d) => d.trim()).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      try {
        if (fs.existsSync(path.join(dir, name))) return true;
      } catch {}
    }
  }
  return false;
}

function detectInstalledAgents() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  const antigravityIdePath = userSettings.antigravityIdePath || '';
  const detectedIde = [
    antigravityIdePath,
    path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(localAppData, 'Programs', 'Google', 'Antigravity', 'Antigravity.exe'),
    path.join(programFiles, 'Antigravity', 'Antigravity.exe'),
  ].find((candidate) => candidate && fs.existsSync(candidate)) || '';

  const codexInstalled = Boolean(
    commandExistsOnPath(['codex.exe', 'codex.cmd', 'codex.ps1']) ||
    fs.existsSync(path.join(appData, 'npm', 'codex.cmd')) ||
    fs.existsSync(path.join(localAppData, 'Programs', 'Codex', 'Codex.exe')) ||
    fs.existsSync(path.join(home, '.codex', 'config.toml')) ||
    fs.existsSync(path.join(home, '.codex', 'auth.json'))
  );

  const antigravityInstalled = Boolean(
    detectedIde ||
    commandExistsOnPath(['agy.exe', 'agy.cmd', 'antigravity.exe', 'antigravity.cmd']) ||
    fs.existsSync(path.join(home, '.gemini', 'antigravity'))
  );

  const claudeInstalled = Boolean(
    commandExistsOnPath(['claude.exe', 'claude.cmd', 'claude.ps1']) ||
    fs.existsSync(path.join(appData, 'npm', 'claude.cmd')) ||
    fs.existsSync(path.join(home, '.local', 'bin', 'claude.exe')) ||
    fs.existsSync(path.join(localAppData, 'Programs', 'claude-code', 'claude.exe')) ||
    fs.existsSync(path.join(home, '.claude.json'))
  );

  return { codexInstalled, antigravityInstalled, claudeInstalled, detectedIde };
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}

function readExistingJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Invalid settings file: ${filePath}`);
  }
  return parsed;
}

function getAgentIntegrationStatus() {
  const paths = getAgentIntegrationPaths();
  const { codexInstalled, antigravityInstalled, claudeInstalled, detectedIde } = detectInstalledAgents();
  const codex = readJsonFile(paths.codex);
  const antigravity = readJsonFile(paths.antigravity);
  const claude = readJsonFile(paths.claude);
  const hasCodexHook = (eventName) => Boolean(codex.hooks?.[eventName]?.some((entry) => entry.hooks?.some((hook) => hook.command?.includes('twocode-agent-hook.ps1'))));
  const hasClaudeHook = (eventName) => Boolean(claude.hooks?.[eventName]?.some((entry) => entry.hooks?.some((hook) => hook.command?.includes('twocode-agent-hook.ps1'))));
  const antigravityMonitor = antigravity['twocode-agent-monitor'];
  return {
    codexInstalled,
    antigravityInstalled,
    claudeInstalled,
    codexConnected: codexInstalled && hasCodexHook('UserPromptSubmit') && hasCodexHook('Stop'),
    antigravityConnected: antigravityInstalled && Boolean(antigravityMonitor?.PreInvocation?.length && antigravityMonitor?.Stop?.length),
    claudeConnected: claudeInstalled && hasClaudeHook('UserPromptSubmit') && hasClaudeHook('Stop'),
    antigravityIdePath: detectedIde,
    codexConfigPath: paths.codex,
    antigravityConfigPath: paths.antigravity,
    claudeConfigPath: paths.claude,
  };
}

function createAgentHookCommand(agent) {
  const scriptPath = getAgentIntegrationPaths().hookScript;
  return `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" ${agent}`;
}

async function connectAgentIntegrations() {
  const paths = getAgentIntegrationPaths();
  const { codexInstalled, antigravityInstalled, claudeInstalled } = detectInstalledAgents();
  if (!codexInstalled && !antigravityInstalled && !claudeInstalled) {
    return getAgentIntegrationStatus();
  }
  const hookScript = [
    'param([Parameter(Mandatory=$true)][ValidateSet("codex","antigravity","claude")][string]$Agent)',
    '$ErrorActionPreference = "SilentlyContinue"',
    '$raw = [Console]::In.ReadToEnd()',
    'try { $event = $raw | ConvertFrom-Json } catch { exit 0 }',
    '$eventName = [string]$event.hook_event_name',
    'if (-not $eventName) { $eventName = [string]$event.event }',
    'if (($Agent -eq "codex" -or $Agent -eq "claude") -and $eventName -eq "UserPromptSubmit") { $type = "thinking" }',
    'elseif ($Agent -eq "antigravity" -and $eventName -eq "PreInvocation") { if ($event.invocationNum -ne 0) { exit 0 }; $type = "thinking" }',
    'elseif ($eventName -eq "Stop") { if ($Agent -eq "antigravity" -and $event.fullyIdle -eq $false) { exit 0 }; $type = if ($event.error) { "error" } else { "done" } }',
    'elseif ($eventName -eq "Interrupt") { $type = "interrupted" }',
    'else { exit 0 }',
    '$agentName = if ($Agent -eq "codex") { "Codex" } elseif ($Agent -eq "claude") { "Claude Code" } else { "Antigravity IDE" }',
    '$title = if ($type -eq "thinking") { "Düşünüyor" } elseif ($type -eq "done") { "Yanıtladı" } elseif ($type -eq "error") { "Tamamlanamadı" } else { "Durduruldu" }',
    '$detail = if ($type -eq "thinking") { if ($event.prompt) { $event.prompt } else { $event.lastUserInput } } elseif ($type -eq "done") { if ($event.last_assistant_message) { $event.last_assistant_message } elseif ($event.prompt_response) { $event.prompt_response } else { "Yanıt hazır" } } else { [string]$event.error }',
    'if ($detail -and $detail.Length -gt 500) { $detail = $detail.Substring(0, 497) + "..." }',
    '$payload = @{ agent = $agentName; type = $type; title = $title; detail = [string]$detail; event = $eventName; sessionId = if ($event.session_id) { $event.session_id } else { $event.conversationId } } | ConvertTo-Json -Compress',
    'try { Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4242/api/agent" -ContentType "application/json" -Body $payload -TimeoutSec 2 | Out-Null } catch {}',
    'if ($Agent -eq "antigravity") { if ($eventName -eq "Stop") { @{ decision = "allow" } | ConvertTo-Json -Compress } else { "{}" } }',
    'exit 0',
  ].join('\r\n');
  fs.mkdirSync(path.dirname(paths.hookScript), { recursive: true });
  fs.writeFileSync(paths.hookScript, hookScript, 'utf8');

  if (codexInstalled) {
    const codexConfig = readExistingJsonFile(paths.codex);
    if (codexConfig.hooks && (typeof codexConfig.hooks !== 'object' || Array.isArray(codexConfig.hooks))) {
      throw new Error('Codex hooks settings have an unsupported format.');
    }
    fs.mkdirSync(path.dirname(paths.codex), { recursive: true });
    codexConfig.hooks ||= {};
    for (const eventName of ['UserPromptSubmit', 'Stop', 'Interrupt']) {
      const entries = (codexConfig.hooks[eventName] || []).filter((entry) => !entry.hooks?.some((hook) => hook.command?.includes('twocode-agent-hook.ps1')));
      entries.push({
        hooks: [{ type: 'command', command: createAgentHookCommand('codex'), commandWindows: createAgentHookCommand('codex'), async: true, timeout: 3 }],
      });
      codexConfig.hooks[eventName] = entries;
    }
    fs.writeFileSync(paths.codex, JSON.stringify(codexConfig, null, 2), 'utf8');
  }

  if (antigravityInstalled) {
    const antigravityConfig = readExistingJsonFile(paths.antigravity);
    fs.mkdirSync(path.dirname(paths.antigravity), { recursive: true });
    const antigravityMonitor = antigravityConfig['twocode-agent-monitor'] || {};
    antigravityMonitor.enabled = true;
    for (const eventName of ['PreInvocation', 'Stop']) {
      antigravityMonitor[eventName] = [{ hooks: [{ type: 'command', command: createAgentHookCommand('antigravity'), timeout: 3 }] }];
    }
    antigravityConfig['twocode-agent-monitor'] = antigravityMonitor;
    fs.writeFileSync(paths.antigravity, JSON.stringify(antigravityConfig, null, 2), 'utf8');
  }

  if (claudeInstalled) {
    const claudeConfig = readExistingJsonFile(paths.claude);
    fs.mkdirSync(path.dirname(paths.claude), { recursive: true });
    claudeConfig.hooks ||= {};
    for (const eventName of ['UserPromptSubmit', 'Stop']) {
      const entries = (claudeConfig.hooks[eventName] || []).filter((entry) => !entry.hooks?.some((hook) => hook.command?.includes('twocode-agent-hook.ps1')));
      entries.push({
        hooks: [{ type: 'command', command: createAgentHookCommand('claude'), timeout: 3 }],
      });
      claudeConfig.hooks[eventName] = entries;
    }
    fs.writeFileSync(paths.claude, JSON.stringify(claudeConfig, null, 2), 'utf8');
  }

  return getAgentIntegrationStatus();
}

const API_KEY_SETTING_NAMES = [
  'claudeApiKey',
  'codexApiKey',
  'openaiApiKey',
  'geminiApiKey',
  'antigravityApiKey',
];

function settingsForDisk(settings) {
  const stored = { ...settings };
  const encryptedApiKeys = [];
  if (safeStorage.isEncryptionAvailable()) {
    for (const name of API_KEY_SETTING_NAMES) {
      if (typeof stored[name] !== 'string' || !stored[name]) continue;
      stored[name] = safeStorage.encryptString(stored[name]).toString('base64');
      encryptedApiKeys.push(name);
    }
  }
  stored.encryptedApiKeys = encryptedApiKeys;
  return stored;
}

function restoreApiKeysFromDisk(settings) {
  const restored = { ...settings };
  const encryptedApiKeys = Array.isArray(restored.encryptedApiKeys)
    ? restored.encryptedApiKeys
    : [];
  for (const name of encryptedApiKeys) {
    if (!API_KEY_SETTING_NAMES.includes(name)) continue;
    if (!safeStorage.isEncryptionAvailable()) {
      delete restored[name];
      continue;
    }
    try {
      restored[name] = safeStorage.decryptString(Buffer.from(restored[name], 'base64'));
    } catch {
      delete restored[name];
    }
  }
  delete restored.encryptedApiKeys;
  return restored;
}

function writeFileAtomicSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function loadSettingsFromDisk() {
  try {
    const p = getSettingsFilePath();
    const legacyPath = path.join(app.getPath('appData'), 'twocode-island', 'twocode-settings.json');
    const sourcePath = fs.existsSync(p) ? p : fs.existsSync(legacyPath) ? legacyPath : '';
    if (sourcePath) {
      const parsed = restoreApiKeysFromDisk(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
      if (parsed.onboardingCompleted === undefined) {
        parsed.onboardingCompleted = true;
      }
      if (parsed.outfit === 'Best') {
        parsed.outfit = 'None';
      }
      if (Array.isArray(parsed.apps)) {
        parsed.apps = parsed.apps
          .filter((a) => !['yt', 'ghlp', 'gm'].includes(a.id))
          .map((a) => {
            if (a.url && (/^[a-zA-Z]:\\/i.test(a.url) || /\.(exe|lnk)$/i.test(a.url))) {
              return { ...a, path: a.url, type: 'native-app' };
            }
            return a;
          });
      }
      userSettings = { ...userSettings, ...parsed };
      writeFileAtomicSync(p, JSON.stringify(settingsForDisk(userSettings), null, 2));
    }
  } catch {}
  return userSettings;
}

function saveSettingsToDisk(nextSettings, opts = {}) {
  const prevLang = normalizeLanguage(userSettings.language);
  const prevOnboarding = Boolean(userSettings.onboardingCompleted);
  const prevSuppressBanners = Boolean(userSettings.suppressWindowsBanners);
  const prevWinNotifs = userSettings.windowsNotifications !== false;
  userSettings = { ...userSettings, ...(nextSettings || {}) };
  if (!prevOnboarding && userSettings.onboardingCompleted === true && !userSettings.lastSeenReleaseVersion) {
    // Fresh installs completing onboarding shouldn't immediately be shown a release popup too.
    userSettings.lastSeenReleaseVersion = app.getVersion();
  }
  if (
    Object.prototype.hasOwnProperty.call(nextSettings || {}, 'windowsNotifications') &&
    userSettings.windowsNotifications === false &&
    userSettings.suppressWindowsBanners
  ) {
    // Safety guard: never leave Windows banners suppressed if Ada notifications are turned off.
    userSettings.suppressWindowsBanners = false;
  }
  const nextSuppressBanners = Boolean(userSettings.suppressWindowsBanners);
  const nextWinNotifs = userSettings.windowsNotifications !== false;
  if (!opts.skipBannerSync && (prevSuppressBanners !== nextSuppressBanners || prevWinNotifs !== nextWinNotifs)) {
    syncWindowsBannerSuppressorBackground();
  }
  if (Object.prototype.hasOwnProperty.call(nextSettings || {}, 'startWithWindows')) {
    applyStartWithWindows(userSettings.startWithWindows !== false);
  }
  if (Object.prototype.hasOwnProperty.call(nextSettings || {}, 'globalShortcutsEnabled')) {
    registerGlobalShortcuts();
  }
  if (
    (Object.prototype.hasOwnProperty.call(nextSettings || {}, 'geminiApiKey') ||
      Object.prototype.hasOwnProperty.call(nextSettings || {}, 'codexApiKey') ||
      Object.prototype.hasOwnProperty.call(nextSettings || {}, 'claudeApiKey')) &&
    bedoService
  ) {
    bedoService.setProviderKeys({
      geminiApiKey: userSettings.geminiApiKey || '',
      openaiApiKey: userSettings.codexApiKey || '',
      anthropicApiKey: userSettings.claudeApiKey || '',
    });
  }
  if (
    Object.prototype.hasOwnProperty.call(nextSettings || {}, 'geminiApiKey') &&
    String(userSettings.geminiApiKey || '').trim() &&
    userSettings.bedoEnableWake !== false
  ) {
    try {
      const svc = getBedoService();
      if (!svc.getStatus().running) {
        svc.start(buildDefaultBedoStartOptions({ startPaused: true }));
      }
    } catch {}
  }
  if (
    Object.prototype.hasOwnProperty.call(nextSettings || {}, 'bedoVoice') ||
    Object.prototype.hasOwnProperty.call(nextSettings || {}, 'bedoEnableWake')
  ) {
    const svc = bedoService;
    if (svc && svc.getStatus().running) {
      const wasPaused = svc.getStatus().paused;
      svc.stop().then(() => {
        // If sleeping and wake-word was disabled, keep Python stopped (0 MB RAM until triggered).
        if (wasPaused && userSettings.bedoEnableWake === false) {
          return;
        }
        if (hasConfiguredGeminiKey()) {
          svc.start(buildDefaultBedoStartOptions({ startPaused: wasPaused }));
        }
      }).catch(() => {});
    } else if (
      Object.prototype.hasOwnProperty.call(nextSettings || {}, 'bedoEnableWake') &&
      userSettings.bedoEnableWake !== false &&
      hasConfiguredGeminiKey()
    ) {
      try {
        getBedoService().start(buildDefaultBedoStartOptions({ startPaused: true }));
      } catch {}
    }
  }
  try {
    writeFileAtomicSync(
      getSettingsFilePath(),
      JSON.stringify(settingsForDisk(userSettings), null, 2)
    );
  } catch {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-updated', userSettings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings-updated', userSettings);
  }
  syncGameModeState();
  if (normalizeLanguage(userSettings.language) !== prevLang && tray) {
    buildTrayContextMenu();
  }
  const startupMenuItem = trayContextMenu?.getMenuItemById('start-with-windows');
  if (startupMenuItem) startupMenuItem.checked = userSettings.startWithWindows !== false;
  return userSettings;
}

function applyStartWithWindows(enabled) {
  return syncWindowsStartup({ app, enabled });
}

// Real local AI history state (Codex, Claude Code, Gemini CLI & Antigravity)
let localAgentHistory = {
  codexJobs: [],
  claudeJobs: [],
  geminiJobs: [],
  antigravityJobs: [],
  jobsToday: 2,
};

// Local-First Google Integration state (Zero hardcoded credentials, production ready)
let localGoogleState = {
  connected: false,
  account: '',
  calendarSync: true,
  newMailSync: true,
  mailAFile: true,
  mailCounts: {
    primary: 0,
    updates: 0,
    promotions: 0,
    unreadTotal: 0,
  },
  agenda: [],
  lastUpdated: 0,
};

let localAgendaEvents = null;

function getLocalAgendaPath() {
  return path.join(app.getPath('userData'), 'local_agenda.json');
}

function getLocalAgendaEvents() {
  if (Array.isArray(localAgendaEvents)) return localAgendaEvents;
  const agendaPath = getLocalAgendaPath();
  try {
    if (fs.existsSync(agendaPath)) {
      const saved = JSON.parse(fs.readFileSync(agendaPath, 'utf8'));
      localAgendaEvents = Array.isArray(saved) ? saved.map((evt, index) => ({
        ...evt,
        id: evt?.id || `local_evt_${index}_${Date.now()}`,
      })) : [];
      return localAgendaEvents;
    }
  } catch {}

  // Preserve events from older versions while moving away from Google-backed agenda storage.
  try {
    const legacy = JSON.parse(fs.readFileSync(getGoogleSessionPath(), 'utf8'));
    localAgendaEvents = Array.isArray(legacy.agenda) ? legacy.agenda.map((evt, index) => ({
      ...evt,
      id: evt?.id || `legacy_evt_${index}_${Date.now()}`,
    })) : [];
  } catch {
    localAgendaEvents = [];
  }
  saveLocalAgendaEvents();
  return localAgendaEvents;
}

function saveLocalAgendaEvents() {
  try {
    fs.writeFileSync(getLocalAgendaPath(), JSON.stringify(localAgendaEvents || [], null, 2), 'utf8');
  } catch {}
}

function publishLocalAgendaEvents() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('local-agenda-update', getLocalAgendaEvents());
  }
}

function getGoogleSessionPath() {
  return path.join(app.getPath('userData'), 'google_session.json');
}

function loadGoogleSessionFromDisk() {
  try {
    const p = getGoogleSessionPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data && data.connected && data.account) {
        localGoogleState = { ...localGoogleState, ...data };
      }
    }
  } catch {}
  return localGoogleState;
}

function saveGoogleSessionToDisk(nextState) {
  localGoogleState = { ...localGoogleState, ...(nextState || {}) };
  try {
    fs.writeFileSync(getGoogleSessionPath(), JSON.stringify(localGoogleState, null, 2), 'utf8');
  } catch {}
  return localGoogleState;
}

function formatHHMMFromDate(d) {
  if (!d || isNaN(d.getTime())) return '02:49';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function readLastBytesSync(filePath, maxBytes = 49152) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const length = Math.min(stat.size, maxBytes);
    const position = Math.max(0, stat.size - length);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, position);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

let lastAiHistorySignature = '';

function computeAiHistorySignature() {
  const parts = [];
  const checkFile = (p) => {
    try {
      const st = fs.statSync(p);
      parts.push(`${p}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${p}:0`);
    }
  };
  checkFile(path.join(os.homedir(), '.codex', '.codex-global-state.json'));
  checkFile(path.join(os.homedir(), '.codex', 'session_index.jsonl'));
  checkFile(path.join(os.homedir(), '.claude', 'history.jsonl'));
  return parts.join('|');
}

function loadLocalAiHistory({ force = false } = {}) {
  const sig = computeAiHistorySignature();
  if (!force && sig === lastAiHistorySignature && localAgentHistory.jobsToday > 0) {
    return localAgentHistory;
  }
  lastAiHistorySignature = sig;

  const codexJobs = [];
  const claudeJobs = [];
  const geminiJobs = [];
  const antigravityJobs = [];
  let todayCount = 0;
  const todayStr = new Date().toDateString();

  // 1. Read ~/.codex/.codex-global-state.json for exact recent prompts
  try {
    const codexStatePath = path.join(os.homedir(), '.codex', '.codex-global-state.json');
    if (fs.existsSync(codexStatePath)) {
      const raw = JSON.parse(fs.readFileSync(codexStatePath, 'utf8'));
      const atomState = raw['electron-persisted-atom-state'] || {};
      const promptHist = atomState['prompt-history'] || {};
      const activityTimes = atomState['thread-user-activity-times-v1'] || {};

      const seenPrompts = new Set();
      const threadEntries = Object.entries(promptHist).filter(([k]) => k !== 'global');
      for (const [threadId, items] of threadEntries.reverse()) {
        if (!Array.isArray(items)) continue;
        const tsKey = Object.keys(activityTimes).find((k) => k.includes(threadId));
        const tsMs = tsKey ? activityTimes[tsKey] : Date.now();
        const timeStr = formatHHMMFromDate(new Date(tsMs));
        for (let i = items.length - 1; i >= 0; i--) {
          const text = (items[i]?.markdown || '').trim();
          if (text && !seenPrompts.has(text)) {
            seenPrompts.add(text);
            codexJobs.push({
              id: `codex_${threadId}_${i}`,
              threadId,
              agent: 'Codex',
              title: text,
              time: timeStr,
              timestamp: tsMs,
              status: 'done',
            });
          }
        }
      }
    }
  } catch {}

  // 2. Also read ~/.codex/session_index.jsonl (fast tail read)
  try {
    const sessionIdxPath = path.join(os.homedir(), '.codex', 'session_index.jsonl');
    if (fs.existsSync(sessionIdxPath)) {
      const lines = readLastBytesSync(sessionIdxPath, 16384)
        .split(/\r?\n/)
        .filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(lines[i]);
          const dt = item.updated_at ? new Date(item.updated_at) : new Date();
          if (dt.toDateString() === todayStr) todayCount++;
          if (item.thread_name && codexJobs.length < 8) {
            const exists = codexJobs.some((j) => j.title === item.thread_name);
            if (!exists) {
              codexJobs.push({
                id: `codex_idx_${item.id || i}`,
                agent: 'Codex',
                title: item.thread_name,
                time: formatHHMMFromDate(dt),
                timestamp: dt.getTime(),
                status: 'done',
              });
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 3. Read ~/.claude/history.jsonl for real Claude Code prompts (fast tail read)
  try {
    const claudeHistPath = path.join(os.homedir(), '.claude', 'history.jsonl');
    if (fs.existsSync(claudeHistPath)) {
      const lines = readLastBytesSync(claudeHistPath, 32768)
        .split(/\r?\n/)
        .filter(Boolean);
      const seenClaude = new Set();
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          const text = (entry.display || '').trim();
          if (!text || text.startsWith('/')) continue;
          const dt = entry.timestamp ? new Date(entry.timestamp) : new Date();
          if (dt.toDateString() === todayStr) todayCount++;
          if (!seenClaude.has(text) && claudeJobs.length < 10) {
            seenClaude.add(text);
            claudeJobs.push({
              id: `claude_${entry.timestamp || i}`,
              agent: 'Claude',
              title: text,
              time: formatHHMMFromDate(dt),
              timestamp: dt.getTime(),
              status: 'done',
            });
          }
        } catch {}
      }
    }
  } catch {}

  // 4. Read Antigravity App and standalone IDE transcripts.
  try {
    const brainDirs = [
      { path: path.join(os.homedir(), '.gemini', 'antigravity', 'brain'), agent: 'Antigravity' },
      { path: path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain'), agent: 'Antigravity IDE' },
    ];
    const seenAg = new Set();
    for (const brain of brainDirs) {
      if (!fs.existsSync(brain.path)) continue;
      const dirs = fs.readdirSync(brain.path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ ...entry, mtime: fs.statSync(path.join(brain.path, entry.name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 8);
      for (const d of dirs) {
        const tPath = path.join(brain.path, d.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(tPath)) {
          try {
            const lines = readLastBytesSync(tPath, 131072).split(/\r?\n/).filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i];
              if (line.includes('USER_REQUEST') || line.includes('"USER_INPUT"')) {
                const parsed = JSON.parse(line);
                const content = parsed.content || '';
                const m = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
                const reqText = (m ? m[1] : content).trim().replace(/\r?\n/g, ' ').slice(0, 120);
                if (reqText && !seenAg.has(reqText)) {
                  seenAg.add(reqText);
                  const dt = parsed.created_at ? new Date(parsed.created_at) : new Date(d.mtime || Date.now());
                  if (dt.toDateString() === todayStr) todayCount++;
                  antigravityJobs.push({
                    id: `ag_${d.name}_${antigravityJobs.length}`,
                    conversationId: d.name,
                    agent: brain.agent,
                    title: reqText,
                    time: formatHHMMFromDate(dt),
                    timestamp: dt.getTime(),
                    status: 'done',
                  });
                  break;
                }
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 5. Read Gemini CLI history / sessions
  try {
    const geminiHistDir = path.join(os.homedir(), '.gemini', 'history');
    if (fs.existsSync(geminiHistDir)) {
      const entries = fs.readdirSync(geminiHistDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({
          name: e.name,
          time: fs.statSync(path.join(geminiHistDir, e.name)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time)
        .slice(0, 8);

      for (const e of entries) {
        const dt = new Date(e.time);
        if (dt.toDateString() === todayStr) todayCount++;
        geminiJobs.push({
          id: `gemini_${e.name}`,
          agent: 'Gemini',
          title: `Gemini CLI Session: ${e.name.length > 16 ? e.name.slice(0, 14) + '...' : e.name}`,
          time: formatHHMMFromDate(dt),
          timestamp: dt.getTime(),
          status: 'done',
        });
      }
    }
  } catch {}

  localAgentHistory = {
    codexJobs: codexJobs.slice(0, 10),
    claudeJobs: claudeJobs.slice(0, 10),
    geminiJobs: geminiJobs.slice(0, 10),
    antigravityJobs: antigravityJobs.slice(0, 10),
    jobsToday: todayCount || (codexJobs.length + claudeJobs.length + geminiJobs.length + antigravityJobs.length),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-history-update', localAgentHistory);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('ai-history-update', localAgentHistory);
  }
  return localAgentHistory;
}

function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const parsed = [];
  const offsetMatch = lrcText.match(/^\[offset:([+-]?\d+)\]/im);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    let match;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const time = Math.max(0, min * 60 + sec + ms / 1000 + offset);
      parsed.push({
        time,
        text,
      });
    }
  }
  return parsed.sort((a, b) => a.time - b.time).filter((line, i, all) =>
    i === 0 || line.time > all[i - 1].time || line.text !== all[i - 1].text
  );
}

function normalizeLyricsMatch(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(feat(?:uring)?|ft)\.?\b.*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function queryLrclibGet(trackName, artistName) {
  return new Promise((resolve) => {
    if (!trackName) return resolve([]);
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName || '')}`;
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'TwoCode-DynamicIsland/1.0' }, timeout: 4000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.syncedLyrics) {
              return resolve(parseLrc(data.syncedLyrics));
            }
          } catch {}
          resolve([]);
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

function queryLrclibSearch(q, expectedTitle, expectedArtist) {
  return new Promise((resolve) => {
    if (!q || !q.trim()) return resolve([]);
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q.trim())}`;
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'TwoCode-DynamicIsland/1.0' }, timeout: 4500 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const arr = JSON.parse(body);
            if (Array.isArray(arr) && arr.length > 0) {
              const wantedTitle = normalizeLyricsMatch(expectedTitle);
              const wantedWords = new Set(wantedTitle.split(' ').filter((word) => word.length > 1));
              const wantedArtist = normalizeLyricsMatch(expectedArtist);
              const candidates = arr
                .filter((item) => item.syncedLyrics && item.trackName)
                .map((item) => {
                  const title = normalizeLyricsMatch(item.trackName);
                  const artist = normalizeLyricsMatch(item.artistName);
                  const titleWords = title.split(' ').filter((word) => word.length > 1);
                  const overlap = titleWords.filter((word) => wantedWords.has(word)).length;
                  const titleScore = wantedWords.size ? overlap / wantedWords.size : 0;
                  const artistMatch = !wantedArtist || !artist || artist === wantedArtist || artist.includes(wantedArtist) || wantedArtist.includes(artist);
                  return { item, titleScore, artistMatch, score: titleScore + (artistMatch ? 0.25 : -1) };
                })
                .filter(({ titleScore, artistMatch }) => titleScore >= 0.75 && artistMatch)
                .sort((a, b) => b.score - a.score);
              const selected = candidates[0]?.item;
              if (selected?.syncedLyrics) return resolve(parseLrc(selected.syncedLyrics));
            }
          } catch {}
          resolve([]);
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function fetchLyricsFromLrclib(title, artist) {
  if (!title || isKickStream(title, artist)) return [];
  const cleanTitle = (title || '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|music|video|audio|lyric|lyrics|live|performance|hd|4k|klip|akustik)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  // YouTube SMTC often reports titles as "Artist - Track". When that prefix
  // agrees with the artist metadata, search LRCLIB using the actual track name.
  const titleParts = cleanTitle.split(/\s+[–—-]\s+/);
  const titlePrefix = titleParts.shift() || '';
  const lookupTitle = titleParts.length > 0 &&
    normalizeLyricsMatch(titlePrefix) === normalizeLyricsMatch(cleanArtist)
    ? titleParts.join(' - ').trim()
    : cleanTitle;

  const cacheKey = `${cleanArtist}__${cleanTitle}`.toLowerCase();
  if (lyricsCacheMap.has(cacheKey)) {
    return lyricsCacheMap.get(cacheKey);
  }

  // 1. Direct GET endpoint (fastest, most accurate)
  if (lookupTitle) {
    const directRes = await queryLrclibGet(lookupTitle, cleanArtist);
    if (directRes && directRes.length > 0) {
      setBoundedCache(lyricsCacheMap, cacheKey, directRes, 40);
      return directRes;
    }
  }

  // 2. Candidate queries from most specific to broadest
  const candidates = [];
  const noFt = cleanTitle.replace(/\b(ft\.?|feat\.?|featuring)\s+[^-]+/gi, ' ').replace(/\s+/g, ' ').trim();

  if (noFt.includes(' - ')) {
    const parts = noFt.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      candidates.push(`${parts[0]} ${parts[parts.length - 1]}`);
      candidates.push(parts[parts.length - 1]);
    }
  }
  if (cleanArtist && !noFt.toLowerCase().includes(cleanArtist.toLowerCase())) {
    candidates.push(`${cleanArtist} ${noFt}`);
  }
  if (cleanArtist && noFt) candidates.push(`${cleanArtist} ${noFt}`);

  const seen = new Set();
  for (const cand of candidates) {
    const key = cand.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const res = await queryLrclibSearch(cand, lookupTitle, cleanArtist);
    if (res && res.length > 0) {
      setBoundedCache(lyricsCacheMap, cacheKey, res, 40);
      return res;
    }
  }
  return [];
}

let isPollingMedia = false;
let pendingMediaRepoll = false;
let lastMediaPollAt = 0;
function pollWindowsMedia(action = 'status', value = null) {
  return new Promise((resolve) => {
    if (gameModeActive && action === 'status') return resolve(lastMediaState);
    if (isPollingMedia && action === 'status') {
      pendingMediaRepoll = true;
      return resolve(lastMediaState);
    }
    isPollingMedia = true;
    lastMediaPollAt = Date.now();
    const scriptPath = resolveScriptPath('win-media.ps1');
    const args = [
      '-WindowStyle',
      'Hidden',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Action',
      action,
      '-LastTitle',
      cachedThumbnail ? lastMediaTitle || '' : '',
      '-LastSourceApp',
      lastMediaSourceApp || '',
    ];
    if (action === 'seek' && typeof value === 'number') {
      args.push('-Position', String(Math.max(0, value)));
    }

    execFile('powershell.exe', args, { timeout: 4000, windowsHide: true }, async (err, stdout) => {
      isPollingMedia = false;
      if (pendingMediaRepoll) {
        pendingMediaRepoll = false;
        scheduleNextMediaPoll(20);
      }
      if (err || !stdout) {
        return resolve(lastMediaState);
      }
      try {
        const line = stdout.trim().split(/\r?\n/).pop();
        const data = JSON.parse(line);
        let sessionActive = Boolean(data && data.hasSession);
        if (sessionActive && !data.isPlaying && data.title && isBrowserMediaSource(data.sourceApp)) {
          const tabExists = await checkBrowserMediaTabExists(data.sourceApp, data.title, data.artist);
          if (!tabExists) {
            sessionActive = false;
          }
        }
        if (sessionActive) {
          const titleChanged = data.title !== lastMediaTitle || data.artist !== lastMediaArtist;
          if (
            action === 'status' &&
            titleChanged &&
            !data.isPlaying &&
            lastMediaState.hasSession
          ) {
            return resolve(lastMediaState);
          }
          lastMediaSourceApp = data.sourceApp || '';
          if (titleChanged) {
            lastMediaTitle = data.title;
            lastMediaArtist = data.artist || '';
            cachedThumbnail = '';
            cachedThumbnailIsKick = false;
            cachedLyrics = [];
            lyricsLookupKey = `${data.artist || ''}__${data.title || ''}`.toLowerCase();
            lyricsRequestId += 1;
            lastMediaState = { ...lastMediaState, lyrics: [] };
          }

          // 1. Resolve Cover Art (Kick streamer avatar takes priority over browser SMTC icon; otherwise SMTC or iTunes/Deezer)
          const kickStream = isKickStream(data.title, data.artist, data.album);
          if (kickStream) {
            if (!cachedThumbnailIsKick) {
              const requestedTitle = data.title;
              const requestedArtist = data.artist || '';
              fetchAlbumCover(requestedTitle, requestedArtist, data.album).then((coverUrl) => {
                if (
                  requestedTitle !== lastMediaTitle ||
                  requestedArtist !== lastMediaArtist
                ) return;
                if (coverUrl) {
                  cachedThumbnail = coverUrl;
                  cachedThumbnailIsKick = true;
                  if (lastMediaState.thumbnail !== coverUrl) {
                    lastMediaState.thumbnail = coverUrl;
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('media-update', lastMediaState);
                    }
                    if (settingsWindow && !settingsWindow.isDestroyed()) {
                      settingsWindow.webContents.send('media-update', lastMediaState);
                    }
                  }
                }
              });
            }
          } else if (data.thumbnail && data.thumbnail.startsWith('data:image/')) {
            cachedThumbnail = data.thumbnail;
          } else if (titleChanged || !cachedThumbnail) {
            const requestedTitle = data.title;
            const requestedArtist = data.artist || '';
            fetchAlbumCover(requestedTitle, requestedArtist, data.album).then((coverUrl) => {
              if (
                requestedTitle !== lastMediaTitle ||
                requestedArtist !== lastMediaArtist
              ) return;
              if (coverUrl && (!lastMediaState.thumbnail || lastMediaState.thumbnail !== coverUrl)) {
                cachedThumbnail = coverUrl;
                lastMediaState.thumbnail = coverUrl;
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('media-update', lastMediaState);
                }
                if (settingsWindow && !settingsWindow.isDestroyed()) {
                  settingsWindow.webContents.send('media-update', lastMediaState);
                }
              }
            });
          }

          // 2. Resolve Lyrics
          if (titleChanged || (!lyricsLookupKey && data.title)) {
            const requestId = lyricsRequestId;
            const requestedTitle = data.title;
            const requestedArtist = data.artist || '';
            fetchLyricsFromLrclib(requestedTitle, requestedArtist).then((lrc) => {
              if (
                requestId !== lyricsRequestId ||
                requestedTitle !== lastMediaTitle ||
                requestedArtist !== lastMediaArtist
              ) return;
              cachedLyrics = lrc || [];
              lastMediaState = { ...lastMediaState, lyrics: cachedLyrics };
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('media-update', lastMediaState);
              }
              if (settingsWindow && !settingsWindow.isDestroyed()) {
                settingsWindow.webContents.send('media-update', lastMediaState);
              }
            });
          }

          lastMediaState = {
            ...data,
            thumbnail: kickStream ? (cachedThumbnail || '') : (cachedThumbnail || data.thumbnail || ''),
            lyrics: cachedLyrics,
          };
        } else {
          lastMediaTitle = '';
          lastMediaArtist = '';
          lastMediaSourceApp = '';
          cachedThumbnail = '';
          cachedThumbnailIsKick = false;
          cachedLyrics = [];
          lyricsLookupKey = '';
          lastMediaState = { ...EMPTY_MEDIA_STATE };
        }
      } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-update', lastMediaState);
      }
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('media-update', lastMediaState);
      }
      resolve(lastMediaState);
    });
  });
}

function handleIncomingHookPayload(payload, res) {
  const id = payload.id || 'req_' + Date.now();
  const hookEventName = payload.hook_event_name || payload.event || '';
  const looksLikeClaudeHook = Boolean(
    payload.transcript_path ||
    payload.permission_mode ||
    typeof payload.stop_hook_active === 'boolean' ||
    hookEventName === 'PermissionRequest'
  );

  let mappedType = payload.type || 'working';
  if (hookEventName === 'PermissionRequest') mappedType = 'approval';
  else if (hookEventName === 'UserPromptSubmit' || hookEventName === 'PreInvocation') mappedType = 'thinking';
  else if (hookEventName === 'Interrupt') mappedType = 'interrupted';
  else if (hookEventName === 'Stop' || hookEventName === 'SessionEnd' || payload.type === 'done') {
    mappedType = payload.type || 'done';
    if (mappedType === 'done') localAgentHistory.jobsToday++;
  }

  const promptTitle =
    payload.prompt ||
    payload.title ||
    payload.tool_name ||
    (payload.tool_input && (payload.tool_input.command || payload.tool_input.file_path)) ||
    hookEventName ||
    'Processing task...';

  const eventObj = {
    id,
    agent: payload.agent || (/preinvocation/i.test(hookEventName) ? 'Antigravity IDE' : looksLikeClaudeHook ? 'Claude' : 'Codex'),
    type: mappedType,
    title: String(promptTitle).slice(0, 140),
    detail: String(payload.detail || payload.last_assistant_message || payload.prompt_response || '').slice(0, 500),
    sessionId: payload.sessionId || payload.session_id || payload.conversationId || '',
    command:
      payload.command ||
      (payload.tool_input && payload.tool_input.command) ||
      '',
    file:
      payload.file ||
      (payload.tool_input && payload.tool_input.file_path) ||
      '',
    timestamp: Date.now(),
    jobsToday: localAgentHistory.jobsToday,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-event', eventObj);
  }

  if (mappedType === 'approval' && (payload.wait || hookEventName === 'PermissionRequest')) {
    pendingApprovals.set(id, (approved) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id,
          approved,
          decision: approved ? 'approve' : 'block',
        })
      );
    });
    setTimeout(() => {
      if (pendingApprovals.has(id)) {
        pendingApprovals.delete(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, approved: false, timeout: true }));
      }
    }, 60000);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id }));
  }
}

let localAgentServers = [];
function createAgentHttpListener(port) {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET' && (req.url === '/api/status' || req.url.startsWith('/twocode-hook'))) {
      const remoteAddress = req.socket.remoteAddress || '';
      const isLoopback =
        remoteAddress === '127.0.0.1' ||
        remoteAddress === '::1' ||
        remoteAddress.startsWith('::ffff:127.');
      if (!isLoopback) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Local connections only' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, jobsToday: localAgentHistory.jobsToday }));
    }

    if (req.method === 'POST' && (req.url === '/api/agent' || req.url.startsWith('/twocode-hook'))) {
      const remoteAddress = req.socket.remoteAddress || '';
      const isLoopback =
        remoteAddress === '127.0.0.1' ||
        remoteAddress === '::1' ||
        remoteAddress.startsWith('::ffff:127.');
      if (!isLoopback) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Local connections only' }));
      }
      let body = '';
      let receivedBytes = 0;
      let requestTooLarge = false;
      req.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > 1024 * 1024) {
          requestTooLarge = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Request too large' }));
          req.destroy();
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        if (requestTooLarge) return;
        try {
          const payload = JSON.parse(body || '{}');
          handleIncomingHookPayload(payload, res);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  server.on('error', () => {
    localAgentServers = localAgentServers.filter((listener) => listener !== server);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

function startLocalAgentServers() {
  if (localAgentServers.length) return;
  localAgentServers = [createAgentHttpListener(4242)];
}

function stopLocalAgentServers() {
  for (const server of localAgentServers) {
    try { server.close(); } catch {}
  }
  localAgentServers = [];
}

function getAppWindowIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function openSafeExternalBrowserTab(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      shell.openExternal(parsed.toString()).catch(() => {});
      return true;
    }
  } catch {}
  return false;
}

function bindExternalLinkInterceptor(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternalBrowserTab(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const isDevLocal = Boolean(process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL));
    if (!url.startsWith('file://') && !isDevLocal && !url.startsWith('http://localhost:5173')) {
      event.preventDefault();
      openSafeExternalBrowserTab(url);
    }
  });
}

function openOrFocusSettingsWindow(tabId = 'home') {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.setSkipTaskbar(false);
    settingsWindow.show();
    settingsWindow.focus();
    if (tabId) {
      settingsWindow.webContents.send('navigate-settings-tab', tabId);
    }
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const islandTopSafeArea = 48;
  const maxWidth = Math.max(760, workArea.width - 32);
  const maxHeight = Math.max(540, workArea.height - islandTopSafeArea - 16);
  const winWidth = Math.min(1180, maxWidth);
  const winHeight = Math.min(780, maxHeight);
  const winX = Math.round(workArea.x + (workArea.width - winWidth) / 2);
  const centeredY = Math.round(workArea.y + (workArea.height - winHeight) / 2);
  const winY = Math.max(workArea.y + islandTopSafeArea, centeredY);

  settingsWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    minWidth: Math.min(940, maxWidth),
    minHeight: Math.min(620, maxHeight),
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: getAppWindowIcon(),
    title: 'Bedo',
    minimizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
      devTools: !app.isPackaged,
    },
  });
  settingsWindow.setSkipTaskbar(false);
  bindExternalLinkInterceptor(settingsWindow);
  settingsWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  settingsWindow.on('minimize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.setSkipTaskbar(false);
    }
  });
  settingsWindow.on('restore', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.setSkipTaskbar(false);
    }
  });

  const distHtml = path.join(__dirname, '../dist/index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?window=settings`);
  } else if (fs.existsSync(distHtml)) {
    settingsWindow.loadFile(distHtml, { query: { window: 'settings' } });
  } else {
    settingsWindow.loadURL('http://localhost:5173/?window=settings');
  }

  settingsWindow.webContents.on('did-finish-load', () => {
    if (tabId) {
      settingsWindow.webContents.send('navigate-settings-tab', tabId);
    }
    settingsWindow.webContents.send('settings-updated', userSettings);
    settingsWindow.webContents.send('ai-history-update', localAgentHistory);
    settingsWindow.webContents.send('media-update', lastMediaState);
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (!userSettings.onboardingCompleted) {
      saveSettingsToDisk({ onboardingCompleted: true });
    }
    trimWorkingSetAndGC({ trimWorkingSet: true });
  });
}

function createTray() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const isEyeLeft = x >= 4 && x <= 6 && y >= 5 && y <= 10;
      const isEyeRight = x >= 9 && x <= 11 && y >= 5 && y <= 10;
      if (isEyeLeft || isEyeRight) {
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = 255;
      } else {
        buf[idx] = 15;
        buf[idx + 1] = 15;
        buf[idx + 2] = 18;
        buf[idx + 3] = 255;
      }
    }
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  tray = new Tray(icon);
  tray.setToolTip('Bedo');
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive();
      mainWindow.webContents.send('notch-hover-change', true);
    }
  });
  buildTrayContextMenu();
}

function buildTrayContextMenu() {
  if (!tray) return;
  const lang = userSettings.language;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Bedo',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: trMain(lang, 'trayOpenIsland'),
      accelerator: 'Alt+CommandOrControl+T',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.showInactive();
        mainWindow.webContents.send('notch-hover-change', true);
      },
    },
    {
      label: trMain(lang, 'trayTuckIsland'),
      accelerator: 'Alt+CommandOrControl+H',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('notch-hover-change', false);
      },
    },
    {
      label: trMain(lang, 'traySettings'),
      click: () => openOrFocusSettingsWindow('home'),
    },
    {
      label: trMain(lang, 'traySetup'),
      click: () => openOrFocusSettingsWindow('connections'),
    },
    { type: 'separator' },
    {
      label: trMain(lang, 'trayStartWithWindows'),
      id: 'start-with-windows',
      type: 'checkbox',
      checked: userSettings.startWithWindows !== false,
      click: (item) => {
        saveSettingsToDisk({ startWithWindows: item.checked });
      },
    },
    {
      label: trMain(lang, 'traySafeGraphics'),
      type: 'checkbox',
      checked: true,
    },
    {
      label: trMain(lang, 'trayGraphicsCard'),
      submenu: [
        { label: trMain(lang, 'trayGpuDefault'), type: 'radio', checked: true },
        { label: trMain(lang, 'trayGpuDiscrete'), type: 'radio', checked: false },
        { label: trMain(lang, 'trayGpuIntegrated'), type: 'radio', checked: false },
      ],
    },
    { type: 'separator' },
    {
      label: trMain(lang, 'trayRestart'),
      click: () => {
        app.relaunch();
        app.exit(0);
      },
    },
    {
      label: trMain(lang, 'trayQuit'),
      click: () => app.quit(),
    },
  ]);
  trayContextMenu = contextMenu;
  tray.setContextMenu(contextMenu);
}

function addSingleNotchRects(rects, offsetX, bodyWidth, height, earRadius, bottomRadius) {
  const bW = Math.round(bodyWidth);
  const h = Math.round(height);
  const eR = Math.round(earRadius);
  const bR = Math.round(bottomRadius);
  const totalWidth = bW + eR * 2;
  const rTop = Math.min(eR, Math.floor(h / 2));
  const rBot = Math.min(bR, Math.floor(bW / 2), Math.floor(h / 2));

  for (let y = 0; y < rTop; y++) {
    const dy = rTop - (y + 0.5);
    const leftX = Math.round(Math.sqrt(Math.max(0, rTop * rTop - dy * dy)));
    const rowWidth = Math.max(0, totalWidth - leftX * 2);
    if (rowWidth > 0) {
      rects.push({ x: offsetX + leftX, y, width: rowWidth, height: 1 });
    }
  }

  const midHeight = h - rBot - rTop;
  if (midHeight > 0) {
    rects.push({ x: offsetX + eR, y: rTop, width: bW, height: midHeight });
  }

  for (let dy = 0; dy < rBot; dy++) {
    const y = h - rBot + dy;
    const distY = dy + 0.5;
    const inset = Math.round(rBot - Math.sqrt(Math.max(0, rBot * rBot - distY * distY)));
    const leftX = offsetX + eR + inset;
    const rowWidth = Math.max(0, bW - inset * 2);
    if (rowWidth > 0) {
      rects.push({ x: leftX, y, width: rowWidth, height: 1 });
    }
  }
}

function buildNotchShapeRects(bodyWidth, height, earRadius, bottomRadius, droplet = 0) {
  const bW = Math.round(bodyWidth);
  const h = Math.round(height);
  const eR = Math.round(earRadius);
  const bR = Math.round(bottomRadius);
  const totalWidth = bW + eR * 2;
  const offsetX = Math.round((CANVAS_WIDTH - totalWidth) / 2);
  const rects = [];

  addSingleNotchRects(rects, offsetX, bW, h, eR, bR);

  // Detached top-bezel circular media droplet to the right when Focus timer + Media are both active
  if (droplet > 0.05) {
    const dBW = Math.round(32 * droplet);
    const dH = Math.round(26 * droplet);
    const dER = Math.round(8 * droplet);
    const dBR = Math.round(13 * droplet);
    const dropletOffsetX = offsetX + totalWidth + 8;
    addSingleNotchRects(rects, dropletOffsetX, dBW, dH, dER, dBR);
  }

  return { rects, totalWidth, height: h, offsetX };
}

function updateWindowMouseIgnore(shouldIgnore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isIgnoringMouse === shouldIgnore) return;
  isIgnoringMouse = shouldIgnore;
  try {
    if (shouldIgnore) {
      // Do NOT pass `{ forward: true }`: startCursorHoverWatcher already handles notch hit-testing,
      // whereas `{ forward: true }` runs Electron's internal 100Hz Win32 cursor-forwarding timer into Chromium!
      mainWindow.setIgnoreMouseEvents(true);
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  } catch {}
}

function animateWindowShapeToMode(modeOrExpanded, customBodyWidth, customHeight, hasDroplet) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const modeKey =
    typeof modeOrExpanded === 'string' && MODE_DIMENSIONS[modeOrExpanded]
      ? modeOrExpanded
      : modeOrExpanded
      ? 'expanded'
      : 'idle';

  currentModeKey = modeKey;
  const baseTarget = MODE_DIMENSIONS[modeKey];
  currentShape = {
    ...baseTarget,
    bodyWidth:
      modeKey === 'music-bar' && typeof customBodyWidth === 'number' && customBodyWidth >= 200
        ? Math.min(360, Math.max(222, Math.round(customBodyWidth)))
        : modeKey === 'notif-toast' && typeof customBodyWidth === 'number' && customBodyWidth >= 180
        ? Math.min(460, Math.max(210, Math.round(customBodyWidth)))
        : modeKey === 'hud' && typeof customBodyWidth === 'number' && customBodyWidth >= 180
        ? Math.min(460, Math.max(180, Math.round(customBodyWidth)))
        : modeKey === 'battery' && typeof customBodyWidth === 'number' && customBodyWidth >= 300
        ? Math.min(460, Math.max(366, Math.round(customBodyWidth)))
        : baseTarget.bodyWidth,
    height:
      modeKey === 'expanded' && typeof customHeight === 'number' && customHeight >= 240
        ? Math.min(CANVAS_HEIGHT - 16, Math.max(baseTarget.height, Math.round(customHeight)))
        : baseTarget.height,
    droplet: hasDroplet ? 1 : baseTarget.droplet,
  };

  if (gameModeActive && userSettings.gameOptDeepHideWindow === true) {
    if (modeKey !== 'idle') {
      showWindowForGameModeOverlay();
    } else {
      scheduleGameModeHide(450);
    }
  }
}

function startCursorHoverWatcher() {
  let cachedBounds = null;
  let hoverTimer = null;
  let lastPtX = -99999;
  let lastPtY = -99999;
  let lastCheckedMode = '';
  let lastShapeWidth = -1;
  let lastShapeHeight = -1;
  let lastDelay = 50;

  const invalidateBounds = () => {
    cachedBounds = null;
    lastPtX = -99999;
    lastPtY = -99999;
  };
  screen.on('display-metrics-changed', invalidateBounds);
  screen.on('display-added', invalidateBounds);
  screen.on('display-removed', invalidateBounds);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.on('move', invalidateBounds);
    mainWindow.on('resize', invalidateBounds);
  }

  const tick = () => {
    let nextDelay = 50;
    try {
      if (isSystemLockedOrSuspended || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        nextDelay = 300;
        return;
      }
      if (gameModeActive) {
        isHoveringNotch = false;
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = null;
        updateWindowMouseIgnore(true);
        nextDelay = 300;
        return;
      }

      const pt = screen.getCursorScreenPoint();
      if (
        pt.x === lastPtX &&
        pt.y === lastPtY &&
        currentModeKey === lastCheckedMode &&
        currentShape.bodyWidth === lastShapeWidth &&
        currentShape.height === lastShapeHeight
      ) {
        nextDelay = lastDelay;
        return;
      }
      lastPtX = pt.x;
      lastPtY = pt.y;
      lastCheckedMode = currentModeKey;
      lastShapeWidth = currentShape.bodyWidth;
      lastShapeHeight = currentShape.height;

      if (!cachedBounds) cachedBounds = mainWindow.getBounds();
      const relX = pt.x - cachedBounds.x;
      const relY = pt.y - cachedBounds.y;

      const activeTotalWidth = currentShape.bodyWidth + currentShape.earRadius * 2;
      const leftEdge = (CANVAS_WIDTH - activeTotalWidth) / 2;
      const rightEdge = leftEdge + activeTotalWidth;

      const padX = currentModeKey === 'expanded' ? 14 : 18;
      const padY = currentModeKey === 'expanded' ? 14 : 14;

      const dropletExtra = currentShape.droplet > 0.05 ? 56 : 0;
      const insideActiveNotch =
        relY >= -4 &&
        relY <= currentShape.height + padY &&
        relX >= leftEdge - padX &&
        relX <= rightEdge + dropletExtra + padX;

      updateWindowMouseIgnore(!insideActiveNotch);

      const nearNotch =
        relY >= -20 &&
        relY <= currentShape.height + 200 &&
        relX >= leftEdge - 200 &&
        relX <= rightEdge + dropletExtra + 200;
      const inTopBand = relY >= -20 && relY <= 220;
      nextDelay =
        nearNotch || isHoveringNotch
          ? 16
          : currentModeKey === 'expanded'
          ? 28
          : inTopBand
          ? 28
          : 75;
      lastDelay = nextDelay;

      if (userSettings.islandOpenMode === 'On click' && currentModeKey !== 'expanded') return;

      if (insideActiveNotch && !isHoveringNotch) {
        isHoveringNotch = true;
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = null;
        }
        mainWindow.webContents.send('notch-hover-change', true);
      } else if (!insideActiveNotch && isHoveringNotch) {
        isHoveringNotch = false;
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
          if (!isHoveringNotch && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notch-hover-change', false);
          }
        }, 140);
      }
    } catch {} finally {
      hoverTimer = setTimeout(tick, nextDelay);
    }
  };

  hoverTimer = setTimeout(tick, 16);
}

function getMainWindowHwndString() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return '0';
  try {
    const buf = mainWindow.getNativeWindowHandle();
    if (!buf || buf.length < 4) return '0';
    return buf.length >= 8 ? buf.readBigInt64LE(0).toString() : String(buf.readInt32LE(0));
  } catch {
    return '0';
  }
}

function requestOverlayFramelessEnforcement() {
  if (process.platform !== 'win32') return;
  try {
    if (systemWatcherProc && systemWatcherProc.stdin && !systemWatcherProc.stdin.destroyed) {
      const hwndStr = getMainWindowHwndString();
      if (hwndStr !== '0') {
        systemWatcherProc.stdin.write(`overlay-hwnd:${hwndStr}\n`);
      }
    }
  } catch {}
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.bounds;
  const x = Math.round((screenWidth - CANVAS_WIDTH) / 2);

  mainWindow = new BrowserWindow({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    x,
    y: 0,
    title: '',
    show: false,
    frame: false,
    icon: getAppWindowIcon(),
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: 'toolbar',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setSkipTaskbar(true);
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  bindExternalLinkInterceptor(mainWindow);

  if (process.platform === 'win32' && typeof mainWindow.hookWindowMessage === 'function') {
    let framelessDebounce = null;
    const scheduleFramelessCheck = () => {
      if (framelessDebounce) return;
      framelessDebounce = setTimeout(() => {
        framelessDebounce = null;
        requestOverlayFramelessEnforcement();
      }, 16);
    };
    // Guard against Chromium/Win32 re-applying WS_CAPTION or painting non-client toolwindow frame
    const WM_STYLECHANGED = 0x007d;
    const WM_NCPAINT = 0x0085;
    const WM_NCACTIVATE = 0x0086;
    try {
      mainWindow.hookWindowMessage(WM_STYLECHANGED, scheduleFramelessCheck);
      mainWindow.hookWindowMessage(WM_NCPAINT, scheduleFramelessCheck);
      mainWindow.hookWindowMessage(WM_NCACTIVATE, scheduleFramelessCheck);
    } catch {}
  }

  isIgnoringMouse = true;
  try {
    mainWindow.setIgnoreMouseEvents(true);
  } catch {}

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  requestOverlayFramelessEnforcement();

  const ensureIslandOnTop = () => {
    if (!mainWindow || mainWindow.isDestroyed() || gameModeActive) return;
    try {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.moveTop();
    } catch {}
  };

  mainWindow.on('blur', () => {
    setTimeout(ensureIslandOnTop, 60);
  });

  const revealIsland = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setSkipTaskbar(true);
    requestOverlayFramelessEnforcement();
    if (!mainWindow.isVisible()) {
      mainWindow.showInactive();
      mainWindow.moveTop();
      try { mainWindow.webContents.send('island-revealed'); } catch {}
    }
  };

  // Show on first painted frame — never wait for external Google Fonts / subresources
  mainWindow.once('ready-to-show', revealIsland);

  mainWindow.webContents.on('did-finish-load', () => {
    revealIsland();
    mainWindow.webContents.send('ai-history-update', localAgentHistory);
    mainWindow.webContents.send('settings-updated', userSettings);
    mainWindow.webContents.send('game-mode-change', gameModeActive);
    console.log(
      '✓ TwoCode Dynamic Island yüklendi ve ekranda gösteriliyor! Bounds:',
      JSON.stringify(mainWindow.getBounds())
    );
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER ${level}] ${message} (${sourceId}:${line})`);
  });

  const distHtml = path.join(__dirname, '../dist/index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

function registerGlobalShortcuts() {
  try {
    globalShortcut.unregisterAll();
    if (userSettings.globalShortcutsEnabled === false) return;

    globalShortcut.register('CommandOrControl+Alt+T', () => {
      if (gameModeActive) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        mainWindow.webContents.send('notch-hover-change', true);
      }
    });
    globalShortcut.register('CommandOrControl+Alt+H', () => {
      if (gameModeActive) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.showInactive();
    });
    globalShortcut.register('CommandOrControl+Alt+Space', () => {
      if (gameModeActive) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.webContents.send('island-shortcut-action', { action: 'bedo' });
      }
    });
    const tabShortcuts = [
      ['CommandOrControl+Alt+Shift+1', 'home'],
      ['CommandOrControl+Alt+Shift+2', 'music'],
      ['CommandOrControl+Alt+Shift+3', 'robo'],
      ['CommandOrControl+Alt+Shift+4', 'timer'],
      ['CommandOrControl+Alt+Shift+5', 'notes'],
      ['CommandOrControl+Alt+Shift+6', 'cal'],
    ];
    for (const [accelerator, tab] of tabShortcuts) {
      globalShortcut.register(accelerator, () => {
        if (gameModeActive) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.webContents.send('island-shortcut-action', { action: 'tab', tab });
        }
      });
    }
  } catch {}
}

let systemWatcherProc = null;
let systemWatcherRestartTimer = null;
let systemWatcherRestartAttempts = 0;
let isAppQuitting = false;
let gameModeActive = false;
let isSystemLockedOrSuspended = false;
let gameModeSettingsWasVisible = false;
let rawGameDetected = false;
let gameModeHideTimer = null;
let gameModePausedBedoVoice = false;
let agentHistoryPollTimer = null;
let mediaPollTimeout = null;
let clipboardPollTimer = null;

function isGameOptHudAllowed() {
  if (!gameModeActive) return true;
  return userSettings.gameOptAllowHudAndNotifs !== false;
}

function showWindowForGameModeOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (gameModeHideTimer) {
    clearTimeout(gameModeHideTimer);
    gameModeHideTimer = null;
  }
  try {
    if (userSettings.gameOptDeepHideWindow === true) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    if (!mainWindow.isVisible()) {
      mainWindow.showInactive();
      updateWindowMouseIgnore(true);
    }
    if (userSettings.gameOptDeepHideWindow === true) {
      mainWindow.moveTop();
    }
  } catch {}
}

function ensureWindowVisibleForHud() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (gameModeActive) {
    showWindowForGameModeOverlay();
    return;
  }
  try {
    if (!mainWindow.isVisible()) {
      mainWindow.showInactive();
      updateWindowMouseIgnore(true);
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.moveTop();
  } catch {}
}

function scheduleGameModeHide(delayMs = 450) {
  if (gameModeHideTimer) {
    clearTimeout(gameModeHideTimer);
    gameModeHideTimer = null;
  }
  if (!gameModeActive || userSettings.gameOptDeepHideWindow !== true) return;
  gameModeHideTimer = setTimeout(() => {
    gameModeHideTimer = null;
    if (!gameModeActive || userSettings.gameOptDeepHideWindow !== true) return;
    if (!mainWindow || mainWindow.isDestroyed() || currentModeKey !== 'idle') return;
    try {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.hide();
    } catch {}
  }, delayMs);
}

function scheduleNextMediaPoll(customDelay) {
  if ((gameModeActive && userSettings.gameOptPauseBackgroundPolling !== false) || isSystemLockedOrSuspended) return;
  if (mediaPollTimeout) clearTimeout(mediaPollTimeout);

  let delay = customDelay;
  if (!delay) {
    const onBattery = powerMonitor.isOnBatteryPower();
    if (lastMediaState && lastMediaState.hasSession && lastMediaState.isPlaying) {
      // win-system-watcher.ps1 emits 'media-changed' in-process on play/pause/track changes;
      // this timer only drift-corrects playback position without spawning PowerShell constantly.
      delay = onBattery ? 12000 : 8000;
    } else if (lastMediaState && lastMediaState.hasSession) {
      delay = onBattery ? 30000 : 20000;
    } else {
      delay = onBattery ? 60000 : 45000;
    }
  }

  mediaPollTimeout = setTimeout(async () => {
    try {
      await pollWindowsMedia('status');
    } catch {}
    scheduleNextMediaPoll();
  }, delay);
}

function stopBackgroundPolling() {
  if (agentHistoryPollTimer) clearInterval(agentHistoryPollTimer);
  if (mediaPollTimeout) clearTimeout(mediaPollTimeout);
  if (clipboardPollTimer) clearInterval(clipboardPollTimer);
  agentHistoryPollTimer = null;
  mediaPollTimeout = null;
  clipboardPollTimer = null;
}

function startBackgroundPolling() {
  if ((gameModeActive && userSettings.gameOptPauseBackgroundPolling !== false) || isSystemLockedOrSuspended) return;
  const onBattery = powerMonitor.isOnBatteryPower();
  if (!agentHistoryPollTimer) {
    loadLocalAiHistory();
    agentHistoryPollTimer = setInterval(() => loadLocalAiHistory(), onBattery ? 35000 : 20000);
  }
  scheduleNextMediaPoll(100);
  if (!clipboardPollTimer) {
    try { lastClipboardText = clipboard.readText() || ''; } catch {}
    clipboardPollTimer = setInterval(() => {
      try {
        const formats = clipboard.availableFormats();
        if (formats.some((f) => f.startsWith('text/'))) {
          const txt = clipboard.readText();
          if (txt && txt.trim() && txt !== lastClipboardText) {
            lastClipboardText = txt;
            clipboardHistory = [
              {
                id: Date.now(),
                kind: 'text',
                text: txt.slice(0, 400),
                time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              },
              ...clipboardHistory.filter((item) => item.kind !== 'text' || item.text !== txt),
            ].slice(0, 15);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('clipboard-update', clipboardHistory);
            }
            return;
          }
        }
        if (formats.some((f) => f.startsWith('image/'))) {
          const img = clipboard.readImage();
          if (img && !img.isEmpty()) {
            const size = img.getSize();
            // Compute a tiny 24px fingerprint instead of allocating a full-res RGBA bitmap every poll.
            const tinyBmp = img.resize({ width: 24, quality: 'good' }).toBitmap();
            const imgKey = `${size.width}x${size.height}:${tinyBmp.toString('base64')}`;
            if (imgKey !== lastClipboardImageKey) {
              lastClipboardImageKey = imgKey;
              const maxDim = 320;
              const scale = Math.min(1, maxDim / Math.max(size.width || 1, size.height || 1));
              const resized = scale < 1
                ? img.resize({ width: Math.max(1, Math.round(size.width * scale)), quality: 'good' })
                : img;
              const jpegBuf = resized.toJPEG(82);
              const thumb = jpegBuf && jpegBuf.length > 0
                ? `data:image/jpeg;base64,${jpegBuf.toString('base64')}`
                : resized.toDataURL();
              clipboardHistory = [
                {
                  id: Date.now(),
                  kind: 'image',
                  thumb,
                  dims: `${size.width}×${size.height}`,
                  time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                },
                ...clipboardHistory,
              ].slice(0, 15);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('clipboard-update', clipboardHistory);
              }
            }
          }
        }
      } catch {}
    }, onBattery ? 6000 : 4000);
  }
}

function applyGameModeRuntimeOptions() {
  if (!gameModeActive) return;

  if (userSettings.gameOptPauseBackgroundPolling !== false) {
    stopBackgroundPolling();
  } else {
    startBackgroundPolling();
  }

  if (userSettings.gameOptPauseBedoVoice === true) {
    try {
      const st = bedoService?.getStatus?.();
      if (st && st.running && !st.paused) {
        gameModePausedBedoVoice = true;
        bedoService.setPaused(true);
      }
    } catch {}
  } else if (gameModePausedBedoVoice) {
    gameModePausedBedoVoice = false;
    try { bedoService?.setPaused?.(false); } catch {}
  }

  if (userSettings.gameOptDeepHideWindow === true) {
    if (currentModeKey === 'idle') scheduleGameModeHide(450);
  } else {
    if (gameModeHideTimer) {
      clearTimeout(gameModeHideTimer);
      gameModeHideTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      try {
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.moveTop();
      } catch {}
    }
  }
}

function syncGameModeState() {
  const effectiveActive = Boolean(rawGameDetected && userSettings.gameOptEnabled !== false);
  if (effectiveActive !== gameModeActive) {
    setGameModeActive(effectiveActive);
  } else if (gameModeActive) {
    applyGameModeRuntimeOptions();
  }
}

function setGameModeActive(active) {
  const nextActive = Boolean(active);
  if (gameModeActive === nextActive) return;
  gameModeActive = nextActive;

  if (nextActive) {
    gameModeSettingsWasVisible = Boolean(
      settingsWindow &&
        !settingsWindow.isDestroyed() &&
        settingsWindow.isVisible() &&
        !settingsWindow.isMinimized()
    );
    applyGameModeRuntimeOptions();
    if (mainWindow && !mainWindow.isDestroyed()) {
      animateWindowShapeToMode('idle');
      mainWindow.webContents.send('game-mode-change', true);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('game-mode-change', true);
      settingsWindow.setSkipTaskbar(false);
      if (!settingsWindow.isMinimized()) {
        settingsWindow.minimize();
      }
    }
    return;
  }

  if (gameModeHideTimer) {
    clearTimeout(gameModeHideTimer);
    gameModeHideTimer = null;
  }
  startBackgroundPolling();
  if (gameModePausedBedoVoice) {
    gameModePausedBedoVoice = false;
    try { bedoService?.setPaused?.(false); } catch {}
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (!mainWindow.isVisible()) {
        mainWindow.showInactive();
      }
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.moveTop();
    } catch {}
    mainWindow.webContents.send('game-mode-change', false);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('game-mode-change', false);
    settingsWindow.setSkipTaskbar(false);
    if (gameModeSettingsWasVisible) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.showInactive();
    }
  }
  gameModeSettingsWasVisible = false;
}

function scheduleSystemWatcherRestart() {
  if (isAppQuitting || isSystemLockedOrSuspended) return;
  if (systemWatcherRestartTimer) return;
  const delayMs = Math.min(10000, 1500 * Math.pow(2, Math.min(systemWatcherRestartAttempts, 3)));
  systemWatcherRestartAttempts += 1;
  systemWatcherRestartTimer = setTimeout(() => {
    systemWatcherRestartTimer = null;
    startSystemWatcher();
  }, delayMs);
}

function startSystemWatcher() {
  if (isAppQuitting) return;
  if (systemWatcherRestartTimer) {
    clearTimeout(systemWatcherRestartTimer);
    systemWatcherRestartTimer = null;
  }
  if (systemWatcherProc && !systemWatcherProc.killed && systemWatcherProc.exitCode === null) {
    return;
  }
  try {
    const watcherScript = resolveScriptPath('win-system-watcher.ps1');
    const overlayHwndStr = getMainWindowHwndString();
    const proc = spawn(
      'powershell.exe',
      [
        '-WindowStyle', 'Hidden',
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy', 'Bypass',
        '-File', watcherScript,
        '-ElectronPid', String(process.pid),
        '-OverlayHwnd', overlayHwndStr,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    systemWatcherProc = proc;
    try { proc.stdin?.on?.('error', ignoreBrokenPipeError); } catch {}
    try { proc.stdout?.on?.('error', ignoreBrokenPipeError); } catch {}
    let buffer = '';
    const watcherStartedAt = Date.now();
    proc.stdout.on('data', (chunk) => {
      systemWatcherRestartAttempts = 0;
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const ev = JSON.parse(trimmed);
          if (ev.event === 'game-mode') {
            rawGameDetected = Boolean(ev.active);
            syncGameModeState();
            continue;
          }
          if (ev.event === 'app-context') {
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (!gameModeActive) {
                try {
                  mainWindow.setAlwaysOnTop(true, 'screen-saver');
                  mainWindow.moveTop();
                } catch {}
              }
              mainWindow.webContents.send('app-context', {
                app: ev.app || '',
                category: ev.category || 'desktop',
              });
            }
            continue;
          }
          if (ev.event === 'mic-mute') {
            const isMuted = Boolean(ev.muted);
            try {
              getBedoService().setSystemMicMuted(isMuted);
            } catch {}
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('system-hud', {
                type: 'mic-mute',
                muted: isMuted,
                isInit: true,
              });
            }
            continue;
          }
          if (ev.event === 'ghelper-notification') {
            const parsed = resolveGHelperToast(ev.title);
            if (parsed?.category === 'fnlock') {
              continue;
            }
            if (parsed?.category === 'aura' && ghelperBridgeClient?.shouldSuppressAuraToast()) {
              continue;
            }
            if (parsed?.category === 'mic' && ghelperBridgeClient?.hasRecentMicToast()) {
              continue;
            }
            if (mainWindow && !mainWindow.isDestroyed() && isGameOptHudAllowed()) {
              if (gameModeActive) showWindowForGameModeOverlay();
              mainWindow.webContents.send('system-hud', {
                type: 'ghelper',
                value: 0,
                ghelper: {
                  ...(parsed || {}),
                  raw: ev.title,
                  label: parsed?.label || 'G-Helper',
                  icon: parsed?.icon || 'ghelper',
                  valueText: parsed?.valueText || ev.title,
                  category: parsed?.category || 'generic',
                },
                isInit: false,
              });
            }
            continue;
          }
          if (!mainWindow || mainWindow.isDestroyed()) continue;
          // Suppress any volume HUD popup during startup grace period (first 4.5 seconds)
          const isStartupGrace = Date.now() - watcherStartedAt < 4500;
          if (ev.event === 'init-audio') {
            mainWindow.webContents.send('system-hud', {
              type: 'init-audio',
              value: typeof ev.volume === 'number' ? ev.volume : ev.value,
              muted: Boolean(ev.muted),
              isInit: true,
            });
          } else if (ev.event === 'volume') {
            if (!isStartupGrace && isGameOptHudAllowed()) {
              ensureWindowVisibleForHud();
              mainWindow.webContents.send('system-hud', {
                type: 'volume',
                value: ev.value,
                muted: Boolean(ev.muted),
                isInit: false,
              });
            }
          } else if (ev.event === 'brightness') {
            if (!isStartupGrace && isGameOptHudAllowed()) {
              ensureWindowVisibleForHud();
              mainWindow.webContents.send('system-hud', {
                type: 'brightness',
                value: ev.value,
                isInit: false,
              });
            }
          } else if (ev.event === 'media-changed') {
            scheduleNextMediaPoll(40);
          } else if (ev.event === 'notification') {
            if (userSettings.suppressWindowsBanners && userSettings.windowsNotifications !== false && ev.appId) {
              getWindowsBannerSuppressor()
                .ensureAppSuppressed(ev.appId)
                .then((r) => {
                  if (r && !r.alreadySuppressed && !r.skipped) {
                    broadcastWindowsBannerStatus();
                  }
                })
                .catch(() => {});
            }
            const isEmail = /gmail|outlook|mail|posta/i.test(`${ev.app || ''} ${ev.appId || ''} ${ev.title || ''}`);
            if (isEmail && localGoogleState.connected) {
              localGoogleState.mailCounts.primary = (localGoogleState.mailCounts.primary || 0) + 1;
              localGoogleState.mailCounts.unreadTotal = (localGoogleState.mailCounts.unreadTotal || 0) + 1;
              localGoogleState.latestMails = [
                {
                  id: 'm_' + Date.now(),
                  from: ev.title || 'Google Mail',
                  subject: ev.body || 'Yeni e-posta alındı',
                  time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                },
                ...(localGoogleState.latestMails || []),
              ].slice(0, 10);
              mainWindow.webContents.send('google-data-update', localGoogleState);
            }
            if (!isGameOptHudAllowed()) continue;
            if (gameModeActive) showWindowForGameModeOverlay();
            const toastLaunch = lookupWindowsToastLaunchPayload({
              id: ev.id,
              appId: ev.appId || '',
              title: ev.title || '',
            });
            mainWindow.webContents.send('windows-notification', {
              id: ev.id,
              app: isEmail ? 'Gmail' : ev.app || 'Windows',
              appId: ev.appId || '',
              logo: ev.logo || '',
              sender: ev.sender || '',
              profileImage: ev.profileImage || ev.avatar || '',
              notificationKind: ev.notificationKind || '',
              callKind: ev.callKind || '',
              targetUrl: ev.targetUrl || '',
              toastLaunch: toastLaunch || '',
              title: ev.title || ev.app || 'Notification',
              body: ev.body || '',
            });
          }
        } catch {}
      }
    });
    proc.on('error', () => {
      if (systemWatcherProc === proc) systemWatcherProc = null;
      scheduleSystemWatcherRestart();
    });
    proc.on('exit', () => {
      if (systemWatcherProc === proc) systemWatcherProc = null;
      scheduleSystemWatcherRestart();
    });
  } catch {
    scheduleSystemWatcherRestart();
  }
}

app.on('will-quit', () => {
  isAppQuitting = true;
  if (systemWatcherRestartTimer) {
    clearTimeout(systemWatcherRestartTimer);
    systemWatcherRestartTimer = null;
  }
  if (gameModeHideTimer) {
    clearTimeout(gameModeHideTimer);
    gameModeHideTimer = null;
  }
  stopBackgroundPolling();
  perfMonitor.stop();
  stopLocalAgentServers();
  if (dropShareServerInstance) {
    try { dropShareServerInstance.stop(); } catch {}
  }
  if (ghelperBridgeClient) {
    try { ghelperBridgeClient.stop(); } catch {}
    ghelperBridgeClient = null;
  }
  if (systemWatcherProc) {
    try {
      systemWatcherProc.kill();
    } catch {}
  }
  if (bedoService) {
    try { bedoService.stop(); } catch {}
  }
  if (speechWorkerProc) {
    try { speechWorkerProc.kill(); } catch {}
    speechWorkerProc = null;
  }
  if (gmailPollTimer) clearInterval(gmailPollTimer);
});

function ensureDesktopShortcutOnce() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  if (userSettings.desktopShortcutCreated) return;
  try {
    const desktopDir = app.getPath('desktop');
    const shortcutPath = path.join(desktopDir, 'Bedo.lnk');
    if (!fs.existsSync(shortcutPath)) {
      const created = shell.writeShortcutLink(shortcutPath, 'create', {
        target: process.execPath,
        cwd: path.dirname(process.execPath),
        icon: process.execPath,
        iconIndex: 0,
        description: 'Bedo — Dynamic Island & AI Assistant',
        appUserModelId: 'com.bedo.assistant',
      });
      if (!created) return;
    }
    saveSettingsToDisk({ desktopShortcutCreated: true });
  } catch (err) {
    console.warn('[Shortcut] Desktop shortcut creation skipped:', err?.message || err);
  }
}

let autoUpdaterInstance = null;
let latestUpdateStatus = { state: 'idle', version: app.getVersion() };

function broadcastUpdateStatus(next) {
  latestUpdateStatus = { ...latestUpdateStatus, ...next };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('update-status', latestUpdateStatus); } catch {}
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('update-status', latestUpdateStatus); } catch {}
  }
}

function setupAutoUpdater() {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:check-for-updates', async () => {
    if (!app.isPackaged || !autoUpdaterInstance) {
      return { ok: false, status: latestUpdateStatus };
    }
    try {
      await autoUpdaterInstance.checkForUpdates();
      return { ok: true, status: latestUpdateStatus };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), status: latestUpdateStatus };
    }
  });
  ipcMain.handle('app:install-update', () => {
    if (!app.isPackaged || !autoUpdaterInstance) return { ok: false };
    try {
      autoUpdaterInstance.quitAndInstall(true, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdaterInstance = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      broadcastUpdateStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      broadcastUpdateStatus({ state: 'available', version: info?.version || '' });
    });
    autoUpdater.on('update-not-available', () => {
      broadcastUpdateStatus({ state: 'up-to-date', version: app.getVersion() });
    });
    autoUpdater.on('download-progress', (p) => {
      broadcastUpdateStatus({ state: 'downloading', percent: Math.round(p?.percent || 0) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      broadcastUpdateStatus({ state: 'downloaded', version: info?.version || '' });
    });
    autoUpdater.on('error', (err) => {
      broadcastUpdateStatus({ state: 'error', message: err?.message || 'Update error' });
    });

    // Silent background check 12s after startup, then every 4 hours
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 12000);
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('[AutoUpdater] Init skipped:', err?.message || err);
  }
}

app.whenReady().then(() => {
  try {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media' || permission === 'microphone' || permission === 'audioCapture';
    });
  } catch {}
  loadSettingsFromDisk();
  try {
    const initialBannerStatus = getWindowsBannerSuppressor().getStatusSync();
    if (userSettings.suppressWindowsBanners || initialBannerStatus.active) {
      syncWindowsBannerSuppressorBackground();
    }
  } catch {}
  try {
    const readyPy = getAvailablePythonExe(app.getPath('userData'));
    if (readyPy) process.env.BEDO_BOOTSTRAP_PYTHON = readyPy;
  } catch {}
  ensureDesktopShortcutOnce();
  setupAutoUpdater();
  applyStartWithWindows(userSettings.startWithWindows !== false);
  loadSavedGoogleSession();
  createWindow();
  createTray();
  if (!userSettings.onboardingCompleted) {
    setTimeout(() => {
      try { openOrFocusSettingsWindow('home'); } catch {}
    }, 650);
  }
  const agentStatus = getAgentIntegrationStatus();
  if (agentStatus.codexConnected || agentStatus.antigravityConnected || agentStatus.claudeConnected) startLocalAgentServers();
  setTimeout(() => {
    ensurePythonRuntimeBackground(app.getPath('userData'), (status) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('python-bootstrap-status', status);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-bootstrap-status', status);
      }
      if (
        status?.state === 'ready' &&
        userSettings.bedoAutoStart !== false &&
        userSettings.bedoEnableWake !== false &&
        hasConfiguredGeminiKey()
      ) {
        try {
          const svc = getBedoService();
          if (!svc.getStatus().running) {
            svc.start(buildDefaultBedoStartOptions({ startPaused: true }));
          }
        } catch {}
      }
    }).catch(() => {});
  }, 4500);

ipcMain.handle('get-python-bootstrap-status', () => getPythonBootstrapStatus());
  startCursorHoverWatcher();
  startSystemWatcher();

  // Start elevated GHelper bridge pipe listener only if G-Helper is installed on this PC
  if (isGHelperInstalled()) try {
    ghelperBridgeClient = new GHelperBridgeClient({
      onToast: (toast) => {
        if (!mainWindow || mainWindow.isDestroyed() || !isGameOptHudAllowed()) return;
        if (gameModeActive) showWindowForGameModeOverlay();
        mainWindow.webContents.send('system-hud', {
          type: 'ghelper',
          value: 0,
          ghelper: toast,
          isInit: false,
        });
      },
      onStatus: (status) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('ghelper-status-update', status);
      },
    });
    ghelperBridgeClient.start();
    powerMonitor.on('on-battery', () => {
      ghelperBridgeClient?.notifyPowerChange();
    });
    powerMonitor.on('on-ac', () => {
      ghelperBridgeClient?.notifyPowerChange();
    });
  } catch (err) {
    console.warn('[Main] GHelper pipe bridge setup error:', err.message);
  }

  // Automatically ensure the elevated G-Helper bridge background task is running on startup
  let ghelperTaskKnownMissing = false;
  let lastGHelperMissingCheckAt = 0;
  setTimeout(async () => {
    try {
      const taskStatus = await checkGHelperTaskStatus();
      ghelperTaskKnownMissing = !taskStatus.installed;
      lastGHelperMissingCheckAt = Date.now();
      if (taskStatus.installed && !taskStatus.running) {
        console.log('[Main] Auto-starting G-Helper bridge task...');
        await startGHelperTask();
      }
    } catch (err) {
      console.warn('[Main] G-Helper bridge task auto-start error:', err.message);
    }
  }, 2000);

  // Pause background polling on system suspend or screen lock to save power/CPU
  const handlePowerPause = () => {
    if (isSystemLockedOrSuspended) return;
    isSystemLockedOrSuspended = true;
    stopBackgroundPolling();
    trimWorkingSetAndGC({ trimWorkingSet: true });
  };
  const handlePowerResume = () => {
    if (!isSystemLockedOrSuspended) return;
    isSystemLockedOrSuspended = false;
    if (!gameModeActive) startBackgroundPolling();
    if (!systemWatcherProc || systemWatcherProc.killed || systemWatcherProc.exitCode !== null) {
      startSystemWatcher();
    } else if (systemWatcherProc.stdin && !systemWatcherProc.stdin.destroyed) {
      try { systemWatcherProc.stdin.write('refresh-watchers\n'); } catch {}
    }
  };
  powerMonitor.on('suspend', handlePowerPause);
  powerMonitor.on('lock-screen', handlePowerPause);
  powerMonitor.on('resume', handlePowerResume);
  powerMonitor.on('unlock-screen', handlePowerResume);

  // Periodic bridge health check (every 3 min); avoid trimming working set during active use to prevent page-fault stutters
  setInterval(async () => {
    if (isSystemLockedOrSuspended || gameModeActive) return;
    if (ghelperBridgeClient?.connected) return;
    // Avoid spawning schtasks.exe repeatedly if the task is not installed (re-check every 10 min).
    if (ghelperTaskKnownMissing && Date.now() - lastGHelperMissingCheckAt < 600000) return;
    try {
      const taskStatus = await checkGHelperTaskStatus();
      ghelperTaskKnownMissing = !taskStatus.installed;
      lastGHelperMissingCheckAt = Date.now();
      if (taskStatus.installed && !taskStatus.running) {
        console.log('[Main] Background check: G-Helper bridge task stopped, restarting...');
        await startGHelperTask();
      }
    } catch {}
  }, 180000);

  registerGlobalShortcuts();
  startGoogleMailAndAgendaWatcher();
  startBackgroundPolling();
});

function scheduleTrimWorkingSetAndGC() {
  if (trimGcTimer) {
    clearTimeout(trimGcTimer);
    trimGcTimer = null;
  }
}

ipcMain.on('set-ignore-mouse-events', (_event, ignore) => {
  updateWindowMouseIgnore(Boolean(ignore));
});

ipcMain.on('set-expanded', (_event, expanded) => {
  const isExp = Boolean(expanded);
  animateWindowShapeToMode(isExp);
  if (isExp && Date.now() - lastMediaPollAt > 5000) {
    scheduleNextMediaPoll(400);
  }
});

ipcMain.on('set-island-mode', (_event, mode, customWidth, customHeight, hasDroplet) => {
  animateWindowShapeToMode(mode, customWidth, customHeight, hasDroplet);
  if ((mode === 'expanded' || mode === 'music-bar') && Date.now() - lastMediaPollAt > 5000) {
    scheduleNextMediaPoll(400);
  }
});

ipcMain.handle('get-ghelper-bridge-status', async () => {
  const installed = isGHelperInstalled();
  if (!installed) {
    return { installed: false, running: false, ghelperInstalled: false };
  }
  const status = await checkGHelperTaskStatus();
  return { ...status, ghelperInstalled: true };
});

ipcMain.handle('get-windows-banner-status', async () => {
  return getWindowsBannerSuppressor().getStatus();
});

ipcMain.handle('set-windows-banner-suppression', async (_event, enabled) => {
  const wantEnabled = Boolean(enabled);
  const patch = wantEnabled
    ? { suppressWindowsBanners: true, windowsNotifications: true }
    : { suppressWindowsBanners: false };
  saveSettingsToDisk(patch, { skipBannerSync: true });
  const res = await syncWindowsBannerSuppressorBackground();
  const status = getWindowsBannerSuppressor().getStatusSync();
  return { ...status, ok: res?.ok !== false, error: res?.error || '' };
});

ipcMain.handle('open-windows-notification-settings', async () => {
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:notifications');
  }
  return true;
});

ipcMain.handle('get-ghelper-status', () => {
  const status = ghelperBridgeClient?.getGHelperStatus() || readGHelperStatus();
  return { ...status, ghelperInstalled: isGHelperInstalled() };
});

ipcMain.handle('install-ghelper-bridge', async () => {
  const res = await installGHelperTask();
  if (res.ok && ghelperBridgeClient) {
    startGHelperTask();
  }
  return res;
});

ipcMain.handle('start-ghelper-bridge', async () => {
  return await startGHelperTask();
});

ipcMain.handle('test-ghelper-hud', (_event, sampleText = 'Zone Test') => {
  const parsed = resolveGHelperToast(sampleText);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-hud', {
      type: 'ghelper',
      value: 0,
      ghelper: parsed,
      isInit: false,
    });
  }
  return { ok: true, parsed };
});

ipcMain.handle('is-game-mode-active', () => gameModeActive);

ipcMain.handle('open-settings-window', (_event, tabId) => {
  openOrFocusSettingsWindow(tabId || 'home');
  return true;
});

ipcMain.on('settings-window-control', (_event, action) => {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  if (action === 'minimize') {
    settingsWindow.setSkipTaskbar(false);
    settingsWindow.minimize();
  } else if (action === 'maximize') {
    if (settingsWindow.isMaximized()) settingsWindow.unmaximize();
    else settingsWindow.maximize();
  } else if (action === 'close') {
    settingsWindow.close();
  }
});

ipcMain.handle('get-settings', async () => {
  return userSettings;
});

ipcMain.handle('save-settings', async (_event, nextSettings) => {
  return saveSettingsToDisk(nextSettings);
});

ipcMain.handle('pick-program-file', async () => {
  try {
    const res = await dialog.showOpenDialog(settingsWindow || mainWindow, {
      title: 'Choose a program',
      properties: ['openFile'],
      filters: [
        { name: 'Programs & Shortcuts', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
  } catch {}
  return null;
});

ipcMain.on('trigger-island-emotion', (_event, emotion) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('island-emotion', emotion);
  }
});

ipcMain.on('trigger-test-notification', (_event, notif) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    let resolvedApp = notif?.app || 'Bedo';
    if (!notif?.app && typeof notif?.title === 'string') {
      const lower = notif.title.toLowerCase();
      if (lower.includes('whatsapp')) resolvedApp = 'WhatsApp';
      else if (lower.includes('discord')) resolvedApp = 'Discord';
      else if (lower.includes('spotify')) resolvedApp = 'Spotify';
      else if (lower.includes('claude')) resolvedApp = 'Claude';
      else if (lower.includes('chatgpt')) resolvedApp = 'ChatGPT';
      else if (lower.includes('chrome')) resolvedApp = 'Chrome';
      else if (lower.includes('telegram')) resolvedApp = 'Telegram';
    }
    mainWindow.webContents.send('windows-notification', {
      id: 'notif_' + Date.now(),
      app: resolvedApp,
      title: notif?.title || 'Bedo Bildirim',
      body: notif?.subtitle || notif?.body || trMain(userSettings.language, 'testNotifDefaultBody'),
      accentHex: notif?.accentHex,
      logo: notif?.logo || notif?.appLogoUri || '',
      appLogoUri: notif?.appLogoUri,
    });
  }
});

ipcMain.handle('get-ai-history', async () => {
  return loadLocalAiHistory();
});

ipcMain.handle('get-agent-integration-status', async () => getAgentIntegrationStatus());

ipcMain.handle('connect-agent-integrations', async () => {
  try {
    const status = await connectAgentIntegrations();
    startLocalAgentServers();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('test-agent-integration', async (_event, agent = 'Codex') => {
  const payload = JSON.stringify({ agent, type: 'done', title: trMain(userSettings.language, 'agentTestTitle', { agent }), event: 'test' });
  return new Promise((resolve) => {
    const request = http.request({ hostname: '127.0.0.1', port: 4242, path: '/api/agent', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 2500 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ ok: response.statusCode === 200, statusCode: response.statusCode, body }));
    });
    request.on('timeout', () => request.destroy(new Error('Agent server timeout')));
    request.on('error', (error) => resolve({ ok: false, error: error.message }));
    request.end(payload);
  });
});

ipcMain.handle('media-control', async (_event, action, value) => {
  const res = await pollWindowsMedia(action, value);
  scheduleNextMediaPoll(100);
  return res;
});

function getGHelperCandidatePaths() {
  return [
    path.join(os.homedir(), 'OneDrive', 'Masaüstü', 'GHelper.exe'),
    path.join(os.homedir(), 'Desktop', 'GHelper.exe'),
    path.join(os.homedir(), 'OneDrive', 'Desktop', 'GHelper.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GHelper', 'GHelper.exe'),
    'C:\\Program Files\\GHelper\\GHelper.exe',
  ];
}

function isGHelperInstalled() {
  const exeExists = getGHelperCandidatePaths().some((p) => p && fs.existsSync(p));
  if (exeExists) return true;
  const cfgPath = path.join(process.env.APPDATA || '', 'GHelper', 'config.json');
  return Boolean(cfgPath && fs.existsSync(cfgPath));
}

async function openGHelper() {
  const candidatePaths = getGHelperCandidatePaths();

  const targetPath = candidatePaths.find((p) => p && fs.existsSync(p));
  if (!targetPath) {
    return { ok: false, error: 'GHelper.exe not found' };
  }

  try {
    const err = await shell.openPath(targetPath);
    if (!err) {
      return { ok: true, path: targetPath, method: 'openPath' };
    }
  } catch (e) {}

  // Fallback if shell.openPath encounters any issues
  try {
    execFile('cmd.exe', ['/c', 'start', '""', targetPath], { windowsHide: true }, () => {});
  } catch (e) {}

  return { ok: true, path: targetPath };
}

ipcMain.handle('open-ghelper', async () => {
  return openGHelper();
});

ipcMain.handle('launch-music-service', async (_event, service) => {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  if (service === 'spotify') {
    const candidatePaths = [
      path.join(appData, 'Spotify', 'Spotify.exe'),
      path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe'),
      path.join(localAppData, 'Spotify', 'Spotify.exe'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Spotify.lnk'),
    ];
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        try {
          const err = await shell.openPath(p);
          if (!err) return { launched: 'app', service: 'spotify' };
        } catch {}
      }
    }

    // Check if Spotify URI handler actually has a valid shell\open\command or Store package
    const hasUriHandler = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-WindowStyle',
          'Hidden',
          '-NoProfile',
          '-Command',
          '$cmd = (Get-ItemProperty "HKCU:\\Software\\Classes\\spotify\\shell\\open\\command" -ErrorAction SilentlyContinue)."(default)"; if (-not $cmd) { $cmd = (Get-ItemProperty "HKLM:\\Software\\Classes\\spotify\\shell\\open\\command" -ErrorAction SilentlyContinue)."(default)" }; if ($cmd -or (Get-AppxPackage -Name "*Spotify*" -ErrorAction SilentlyContinue)) { Write-Output "INSTALLED" } else { Write-Output "NONE" }',
        ],
        { windowsHide: true, timeout: 2500 },
        (_err, stdout) => resolve((stdout || '').includes('INSTALLED'))
      );
    });

    if (hasUriHandler) {
      try {
        await shell.openExternal('spotify:');
        return { launched: 'app', service: 'spotify' };
      } catch {}
    }

    await shell.openExternal('https://open.spotify.com');
    return { launched: 'web', service: 'spotify' };
  }

  if (service === 'ytmusic') {
    const candidatePaths = [
      path.join(localAppData, 'Programs', 'youtube-music', 'YouTube Music.exe'),
      path.join(localAppData, 'YouTube Music', 'YouTube Music.exe'),
      path.join(localAppData, 'Programs', 'YouTube Music Desktop App', 'YouTube Music Desktop App.exe'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Chrome Apps', 'YouTube Music.lnk'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Edge Apps', 'YouTube Music.lnk'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'YouTube Music.lnk'),
    ];
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        await shell.openPath(p);
        return { launched: 'app', service: 'ytmusic' };
      }
    }
    await shell.openExternal('https://music.youtube.com');
    return { launched: 'web', service: 'ytmusic' };
  }

  return { launched: 'none' };
});

ipcMain.handle('get-media-status', async () => {
  return lastMediaState;
});

ipcMain.handle('copy-text', (_event, text) => {
  lastClipboardText = text || '';
  clipboard.writeText(text || '');
  return true;
});

ipcMain.handle('copy-clip', (_event, clip = {}) => {
  try {
    if (clip.kind === 'image' && typeof clip.thumb === 'string' && clip.thumb.startsWith('data:image/')) {
      const img = nativeImage.createFromDataURL(clip.thumb);
      if (img && !img.isEmpty()) {
        const size = img.getSize();
        const bmp = img.toBitmap();
        lastClipboardImageKey = `${size.width}x${size.height}:${bmp.subarray(0, 256).toString('base64')}`;
        clipboard.writeImage(img);
        return true;
      }
    }
    if (typeof clip.text === 'string' && clip.text) {
      lastClipboardText = clip.text;
      clipboard.writeText(clip.text);
      return true;
    }
  } catch (error) {
    console.warn('Could not copy clip:', error.message);
  }
  return false;
});

ipcMain.handle('clear-clips', () => {
  clipboardHistory = [];
  return true;
});

ipcMain.handle('open-note-attachment', async (_event, payload = {}) => {
  try {
    if (typeof payload.path === 'string' && payload.path && fs.existsSync(payload.path)) {
      const err = await shell.openPath(payload.path);
      return !err;
    }
    if (typeof payload.thumb === 'string' && payload.thumb.startsWith('data:image/')) {
      const match = payload.thumb.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1].replace(/[^a-z0-9]/gi, '') || 'png';
        const tmpFile = path.join(os.tmpdir(), `twocode-note-${Date.now()}.${ext}`);
        fs.writeFileSync(tmpFile, Buffer.from(match[2], 'base64'));
        const err = await shell.openPath(tmpFile);
        return !err;
      }
    }
  } catch (error) {
    console.warn('Could not open note attachment:', error.message);
  }
  return false;
});

ipcMain.handle('copy-note-attachment', (_event, payload = {}) => {
  try {
    if (payload.isImage) {
      let img = null;
      if (typeof payload.path === 'string' && payload.path && fs.existsSync(payload.path)) {
        img = nativeImage.createFromPath(payload.path);
      }
      if ((!img || img.isEmpty()) && typeof payload.thumb === 'string' && payload.thumb.startsWith('data:image/')) {
        img = nativeImage.createFromDataURL(payload.thumb);
      }
      if (img && !img.isEmpty()) {
        clipboard.writeImage(img);
        return true;
      }
    }
    const textVal = (typeof payload.path === 'string' && payload.path) || payload.name || '';
    if (textVal) {
      lastClipboardText = textVal;
      clipboard.writeText(textVal);
      return true;
    }
  } catch (error) {
    console.warn('Could not copy note attachment:', error.message);
  }
  return false;
});

let speechWorkerProc = null;
let speechWorkerQueue = [];
let speechWorkerBuffer = '';

function transcribeWithWarmPythonWorker(wavPath, lang) {
  return new Promise((resolve) => {
    if (!speechWorkerProc || speechWorkerProc.killed || !speechWorkerProc.stdin || !speechWorkerProc.stdin.writable) {
      const workerCode = [
        'import sys, json',
        'sr = None',
        'sr_rec = None',
        'whisper_model = None',
        'whisper_init_err = None',
        'try:',
        '    import speech_recognition as _sr',
        '    sr = _sr',
        '    sr_rec = _sr.Recognizer()',
        'except Exception:',
        '    pass',
        'def get_whisper():',
        '    global whisper_model, whisper_init_err',
        '    if whisper_model is not None:',
        '        return whisper_model',
        '    if whisper_init_err is not None:',
        '        return None',
        '    try:',
        '        from faster_whisper import WhisperModel',
        '        whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")',
        '        return whisper_model',
        '    except Exception as e:',
        '        whisper_init_err = str(e)',
        '        return None',
        'for line in sys.stdin:',
        '    line = line.strip()',
        '    if not line:',
        '        continue',
        '    parts = line.split("|", 1)',
        '    wav_path = parts[0]',
        '    lang = parts[1] if len(parts) > 1 else "tr-TR"',
        '    short_lang = lang.split("-")[0].lower() if lang else "tr"',
        '    try:',
        '        wm = get_whisper()',
        '        if wm is not None:',
        '            segs, _ = wm.transcribe(wav_path, language=short_lang, beam_size=1, vad_filter=False)',
        '            txt = " ".join(s.text.strip() for s in segs if s.text).strip()',
        '            if txt:',
        '                print(json.dumps({"ok": True, "text": txt}, ensure_ascii=False), flush=True)',
        '            else:',
        '                print(json.dumps({"ok": False, "error": "Konuşma algılanamadı."}), flush=True)',
        '            continue',
        '        if sr is not None and sr_rec is not None:',
        '            with sr.AudioFile(wav_path) as src:',
        '                audio = sr_rec.record(src)',
        '            txt = sr_rec.recognize_google(audio, language=lang)',
        '            print(json.dumps({"ok": True, "text": txt}, ensure_ascii=False), flush=True)',
        '            continue',
        '        err = whisper_init_err or "faster-whisper veya SpeechRecognition yüklü değil."',
        '        print(json.dumps({"ok": False, "error": err}), flush=True)',
        '    except Exception as e:',
        '        if sr is not None and isinstance(e, sr.UnknownValueError):',
        '            print(json.dumps({"ok": False, "error": "Konuşma algılanamadı."}), flush=True)',
        '        else:',
        '            print(json.dumps({"ok": False, "error": str(e)}), flush=True)',
      ].join('\n');

      const pythonCmd = getAvailablePythonExe(app.getPath('userData')) || 'python';
      speechWorkerProc = spawn(pythonCmd, ['-u', '-c', workerCode], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      speechWorkerBuffer = '';
      try { speechWorkerProc.stdin?.on?.('error', ignoreBrokenPipeError); } catch {}
      try { speechWorkerProc.stdout?.on?.('error', ignoreBrokenPipeError); } catch {}
      speechWorkerProc.stdout.setEncoding('utf8');
      speechWorkerProc.stdout.on('data', (chunk) => {
        speechWorkerBuffer += chunk;
        const lines = speechWorkerBuffer.split('\n');
        speechWorkerBuffer = lines.pop() || '';
        for (const raw of lines) {
          const item = speechWorkerQueue.shift();
          if (!item) continue;
          try {
            item.resolve(JSON.parse(raw));
          } catch {
            item.resolve({ ok: false, error: 'Ses yazıya dökülemedi.' });
          }
        }
      });
      speechWorkerProc.on('error', () => {
        speechWorkerProc = null;
        while (speechWorkerQueue.length) {
          const item = speechWorkerQueue.shift();
          item?.resolve({ ok: false, error: 'Sesli dikte için sistemde Python bulunamadı.' });
        }
      });
      speechWorkerProc.on('exit', () => {
        speechWorkerProc = null;
        while (speechWorkerQueue.length) {
          const item = speechWorkerQueue.shift();
          item?.resolve({ ok: false, error: 'Ses çalışanı kapandı.' });
        }
      });
    }

    let settled = false;
    const entry = {
      resolve: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res);
      },
    };

    const timer = setTimeout(() => {
      const idx = speechWorkerQueue.indexOf(entry);
      if (idx !== -1) {
        speechWorkerQueue.splice(idx, 1);
      }
      entry.resolve({ ok: false, error: 'Ses çözme zaman aşımına uğradı.' });
    }, 20000);

    speechWorkerQueue.push(entry);
    try {
      speechWorkerProc.stdin.write(`${wavPath}|${lang}\n`);
    } catch {
      const idx = speechWorkerQueue.indexOf(entry);
      if (idx !== -1) speechWorkerQueue.splice(idx, 1);
      entry.resolve({ ok: false, error: 'Ses yazıya dökülemedi.' });
    }
  });
}

ipcMain.handle('transcribe-audio', async (_event, payload = {}) => {
  const wavBase64 = typeof payload.wavBase64 === 'string' ? payload.wavBase64 : '';
  const lang = typeof payload.lang === 'string' && payload.lang ? payload.lang : getLocale(userSettings.language);
  if (!wavBase64) return { ok: false, error: trMain(userSettings.language, 'speechEmptyAudio') };

  const geminiKey = userSettings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    for (const modelId of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash']) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(12000),
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: trMain(userSettings.language, 'speechGeminiPrompt') },
                  { inline_data: { mime_type: 'audio/wav', data: wavBase64 } },
                ],
              }],
            }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) return { ok: true, text, provider: modelId };
        } else {
          console.warn(`${modelId} audio transcription HTTP ${resp.status}`);
        }
      } catch (error) {
        console.warn(`${modelId} audio transcription failed, trying fallback:`, error.message);
      }
    }
  }

  const tmpWav = path.join(os.tmpdir(), `twocode-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);
  try {
    fs.writeFileSync(tmpWav, Buffer.from(wavBase64, 'base64'));
    const res = await transcribeWithWarmPythonWorker(tmpWav, lang);
    if (res?.ok && res.text) return { ok: true, text: res.text.trim(), provider: 'python-worker' };
    return { ok: false, error: res?.error || 'Konuşma algılanamadı.' };
  } catch {
    return { ok: false, error: 'Ses yazıya dökülemedi.' };
  } finally {
    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}
  }
});

ipcMain.handle('open-external', (_event, url) => {
  if (url && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  } else if (url) {
    shell.openPath(url);
  }
  return true;
});

ipcMain.handle('open-app', async (_event, target = {}) => {
  try {
    const appTarget = typeof target === 'string' ? { url: target } : target;
    if (appTarget.type === 'uwp-app' && typeof appTarget.aumid === 'string' && /^[A-Za-z0-9_.!-]+$/.test(appTarget.aumid)) {
      const child = spawn('explorer.exe', [`shell:AppsFolder\\${appTarget.aumid}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return true;
    }
    const localPath = appTarget.path || appTarget.url;
    if (appTarget.type === 'native-app' || (typeof localPath === 'string' && /\.(exe|lnk|bat|cmd)$/i.test(localPath))) {
      if (typeof localPath !== 'string' || !path.isAbsolute(localPath) || !fs.existsSync(localPath)) return false;
      const error = await shell.openPath(localPath);
      return !error;
    }
    const url = appTarget.url;
    if (typeof url !== 'string') return false;
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
});

let installedAppsCache = null;

function collectStartMenuLinks(dir, depth = 0, out = []) {
  if (!dir || depth > 3 || !fs.existsSync(dir)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  const ignorePattern = /(uninstall|kaldır|readme|documentation|manual|license|changelog|release notes|setup|updater|installer|website|help|yardım)/i;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectStartMenuLinks(fullPath, depth + 1, out);
    } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
      const displayName = entry.name.replace(/\.lnk$/i, '').trim();
      if (!displayName || ignorePattern.test(displayName)) continue;
      out.push({ name: displayName, path: fullPath });
    }
  }
  return out;
}

function getUwpStartApps() {
  return new Promise((resolve) => {
    const ps = [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
      '$pkgMap = @{};',
      'Get-AppxPackage | ForEach-Object { if ($_.PackageFamilyName -and $_.InstallLocation) { $pkgMap[$_.PackageFamilyName] = $_.InstallLocation } };',
      'Get-StartApps | ForEach-Object {',
      '  $aid = [string]$_.AppID;',
      '  $loc = "";',
      '  if ($aid -match "^([^!]+)!") { $loc = $pkgMap[$matches[1]] };',
      '  [PSCustomObject]@{ Name = $_.Name; AppID = $aid; InstallLocation = $loc }',
      '} | ConvertTo-Json -Compress',
    ].join(' ');
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 5500, maxBuffer: 1024 * 1024 * 4, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          resolve(list.filter((item) => item && item.Name && item.AppID));
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function resolveUwpIconDataUrl(installLocation) {
  if (!installLocation || !fs.existsSync(installLocation)) return '';
  try {
    const manifestPath = path.join(installLocation, 'AppxManifest.xml');
    if (!fs.existsSync(manifestPath)) return '';
    const xml = fs.readFileSync(manifestPath, 'utf8');
    const match =
      xml.match(/Square44x44Logo="([^"]+)"/i) ||
      xml.match(/<Logo>([^<]+)<\/Logo>/i) ||
      xml.match(/Square150x150Logo="([^"]+)"/i);
    if (!match?.[1]) return '';
    const rel = match[1].replace(/\//g, path.sep);
    const direct = path.join(installLocation, rel);
    let chosen = fs.existsSync(direct) ? direct : '';
    if (!chosen) {
      const dir = path.dirname(direct);
      const ext = path.extname(direct) || '.png';
      const base = path.basename(direct, ext);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const hit =
          files.find((f) => f.startsWith(base) && /targetsize-48|scale-200|scale-150|scale-100/i.test(f) && /\.(png|ico)$/i.test(f)) ||
          files.find((f) => f.startsWith(base) && /\.(png|ico)$/i.test(f));
        if (hit) chosen = path.join(dir, hit);
      }
    }
    if (!chosen || !fs.existsSync(chosen)) return '';
    const buf = fs.readFileSync(chosen);
    if (!buf.length) return '';
    return `data:image/${chosen.toLowerCase().endsWith('.ico') ? 'x-icon' : 'png'};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function scanInstalledApps(forceRefresh = false) {
  if (installedAppsCache && !forceRefresh) return installedAppsCache;

  const startDirs = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
  ].filter(Boolean);

  const byKey = new Map();
  const rawLinks = [];
  for (const d of startDirs) {
    collectStartMenuLinks(d, 0, rawLinks);
  }

  for (const lnk of rawLinks) {
    const key = lnk.name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: `local-${key}`,
        name: lnk.name,
        type: 'native-app',
        path: lnk.path,
        source: 'desktop',
        iconDataUrl: '',
      });
    }
  }

  const lnkItems = Array.from(byKey.values());
  const batchSize = 15;
  for (let i = 0; i < lnkItems.length; i += batchSize) {
    const slice = lnkItems.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (item) => {
        try {
          let iconSource = item.path;
          try {
            const sc = shell.readShortcutLink(item.path);
            if (sc?.icon && fs.existsSync(sc.icon)) {
              iconSource = sc.icon;
            } else if (sc?.target && fs.existsSync(sc.target)) {
              iconSource = sc.target;
            }
          } catch {}
          const img = await app.getFileIcon(iconSource, { size: 'normal' });
          if (img && !img.isEmpty()) {
            item.iconDataUrl = img.toDataURL();
          }
        } catch {}
      })
    );
  }

  const ignoreStorePattern = /(uninstall|kaldır|help|yardım|readme|troubleshooting|command prompt|developer|powershell|sdk|settings|ayarlar)/i;
  const uwpApps = await getUwpStartApps();
  for (const uwp of uwpApps) {
    const cleanName = String(uwp.Name || '').trim();
    const aumid = String(uwp.AppID || '').trim();
    if (!cleanName || !aumid || ignoreStorePattern.test(cleanName)) continue;
    if (!/^[A-Za-z0-9_.!-]+$/.test(aumid)) continue;
    const key = cleanName.toLowerCase();
    if (!byKey.has(key) && aumid.includes('!')) {
      byKey.set(key, {
        id: `uwp-${key}`,
        name: cleanName,
        type: 'uwp-app',
        aumid,
        source: 'store',
        iconDataUrl: resolveUwpIconDataUrl(uwp.InstallLocation),
      });
    }
  }

  const sorted = Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' })
  );
  installedAppsCache = sorted;
  return sorted;
}

ipcMain.handle('get-installed-apps', async (_event, opts = {}) => {
  try {
    return await scanInstalledApps(Boolean(opts?.forceRefresh));
  } catch {
    return [];
  }
});

function decodeXmlAttrEntities(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractToastLaunchFromXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return '';
  const m = xmlText.match(/<toast\b[^>]*?\blaunch\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!m) return '';
  return decodeXmlAttrEntities(m[1] !== undefined ? m[1] : m[2]);
}

function lookupWindowsToastLaunchPayload({ id, appId, title } = {}) {
  if (process.platform !== 'win32') return '';
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    return '';
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const srcDb = path.join(localAppData, 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
  if (!fs.existsSync(srcDb)) return '';

  const tmpBase = path.join(os.tmpdir(), `tc_wpn_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.db`);
  let db = null;
  try {
    fs.copyFileSync(srcDb, tmpBase);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(srcDb + ext)) {
        try { fs.copyFileSync(srcDb + ext, tmpBase + ext); } catch {}
      }
    }
    db = new DatabaseSync(tmpBase, { open: true });
    const decodePayload = (val) => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
        return Buffer.from(val).toString('utf8');
      }
      return String(val);
    };

    const numericId = /^\d+$/.test(String(id || '').trim()) ? Number(String(id).trim()) : null;
    if (numericId !== null && Number.isSafeInteger(numericId)) {
      const row = db.prepare('SELECT Payload FROM Notification WHERE Id = ? LIMIT 1').get(numericId);
      const launch = extractToastLaunchFromXml(decodePayload(row?.Payload));
      if (launch) return launch;
    }

    const cleanAppId = String(appId || '').trim();
    if (cleanAppId) {
      const rows = db
        .prepare(
          'SELECT n.Payload FROM Notification n JOIN NotificationHandler h ON n.HandlerId = h.RecordId WHERE LOWER(h.PrimaryId) = LOWER(?) ORDER BY n.Id DESC LIMIT 20'
        )
        .all(cleanAppId);
      const cleanTitle = String(title || '').trim().toLowerCase();
      let firstLaunch = '';
      for (const r of rows) {
        const xml = decodePayload(r?.Payload);
        const launch = extractToastLaunchFromXml(xml);
        if (!launch) continue;
        if (!firstLaunch) firstLaunch = launch;
        if (cleanTitle && xml.toLowerCase().includes(cleanTitle)) {
          return launch;
        }
      }
      if (firstLaunch) return firstLaunch;
    }
  } catch {
    return '';
  } finally {
    try { db?.close(); } catch {}
    for (const ext of ['', '-wal', '-shm', '-journal']) {
      try { if (fs.existsSync(tmpBase + ext)) fs.unlinkSync(tmpBase + ext); } catch {}
    }
  }
  return '';
}

function resolveToastActivatorClsid(appId) {
  const lower = String(appId || '').trim().toLowerCase();
  if (!lower) return '';
  try {
    const shortcuts = getStartMenuShortcuts();
    const match = shortcuts.find((s) => s.appIdLower === lower && s.toastActivatorClsid);
    return match ? match.toastActivatorClsid : '';
  } catch {
    return '';
  }
}

function runPowerShellJsonScript(scriptName, namedParams = {}, timeoutMs = 6000) {
  const scriptPath = resolveScriptPath(scriptName);
  const cliArgs = [];
  for (const [key, val] of Object.entries(namedParams)) {
    const str = val !== undefined && val !== null ? String(val) : '';
    if (str.length > 0) {
      cliArgs.push(`-${key}`, str);
    }
  }
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...cliArgs],
      { windowsHide: true, timeout: timeoutMs },
      (_err, stdout) => {
        try {
          const lastLine = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
          resolve(lastLine ? JSON.parse(lastLine) : { ok: false });
        } catch {
          resolve({ ok: false });
        }
      }
    );
  });
}

ipcMain.handle('open-notification-target', async (_event, target = {}) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
      mainWindow.blur();
    }
    if (typeof target.url === 'string' && target.url) {
      const parsed = new URL(target.url);
      if (!['https:', 'http:'].includes(parsed.protocol)) return false;
      await shell.openExternal(parsed.toString());
      return true;
    }

    const cleanAppId = typeof target.appId === 'string' ? target.appId.trim() : '';
    const appName = typeof target.app === 'string' ? target.app.trim() : '';
    const notifTitle = typeof target.title === 'string' ? target.title.trim() : '';
    const notifBody = typeof target.body === 'string' ? target.body.trim() : '';
    const notifId = target.id !== undefined && target.id !== null ? String(target.id).trim() : '';
    const isBrowserApp =
      /^(chrome|msedge|microsoftedge|brave|comet|firefox|opera|vivaldi|arc|zen|thorium|chromium|waterfox|librewolf|floorp)(\.|$)/i.test(cleanAppId) ||
      /\b(chrome|edge|brave|comet|firefox|opera|vivaldi|arc|zen)\b/i.test(appName);

    // 1. Native Windows Action Center COM activation (switches directly to the exact open browser tab / notification context)
    if (cleanAppId && !/[\r\n\0"<>|&^;]/.test(cleanAppId)) {
      const invokedArgs =
        (typeof target.toastLaunch === 'string' && target.toastLaunch) ||
        lookupWindowsToastLaunchPayload({ id: notifId, appId: cleanAppId, title: notifTitle });
      const clsid = resolveToastActivatorClsid(cleanAppId);
      if (invokedArgs || (clsid && !isBrowserApp)) {
        const comRes = await runPowerShellJsonScript('win-activate-notification.ps1', {
          Clsid: clsid,
          AppId: cleanAppId,
          InvokedArgs: invokedArgs || '',
        });
        if (comRes?.ok) return true;
      }
    }

    // 2. Focus already-open window / matching tab instead of spawning a duplicate blank browser window
    const focusSource = cleanAppId || appName;
    if (focusSource) {
      const focusRes = await runPowerShellJsonScript('win-focus-media.ps1', {
        SourceApp: focusSource,
        Title: notifTitle,
        Artist: notifBody,
      });
      if (focusRes?.ok) return true;
    }

    // 3. Last resort: launch app via shell:AppsFolder when not currently open
    if (cleanAppId && !/[\r\n\0"<>|&^;]/.test(cleanAppId)) {
      const child = spawn('explorer.exe', [`shell:AppsFolder\\${cleanAppId}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return true;
    }
  } catch (error) {
    console.warn('Could not open notification target:', error.message);
  } finally {
    if (mainWindow && !mainWindow.isDestroyed() && !gameModeActive) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !gameModeActive) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
      }, 300);
    }
  }
  return false;
});

ipcMain.handle('focus-media-source', async (_event, media = {}) => {
  try {
    const sourceApp = typeof media.sourceApp === 'string' ? media.sourceApp.trim() : '';
    const title = typeof media.title === 'string' ? media.title.trim() : '';
    const artist = typeof media.artist === 'string' ? media.artist.trim() : '';

    const scriptPath = resolveScriptPath('win-focus-media.ps1');
    const result = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-WindowStyle', 'Hidden',
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          '-SourceApp', sourceApp,
          '-Title', title,
          '-Artist', artist,
        ],
        { windowsHide: true, timeout: 8000 },
        (_err, stdout) => {
          try {
            const parsed = JSON.parse((stdout || '').trim().split(/\r?\n/).pop());
            resolve(parsed);
          } catch {
            resolve({ ok: false });
          }
        }
      );
    });

    if (result && result.ok) {
      if (!result.alreadyActive && mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
        mainWindow.blur();
      }
      return { ok: true, alreadyActive: Boolean(result.alreadyActive) };
    }

    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
      mainWindow.blur();
    }

    // Never launch shell:AppsFolder for a browser when focus fails, because
    // Windows opens a blank new tab in the existing browser instead.
    const isBrowserSource =
      /(?:chrome|msedge|microsoftedge|brave|opera|vivaldi|\barc\b|firefox|308046b0af4a39cb|0d797b6d|comet|zen|floorp|waterfox|librewolf|thorium|chromium|yandex)/i.test(sourceApp) &&
      !/_crx_/i.test(sourceApp);

    if (sourceApp && !isBrowserSource && !/[\r\n\0"<>|&^;]/.test(sourceApp)) {
      const child = spawn('explorer.exe', [`shell:AppsFolder\\${sourceApp}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return true;
    }
  } catch (error) {
    console.warn('Could not focus media source:', error.message);
  } finally {
    if (mainWindow && !mainWindow.isDestroyed() && !gameModeActive) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !gameModeActive) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
      }, 300);
    }
  }
  return false;
});

ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 960, height: 540 },
    });
    if (sources && sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
  } catch {}
  return null;
});

ipcMain.handle('get-system-mic-muted', async () => {
  try {
    const psCmd = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f0(); int f1(); int f2(); int f3(); int f4(); int f5(); int f6(); int f7(); int f8(); int f9(); int f10(); int f11();
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f0(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public class MicMuteQuery {
  public static bool IsMuted() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice dev;
    enumerator.GetDefaultAudioEndpoint(1, 1, out dev);
    var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    IntPtr ptr;
    dev.Activate(ref iid, 23, IntPtr.Zero, out ptr);
    var vol = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(ptr);
    bool muted;
    vol.GetMute(out muted);
    return muted;
  }
}
"@
[MicMuteQuery]::IsMuted()
`;
    const out = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
        { windowsHide: true, timeout: 4000 },
        (_err, stdout) => resolve((stdout || '').trim().toLowerCase())
      );
    });
    if (out === 'true') return true;
    if (out === 'false') return false;
  } catch {}
  return null;
});

ipcMain.handle('set-system-mic-muted', async (_event, muted) => {
  const target = Boolean(muted);
  try {
    if (systemWatcherProc && systemWatcherProc.stdin && !systemWatcherProc.stdin.destroyed) {
      systemWatcherProc.stdin.write(`set-mic-mute:${target ? 'true' : 'false'}\n`);
    }
    const psCmd = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f0(); int f1(); int f2(); int f3(); int f4(); int f5(); int f6(); int f7(); int f8(); int f9(); int f10();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f0(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public class MicMuteSetter {
  public static bool SetMuted(bool mute) {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    for (int role = 0; role < 3; role++) {
      IMMDevice dev;
      enumerator.GetDefaultAudioEndpoint(1, role, out dev);
      if (dev != null) {
        IntPtr ptr;
        dev.Activate(ref iid, 23, IntPtr.Zero, out ptr);
        var vol = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(ptr);
        vol.SetMute(mute, Guid.Empty);
      }
    }
    return mute;
  }
}
"@
[MicMuteSetter]::SetMuted($${target ? 'true' : 'false'})
`;
    await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
        { windowsHide: true, timeout: 4000 },
        () => resolve()
      );
    });
    getBedoService().setSystemMicMuted(target);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-hud', {
        type: 'mic-mute',
        muted: target,
        isInit: true,
      });
    }
    return target;
  } catch {}
  return null;
});

ipcMain.handle('get-system-stats', async () => {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
  return {
    memUsagePercent,
    uptimeSeconds: Math.floor(os.uptime()),
    jobsToday: localAgentHistory.jobsToday,
  };
});

ipcMain.handle('get-perf-metrics', async () => perfMonitor.getSnapshot());
ipcMain.handle('get-battery-charge-eta', async (_event, opts = {}) => queryWindowsBatteryEta(opts));

ipcMain.handle('open-taskmgr-perf', async (_event, section = 'cpu') => {
  const scriptPath = resolveScriptPath('open-taskmgr-perf.ps1');
  execFile(
    'powershell.exe',
    ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Section', String(section || 'cpu')],
    { windowsHide: true, timeout: 8000 },
    () => {}
  );
  return true;
});

ipcMain.handle('focus-agent-window', async (_event, payload = {}) => {
  const agent = String(payload?.agent || '');
  const file = String(payload?.file || '');
  const title = String(payload?.title || '');
  const scriptPath = resolveScriptPath('win-focus-agent.ps1');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-WindowStyle', 'Hidden',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Agent', agent,
        '-File', file,
        '-Title', title,
      ],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        try {
          const parsed = JSON.parse((stdout || '').trim() || '{}');
          if (parsed.ok) return resolve(parsed);
        } catch {}
        if (/antigravity/i.test(agent)) {
          const status = getAgentIntegrationStatus();
          if (status.antigravityIdePath && fs.existsSync(status.antigravityIdePath)) {
            try {
              const child = spawn(status.antigravityIdePath, [], { detached: true, stdio: 'ignore', windowsHide: true });
              child.unref();
              return resolve({ ok: true, launched: true });
            } catch {}
          }
        }
        resolve({ ok: false });
      }
    );
  });
});

const dropIconCache = new Map();
function cacheDropFileIcons(paths = []) {
  for (const p of paths) {
    if (!p || dropIconCache.has(p) || !fs.existsSync(p)) continue;
    app.getFileIcon(p, { size: 'normal' })
      .then((img) => {
        if (img && !img.isEmpty()) dropIconCache.set(p, img);
      })
      .catch(() => {});
  }
}

let dropShareServerInstance = null;
function getDropShareServer() {
  if (!dropShareServerInstance) {
    const uploadDir = path.join(app.getPath('downloads'), 'TwoCode Drop');
    dropShareServerInstance = new DropShareServer({
    uploadDir,
    port: 4343,
    getLanguage: () => userSettings.language,
  });
    dropShareServerInstance.on('change', (files) => {
      cacheDropFileIcons(files.map((f) => f.path));
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('drop-shelf-update', files);
      }
    });
    dropShareServerInstance.on('phone-upload-start', (meta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-hud', {
          type: 'phone-upload',
          phase: 'receiving',
          file: meta || null,
        });
      }
    });
    dropShareServerInstance.on('phone-upload', (file) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-hud', {
          type: 'phone-upload',
          phase: 'done',
          file: file
            ? {
                id: file.id,
                name: file.name,
                path: file.path,
                size: file.size,
                ext: file.ext,
                isImage: Boolean(file.isImage),
              }
            : null,
        });
      }
    });
  }
  return dropShareServerInstance;
}

ipcMain.handle('get-drop-shelf', async () => getDropShareServer().getFiles());

ipcMain.handle('add-drop-files', async (_event, paths = []) => {
  const list = Array.isArray(paths) ? paths : [];
  cacheDropFileIcons(list);
  const srv = getDropShareServer();
  srv.addFiles(list, 'pc');
  return srv.getFiles();
});

ipcMain.handle('pick-drop-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow || undefined, {
    title: trMain(userSettings.language, 'dropPickTitle'),
    properties: ['openFile', 'multiSelections'],
  });
  if (res.canceled || !res.filePaths?.length) return getDropShareServer().getFiles();
  cacheDropFileIcons(res.filePaths);
  const srv = getDropShareServer();
  srv.addFiles(res.filePaths, 'pc');
  return srv.getFiles();
});

ipcMain.handle('remove-drop-file', async (_event, id) => {
  const srv = getDropShareServer();
  srv.removeFile(id);
  return srv.getFiles();
});

ipcMain.handle('clear-drop-shelf', async () => {
  const srv = getDropShareServer();
  srv.clearFiles();
  return [];
});

ipcMain.handle('get-drop-share-status', async () => getDropShareServer().getStatus());

ipcMain.handle('toggle-drop-share-server', async (_event, enabled) => {
  const srv = getDropShareServer();
  if (enabled) return srv.start();
  return srv.stop();
});

ipcMain.handle('open-drop-file', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('save-all-drop-files', async () => {
  const srv = getDropShareServer();
  const files = srv.getFiles();
  if (!files.length) return { ok: false, canceled: false, count: 0 };

  const res = await dialog.showOpenDialog(mainWindow || undefined, {
    title: trMain(userSettings.language, 'dropSaveAllTitle'),
    defaultPath: app.getPath('desktop'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths?.[0]) {
    return { ok: false, canceled: true, count: 0 };
  }

  const targetDir = res.filePaths[0];
  let savedCount = 0;

  for (const item of files) {
    const srcPath = item?.path;
    if (!srcPath || !fs.existsSync(srcPath)) continue;
    const baseName = path.basename(item.name || srcPath);
    const ext = path.extname(baseName);
    const stem = ext ? baseName.slice(0, -ext.length) : baseName;
    let destPath = path.join(targetDir, baseName);
    let idx = 1;
    while (fs.existsSync(destPath)) {
      destPath = path.join(targetDir, `${stem} (${idx})${ext}`);
      idx += 1;
    }
    try {
      fs.copyFileSync(srcPath, destPath);
      savedCount += 1;
      srv.removeFile(item.id);
    } catch {}
  }

  return { ok: savedCount > 0, canceled: false, count: savedCount, targetDir };
});

const FALLBACK_DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAE0lEQVR42mP8/5+hngELGJUYEQAAB88PAf0J+5UAAAAASUVORK5CYII='
);

ipcMain.on('start-drop-drag', (event, filePathOrList) => {
  const rawList = Array.isArray(filePathOrList) ? filePathOrList : [filePathOrList];
  const validPaths = rawList
    .filter((p) => typeof p === 'string' && p && fs.existsSync(p))
    .map((p) => path.resolve(p));
  if (!validPaths.length) {
    event.returnValue = false;
    return;
  }
  const icon = dropIconCache.get(validPaths[0]) || FALLBACK_DRAG_ICON;
  try {
    if (validPaths.length === 1) {
      event.sender.startDrag({ file: validPaths[0], icon });
    } else {
      event.sender.startDrag({ file: validPaths[0], files: validPaths, icon });
    }
    const srv = getDropShareServer();
    const draggedSet = new Set(validPaths.map((p) => p.toLowerCase()));
    for (const item of srv.getFiles()) {
      if (item?.path && draggedSet.has(path.resolve(item.path).toLowerCase())) {
        srv.removeFile(item.id);
      }
    }
    event.returnValue = true;
  } catch {
    event.returnValue = false;
  }
});

ipcMain.handle('resolve-agent-approval', (_event, { id, approved }) => {
  if (pendingApprovals.has(id)) {
    const resolver = pendingApprovals.get(id);
    pendingApprovals.delete(id);
    resolver(Boolean(approved));
  }
  if (approved) {
    localAgentHistory.jobsToday++;
  }
  return { ok: true, jobsToday: localAgentHistory.jobsToday };
});

ipcMain.handle('simulate-agent-task', (_event, type) => {
  if (type === 'done') {
    localAgentHistory.jobsToday++;
  }
  return { jobsToday: localAgentHistory.jobsToday };
});

ipcMain.handle('adjust-volume', (_event, direction) => {
  const keyChar = direction === 'up' ? '[char]175' : direction === 'down' ? '[char]174' : '[char]173';
  execFile(
    'powershell.exe',
    ['-WindowStyle', 'Hidden', '-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).SendKeys(${keyChar})`],
    { windowsHide: true },
    () => {}
  );
  return true;
});

ipcMain.handle('toggle-radio', async (_event, kind) => {
  if (kind !== 'Wifi' && kind !== 'Bluetooth') {
    return { success: false, error: 'Unknown radio type.' };
  }
  return new Promise((resolve) => {
    const scriptPath = resolveScriptPath('win-radio.ps1');
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', 'Toggle', '-Kind', kind],
      { windowsHide: true, timeout: 12000 },
      (err, stdout) => {
        try {
          const result = JSON.parse((stdout || '').trim().split(/\r?\n/).pop());
          if (err && result.success) return resolve({ success: false, error: err.message });
          resolve(result);
        } catch {
          resolve({ success: false, error: err?.message || 'Windows radio control returned no status.' });
        }
      }
    );
  });
});

ipcMain.handle('get-radio-states', async () => {
  return new Promise((resolve) => {
    const scriptPath = resolveScriptPath('win-radio.ps1');
    const readState = (kind) => new Promise((done) => {
      execFile(
        'powershell.exe',
        ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', 'Status', '-Kind', kind],
        { windowsHide: true, timeout: 9000 },
        (_err, stdout) => {
          try { done(JSON.parse((stdout || '').trim().split(/\r?\n/).pop())); }
          catch { done({ success: false, kind, error: 'Could not read radio state.' }); }
        }
      );
    });
    Promise.all([readState('Wifi'), readState('Bluetooth')]).then(([wifi, bluetooth]) => {
      resolve({
        wifiState: wifi.success ? wifi.state : null,
        bluetoothState: bluetooth.success ? bluetooth.state : null,
        error: wifi.error || bluetooth.error || null,
      });
    });
  });
});

ipcMain.handle('scan-wifi-networks', async () => {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolveScriptPath('win-wifi-scan.ps1'), '-Action', 'Scan'],
      { windowsHide: true, timeout: 12000 },
      (err, stdout) => {
        try {
          const result = JSON.parse((stdout || '').trim().split(/\r?\n/).pop());
          if (err && result.success) return resolve({ success: false, networks: [], error: err.message });
          if (result.error === 'WLAN_ACCESS_DENIED') {
            result.error = 'Windows bu uygulamanın Wi-Fi ağ taramasına erişmesine izin vermedi. WLAN hizmetini ve uygulama izinlerini kontrol edin.';
          } else if (result.error === 'WIFI_SCAN_FAILED') {
            result.error = 'Wi-Fi ağları taranamadı. Kablosuz ağ hizmetinin çalıştığını kontrol edip yeniden deneyin.';
          }
          resolve(result);
        } catch {
          resolve({ success: false, networks: [], error: err?.message || 'Wi-Fi ağ taraması başarısız oldu.' });
        }
      }
    );
  });
});

ipcMain.handle('scan-bluetooth-devices', async () => {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolveScriptPath('win-bluetooth.ps1'), '-Action', 'Scan'],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        try {
          const result = JSON.parse((stdout || '').trim().split(/\r?\n/).pop());
          if (err && result.success) return resolve({ success: false, devices: [], error: err.message });
          resolve(result);
        } catch {
          resolve({ success: false, devices: [], error: err?.message || 'Bluetooth cihaz taraması başarısız oldu.' });
        }
      }
    );
  });
});

ipcMain.handle('pair-bluetooth-device', async (_event, deviceId) => {
  if (typeof deviceId !== 'string' || !deviceId || deviceId.length > 2048) {
    return { success: false, error: 'Geçersiz Bluetooth cihazı.' };
  }
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolveScriptPath('win-bluetooth.ps1'), '-Action', 'Pair', '-DeviceId', deviceId],
      { windowsHide: true, timeout: 16000 },
      (err, stdout) => {
        try {
          const result = JSON.parse((stdout || '').trim().split(/\r?\n/).pop());
          if (err && result.success) return resolve({ success: false, error: err.message });
          resolve(result);
        } catch {
          resolve({ success: false, error: err?.message || 'Bluetooth eşleştirme başarısız oldu.' });
        }
      }
    );
  });
});

ipcMain.handle('get-network-info', async () => {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-WindowStyle',
        'Hidden',
        '-NoProfile',
        '-Command',
        '$ErrorActionPreference = "SilentlyContinue"; $wifiAdapter = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" -and ($_.NdisPhysicalMedium -eq 9 -or $_.InterfaceDescription -match "Wi-Fi|Wireless|802\.11") } | Select-Object -First 1; $wifiProfile = if ($wifiAdapter) { Get-NetConnectionProfile -InterfaceIndex $wifiAdapter.ifIndex | Select-Object -First 1 }; $ssid = ((netsh wlan show interfaces) | Select-String "^\\s*SSID\\s*:\\s*(.+)$" | Select-Object -First 1).Matches.Groups[1].Value.Trim(); $b = ((Get-Service bthserv).Status); @{ wifi = if ($wifiProfile) { $wifiProfile.Name } elseif ($ssid) { $ssid } else { "Bağlı değil" }; wifiConnected = [bool]($wifiAdapter -and $wifiProfile); bluetooth = if ($b -eq "Running") { "On" } else { "Off" } } | ConvertTo-Json -Compress',
      ],
      { windowsHide: true, timeout: 3000 },
      (_err, stdout) => {
        try {
          const res = JSON.parse(stdout.trim());
          resolve(res);
        } catch {
          resolve({ wifi: 'Bağlı değil', wifiConnected: false, bluetooth: 'On' });
        }
      }
    );
  });
});

ipcMain.handle('add-agenda-event', async (_event, evt) => {
  if (!evt || !String(evt.title || '').trim()) return getLocalAgendaEvents();
  const now = new Date();
  const defaultTime = new Date(now.getTime() + 15 * 60 * 1000).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const newEvt = {
    id: evt.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(evt.title).trim(),
    time: evt.time || defaultTime,
    date: evt.date || 'Bugün',
    notified: false,
    completed: Boolean(evt.completed),
  };
  localAgendaEvents = [...getLocalAgendaEvents(), newEvt];
  saveLocalAgendaEvents();
  publishLocalAgendaEvents();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('windows-notification', {
      id: 'notif_agenda_' + newEvt.id,
      app: 'Takvim',
      appId: 'twocode.calendar',
      logo: '',
      title: 'Takvime eklendi: ' + newEvt.title,
      body: `Etkinlik planlandı (${newEvt.date} · ${newEvt.time})`,
    });
  }
  return localAgendaEvents;
});

ipcMain.handle('get-agenda-events', () => getLocalAgendaEvents());

ipcMain.handle('delete-agenda-event', async (_event, eventId) => {
  if (eventId === undefined || eventId === null) return getLocalAgendaEvents();
  localAgendaEvents = getLocalAgendaEvents().filter((evt) => String(evt?.id) !== String(eventId));
  agendaNotifiedIds.delete(String(eventId));
  saveLocalAgendaEvents();
  publishLocalAgendaEvents();
  return localAgendaEvents;
});

ipcMain.handle('toggle-agenda-event', async (_event, eventId) => {
  if (eventId === undefined || eventId === null) return getLocalAgendaEvents();
  localAgendaEvents = getLocalAgendaEvents().map((evt) =>
    String(evt?.id) === String(eventId) ? { ...evt, completed: !evt?.completed } : evt
  );
  saveLocalAgendaEvents();
  publishLocalAgendaEvents();
  return localAgendaEvents;
});

// Google Mail state is polled through the authenticated session without a hidden renderer.
let agendaNotifiedIds = new Set();
let gmailPollTimer = null;
let gmailPollInFlight = false;
let gmailFeedInitialized = false;
const knownGmailMessageIds = new Set();

function decodeAtomText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([\da-f]{1,6});/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAtomTag(source, tag) {
  const match = String(source || '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeAtomText(match[1]) : '';
}

function publishGmailData() {
  saveGoogleSessionToDisk(localGoogleState);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google-data-update', { ...localGoogleState });
  }
}

async function pollGmailAtomFeed() {
  if (gmailPollInFlight || !localGoogleState?.connected) return;
  gmailPollInFlight = true;
  try {
    const authSession = session.fromPartition('persist:google_account_session');
    const response = await authSession.fetch('https://mail.google.com/mail/feed/atom', {
      credentials: 'include',
      headers: { Accept: 'application/atom+xml, application/xml, text/xml' },
    });
    if (!response.ok || /accounts\.google\.com/i.test(response.url || '')) return;
    const xml = await response.text();
    if (!/<feed\b/i.test(xml)) return;

    const fullCount = Number(readAtomTag(xml, 'fullcount')) || 0;
    const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => {
      const entry = match[1];
      const author = entry.match(/<author\b[^>]*>([\s\S]*?)<\/author>/i)?.[1] || '';
      return {
        id: readAtomTag(entry, 'id'),
        sender: readAtomTag(author, 'name') || readAtomTag(author, 'email') || 'Google Mail',
        subject: readAtomTag(entry, 'title') || 'Yeni e-posta',
        snippet: readAtomTag(entry, 'summary'),
        time: readAtomTag(entry, 'issued') || readAtomTag(entry, 'modified'),
      };
    }).filter((mail) => mail.id);

    const previousCounts = localGoogleState.mailCounts || {};
    localGoogleState.mailCounts = {
      primary: fullCount,
      updates: Number(previousCounts.updates) || 0,
      promotions: Number(previousCounts.promotions) || 0,
      unreadTotal: fullCount,
    };
    localGoogleState.latestMails = entries.slice(0, 10).map((mail) => ({
      id: mail.id,
      from: mail.sender,
      subject: mail.subject,
      snippet: mail.snippet,
      time: mail.time ? new Date(mail.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Şimdi',
    }));

    if (gmailFeedInitialized) {
      for (const mail of entries) {
        if (knownGmailMessageIds.has(mail.id)) continue;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('windows-notification', {
            id: `notif_mail_${Date.now()}`,
            app: 'Gmail',
            appId: 'com.google.gmail',
            sender: mail.sender,
            notificationKind: 'message',
            targetUrl: 'https://mail.google.com/',
            title: `${mail.sender} (Gmail)`,
            body: mail.subject + (mail.snippet ? ` — ${mail.snippet}` : ''),
          });
        }
      }
    }

    entries.forEach((mail) => knownGmailMessageIds.add(mail.id));
    while (knownGmailMessageIds.size > 300) knownGmailMessageIds.delete(knownGmailMessageIds.values().next().value);
    gmailFeedInitialized = true;
    publishGmailData();
  } catch (error) {
    console.warn('[Gmail] Hafif posta kontrolü başarısız:', error?.message || error);
  } finally {
    gmailPollInFlight = false;
  }
}

function startGoogleBackgroundWorker() {
  // Mail is paused for now; keep its polling logic here for later reactivation.
  // if (!localGoogleState?.connected || gmailPollTimer) return;
  // pollGmailAtomFeed();
  // gmailPollTimer = setInterval(pollGmailAtomFeed, 15000);
}
function startGoogleMailAndAgendaWatcher() {
  // Mail polling triggers are paused; calendar reminders below still run.
  // setTimeout(() => {
  //   if (localGoogleState && localGoogleState.connected) {
  //     startGoogleBackgroundWorker();
  //   }
  // }, 1000);

  setInterval(() => {
    // Local calendar reminders run independently from any Google account.
    try {
      const now = new Date();
      const currentHHMM = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      for (const evt of getLocalAgendaEvents()) {
        if (!evt || agendaNotifiedIds.has(String(evt.id))) continue;
        if (evt.date && evt.date !== 'Bugün' && evt.date !== today) continue;
        if (evt.time) {
          const [h, m] = evt.time.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            const evtMinutes = h * 60 + m;
            if (Math.abs(currentMinutes - evtMinutes) <= 1 || currentHHMM === evt.time) {
              agendaNotifiedIds.add(String(evt.id));
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('windows-notification', {
                  id: 'notif_cal_due_' + evt.id,
                  app: 'Takvim',
                  appId: 'twocode.calendar',
                  logo: '',
                  title: 'Etkinlik zamanı',
                  body: `${evt.title} · ${evt.time}`,
                });
              }
            }
          }
        }
      }
    } catch (e) {}

    // Mail polling is paused; calendar reminders are checked above.
  }, 30000);
}

ipcMain.handle('test-mail-notif', async () => {
  localGoogleState.mailCounts.unreadTotal = (localGoogleState.mailCounts.unreadTotal || 0) + 1;
  localGoogleState.mailCounts.primary = (localGoogleState.mailCounts.primary || 0) + 1;
  const newMail = {
    id: 'm_' + Date.now(),
    from: 'Google Güvenlik Ekibi',
    subject: 'Yeni e-posta alındı: İki faktörlü güvenlik ve hesap özeti.',
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  };
  localGoogleState.latestMails = [newMail, ...(localGoogleState.latestMails || [])].slice(0, 10);
  saveGoogleSessionToDisk(localGoogleState);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google-data-update', localGoogleState);
    mainWindow.webContents.send('windows-notification', {
      id: 'notif_mail_' + Date.now(),
      app: 'Gmail',
      appId: 'com.google.gmail',
      logo: '',
      title: 'Google Mail (' + (localGoogleState.account || 'Gelen Kutusu') + ')',
      body: newMail.subject,
    });
  }
  return true;
});

ipcMain.handle('test-agenda-notif', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('windows-notification', {
      id: 'notif_agenda_' + Date.now(),
      app: 'Takvim',
      appId: 'twocode.calendar',
      logo: '',
      title: 'Ajanda Hatırlatıcısı',
      body: '15 dakika sonra: Haftalık Ekip Senkronizasyonu (14:30)',
    });
  }
  return true;
});

async function extractNativePathIconDataUri(rawPath) {
  try {
    if (!rawPath || !fs.existsSync(rawPath)) return null;
    let iconSourcePath = rawPath;
    if (/\.lnk$/i.test(rawPath)) {
      let resolvedTarget = '';
      try {
        const sl = shell.readShortcutLink(rawPath);
        const cleanIconPath = String(sl?.icon || '')
          .trim()
          .replace(/,\s*-?\d+\s*$/, '')
          .replace(/^"(.*)"$/, '$1');
        const cleanTargetPath = String(sl?.target || '')
          .trim()
          .replace(/^"(.*)"$/, '$1');
        if (cleanIconPath && fs.existsSync(cleanIconPath) && !/\.(lnk|url)$/i.test(cleanIconPath)) {
          resolvedTarget = cleanIconPath;
        } else if (cleanTargetPath && fs.existsSync(cleanTargetPath) && !/\.(lnk|url)$/i.test(cleanTargetPath)) {
          resolvedTarget = cleanTargetPath;
        }
      } catch {}
      // Never call app.getFileIcon directly on .lnk — Windows Shell returns a generic blank sheet icon
      if (!resolvedTarget) return null;
      iconSourcePath = resolvedTarget;
    }

    if (/\.(ico|png|jpe?g|webp|bmp)$/i.test(iconSourcePath)) {
      try {
        const directImg = nativeImage.createFromPath(iconSourcePath);
        if (directImg && !directImg.isEmpty()) {
          return directImg.toDataURL();
        }
      } catch {}
    }

    const icon = await app.getFileIcon(iconSourcePath, { size: 'normal' });
    if (!icon || icon.isEmpty()) return null;
    return icon.toDataURL();
  } catch {
    return null;
  }
}

ipcMain.handle('get-file-icon', async (_event, filePath) => {
  return await extractNativePathIconDataUri(filePath);
});

const appLogoCache = new Map();
const appLogoInFlight = new Map();
let startMenuLnkCache = null;

const APP_ICON_ALIASES = {
  'visual studio code': ['code', 'visual studio code'],
  vscode: ['code', 'visual studio code'],
  'google chrome': ['chrome', 'google chrome'],
  'microsoft edge': ['msedge', 'microsoft edge'],
  'telegram desktop': ['telegram', 'telegram desktop'],
  'g-helper': ['ghelper', 'g-helper'],
  ghelper: ['ghelper', 'g-helper'],
  'nvidia app': ['nvidia app', 'nvidia overlay', 'nvcontainer'],
  nvidia: ['nvidia app', 'nvidia overlay', 'nvcontainer'],
  'windows security': ['securityhealthsystray'],
  'windows defender': ['securityhealthsystray'],
  'dosya yöneticisi': ['explorer'],
  'file explorer': ['explorer'],
  'windows powershell': ['powershell', 'windows powershell'],
  powershell: ['powershell', 'pwsh'],
};

function getStartMenuShortcuts() {
  if (Array.isArray(startMenuLnkCache)) return startMenuLnkCache;
  const results = [];
  const roots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
  ].filter(Boolean);

  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
        let appIdLower = '';
        let toastActivatorClsid = '';
        try {
          const sl = shell.readShortcutLink(fullPath);
          appIdLower = String(sl?.appUserModelId || '').trim().toLowerCase();
          toastActivatorClsid = String(sl?.toastActivatorClsid || '').trim();
        } catch {}
        results.push({
          nameLower: entry.name.replace(/\.lnk$/i, '').toLowerCase(),
          appIdLower,
          toastActivatorClsid,
          path: fullPath,
        });
      }
    }
  };

  for (const root of roots) walk(root, 0);
  startMenuLnkCache = results;
  return results;
}

function buildAppLogoCandidates(appName, appId) {
  const genericNames = new Set(['windows', 'notification', 'bildirim', 'sistem', 'system', 'app', 'unknown']);
  const candidates = [];
  const push = (val) => {
    const clean = String(val || '').trim();
    if (!clean || clean.length < 2) return;
    if (!candidates.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      candidates.push(clean);
    }
  };

  if (appId && !/^twocode\./i.test(appId) && !/^com\.google\.gmail$/i.test(appId)) {
    const idTail = appId.replace(/\.exe$/i, '').split(/[!\\/.]/).pop();
    if (idTail && idTail.toLowerCase() !== 'app') push(idTail);
    const idClean = appId.replace(/^electron\.app\./i, '');
    if (idClean && !idClean.includes('!')) push(idClean);
  }

  const lowerName = String(appName || '').trim().toLowerCase();
  if (appName && !genericNames.has(lowerName)) {
    push(appName);
    push(appName.replace(/\s+/g, ''));
    const aliases = APP_ICON_ALIASES[lowerName];
    if (Array.isArray(aliases)) {
      aliases.forEach(push);
    }
  }
  return candidates;
}

function resolveAppLogoViaPowerShell(appName, appId, candidates) {
  return new Promise((resolve) => {
    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$appName = [string]$env:TWOCODE_APP_NAME
$appId = [string]$env:TWOCODE_APP_ID
$cands = @(([string]$env:TWOCODE_APP_CANDIDATES) -split '\\|' | Where-Object { $_ -and $_.Length -ge 2 })

$procs = Get-Process
foreach ($cand in $cands) {
  $low = $cand.ToLowerInvariant()
  $m = $procs | Where-Object {
    $_.Path -and (
      $_.ProcessName.ToLowerInvariant() -eq $low -or
      ($low.Length -ge 4 -and $_.ProcessName.ToLowerInvariant().Contains($low)) -or
      ($_.MainWindowTitle -and $low.Length -ge 4 -and $_.MainWindowTitle.ToLowerInvariant().Contains($low))
    )
  } | Select-Object -First 1
  if ($null -ne $m -and $m.Path -and (Test-Path -LiteralPath $m.Path)) {
    Write-Output ('PATH:' + $m.Path)
    exit 0
  }
}

$pfn = ''
if ($appId -match '^([^!]+)!') {
  $pfn = $Matches[1]
}
if (-not $pfn -and $cands.Count -gt 0) {
  $startApps = Get-StartApps
  foreach ($cand in $cands) {
    $low = $cand.ToLowerInvariant()
    $sa = $startApps | Where-Object {
      ($_.AppID -and $_.AppID.ToLowerInvariant() -eq $appId.ToLowerInvariant()) -or
      ($_.Name -and $_.Name.ToLowerInvariant() -eq $low) -or
      ($_.Name -and $low.Length -ge 4 -and $_.Name.ToLowerInvariant().Contains($low))
    } | Select-Object -First 1
    if ($null -ne $sa -and $sa.AppID) {
      if ($sa.AppID -match '^[A-Za-z]:\\\\' -and (Test-Path -LiteralPath $sa.AppID)) {
        Write-Output ('PATH:' + $sa.AppID)
        exit 0
      }
      if ($sa.AppID -match '^([^!]+)!') {
        $pfn = $Matches[1]
        break
      }
    }
  }
}

if ($pfn) {
  $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $pfn } | Select-Object -First 1
  if ($null -ne $pkg -and $pkg.InstallLocation) {
    $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
    if (Test-Path -LiteralPath $manifestPath) {
      [xml]$xml = Get-Content -LiteralPath $manifestPath -Raw
      $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
      $ns.AddNamespace('m', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
      $ns.AddNamespace('uap', 'http://schemas.microsoft.com/appx/manifest/uap/windows10')
      $vis = $xml.SelectSingleNode('//uap:VisualElements', $ns)
      $logoRel = ''
      if ($null -ne $vis) {
        $logoRel = $vis.GetAttribute('Square44x44Logo')
        if (-not $logoRel) { $logoRel = $vis.GetAttribute('Square150x150Logo') }
      }
      if (-not $logoRel) {
        $logoNode = $xml.SelectSingleNode('//m:Properties/m:Logo', $ns)
        if ($null -ne $logoNode) { $logoRel = $logoNode.InnerText }
      }
      if ($logoRel) {
        $full = Join-Path $pkg.InstallLocation $logoRel
        $dir = Split-Path $full -Parent
        $base = [System.IO.Path]::GetFileNameWithoutExtension($full)
        $ext = [System.IO.Path]::GetExtension($full)
        $files = @(Get-ChildItem -LiteralPath $dir -Filter "$base*$ext" | Where-Object { $_.Name -notmatch 'contrast-' })
        $pick = $files | Where-Object { $_.Name -match 'scale-200|targetsize-48' } | Select-Object -First 1
        if ($null -eq $pick) { $pick = $files | Where-Object { $_.Name -match 'scale-150|scale-100|targetsize-32' } | Select-Object -First 1 }
        if ($null -eq $pick) { $pick = $files | Select-Object -First 1 }
        if ($null -ne $pick -and (Test-Path -LiteralPath $pick.FullName)) {
          $bytes = [System.IO.File]::ReadAllBytes($pick.FullName)
          if ($bytes.Length -gt 0 -and $bytes.Length -le 524288) {
            $mime = if ($ext -ieq '.jpg' -or $ext -ieq '.jpeg') { 'image/jpeg' } else { 'image/png' }
            Write-Output ("DATA:data:$mime;base64," + [Convert]::ToBase64String($bytes))
            exit 0
          }
        }
      }
    }
  }
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        timeout: 5500,
        windowsHide: true,
        env: {
          ...process.env,
          TWOCODE_APP_NAME: appName,
          TWOCODE_APP_ID: appId,
          TWOCODE_APP_CANDIDATES: candidates.join('|'),
        },
      },
      async (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = String(stdout).split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('PATH:') || l.startsWith('DATA:'));
        if (!line) return resolve(null);
        if (line.startsWith('DATA:')) return resolve(line.slice(5));
        if (line.startsWith('PATH:')) {
          const exePath = line.slice(5);
          try {
            if (exePath && fs.existsSync(exePath)) {
              const icon = await app.getFileIcon(exePath, { size: 'normal' });
              return resolve(icon ? icon.toDataURL() : null);
            }
          } catch {}
        }
        resolve(null);
      }
    );
  });
}

function resolveKnownFolderAppIdPath(appId) {
  const raw = String(appId || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z]:[/\\]/.test(raw)) return raw;
  const match = raw.match(/^(\{[0-9a-fA-F-]{36}\})[/\\](.+)$/);
  if (!match) return '';
  const guid = match[1].toUpperCase();
  const rel = match[2];
  const winDir = process.env.SystemRoot || 'C:\\Windows';
  const knownFolders = {
    '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': path.join(winDir, 'System32'),
    '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}': path.join(winDir, 'SysWOW64'),
    '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': winDir,
    '{6D809377-6AF0-444B-8957-A3773F02200E}': process.env.ProgramFiles || 'C:\\Program Files',
    '{905E63B6-C1BF-494E-B29C-65B732D3D21A}': process.env.ProgramFiles || 'C:\\Program Files',
    '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  };
  const base = knownFolders[guid];
  return base ? path.join(base, rel) : '';
}

ipcMain.handle('resolve-app-logo', async (_event, payload) => {
  try {
    const appName = String(payload?.app || '').trim();
    const appId = String(payload?.appId || '').trim();
    const cacheKey = `${appId}|${appName}`.toLowerCase();
    if (!cacheKey || cacheKey === '|') return null;

    const cached = appLogoCache.get(cacheKey);
    if (cached) {
      if (cached.dataUri) return cached.dataUri;
      if (Date.now() - cached.ts < 5 * 60 * 1000) return null;
    }

    if (appLogoInFlight.has(cacheKey)) {
      return await appLogoInFlight.get(cacheKey);
    }

    const promise = (async () => {
      const directExePath = resolveKnownFolderAppIdPath(appId);
      if (directExePath && fs.existsSync(directExePath)) {
        const dataUri = await extractNativePathIconDataUri(directExePath);
        if (dataUri) {
          appLogoCache.set(cacheKey, { dataUri, ts: Date.now() });
          return dataUri;
        }
      }

      const candidates = buildAppLogoCandidates(appName, appId);
      const lowerAppId = appId.toLowerCase();

      // 1. Fast Start Menu .lnk lookup (exact AppUserModelId first, then shortcut name)
      const shortcuts = getStartMenuShortcuts();
      let lnkMatch = lowerAppId
        ? shortcuts.find((s) => s.appIdLower && s.appIdLower === lowerAppId)
        : null;
      if (!lnkMatch) {
        for (const cand of candidates) {
          const low = cand.toLowerCase();
          lnkMatch = shortcuts.find((s) => s.nameLower === low);
          if (lnkMatch) break;
        }
      }
      if (!lnkMatch) {
        for (const cand of candidates) {
          const low = cand.toLowerCase();
          if (low.length < 4) continue;
          lnkMatch = shortcuts.find((s) => s.nameLower.includes(low) || low.includes(s.nameLower));
          if (lnkMatch) break;
        }
      }
      if (lnkMatch) {
        const dataUri = await extractNativePathIconDataUri(lnkMatch.path);
        if (dataUri) {
          appLogoCache.set(cacheKey, { dataUri, ts: Date.now() });
          return dataUri;
        }
      }

      if (candidates.length === 0) {
        appLogoCache.set(cacheKey, { dataUri: null, ts: Date.now() });
        return null;
      }

      // 2. Running process / UWP AppxManifest fallback
      const psResult = await resolveAppLogoViaPowerShell(appName, appId, candidates);
      appLogoCache.set(cacheKey, { dataUri: psResult || null, ts: Date.now() });
      return psResult || null;
    })();

    appLogoInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      appLogoInFlight.delete(cacheKey);
    }
  } catch {
    return null;
  }
});

function getGoogleSessionFilePath() {
  return path.join(app.getPath('userData'), 'google_session.json');
}

function loadSavedGoogleSession() {
  try {
    const sPath = getGoogleSessionFilePath();
    if (fs.existsSync(sPath)) {
      const data = JSON.parse(fs.readFileSync(sPath, 'utf8'));
      if (data && data.account) {
        localGoogleState.connected = true;
        localGoogleState.account = data.account;
        localGoogleState.lastUpdated = data.lastUpdated || Date.now();
        if (data.mailCounts) {
          localGoogleState.mailCounts = { ...localGoogleState.mailCounts, ...data.mailCounts };
        }
        if (Array.isArray(data.agenda)) {
          localGoogleState.agenda = data.agenda;
        }
        if (Array.isArray(data.latestMails)) {
          localGoogleState.latestMails = data.latestMails;
        }
        userSettings.googleConnected = true;
        userSettings.googleEmail = data.account;
        setTimeout(() => {
          startGoogleBackgroundWorker();
        }, 800);
      }
    }
  } catch {}
}

function completeGoogleConnection(email) {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) return localGoogleState;

  localGoogleState.connected = true;
  localGoogleState.account = cleanEmail;
  localGoogleState.lastUpdated = Date.now();
  userSettings.googleConnected = true;
  userSettings.googleEmail = cleanEmail;
  saveUserSettings();

  try {
    fs.writeFileSync(
      getGoogleSessionFilePath(),
      JSON.stringify(
        {
          account: cleanEmail,
          agenda: localGoogleState.agenda,
          mailCounts: localGoogleState.mailCounts,
          lastUpdated: Date.now(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}

  // Trigger background live Gmail & Calendar worker
  setTimeout(() => {
    startGoogleBackgroundWorker();
  }, 300);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google-data-update', localGoogleState);
    mainWindow.webContents.send('settings-updated', userSettings);
    mainWindow.webContents.send('windows-notification', {
      id: 'notif_g_' + Date.now(),
      app: 'Google',
      title: localGoogleState.account,
      body: 'Google hesabı başarıyla bağlandı. Mail ve Ajanda senkronize edildi.',
    });
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('google-data-update', localGoogleState);
    settingsWindow.webContents.send('settings-updated', userSettings);
  }
  return localGoogleState;
}

let googleAuthWindow = null;

ipcMain.handle('get-google-data', async () => {
  return localGoogleState;
});

ipcMain.handle('connect-google', async (_event, opts) => {
  const expectedEmail = (opts?.email || '').trim().toLowerCase();
  if (expectedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail)) {
    return { connected: false, message: 'INVALID_EMAIL' };
  }

  return new Promise((resolve) => {
    if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
      googleAuthWindow.focus();
      return resolve({ connected: false, message: 'ALREADY_OPEN' });
    }

    const FIREFOX_UA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

    const authSession = session.fromPartition('persist:google_account_session');
    authSession.setUserAgent(FIREFOX_UA);

    // Strip Chromium client hints so Google sees standard Firefox without embedded Chromium checks
    try {
      authSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const reqHeaders = { ...details.requestHeaders };
        delete reqHeaders['sec-ch-ua'];
        delete reqHeaders['sec-ch-ua-mobile'];
        delete reqHeaders['sec-ch-ua-platform'];
        delete reqHeaders['sec-ch-ua-model'];
        delete reqHeaders['sec-ch-ua-platform-version'];
        delete reqHeaders['sec-ch-ua-full-version'];
        delete reqHeaders['sec-ch-ua-full-version-list'];
        reqHeaders['User-Agent'] = FIREFOX_UA;
        callback({ cancel: false, requestHeaders: reqHeaders });
      });
    } catch (e) {}

    googleAuthWindow = new BrowserWindow({
      width: 520,
      height: 680,
      title: 'Google ile Giriş Yap - Bedo',
      parent: settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:google_account_session',
      },
    });

    googleAuthWindow.webContents.setUserAgent(FIREFOX_UA);

    googleAuthWindow.webContents.setWindowOpenHandler(({ url }) => {
      googleAuthWindow.loadURL(url);
      return { action: 'deny' };
    });

    const googleLoginUrl =
      'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/u/0/' +
      (expectedEmail ? `&login_hint=${encodeURIComponent(expectedEmail)}` : '');
    googleAuthWindow.loadURL(googleLoginUrl, { userAgent: FIREFOX_UA });

    let isResolved = false;

    const tryExtractAccountAndComplete = async () => {
      if (isResolved || !googleAuthWindow || googleAuthWindow.isDestroyed()) return;
      try {
        const currentUrl = googleAuthWindow.webContents.getURL() || '';
        if (
          !currentUrl.includes('/ServiceLogin') &&
          !currentUrl.includes('/identifier') &&
          !currentUrl.includes('/challenge')
        ) {
          // If on myaccount, redirect to mail to establish gmail cookies
          if (currentUrl.includes('myaccount.google.com')) {
            googleAuthWindow.loadURL('https://mail.google.com/mail/u/0/');
            return;
          }

          const detectedEmail = await googleAuthWindow.webContents.executeJavaScript(`
            (() => {
              try {
                if (location.hostname !== 'mail.google.com') return null;
                const labels = Array.from(document.querySelectorAll('[aria-label]'))
                  .map((el) => el.getAttribute('aria-label') || '')
                  .filter((label) => /google account|google hesab/i.test(label));
                for (const label of labels) {
                  const m = label.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
                  if (m) return m[0];
                }
              } catch (e) {}
              return null;
            })()
          `);

          if (
            detectedEmail &&
            currentUrl.includes('mail.google.com') &&
            (!expectedEmail || detectedEmail.toLowerCase() === expectedEmail)
          ) {
            isResolved = true;
            const res = completeGoogleConnection(detectedEmail);
            setTimeout(() => {
              if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
                googleAuthWindow.close();
              }
            }, 800);
            return resolve(res);
          } else if (detectedEmail && !currentUrl.includes('mail.google.com')) {
            googleAuthWindow.loadURL('https://mail.google.com/mail/u/0/');
          }
        }
      } catch (err) {}
    };

    const pollInterval = setInterval(tryExtractAccountAndComplete, 500);

    googleAuthWindow.webContents.on('did-finish-load', () => {
      tryExtractAccountAndComplete();
    });

    googleAuthWindow.webContents.on('did-navigate', tryExtractAccountAndComplete);
    googleAuthWindow.webContents.on('did-navigate-in-page', tryExtractAccountAndComplete);

    googleAuthWindow.on('closed', () => {
      clearInterval(pollInterval);
      googleAuthWindow = null;
      if (!isResolved) {
        resolve(localGoogleState);
      }
    });
  });
});

ipcMain.handle('disconnect-google', async () => {
  localGoogleState.connected = false;
  localGoogleState.account = '';
  localGoogleState.lastUpdated = Date.now();
  userSettings.googleConnected = false;
  userSettings.googleEmail = '';
  saveUserSettings();

  try {
    const sPath = getGoogleSessionFilePath();
    if (fs.existsSync(sPath)) fs.unlinkSync(sPath);
  } catch {}

  if (gmailPollTimer) {
    clearInterval(gmailPollTimer);
    gmailPollTimer = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google-data-update', localGoogleState);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('google-data-update', localGoogleState);
  }
  return localGoogleState;
});

// Translation helper via MyMemory free API
function translateTextMyMemory(text, from = 'tr', to = 'en') {
  return new Promise((resolve) => {
    if (!text || !text.trim()) return resolve('');
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${from}|${to}`;
    https
      .get(url, { timeout: 5000 }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(b);
            if (j?.responseData?.translatedText) {
              return resolve(j.responseData.translatedText);
            }
          } catch {}
          resolve('');
        });
      })
      .on('error', () => resolve(''));
  });
}

// Google Gemini API query
function httpsPostJson(urlStr, headers, bodyStr, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        family: 4,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, statusText: res.statusMessage || '', body: data }));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGetJsonIpv4(urlStr, headers = {}, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        family: 4,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const status = res.statusCode || 0;
          try {
            resolve({ ok: status >= 200 && status < 300, status, json: JSON.parse(data) });
          } catch {
            resolve({ ok: false, status, json: null });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

function httpsStreamSseIpv4(urlStr, headers, bodyStr, onEventJson, firstByteTimeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    let settled = false;
    let idleTimer = null;
    const armTimer = (ms) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          req.destroy(new Error('TIMEOUT'));
          reject(new Error('TIMEOUT'));
        }
      }, ms);
    };

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        family: 4,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        res.setEncoding('utf8');

        if (status < 200 || status >= 300) {
          let errRaw = '';
          res.on('data', (chunk) => {
            armTimer(8000);
            errRaw += chunk;
          });
          res.on('end', () => {
            if (idleTimer) clearTimeout(idleTimer);
            if (settled) return;
            settled = true;
            let errJson = {};
            try { errJson = JSON.parse(errRaw); } catch {}
            resolve({ ok: false, status, errJson, errRaw });
          });
          return;
        }

        let buffer = '';
        armTimer(20000);
        res.on('data', (chunk) => {
          armTimer(20000);
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              onEventJson(JSON.parse(raw));
            } catch {}
          }
        });
        res.on('end', () => {
          if (idleTimer) clearTimeout(idleTimer);
          if (settled) return;
          settled = true;
          const tail = buffer.trim();
          if (tail.startsWith('data:')) {
            const raw = tail.slice(5).trim();
            if (raw && raw !== '[DONE]') {
              try { onEventJson(JSON.parse(raw)); } catch {}
            }
          }
          resolve({ ok: true, status });
        });
        res.on('error', (err) => {
          if (idleTimer) clearTimeout(idleTimer);
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
      }
    );

    armTimer(firstByteTimeoutMs);
    req.on('error', (err) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    req.write(bodyStr);
    req.end();
  });
}

const _discoveredModelCache = new Map();
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;

function _parseVersionTuple(modelId) {
  const stripped = String(modelId || '').replace(/[-_]?20\d{2}(?:[-_]?\d{2}){1,2}\b/g, '');
  const matches = stripped.match(/\d+/g);
  return matches ? matches.slice(0, 3).map((n) => Number(n)) : [0];
}

function _compareVersionTuples(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const da = a[i] || 0;
    const db = b[i] || 0;
    if (da !== db) return db - da;
  }
  return 0;
}

const _modelCooldownUntil = new Map();

async function resolveGeminiModels(apiKey) {
  const cacheKey = `gemini:${String(apiKey || '').slice(-8)}`;
  const cached = _discoveredModelCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL_MS) return cached.models;

  // Primary Gemini 4 + Gemini 3 models that support "Gemini 3 and newer" Search Grounding and have Free + Paid tier quota
  const priorityChain = [
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];

  try {
    const allModels = [];
    let pageToken = '';
    for (let page = 0; page < 4; page += 1) {
      const qs = `pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await httpsGetJsonIpv4(
        `https://generativelanguage.googleapis.com/v1beta/models?${qs}`,
        { 'x-goog-api-key': apiKey },
        4000
      );
      if (!res.ok || !res.json) break;
      if (Array.isArray(res.json.models)) allModels.push(...res.json.models);
      pageToken = res.json.nextPageToken || '';
      if (!pageToken) break;
    }

    if (allModels.length > 0) {
      const excluded = [
        'embedding', 'imagen', 'veo', 'tts', 'audio', 'robotics', 'aqa', 'live',
        'learnlm', 'gemma', 'thinking', 'pro', 'ultra', 'carbon', 'argon',
        'image', 'computer', 'native', 'dialog', 'transcribe', 'translate', 'banana', 'lyria', 'omni',
      ];
      const discovered = [];
      for (const m of allModels) {
        const methods = m?.supportedGenerationMethods || [];
        if (methods.length && !methods.some((x) => String(x).toLowerCase().includes('generatecontent'))) continue;
        const id = String(m?.name || '').replace(/^models\//, '').trim();
        const low = id.toLowerCase();
        if (!low.startsWith('gemini-') || excluded.some((bad) => low.includes(bad))) continue;
        if (low.includes('exp')) continue;
        const ver = _parseVersionTuple(low);
        // Prefer Gemini 4 Hydrogen & Gemini 3.x Flash/Lite (which have active quota + Gemini 3+ Search Grounding)
        if ((ver[0] || 0) < 3) continue;
        const tier = low.includes('hydrogen')
          ? 6
          : low.includes('flash') && !low.includes('lite')
            ? 5
            : low.includes('flash-lite')
              ? 4
              : low.includes('neon')
                ? 3
                : 2;
        discovered.push({ id, ver, tier });
      }
      discovered.sort((x, y) => _compareVersionTuples(x.ver, y.ver) || y.tier - x.tier);
      const ranked = [
        ...new Set([
          ...priorityChain,
          ...discovered.slice(0, 4).map((c) => c.id),
        ]),
      ];
      _discoveredModelCache.set(cacheKey, { ts: Date.now(), models: ranked });
      return ranked;
    }
  } catch {}
  return priorityChain;
}

async function resolveClaudeModels(apiKey) {
  const cacheKey = `claude:${String(apiKey || '').slice(-8)}`;
  const cached = _discoveredModelCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL_MS) return cached.models;

  const fallback = ['claude-fable-5-2', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
  try {
    const res = await httpsGetJsonIpv4(
      'https://api.anthropic.com/v1/models?limit=50',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      4000
    );
    if (res.ok && res.json) {
      const candidates = [];
      for (const m of res.json?.data || []) {
        const id = String(m?.id || '').trim();
        const low = id.toLowerCase();
        if (!low.startsWith('claude-')) continue;
        const ver = _parseVersionTuple(low);
        const tier = low.includes('fable') ? 5 : low.includes('opus') ? 4 : low.includes('sonnet') ? 3 : low.includes('haiku') ? 2 : 1;
        candidates.push({ id, ver, tier });
      }
      candidates.sort((x, y) => _compareVersionTuples(x.ver, y.ver) || y.tier - x.tier);
      const ranked = [...new Set(candidates.slice(0, 4).map((c) => c.id))];
      if (ranked.length > 0) {
        _discoveredModelCache.set(cacheKey, { ts: Date.now(), models: ranked });
        return ranked;
      }
    }
  } catch {}
  return fallback;
}

async function resolveOpenAiModels(apiKey) {
  const cacheKey = `openai:${String(apiKey || '').slice(-8)}`;
  const cached = _discoveredModelCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL_MS) return cached.models;

  const fallback = ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6-astra', 'gpt-6-sol'];
  try {
    const res = await httpsGetJsonIpv4(
      'https://api.openai.com/v1/models',
      { Authorization: `Bearer ${apiKey}` },
      4000
    );
    if (res.ok && res.json) {
      const excluded = ['audio', 'realtime', 'transcribe', 'tts', 'image', 'embedding', 'whisper', 'dall-e', 'moderation'];
      const candidates = [];
      for (const m of res.json?.data || []) {
        const id = String(m?.id || '').trim();
        const low = id.toLowerCase();
        if (!low.startsWith('gpt-') || excluded.some((bad) => low.includes(bad))) continue;
        const ver = _parseVersionTuple(low);
        const tier = low.includes('astra') ? 5 : low.includes('sol') ? 4 : low.includes('pro') ? 3 : 2;
        candidates.push({ id, ver, tier });
      }
      candidates.sort((x, y) => _compareVersionTuples(x.ver, y.ver) || y.tier - x.tier);
      const ranked = [...new Set(candidates.slice(0, 4).map((c) => c.id))];
      if (ranked.length > 0) {
        _discoveredModelCache.set(cacheKey, { ts: Date.now(), models: ranked });
        return ranked;
      }
    }
  } catch {}
  return fallback;
}

const _lastWorkingModel = { gemini: '', claude: '', openai: '' };

function _extractEffectiveSearchQuery(question, historyTurns = []) {
  const latest = String(question || '').trim();
  if (latest.length < 28 && Array.isArray(historyTurns) && historyTurns.length > 0) {
    const prevSubstantive = [...historyTurns]
      .reverse()
      .find((t) => String(t.userText || '').trim().length >= 8);
    if (prevSubstantive) {
      return `${prevSubstantive.userText} ${latest}`.trim();
    }
  }
  return latest;
}

function _shouldRetrieveWebContext(question, historyTurns = []) {
  const effective = _extractEffectiveSearchQuery(question, historyTurns).toLowerCase();
  if (effective.length < 4) return false;
  // Skip pure greetings, short acknowledgements, or code snippets
  if (/^(merhaba|selam|slm|naber|nasılsın|teşekkürler|sağol|tamam|evet|hayır|hi|hello|thanks)\b[!?.]*$/i.test(effective)) {
    return false;
  }
  if (/```|function\s+\w+|const\s+\w+\s*=|import\s+.+from\s+|def\s+\w+\(/.test(effective)) {
    return false;
  }
  // Trigger for factual, real-time, version, price, weather, sports, entity, or question queries
  return /(son\b|en yeni|güncel|çıkan|sürüm|model|versiyon|fiyat|kur\b|dolar|euro|sterlin|altın|bitcoin|btc|eth|kripto|bist|hisse|asgari|enflasyon|hava\b|derece|yağmur|maç|skor|puan|haber|bugün|dün|bu yıl|2025|2026|kimdir|kim\b|nedir|nerede|ne zaman|kaç\b|listesi|sırayla|neymiş|araştır|latest|current|price|weather|version|release|who is|what is|\?)/i.test(effective);
}

async function fetchLiveFxAndCryptoIpv4(queryText) {
  const q = String(queryText || '');
  const blocks = [];
  if (/(dolar|euro|sterlin|usd|eur|gbp|döviz|kur\b|kaç\s*tl)/i.test(q)) {
    try {
      const res = await httpsGetJsonIpv4('https://open.er-api.com/v6/latest/USD', {}, 2200);
      const rates = res.ok ? res.json?.rates : null;
      if (rates?.TRY) {
        const usdTry = Number(rates.TRY).toFixed(2);
        const eurTry = rates.EUR ? (Number(rates.TRY) / Number(rates.EUR)).toFixed(2) : null;
        const gbpTry = rates.GBP ? (Number(rates.TRY) / Number(rates.GBP)).toFixed(2) : null;
        const parts = [`1 USD = ${usdTry} TL`];
        if (eurTry) parts.push(`1 EUR = ${eurTry} TL`);
        if (gbpTry) parts.push(`1 GBP = ${gbpTry} TL`);
        blocks.push(`[ANLIK DÖVİZ KURLARI]: ${parts.join(' | ')}`);
      }
    } catch {}
  }
  if (/(bitcoin|\bbtc\b|ethereum|\beth\b|kripto)/i.test(q)) {
    try {
      const [btc, eth] = await Promise.all([
        httpsGetJsonIpv4('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {}, 1800),
        httpsGetJsonIpv4('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', {}, 1800),
      ]);
      const parts = [];
      if (btc.ok && btc.json?.price) parts.push(`BTC = $${Number(btc.json.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
      if (eth.ok && eth.json?.price) parts.push(`ETH = $${Number(eth.json.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
      if (parts.length) blocks.push(`[ANLIK KRİPTO FİYATLARI]: ${parts.join(' | ')}`);
    } catch {}
  }
  return blocks.length ? `${blocks.join('\n')}\n` : '';
}

async function fetchLiveWeatherIpv4(queryText) {
  const q = String(queryText || '');
  if (!/(hava\s+nasıl|hava\s+durumu|kaç\s+derece|yağmur\s+yağacak|weather)/i.test(q)) return '';
  try {
    const cityMatch = /\b(istanbul|ankara|izmir|bursa|antalya|adana|konya|gaziantep|kayseri|mersin|eskişehir|samsun|trabzon|diyarbakır|erzurum|london|berlin|new york|paris)\b/i.exec(q);
    const city = cityMatch ? cityMatch[1] : 'Istanbul';
    const geo = await httpsGetJsonIpv4(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`,
      {},
      1800
    );
    const loc = geo.ok ? geo.json?.results?.[0] : null;
    if (!loc) return '';
    const wx = await httpsGetJsonIpv4(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`,
      {},
      1800
    );
    const cur = wx.ok ? wx.json?.current : null;
    if (!cur) return '';
    return `[ANLIK HAVA DURUMU — ${loc.name}]: Sıcaklık ${cur.temperature_2m}°C (Hissedilen ${cur.apparent_temperature}°C), Rüzgar ${cur.wind_speed_10m} km/s\n`;
  } catch {
    return '';
  }
}

async function fetchWikipediaSnippetsIpv4(queryText, isTr) {
  try {
    const host = isTr ? 'tr.wikipedia.org' : 'en.wikipedia.org';
    const cleanQ = String(queryText || '').replace(/\b(nedir|kimdir|ne zaman|kaç|hangi|sırayla|izlemem|lazım|2026)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (cleanQ.length < 3) return [];
    const res = await httpsGetJsonIpv4(
      `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&srlimit=2&format=json`,
      { 'User-Agent': 'BedoDesktopAssistant/1.0' },
      1800
    );
    const hits = res.ok ? res.json?.query?.search || [] : [];
    return hits
      .map((h) => {
        const snip = String(h?.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
        return snip ? `- [Wikipedia: ${h.title}] ${snip}` : '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fetchSingleRssIpv4(q, isTr) {
  const hl = isTr ? 'hl=tr&gl=TR&ceid=TR:tr' : 'hl=en-US&gl=US&ceid=US:en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${hl}`;
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: 443,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          family: 4,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 1800,
        },
        (res) => {
          let xml = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { if (xml.length < 56000) xml += c; });
          res.on('end', () => {
            const items = [];
            const itemRe = /<item>([\s\S]*?)<\/item>/gi;
            let m;
            while ((m = itemRe.exec(xml)) !== null && items.length < 6) {
              const block = m[1];
              const title = (/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i.exec(block) || [])[1]
                || (/<title>([\s\S]*?)<\/title>/i.exec(block) || [])[2] || '';
              const desc = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i.exec(block) || [])[1]
                || (/<description>([\s\S]*?)<\/description>/i.exec(block) || [])[2] || '';
              const pub = (/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block) || [])[1] || '';
              const cleanTitle = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();
              const cleanDesc = desc
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (cleanTitle) {
                const snippet = cleanDesc && cleanDesc !== cleanTitle ? ` — ${cleanDesc.slice(0, 180)}` : '';
                items.push(`- ${cleanTitle}${pub ? ` (${pub.trim()})` : ''}${snippet}`);
              }
            }
            resolve(items);
          });
        }
      );
      req.on('timeout', () => { req.destroy(); resolve([]); });
      req.on('error', () => resolve([]));
      req.end();
    } catch {
      resolve([]);
    }
  });
}

// ======================= UNIVERSAL AGENTIC WEB RAG =======================
// Zero domain-specific rules:
// 1) Multi-provider LLM Query Planner (coreference, typo repair, multi-query TR+EN decomposition)
// 2) Parallel Organic Web Search (Yahoo Web + Google News RSS + Wikipedia + live FX/Weather sensors)
// 3) RRF + lexical + recency ranking + automatic 2nd-hop gap fill
// 4) Deep Page Reader (JSON-LD structured schema + meta + table-aware BM25 passages + Jina SPA fallback)

function httpsRequestTextIpv4(
  urlStr,
  { method = 'GET', headers = {}, body = null, timeoutMs = 4500, maxBytes = 600000, redirects = 4, cookies = '' } = {}
) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(urlStr); } catch { resolve({ ok: false, status: 0, text: '' }); return; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      resolve({ ok: false, status: 0, text: '' });
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        family: 4,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'identity',
          ...(cookies ? { Cookie: cookies } : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        const setCookie = (res.headers['set-cookie'] || []).map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
        const mergedCookies = [cookies, setCookie].filter(Boolean).join('; ');
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects > 0) {
          res.resume();
          let nextUrl = '';
          try { nextUrl = new URL(res.headers.location, urlStr).toString(); } catch {}
          if (!nextUrl) { finish({ ok: false, status, text: '' }); return; }
          httpsRequestTextIpv4(nextUrl, {
            method: 'GET',
            headers,
            timeoutMs,
            maxBytes,
            redirects: redirects - 1,
            cookies: mergedCookies,
          }).then(finish);
          return;
        }
        const ctype = String(res.headers['content-type'] || '');
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= maxBytes) chunks.push(c);
          else res.destroy();
        });
        const end = () =>
          finish({
            ok: status >= 200 && status < 300,
            status,
            ctype,
            url: urlStr,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        res.on('end', end);
        res.on('close', end);
        res.on('error', end);
      }
    );
    req.on('timeout', () => { req.destroy(); finish({ ok: false, status: 0, text: '' }); });
    req.on('error', () => finish({ ok: false, status: 0, text: '' }));
    if (body) req.write(body);
    req.end();
  });
}

const _NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', bull: '•', middot: '·', hellip: '…', tl: '₺', euro: '€', copy: '©',
  Ccedil: 'Ç', ccedil: 'ç', Ouml: 'Ö', ouml: 'ö', Uuml: 'Ü', uuml: 'ü', Idot: 'İ', inodot: 'ı',
  Gbreve: 'Ğ', gbreve: 'ğ', Scedil: 'Ş', scedil: 'ş',
};

function _decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (full, name) => (_NAMED_ENTITIES[name] !== undefined ? _NAMED_ENTITIES[name] : full));
}

function _parseRssItems(xml, limit = 8) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < limit) {
    const b = m[1];
    const pick = (tag) =>
      _decodeEntities((new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(b) || [])[1] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const title = pick('title');
    const link = pick('link');
    if (!title || !link) continue;
    out.push({
      title,
      link,
      snippet: pick('description').slice(0, 340),
      date: pick('pubDate'),
    });
  }
  return out;
}

// Organic web search via tr.search.yahoo.com (serves both TR & global EN results without EU/GDPR consent wall)
async function _searchYahooWeb(q) {
  const r = await httpsRequestTextIpv4(`https://tr.search.yahoo.com/search?p=${encodeURIComponent(q)}&ei=UTF-8`, { timeoutMs: 4200, maxBytes: 450000 });
  if (!r.ok || !r.text) return [];
  // Abort immediately if any bot/challenge screen is detected (never bypass)
  if (/verify you are human|recaptcha|cf-turnstile/i.test(r.text) && !r.text.includes('compText')) return [];

  const out = [];
  const blocks = r.text.split(/<div[^>]+class="[^"]*\balgo\b[^"]*"[^>]*>/i).slice(1);
  for (let idx = 0; idx < blocks.length && out.length < 8; idx += 1) {
    const b = blocks[idx];
    const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(b);
    if (!h3) continue;
    const hrefM = /href="([^"]+)"/i.exec(h3[1]) || /href="([^"]+)"/i.exec(b);
    let link = hrefM ? _decodeEntities(hrefM[1]) : '';
    const ru = /\/RU=([^/]+)\//i.exec(link);
    if (ru) {
      try { link = decodeURIComponent(ru[1]); } catch {}
    }
    if (!/^https?:\/\//i.test(link) || /yahoo\.com\/|bing\.com\/aclick|gemini\.yahoo/i.test(link)) continue;

    const title = _decodeEntities(
      h3[1]
        .replace(/<span[^>]*class="[^"]*(?:d-ib|fc-obsidian|fz-ms|va-bot)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();

    const compM = /<div[^>]+class="[^"]*\bcompText\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(b);
    const snippet = _decodeEntities((compM ? compM[1] : '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) continue;

    // Extract leading date hint like "18 Kas 2026 · " or "Nov 18, 2026 · "
    const dateM = /^([0-9]{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]{3,10}\s+20\d{2}|[A-Za-z]{3,9}\s+[0-9]{1,2},\s*20\d{2})\s*[·•-]/u.exec(snippet);
    out.push({
      title,
      link,
      snippet: snippet.slice(0, 420),
      date: dateM ? dateM[1] : '',
      rank: out.length,
      source: 'web',
    });
  }
  return out;
}

async function _searchNewsRss(q, isTr) {
  const hl = isTr ? 'hl=tr&gl=TR&ceid=TR:tr' : 'hl=en-US&gl=US&ceid=US:en';
  const r = await httpsRequestTextIpv4(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${hl}`, { timeoutMs: 3500 });
  if (!r.ok) return [];
  const rawItems = r.text.split(/<item>/i).slice(1);
  return _parseRssItems(r.text, 6).map((x, i) => {
    const src = /<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i.exec(rawItems[i] || '');
    return {
      ...x,
      link: src ? src[1] : x.link,
      newsLink: x.link,
      publisher: src ? _decodeEntities(src[2]).trim() : '',
      rank: i,
      source: 'news',
    };
  });
}

async function _searchWikipedia(q, isTr) {
  const host = isTr ? 'tr.wikipedia.org' : 'en.wikipedia.org';
  const r = await httpsGetJsonIpv4(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=2&format=json`,
    { 'User-Agent': 'BedoDesktopAssistant/1.0' },
    2800
  );
  const hits = r.ok ? r.json?.query?.search || [] : [];
  return hits.map((h, i) => ({
    title: `Wikipedia: ${h.title}`,
    link: `https://${host}/wiki/${encodeURIComponent(String(h.title).replace(/ /g, '_'))}`,
    snippet: _decodeEntities(String(h.snippet || '').replace(/<[^>]+>/g, '')),
    rank: i,
    source: 'wiki',
  }));
}

function _extractStructuredHtmlFacts(html) {
  const facts = [];
  // 1. Meta description / og:description
  const ogDesc =
    /<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]{25,500})"/i.exec(html) ||
    /<meta[^>]+content="([^"]{25,500})"[^>]+(?:property="og:description"|name="description")/i.exec(html);
  if (ogDesc) {
    facts.push(_decodeEntities(ogDesc[1]).replace(/\s+/g, ' ').trim());
  }
  // 2. Schema.org JSON-LD (prices, offers, dates, headlines, FAQs)
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let count = 0;
  const walkLd = (node) => {
    if (!node || count >= 8) return;
    if (Array.isArray(node)) { node.forEach(walkLd); return; }
    if (typeof node !== 'object') return;
    const type = String(node['@type'] || '');
    const parts = [];
    if (node.name || node.headline) parts.push(String(node.name || node.headline).slice(0, 140));
    if (node.datePublished) parts.push(`date=${String(node.datePublished).slice(0, 10)}`);
    if (node.price !== undefined || node.lowPrice !== undefined) {
      const p = node.price ?? node.lowPrice;
      const hi = node.highPrice ? `–${node.highPrice}` : '';
      const cur = node.priceCurrency || '';
      parts.push(`price=${p}${hi} ${cur}`.trim());
    }
    if (type === 'Question' && node.name && node.acceptedAnswer?.text) {
      parts.push(`Q: ${node.name} -> A: ${_decodeEntities(String(node.acceptedAnswer.text).replace(/<[^>]+>/g, ' ')).slice(0, 220)}`);
    }
    if (parts.length >= 2 || (parts.length === 1 && /price=|Q:/.test(parts[0]))) {
      facts.push(parts.join(' | '));
      count += 1;
    }
    if (node.offers) walkLd(node.offers);
    if (node.mainEntity) walkLd(node.mainEntity);
    if (node['@graph']) walkLd(node['@graph']);
  };
  while ((m = ldRe.exec(html)) && count < 8) {
    try { walkLd(JSON.parse(m[1].trim())); } catch {}
  }
  return [...new Set(facts)].slice(0, 5).join('\n');
}

function _htmlToText(html) {
  return _decodeEntities(
    String(html || '')
      .replace(/<(script|style|noscript|svg|nav|footer|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<(br|p|div|li|tr|h[1-6]|section|article)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\|\s*/g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const _STOP = new Set([
  'için', 'icin', 'en', 'kaç', 'kac', 'ne', 'neler', 'nedir', 'mi', 'mı', 'mu', 'mü', 'bir', 've', 'ile', 'bu', 'şu', 'da', 'de',
  'ki', 'gibi', 'hangi', 'nasıl', 'bana', 'olan', 'olarak', 'daha', 'çok', 'var', 'yok',
  'the', 'what', 'is', 'are', 'of', 'and', 'for', 'to', 'in', 'on', 'a', 'an', 'with', 'from', 'how', 'much',
]);

function _terms(q) {
  return [
    ...new Set(
      String(q || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !_STOP.has(w))
        .map((w) => (w.length > 6 && !/\d/.test(w) ? w.slice(0, 6) : w))
    ),
  ];
}

function _scoreText(text, terms) {
  const low = String(text || '').toLocaleLowerCase('tr-TR');
  let s = 0;
  for (const t of terms) if (low.includes(t)) s += 1;
  if (/\d/.test(low)) s += 0.35;
  if (/(₺|\btl\b|\busd\b|\beur\b|\$|€)/i.test(low)) s += 0.25;
  return s;
}

function _bestPassages(text, terms, maxChars = 1200) {
  const paras = String(text || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 18 && p.length <= 1400);
  const ranked = paras
    .map((p, i) => ({ p, i, s: _scoreText(p, terms) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .sort((a, b) => a.i - b.i);
  let out = '';
  for (const r of ranked) {
    if (out.length + r.p.length > maxChars) break;
    out += `${r.p}\n`;
  }
  return out.trim();
}

async function _readPageUniversal(urlStr, allTerms) {
  const r = await httpsRequestTextIpv4(urlStr, { timeoutMs: 3400, maxBytes: 650000 });
  let structured = '';
  let bodyPassages = '';
  if (r.ok && /text\/html|text\/plain|application\/xhtml/i.test(r.ctype || '')) {
    if (!/verify you are human|cf-turnstile|olağan dışı trafik/i.test(r.text.slice(0, 4000))) {
      structured = _extractStructuredHtmlFacts(r.text);
      const plain = _htmlToText(r.text);
      bodyPassages = _bestPassages(plain, allTerms, 1000);
      if (plain.length >= 220 || structured.length >= 80) {
        return [structured, bodyPassages].filter(Boolean).join('\n').trim();
      }
    }
  }
  // Fallback for JS-rendered docs/blogs when direct HTML was empty (skip if site returned 401/403/429)
  if (r.status !== 401 && r.status !== 403 && r.status !== 429) {
    const jr = await httpsRequestTextIpv4(`https://r.jina.ai/${urlStr}`, { timeoutMs: 3500, maxBytes: 280000 });
    if (jr.ok && jr.text && !/AuthenticationRequiredError|AbuseAlleviationError|<title>403/i.test(jr.text.slice(0, 600))) {
      const mdPassages = _bestPassages(jr.text, allTerms, 1000);
      if (mdPassages) return [structured, mdPassages].filter(Boolean).join('\n').trim();
    }
  }
  return [structured, bodyPassages].filter(Boolean).join('\n').trim();
}

const _TR_MONTH_MAP = {
  ocak: 0, şubat: 1, subat: 1, mart: 2, nisan: 3, mayıs: 4, mayis: 4, haziran: 5,
  temmuz: 6, ağustos: 7, agustos: 7, eylül: 8, eylul: 8, ekim: 9, kasım: 10, kasim: 10, aralık: 11, aralik: 11,
  oca: 0, şub: 1, sub: 1, mar: 2, nis: 3, may: 4, haz: 5, tem: 6, ağu: 7, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
};

function _parseFlexibleDateMs(dateStr) {
  if (!dateStr) return NaN;
  const direct = Date.parse(dateStr);
  if (Number.isFinite(direct)) return direct;
  const m = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(20\d{2})/u.exec(dateStr);
  if (m) {
    const mon = _TR_MONTH_MAP[m[2].toLocaleLowerCase('tr-TR')];
    if (mon !== undefined) return Date.UTC(Number(m[3]), mon, Number(m[1]));
  }
  return NaN;
}

function _extractDomainLabel(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

async function _runSearchBatch(queries, isTr) {
  const tasks = [];
  queries.slice(0, 4).forEach((q, idx) => {
    const cleanQ = String(q || '').trim();
    if (!cleanQ) return;
    const looksEn = /^[\x00-\x7F]+$/.test(cleanQ) && /\b(the|latest|release|price|schedule|vs|how|what|when|who)\b/i.test(cleanQ);
    const useTr = looksEn ? false : isTr;
    tasks.push(_searchYahooWeb(cleanQ).then((arr) => arr.map((x) => ({ ...x, qIdx: idx }))));
    if (idx < 3) tasks.push(_searchNewsRss(cleanQ, useTr).then((arr) => arr.map((x) => ({ ...x, qIdx: idx }))));
  });
  if (queries[0]) {
    tasks.push(_searchWikipedia(queries[0], isTr).then((arr) => arr.map((x) => ({ ...x, qIdx: 0 }))));
  }
  const batches = await Promise.all(tasks);
  return batches.flat();
}

function _rankSearchCandidates(rawItems, perQueryTerms) {
  const byKey = new Map();
  for (const h of rawItems) {
    const k = String(h.newsLink || h.link || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (!k) continue;
    const prev = byKey.get(k);
    const rrf = 1 / (8 + (h.rank || 0));
    if (prev) {
      prev.rrf += rrf;
      prev.qIdxs.add(h.qIdx ?? 0);
      if ((h.snippet || '').length > (prev.snippet || '').length) prev.snippet = h.snippet;
      if (!prev.date && h.date) prev.date = h.date;
      if (prev.source === 'news' && h.source === 'web') {
        prev.source = 'web';
        prev.link = h.link;
      }
    } else {
      byKey.set(k, { ...h, rrf, qIdxs: new Set([h.qIdx ?? 0]) });
    }
  }

  const scored = [];
  for (const h of byKey.values()) {
    const text = `${h.title} ${h.snippet}`.toLocaleLowerCase('tr-TR');
    let rel = 0;
    let bestQIdx = [...h.qIdxs][0] ?? 0;
    perQueryTerms.forEach((terms, idx) => {
      if (!terms.length) return;
      const matched = terms.filter((t) => text.includes(t)).length;
      const ratio = matched / terms.length;
      if (ratio > rel) {
        rel = ratio;
        bestQIdx = idx;
      }
    });
    const ts = _parseFlexibleDateMs(h.date);
    const ageDays = Number.isFinite(ts) ? (Date.now() - ts) / 86400000 : NaN;
    const recency = Number.isFinite(ageDays) ? (ageDays > 450 ? -0.3 : ageDays > 120 ? -0.06 : 0.16) : 0;
    const srcBonus = h.source === 'web' ? 0.24 : h.source === 'wiki' ? -0.1 : 0.02;
    const isTeaserOnlyNews =
      h.source === 'news' &&
      /\?/.test(h.title || '') &&
      (h.snippet || '').length <= (h.title || '').length + 35;
    const score = rel + h.rrf + recency + srcBonus + (isTeaserOnlyNews ? -0.3 : 0);
    scored.push({ ...h, rel, score, bestQIdx });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function _diversifyAcrossQueries(ranked, queryCount, maxTotal = 12) {
  const valid = ranked.filter((h) => h.rel >= 0.32 && h.score >= 0.36);
  if (queryCount <= 1) return valid.slice(0, maxTotal);
  const picked = [];
  const seen = new Set();
  const buckets = Array.from({ length: queryCount }, (_, qi) =>
    valid.filter((h) => h.qIdxs?.has(qi) || h.bestQIdx === qi)
  );
  for (let round = 0; round < 3; round += 1) {
    for (let qi = 0; qi < queryCount; qi += 1) {
      const cand = buckets[qi].find((h) => !seen.has(h.link));
      if (cand && picked.length < maxTotal) {
        seen.add(cand.link);
        picked.push(cand);
      }
    }
  }
  for (const h of valid) {
    if (picked.length >= maxTotal) break;
    if (!seen.has(h.link)) {
      seen.add(h.link);
      picked.push(h);
    }
  }
  return picked;
}

// ======================= UNIVERSAL AGENT TOOLS =======================
// Pure, domain-agnostic tools exposed to Gemini / Claude / OpenAI via native Function Calling.

const GEMINI_AGENT_FUNCTION_DECLARATIONS = [
  {
    name: 'web_search',
    description:
      'Searches the live web and news index for up-to-date facts, schedules, prices, exchange rates, software/model releases, events, or any verifiable information. Pass 1 to 4 concise, targeted search queries.',
    parameters: {
      type: 'OBJECT',
      properties: {
        queries: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '1 to 4 focused search engine queries (include current year or English query when helpful).',
        },
      },
      required: ['queries'],
    },
  },
  {
    name: 'read_webpage',
    description:
      'Opens and extracts full text, tables, and structured metadata from 1 to 4 specific webpage URLs returned by web_search when snippets alone do not contain the complete details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        urls: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '1 to 4 http/https URLs to read in full.',
        },
        focus: {
          type: 'STRING',
          description: 'Keywords describing the exact information to extract from the pages.',
        },
      },
      required: ['urls'],
    },
  },
];

async function _executeAgentWebSearch(args, onProgress) {
  const isTr = normalizeLanguage(userSettings.language) === 'tr';
  const queries = (Array.isArray(args?.queries) ? args.queries : [args?.query])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!queries.length) return { results: [] };

  if (typeof onProgress === 'function') {
    try { onProgress({ phase: 'searching', queries: queries.slice(0, 3) }); } catch {}
  }

  const joined = queries.join(' ');
  const [fxBlock, weatherBlock, rawHits] = await Promise.all([
    fetchLiveFxAndCryptoIpv4(joined),
    fetchLiveWeatherIpv4(joined),
    _runSearchBatch(queries, isTr),
  ]);

  const perQueryTerms = queries.map((q) => _terms(q)).filter((t) => t.length);
  const ranked = _rankSearchCandidates(rawHits, perQueryTerms.length ? perQueryTerms : [_terms(joined)]);
  const top = _diversifyAcrossQueries(ranked, queries.length, 12);
  const domains = [...new Set(top.map((h) => _extractDomainLabel(h.link)).filter(Boolean))].slice(0, 5);

  if (typeof onProgress === 'function' && domains.length) {
    try { onProgress({ phase: 'searching', queries: queries.slice(0, 2), domains, totalSources: top.length }); } catch {}
  }

  if (process.env.BEDO_DEBUG_LLM) {
    console.log(`[tool:web_search] queries=${JSON.stringify(queries)} hits=${rawHits.length} top=${top.length}`);
  }

  return {
    today: new Date().toISOString().slice(0, 10),
    ...(fxBlock ? { liveExchangeAndCrypto: fxBlock.trim() } : {}),
    ...(weatherBlock ? { liveWeather: weatherBlock.trim() } : {}),
    results: top.map((h) => ({
      title: h.title,
      url: h.link,
      ...(h.date ? { date: h.date } : {}),
      type: h.source,
      snippet: h.snippet,
    })),
  };
}

async function _executeAgentReadWebpage(args, onProgress) {
  const urls = (Array.isArray(args?.urls) ? args.urls : [args?.url])
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 4);
  if (!urls.length) return { pages: [] };

  const domains = [...new Set(urls.map(_extractDomainLabel).filter(Boolean))];
  const focusTerms = _terms(`${args?.focus || ''} ${urls.join(' ')}`);
  let readDone = 0;

  if (typeof onProgress === 'function') {
    try { onProgress({ phase: 'reading', domains, readCount: 0, readableTotal: urls.length, totalSources: urls.length }); } catch {}
  }

  const pages = [];
  await Promise.race([
    Promise.all(
      urls.map(async (u) => {
        const content = await _readPageUniversal(u, focusTerms);
        readDone += 1;
        if (typeof onProgress === 'function') {
          try { onProgress({ phase: 'reading', domains, readCount: readDone, readableTotal: urls.length, totalSources: urls.length }); } catch {}
        }
        pages.push({
          url: u,
          content: content ? content.slice(0, 1800) : 'Sayfa içeriği statik olarak okunamadı; arama özetini veya farklı bir URL\'yi kullanın.',
        });
      })
    ),
    new Promise((r) => setTimeout(r, 3200)),
  ]);

  if (process.env.BEDO_DEBUG_LLM) {
    console.log(`[tool:read_webpage] urls=${JSON.stringify(urls)} read=${pages.length}`);
  }
  return { pages };
}

function sanitizeModelAnswer(text) {
  return String(text || '')
    .replace(/^\s*\[(DOĞRULANMIŞ|VERIFIED)[^\]\n]*\]\s*/i, '')
    .replace(/<\/?(web_context|search_results|sources|flight_search_links)[^>]*>/gi, '')
    .trimStart();
}

function _wrapDelta(onDelta) {
  if (typeof onDelta !== 'function') return null;
  return (acc) => onDelta(sanitizeModelAnswer(acc));
}

function buildLiveSystemInstruction(mode = 'agent') {
  const isTr = normalizeLanguage(userSettings.language) === 'tr';
  const nowStr = new Date().toLocaleDateString(isTr ? 'tr-TR' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const base = trMain(userSettings.language, 'roboSystemPrompt');
  const memBlock = loadUserMemoryContextForPrompt();

  if (isTr) {
    const toolGuidance =
      mode === 'native_search'
        ? '- Güncel veya zamana duyarlı her bilgide canlı web aramasını kullan.'
        : mode === 'agent'
          ? '- Güncel olaylar, tarihler, fiyatlar, kurlar, takvimler, sürümler veya kesinliğinden emin olmadığın her olgu için eğitim belleğine güvenme; `web_search` aracını çağır. Arama özetleri (snippet) tek başına yeterli detayı içermiyorsa en alakalı URL\'leri `read_webpage` ile açıp tam metni/tabloyu oku; gerekirse farklı açılardan ek `web_search` çağrısı yap.'
          : '- Yanıtını yalnızca doğrulanmış bilgilere dayandır.';
    return (
      `[BUGÜNÜN TARİHİ: ${nowStr}]\n${memBlock}${base}\n` +
      `İLKELER:\n` +
      `${toolGuidance}\n` +
      `- Bugünün tarihini (${nowStr}) her zaman referans al; geçmiş tarihli verileri gelecekteki olaylarla veya eski sürümleri güncel sürümlerle karıştırma.\n` +
      `- Doğrulanmış kaynaklarda yer almayan hiçbir sayıyı, fiyatı, tarihi veya adı ASLA uydurma; anlık dinamik sorgu gerektiren bir veri kaynaklarda açıkça yoksa uydurmak yerine mevcut doğrulanmış kapsamı netçe belirt.\n` +
      `- "Arama yapıyorum / lütfen bekleyin" gibi ara cümleler yazma; araştırmanı araçlarla tamamlayıp doğrudan nihai yanıtı ver.\n` +
      `- Web kaynaklarından yararlandığında yanıtın sonuna "Kaynaklar:" başlığıyla kullandığın gerçek sayfaları [Site Adı](URL) biçiminde ekle.`
    );
  }

  const toolGuidanceEn =
    mode === 'native_search'
      ? '- Use live web search for any current or time-sensitive fact.'
      : mode === 'agent'
        ? '- Never rely on pretraining memory for current events, dates, prices, rates, schedules, releases, or uncertain facts: call `web_search`, and whenever snippets lack complete details, call `read_webpage` on the best URLs (or run a refined `web_search`).'
        : '- Rely strictly on verified facts.';
  return (
    `[TODAY'S DATE: ${nowStr}]\n${memBlock}${base}\n` +
    `PRINCIPLES:\n` +
    `${toolGuidanceEn}\n` +
    `- Anchor all temporal reasoning to today's date (${nowStr}); never confuse past events or legacy versions with current ones.\n` +
    `- NEVER fabricate numbers, prices, dates, or names absent from retrieved sources; if live interactive data is unavailable in static sources, state the verified scope honestly.\n` +
    `- Do not output interim filler ("searching, please wait"); complete tool calls first and stream the final answer directly, citing used pages under "Sources:" as [Site](URL).`
  );
}

const _searchToolBlockedUntil = { gemini: 0, claude: 0, openai: 0 };
const SEARCH_BLOCK_MS = 30 * 60 * 1000;

// Zero-example ReAct research controller (fast JSON mode, ~600-900ms/step, avoids Gemini Free-Tier functionDeclarations SSE stalls)
async function _runGeminiReactStep(apiKey, controllerModels, statePrompt) {
  for (const modelId of controllerModels) {
    const coolKey = `${modelId}:react`;
    if ((_modelCooldownUntil.get(coolKey) || 0) > Date.now()) continue;
    const t0 = Date.now();
    const r = await httpsRequestTextIpv4(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: statePrompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 320,
            responseMimeType: 'application/json',
          },
        }),
        timeoutMs: 4800,
      }
    );
    if (process.env.BEDO_DEBUG_LLM) {
      console.log(`[react] ${modelId} status=${r.status} ${Date.now() - t0}ms`);
    }
    if (r.status === 429 || r.status === 404 || r.status === 503 || r.status === 0) {
      _modelCooldownUntil.set(coolKey, Date.now() + 90000);
      continue;
    }
    if (!r.ok) continue;
    try {
      const parsed = JSON.parse(r.text || '{}');
      const txt = (parsed?.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p?.thought && p?.text)
        .map((p) => p.text)
        .join('');
      const m = /\{[\s\S]*\}/.exec(txt);
      if (m) return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

async function _runUniversalResearchLoop(question, historyTurns, runStepFn, onProgress) {
  const latest = String(question || '').trim();
  if (!latest) return '';

  const today = new Date().toISOString().slice(0, 10);
  const histText = (historyTurns || [])
    .slice(-4)
    .map((t) => `User: ${String(t.userText || '').slice(0, 280)}\nAssistant: ${String(t.assistantText || '').slice(0, 280)}`)
    .join('\n');

  const observations = [];
  const searchedQueries = new Set();
  const readUrls = new Set();
  const discoveredUrls = new Set();
  const discoveredDomains = new Set();

  for (let step = 0; step < 3; step += 1) {
    const obsSummary = observations
      .map((o, i) => `Observation ${i + 1} (${o.kind}):\n${o.summary}`)
      .join('\n\n');

    const reactPrompt =
      `Today's date: ${today}.\n` +
      `You are an autonomous research controller deciding the next step to answer the user accurately.\n\n` +
      `Conversation history:\n${histText || '(none)'}\n\n` +
      `Latest user message: "${latest}"\n\n` +
      `Collected observations so far:\n${obsSummary || '(none yet)'}\n\n` +
      `Choose ONE action as strict JSON:\n` +
      `- If the message needs NO live/factual verification (pure greeting, casual chat, coding, math, rewriting, translation) OR if collected observations ALREADY contain the specific facts/dates/opponents/numbers needed to answer completely:\n` +
      `  {"action": "answer"}\n` +
      `- If you need to search the web (resolve pronouns from conversation history, fix typos, include current year when time-sensitive, use 1 to 4 targeted queries, include an English query for global topics):\n` +
      `  {"action": "web_search", "queries": ["query 1", "query 2"]}\n` +
      `- If search snippets were retrieved but lack exact details (e.g. full table rows, exact schedule opponent/time, full article body, exact specs/pricing), pick 1 to 4 most promising URLs from the observations to read in full:\n` +
      `  {"action": "read_webpage", "urls": ["https://..."], "focus": "exact info to extract"}`;

    if (step === 0 && typeof onProgress === 'function') {
      // Only show planning indicator if message isn't a one-word greeting
      if (latest.length > 6) {
        try { onProgress({ phase: 'planning' }); } catch {}
      }
    }

    const decision = await runStepFn(reactPrompt);
    if (!decision || decision.action === 'answer') {
      if (observations.length === 0 && typeof onProgress === 'function') {
        try { onProgress({ phase: 'idle' }); } catch {}
      }
      break;
    }

    if (decision.action === 'web_search' && Array.isArray(decision.queries)) {
      const freshQueries = decision.queries
        .map((q) => String(q || '').trim())
        .filter((q) => q && !searchedQueries.has(q.toLowerCase()))
        .slice(0, 4);
      if (!freshQueries.length) break;
      freshQueries.forEach((q) => searchedQueries.add(q.toLowerCase()));
      const res = await _executeAgentWebSearch({ queries: freshQueries }, onProgress);
      for (const r of res.results || []) {
        if (r.url) {
          discoveredUrls.add(r.url);
          const d = _extractDomainLabel(r.url);
          if (d) discoveredDomains.add(d);
        }
      }
      const compact = [
        res.liveExchangeAndCrypto || '',
        res.liveWeather || '',
        ...(res.results || []).map(
          (r, idx) => `[${idx + 1}] ${r.title}${r.date ? ` (${r.date})` : ''} | URL: ${r.url}\nSnippet: ${r.snippet}`
        ),
      ]
        .filter(Boolean)
        .join('\n');
      observations.push({ kind: `web_search(${freshQueries.join('; ')})`, summary: compact || 'No results.' });
      continue;
    }

    if (decision.action === 'read_webpage' && Array.isArray(decision.urls)) {
      const freshUrls = decision.urls
        .map((u) => String(u || '').trim())
        .filter((u) => /^https?:\/\//i.test(u) && !readUrls.has(u))
        .slice(0, 4);
      if (!freshUrls.length) break;
      freshUrls.forEach((u) => readUrls.add(u));
      const res = await _executeAgentReadWebpage({ urls: freshUrls, focus: decision.focus || latest }, onProgress);
      const compact = (res.pages || [])
        .map((p) => `URL: ${p.url}\nContent:\n${p.content}`)
        .join('\n\n');
      observations.push({ kind: `read_webpage(${freshUrls.length} pages)`, summary: compact || 'Empty.' });
      continue;
    }

    break;
  }

  if (!observations.length) return '';
  if (typeof onProgress === 'function') {
    try {
      onProgress({
        phase: 'writing',
        domains: [...discoveredDomains].slice(0, 5),
        totalSources: discoveredUrls.size || observations.length,
      });
    } catch {}
  }
  return `<web_context retrieved="${new Date().toISOString()}">\n${observations
    .map((o) => `--- ${o.kind} ---\n${o.summary}`)
    .join('\n\n')}\n</web_context>\n\n`;
}

function callGeminiApi(apiKey, prompt, onDelta = null, historyTurns = [], onProgress = null) {
  return (async () => {
    const cleanKey = String(apiKey || '').trim();
    const discoveredModels = await resolveGeminiModels(cleanKey);
    const controllerModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    const synthesisOrder = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-4-hydrogen',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      ...discoveredModels,
      'gemma-4-31b-it',
    ];
    const models = _lastWorkingModel.gemini
      ? [...new Set([_lastWorkingModel.gemini, ...synthesisOrder])]
      : [...new Set(synthesisOrder)];

    const baseHistory = [];
    for (const turn of historyTurns) {
      baseHistory.push({ role: 'user', parts: [{ text: turn.userText }] });
      baseHistory.push({ role: 'model', parts: [{ text: turn.assistantText }] });
    }

    const retryableStatuses = new Set([400, 404, 429, 500, 502, 503, 504]);
    let lastError = null;
    const emit = _wrapDelta(onDelta);

    // 1) Paid / Tier-1 Native Google Search Grounding (skipped for 30m once Free Tier returns 429/400)
    if (Date.now() >= _searchToolBlockedUntil.gemini) {
      for (const modelId of models) {
        if (modelId.startsWith('gemma-')) continue;
        const coolKey = `${modelId}:native_search`;
        if ((_modelCooldownUntil.get(coolKey) || 0) > Date.now()) continue;
        let acc = '';
        const _t0 = Date.now();
        try {
          const res = await httpsStreamSseIpv4(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`,
            { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
            JSON.stringify({
              system_instruction: { parts: [{ text: buildLiveSystemInstruction('native_search') }] },
              contents: [...baseHistory, { role: 'user', parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
            }),
            (chunk) => {
              for (const part of chunk?.candidates?.[0]?.content?.parts || []) {
                if (!part?.thought && part?.text) {
                  acc += part.text;
                  if (emit) emit(acc);
                }
              }
            },
            9000
          );
          if (process.env.BEDO_DEBUG_LLM) console.log(`[llm] ${modelId} mode=native_search status=${res.status} ${Date.now() - _t0}ms`);
          if (res.ok && sanitizeModelAnswer(acc).trim()) {
            _lastWorkingModel.gemini = modelId;
            return sanitizeModelAnswer(acc).trim();
          }
          if (res.status === 429 || res.status === 400) {
            _searchToolBlockedUntil.gemini = Date.now() + SEARCH_BLOCK_MS;
            break;
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error(`${res.status}: ${res.errJson?.error?.message || `HTTP ${res.status}`}`);
          }
          break;
        } catch (err) {
          if (/^(401|403):/.test(err?.message || '')) throw err;
          break;
        }
      }
    }

    // 2) Autonomous multi-step ReAct research loop (LLM decides whether to answer directly, search, or read pages)
    const webContext = await _runUniversalResearchLoop(
      prompt,
      historyTurns,
      (statePrompt) => _runGeminiReactStep(cleanKey, controllerModels, statePrompt),
      onProgress
    );

    // 3) Stream grounded final synthesis over SSE (zero functionDeclarations payload -> fast 1.5-3s streaming)
    const sysText = buildLiveSystemInstruction('plain');
    const finalUserText = `${webContext}${prompt}`;

    for (const modelId of models) {
      const isGemma = modelId.startsWith('gemma-');
      const coolKey = `${modelId}:synth`;
      if ((_modelCooldownUntil.get(coolKey) || 0) > Date.now()) continue;
      const _t0 = Date.now();
      try {
        let acc = '';
        let blockReason = '';
        const contents = isGemma
          ? [{ role: 'user', parts: [{ text: `${sysText}\n\n${finalUserText}` }] }]
          : [...baseHistory, { role: 'user', parts: [{ text: finalUserText }] }];

        const res = await httpsStreamSseIpv4(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`,
          { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
          JSON.stringify({
            ...(isGemma ? {} : { system_instruction: { parts: [{ text: sysText }] } }),
            contents,
            generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
          }),
          (chunk) => {
            if (chunk?.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;
            for (const part of chunk?.candidates?.[0]?.content?.parts || []) {
              if (!part?.thought && part?.text) {
                acc += part.text;
                if (emit) emit(acc);
              }
            }
          },
          10000
        );
        if (process.env.BEDO_DEBUG_LLM) console.log(`[llm] ${modelId} mode=synth status=${res.status} ${Date.now() - _t0}ms`);
        if (!res.ok) {
          const msg = res.errJson?.error?.message || `HTTP ${res.status}`;
          lastError = new Error(`${res.status}: ${msg}`);
          if (res.status === 429 || res.status === 404 || res.status === 503) {
            _modelCooldownUntil.set(coolKey, Date.now() + 90000);
          }
          if (_lastWorkingModel.gemini === modelId && (res.status === 429 || res.status === 503)) {
            _lastWorkingModel.gemini = '';
          }
          if (res.status === 401 || res.status === 403) throw lastError;
          if (retryableStatuses.has(res.status)) continue;
          throw lastError;
        }
        const cleanAnswer = sanitizeModelAnswer(acc).trim();
        if (!cleanAnswer && blockReason) {
          throw new Error(`İstek güvenlik filtresine takıldı (${blockReason}).`);
        }
        if (cleanAnswer) {
          if (!isGemma) _lastWorkingModel.gemini = modelId;
          return cleanAnswer;
        }
      } catch (error) {
        if (error?.message === 'TIMEOUT') {
          lastError = new Error('TIMEOUT');
          _modelCooldownUntil.set(coolKey, Date.now() + 90000);
          if (_lastWorkingModel.gemini === modelId) _lastWorkingModel.gemini = '';
          continue;
        }
        if (/^(401|403):/.test(error?.message || '') || /güvenlik filtresine/i.test(error?.message || '')) {
          throw error;
        }
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return '';
  })();
}

// Anthropic Claude API streaming query (+ native web_search & universal agentic tool fallback)
async function callClaudeApi(apiKey, prompt, onDelta = null, historyTurns = [], onProgress = null) {
  const cleanKey = String(apiKey || '').trim();
  const models = await resolveClaudeModels(cleanKey);
  const baseMessages = [];
  for (const turn of historyTurns) {
    baseMessages.push({ role: 'user', content: turn.userText });
    baseMessages.push({ role: 'assistant', content: turn.assistantText });
  }
  baseMessages.push({ role: 'user', content: prompt });

  const claudeAgentTools = GEMINI_AGENT_FUNCTION_DECLARATIONS.map((fn) => ({
    name: fn.name,
    description: fn.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(fn.parameters.properties).map(([k, v]) => [
          k,
          v.type === 'ARRAY'
            ? { type: 'array', items: { type: 'string' }, description: v.description }
            : { type: 'string', description: v.description },
        ])
      ),
      required: fn.parameters.required,
    },
  }));

  let lastErr = null;
  const modes = Date.now() < _searchToolBlockedUntil.claude ? ['agent'] : ['native_search', 'agent'];

  for (const mode of modes) {
    let abortMode = false;
    for (let i = 0; i < models.length && !abortMode; i += 1) {
      try {
        const messages = baseMessages.map((m) => ({ ...m }));
        const maxRounds = mode === 'agent' ? 4 : 1;

        for (let round = 0; round < maxRounds; round += 1) {
          let roundText = '';
          const toolUses = [];
          let curTool = null;

          const res = await httpsStreamSseIpv4(
            'https://api.anthropic.com/v1/messages',
            {
              'x-api-key': cleanKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            JSON.stringify({
              model: models[i],
              max_tokens: 3072,
              system: buildLiveSystemInstruction(mode),
              stream: true,
              ...(mode === 'native_search'
                ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] }
                : round < maxRounds - 1
                  ? { tools: claudeAgentTools }
                  : {}),
              messages,
            }),
            (ev) => {
              if (ev?.type === 'content_block_start' && ev?.content_block?.type === 'tool_use') {
                curTool = { id: ev.content_block.id, name: ev.content_block.name, json: '' };
              } else if (ev?.type === 'content_block_delta') {
                if (ev.delta?.type === 'text_delta' && ev.delta.text) {
                  roundText += ev.delta.text;
                  if (!curTool && toolUses.length === 0 && typeof onDelta === 'function') {
                    onDelta(sanitizeModelAnswer(roundText));
                  }
                } else if (ev.delta?.type === 'input_json_delta' && curTool) {
                  curTool.json += ev.delta.partial_json || '';
                }
              } else if (ev?.type === 'content_block_stop' && curTool) {
                let input = {};
                try { input = JSON.parse(curTool.json || '{}'); } catch {}
                toolUses.push({ id: curTool.id, name: curTool.name, input });
                curTool = null;
              }
            },
            18000
          );

          if (!res.ok) {
            const msg = res.errJson?.error?.message || `HTTP ${res.status}`;
            lastErr = new Error(`${res.status}: ${msg}`);
            if (mode === 'native_search' && (res.status === 400 || res.status === 429)) {
              _searchToolBlockedUntil.claude = Date.now() + SEARCH_BLOCK_MS;
              abortMode = true;
              break;
            }
            if (res.status === 401 || res.status === 403) throw lastErr;
            break;
          }

          if (mode === 'agent' && toolUses.length > 0 && round < maxRounds - 1) {
            if (typeof onDelta === 'function') onDelta('');
            const assistantContent = [];
            if (roundText) assistantContent.push({ type: 'text', text: roundText });
            for (const tu of toolUses) assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
            messages.push({ role: 'assistant', content: assistantContent });

            const toolResults = await Promise.all(
              toolUses.map(async (tu) => {
                const out =
                  tu.name === 'web_search'
                    ? await _executeAgentWebSearch(tu.input, onProgress)
                    : await _executeAgentReadWebpage(tu.input, onProgress);
                return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) };
              })
            );
            messages.push({ role: 'user', content: toolResults });
            if (typeof onProgress === 'function') {
              try { onProgress({ phase: 'writing' }); } catch {}
            }
            continue;
          }

          const clean = sanitizeModelAnswer(roundText).trim();
          if (clean) return clean;
          break;
        }
      } catch (err) {
        if (/^(401|403):/.test(err?.message || '')) throw err;
        lastErr = err;
      }
    }
  }
  if (lastErr) throw lastErr;
  return '';
}

// OpenAI API streaming query (+ Responses web_search_preview & universal Chat Completions tool loop)
async function callOpenAiApi(apiKey, prompt, onDelta = null, historyTurns = [], onProgress = null) {
  const cleanKey = String(apiKey || '').trim();
  const models = await resolveOpenAiModels(cleanKey);

  const inputItems = [];
  const baseChatMessages = [{ role: 'system', content: buildLiveSystemInstruction('agent') }];
  for (const turn of historyTurns) {
    inputItems.push({ role: 'user', content: turn.userText });
    inputItems.push({ role: 'assistant', content: turn.assistantText });
    baseChatMessages.push({ role: 'user', content: turn.userText });
    baseChatMessages.push({ role: 'assistant', content: turn.assistantText });
  }
  inputItems.push({ role: 'user', content: prompt });
  baseChatMessages.push({ role: 'user', content: prompt });

  const openAiTools = GEMINI_AGENT_FUNCTION_DECLARATIONS.map((fn) => ({
    type: 'function',
    function: {
      name: fn.name,
      description: fn.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(fn.parameters.properties).map(([k, v]) => [
            k,
            v.type === 'ARRAY'
              ? { type: 'array', items: { type: 'string' }, description: v.description }
              : { type: 'string', description: v.description },
          ])
        ),
        required: fn.parameters.required,
      },
    },
  }));

  let lastErr = null;
  for (let i = 0; i < models.length; i += 1) {
    if (Date.now() >= _searchToolBlockedUntil.openai) {
      try {
        let accumulated = '';
        const res = await httpsStreamSseIpv4(
          'https://api.openai.com/v1/responses',
          { Authorization: `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
          JSON.stringify({
            model: models[i],
            instructions: buildLiveSystemInstruction('native_search'),
            input: inputItems,
            tools: [{ type: 'web_search_preview' }],
            stream: true,
          }),
          (ev) => {
            if (ev?.type === 'response.output_text.delta' && ev.delta) {
              accumulated += ev.delta;
              if (typeof onDelta === 'function') onDelta(sanitizeModelAnswer(accumulated));
            }
          },
          15000
        );
        if (res.ok && accumulated.trim()) return sanitizeModelAnswer(accumulated).trim();
        if (res.status === 400 || res.status === 429) {
          _searchToolBlockedUntil.openai = Date.now() + SEARCH_BLOCK_MS;
        }
      } catch {}
    }

    try {
      const chatMessages = baseChatMessages.map((m) => ({ ...m }));
      for (let round = 0; round < 4; round += 1) {
        let roundText = '';
        const toolCallMap = new Map();
        const res = await httpsStreamSseIpv4(
          'https://api.openai.com/v1/chat/completions',
          { Authorization: `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
          JSON.stringify({
            model: models[i],
            max_tokens: 3072,
            stream: true,
            ...(round < 3 ? { tools: openAiTools } : {}),
            messages: chatMessages,
          }),
          (ev) => {
            const delta = ev?.choices?.[0]?.delta;
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const slot = toolCallMap.get(tc.index) || { id: '', name: '', arguments: '' };
                if (tc.id) slot.id = tc.id;
                if (tc.function?.name) slot.name += tc.function.name;
                if (tc.function?.arguments) slot.arguments += tc.function.arguments;
                toolCallMap.set(tc.index, slot);
              }
            } else if (delta?.content) {
              roundText += delta.content;
              if (toolCallMap.size === 0 && typeof onDelta === 'function') {
                onDelta(sanitizeModelAnswer(roundText));
              }
            }
          },
          16000
        );
        if (!res.ok) {
          const msg = res.errJson?.error?.message || `HTTP ${res.status}`;
          lastErr = new Error(`${res.status}: ${msg}`);
          if (res.status === 401 || res.status === 403) throw lastErr;
          break;
        }
        const toolCalls = [...toolCallMap.values()].filter((t) => t.name);
        if (toolCalls.length > 0 && round < 3) {
          if (typeof onDelta === 'function') onDelta('');
          chatMessages.push({
            role: 'assistant',
            content: roundText || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments || '{}' },
            })),
          });
          for (const tc of toolCalls) {
            let parsedArgs = {};
            try { parsedArgs = JSON.parse(tc.arguments || '{}'); } catch {}
            const out =
              tc.name === 'web_search'
                ? await _executeAgentWebSearch(parsedArgs, onProgress)
                : await _executeAgentReadWebpage(parsedArgs, onProgress);
            chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
          }
          if (typeof onProgress === 'function') {
            try { onProgress({ phase: 'writing' }); } catch {}
          }
          continue;
        }
        if (roundText.trim()) return sanitizeModelAnswer(roundText).trim();
        break;
      }
    } catch (err) {
      if (/^(401|403):/.test(err?.message || '')) throw err;
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return '';
}

function getLocalSmartReply(q, mode) {
  const lower = q.toLowerCase().trim();

  // 1. Math expressions (e.g. 15 * 8, 120 / 4)
  if (/^[\d\s\+\-\*\/\(\)\.\^\%]+$/.test(q) && /[\+\-\*\/]/.test(q)) {
    try {
      const sanitized = q.replace(/[^0-9\+\-\*\/\(\)\.\%]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      if (typeof result === 'number' && !isNaN(result)) {
        return `${q.trim()} = ${result}`;
      }
    } catch {}
  }

  // 2. Greetings & small talk
  if (lower === 'naber' || lower === 'ne haber' || lower.includes('naber')) {
    return 'İyidir, senden naber? Çalışmalar nasıl gidiyor? Sana bugün kodlama, çeviri veya sorularında yardımcı olabilirim!';
  }
  if (lower === 'nasılsın' || lower === 'nasilsin' || lower.includes('nasıl gidiyor')) {
    return 'Harikayım, teşekkürler! Her şey yolunda. Senin günün nasıl geçiyor?';
  }
  if (
    lower === 'merhaba' ||
    lower === 'selam' ||
    lower === 'slm' ||
    lower === 'hello' ||
    lower === 'hi'
  ) {
    return 'Merhaba! Bedo hazır. Aklındaki soruyu veya üzerinde çalıştığın konuyu yazabilirsin.';
  }
  if (lower.includes('günaydın') || lower.includes('gunaydin')) {
    return 'Günaydın! Harika ve çok verimli bir gün dilerim ☀️';
  }
  if (lower.includes('iyi akşamlar') || lower.includes('iyi aksamlar')) {
    return 'İyi akşamlar! Günün nasıl geçti? Dinlenirken veya çalışırken buradayım.';
  }
  if (
    lower.includes('kimsin') ||
    lower.includes('sen kimsin') ||
    lower.includes('adın ne') ||
    lower.includes('robo nedir')
  ) {
    return 'Ben Bedo! Masaüstünde çalışan akıllı yapay zeka asistanınım. Sorularını yanıtlayabilir, kodlama ve yazım hatalarında sana destek olabilirim.';
  }
  if (
    lower.includes('teşekkür') ||
    lower.includes('tesekkur') ||
    lower === 'sağol' ||
    lower === 'eyvallah'
  ) {
    return 'Rica ederim, her zaman buradayım! Kolay gelsin.';
  }

  // 3. Mode: Check my spelling
  if (
    mode === 'Check my spelling' ||
    lower.startsWith('yazımı düzelt') ||
    lower.startsWith('düzelt')
  ) {
    const commonTypos = {
      gelcem: 'geleceğim',
      yapcam: 'yapacağım',
      gidicez: 'gideceğiz',
      gelicez: 'geleceğiz',
      bugeun: 'bugün',
      herşey: 'her şey',
      herkez: 'herkes',
      yanlız: 'yalnız',
      yalnış: 'yanlış',
      tabiki: 'tabii ki',
      farketmez: 'fark etmez',
      saol: 'sağ ol',
      bişey: 'bir şey',
    };
    let corrected = q;
    for (const [wrong, right] of Object.entries(commonTypos)) {
      const reg = new RegExp(`\\b${wrong}\\b`, 'gi');
      corrected = corrected.replace(reg, right);
    }
    if (corrected !== q) {
      return `Düzeltilmiş metin: "${corrected}"`;
    }
    return `Yazım kontrol edildi, metniniz düzgün görünüyor: "${q}"`;
  }

  // 4. Programming knowledge lookup
  if (lower.includes('usestate')) {
    return 'useState, React bileşenlerinde yerel durum (state) tutmayı sağlayan temel bir Hook\'tur. [değer, setDeğer] şeklinde iki elemanlı dizi döner.';
  }
  if (lower.includes('useeffect')) {
    return 'useEffect, React bileşenlerinde yan etkileri (veri çekme, DOM güncelleme, abonelikler) yönetir. Bağımlılık dizisi ile ne zaman çalışacağı kontrol edilir.';
  }
  if (lower.includes('react')) {
    return 'React, Meta tarafından geliştirilen, kullanıcı arayüzleri oluşturmak için kullanılan popüler bir JavaScript kütüphanesidir. Bileşen (component) tabanlı mimariye sahiptir.';
  }
  if (lower.includes('python')) {
    return 'Python, okunabilirliği yüksek, geniş kütüphane ekosistemine sahip çok amaçlı ve popüler bir programlama dilidir. Veri bilimi, yapay zeka ve web geliştirmede yaygın kullanılır.';
  }
  if (lower.includes('docker')) {
    return 'Docker, uygulamaları ve bağımlılıklarını izole konteynerlar (container) içinde paketleyerek her ortamda tutarlı çalışmasını sağlayan bir platformdur.';
  }

  return null;
}

ipcMain.handle('validate-api-key', async (_event, payload = {}) => {
  const provider = String(payload?.provider || 'gemini').toLowerCase();
  const key = String(payload?.apiKey || '').trim();
  if (!key || key.length < 10) {
    return { ok: false, reason: 'invalid' };
  }
  try {
    let res;
    if (provider === 'openai' || provider === 'codex') {
      res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
    } else if (provider === 'claude' || provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        method: 'GET',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(8000),
      });
    } else {
      res = await net.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
        {
          method: 'GET',
          headers: { 'x-goog-api-key': key },
          signal: AbortSignal.timeout(8000),
        }
      );
    }
    if (res.ok) return { ok: true, status: res.status };
    let detail = '';
    try {
      const json = await res.json();
      detail = String(json?.error?.message || json?.message || '').trim();
    } catch {}
    if (res.status === 429) {
      // Rate-limited still means the key authenticated
      return { ok: true, status: res.status };
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'invalid', status: res.status, detail };
    }
    return { ok: false, reason: 'invalid', status: res.status, detail };
  } catch (err) {
    return { ok: false, reason: 'network', detail: err?.message || '' };
  }
});

ipcMain.handle('ask-robo', async (_event, payload = {}) => {
  const { question, provider, mode, sessionId: requestedSessionId } = payload || {};
  const q = (question || '').trim();
  if (!q) return { text: 'Lütfen bir soru veya metin girin.' };
  if (requestedSessionId && typeof requestedSessionId === 'string') {
    activeBedoSessionId = requestedSessionId;
    explicitBedoSession = true;
    activeLiveBedoTurnId = null;
  }

  const hasAnyConfiguredKey = Boolean(
    (userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim() ||
    (userSettings.codexApiKey || userSettings.openaiApiKey || process.env.OPENAI_API_KEY || '').trim() ||
    (userSettings.claudeApiKey || process.env.ANTHROPIC_API_KEY || '').trim()
  );

  // Mode: Translate — only use free MyMemory fallback when no LLM API key is configured
  if (
    !hasAnyConfiguredKey &&
    (mode === 'Translate' ||
      q.toLowerCase().startsWith('çevir:') ||
      q.toLowerCase().startsWith('translate:'))
  ) {
    const textToTranslate = q.replace(/^(çevir|translate):\s*/i, '');
    const isTurkish =
      /[çğıöşü]/i.test(textToTranslate) ||
      /^(merhaba|naber|nasılsın|bugün|evet|hayır|kitap|masa|gideceğiz|güzel)/i.test(textToTranslate);
    const from = isTurkish ? 'tr' : 'en';
    const to = isTurkish ? 'en' : 'tr';
    const translated = await translateTextMyMemory(textToTranslate, from, to);
    if (translated) {
      const replyText = `Çeviri (${from.toUpperCase()} → ${to.toUpperCase()}):\n${translated}`;
      appendBedoChatEntry({ userText: q, assistantText: replyText, provider: 'Çeviri', source: 'text' });
      return { text: replyText };
    }
  }

  // Route only to the provider selected in Robo. Never disguise API failures as AI answers.
  const lang = userSettings.language;
  const selected = String(provider || 'Claude').toLowerCase();
  const providers = {
    claude: {
      label: 'Claude',
      enabled: userSettings.claudeEnabled !== false,
      key: userSettings.claudeApiKey || process.env.ANTHROPIC_API_KEY,
      call: callClaudeApi,
      setup: trMain(lang, 'roboSetupClaude'),
    },
    codex: {
      label: 'OpenAI',
      enabled: userSettings.codexEnabled !== false,
      key: userSettings.codexApiKey || userSettings.openaiApiKey || process.env.OPENAI_API_KEY,
      call: callOpenAiApi,
      setup: trMain(lang, 'roboSetupCodex'),
    },
    gemini: {
      label: 'Gemini',
      enabled: userSettings.geminiEnabled !== false,
      key: userSettings.geminiApiKey || process.env.GEMINI_API_KEY,
      call: callGeminiApi,
      setup: trMain(lang, 'roboSetupGemini'),
    },
  };
  const selectedProvider = selected.includes('claude')
    ? providers.claude
    : selected.includes('codex') || selected.includes('openai')
    ? providers.codex
    : selected.includes('gemini')
    ? providers.gemini
    : null;

  if (!selectedProvider) {
    return { error: trMain(lang, 'roboUnsupportedProvider') };
  }
  if (!selectedProvider.enabled) {
    return { error: trMain(lang, 'roboProviderDisabled', { provider: selectedProvider.label }) };
  }
  if (!selectedProvider.key) {
    const localReply = getLocalSmartReply(q, mode);
    if (localReply) {
      appendBedoChatEntry({ userText: q, assistantText: localReply, provider: 'Bedo', source: 'text' });
      return { text: localReply, provider: 'Robo' };
    }
    return { error: trMain(lang, 'roboMissingApiKey', { provider: selectedProvider.label, setup: selectedProvider.setup }) };
  }

  const sessionId = ensureActiveBedoSessionId();
  broadcastBedoChatSync({
    type: 'turn-start',
    sessionId,
    userText: q,
    provider: selectedProvider.label,
  });

  try {
    const historyTurns = getCleanSessionTurns(sessionId, 6);
    const effectiveQuestion =
      mode === 'Translate' && !/^(çevir|translate):/i.test(q)
        ? `Şu metni doğal ve akıcı şekilde çevir (Türkçe ise İngilizceye, yabancı dilde ise Türkçeye): ${q}`
        : q;
    // Adaptive 45fps word-boundary stream pacer so coarse SSE packets glide word-by-word like Claude/Gemini
    // instead of dumping 600+ characters onto the screen in a single frame.
    let targetStreamText = '';
    let shownLen = 0;
    let streamDone = false;
    let finishResolve = null;
    let finishDeadline = 0;
    const emitSlice = (len) => {
      shownLen = len;
      broadcastBedoChatSync({
        type: 'turn-stream',
        sessionId,
        userText: q,
        assistantText: targetStreamText.slice(0, shownLen),
        provider: selectedProvider.label,
      });
    };
    const nextBoundaryIndex = (full, fromIdx, stepChars) => {
      let idx = Math.min(full.length, fromIdx + stepChars);
      // Hold before an in-progress Markdown link [label](url) until its closing ')' arrives in SSE,
      // then emit the entire [label](url) atomically so partial "[Hürr" syntax never flashes on screen.
      const openBr = full.lastIndexOf('[', idx);
      if (openBr !== -1 && idx >= openBr && idx - openBr < 180) {
        const rest = full.slice(openBr);
        const completeLink = /^\[[^\]]+\]\(https?:\/\/(?:[^\s()]+|\([^\s()]*\))+\)/.exec(rest);
        if (completeLink) {
          const endOfLink = openBr + completeLink[0].length;
          if (idx < endOfLink) return endOfLink;
        } else if (!streamDone && /^\[[^\]]*(?:\]\([^\s)]*)?$/.test(rest) && rest.length < 260) {
          return openBr;
        }
      }
      if (idx >= full.length) return full.length;
      // Snap forward up to 9 chars to end of current word
      for (let k = idx; k < Math.min(full.length, idx + 9); k += 1) {
        const ch = full[k];
        if (ch === ' ' || ch === '\n' || ch === '\t') return k + 1;
      }
      return idx;
    };
    const pacerTimer = setInterval(() => {
      const total = targetStreamText.length;
      if (shownLen < total) {
        const backlog = total - shownLen;
        let step = Math.max(4, Math.min(20, Math.ceil(backlog / 13)));
        if (streamDone && finishDeadline) {
          const remTicks = Math.max(1, Math.ceil((finishDeadline - Date.now()) / 22));
          step = Math.max(step, Math.ceil(backlog / remTicks));
        }
        const nextLen = nextBoundaryIndex(targetStreamText, shownLen, step);
        emitSlice(nextLen);
      }
      if (streamDone && shownLen >= targetStreamText.length) {
        clearInterval(pacerTimer);
        if (finishResolve) {
          const r = finishResolve;
          finishResolve = null;
          r();
        }
      }
    }, 22);

    const handleStreamDelta = (partialText) => {
      targetStreamText = String(partialText || '');
    };
    const handleResearchProgress = (researchPatch) => {
      broadcastBedoChatSync({
        type: 'turn-research',
        sessionId,
        userText: q,
        provider: selectedProvider.label,
        research: researchPatch,
      });
    };
    let reply = '';
    try {
      reply = await selectedProvider.call(
        selectedProvider.key,
        effectiveQuestion,
        handleStreamDelta,
        historyTurns,
        handleResearchProgress
      );
    } catch (callErr) {
      clearInterval(pacerTimer);
      throw callErr;
    }
    if (reply) {
      targetStreamText = reply;
      streamDone = true;
      finishDeadline = Date.now() + Math.min(2200, Math.max(320, (reply.length - shownLen) * 2.1));
      if (shownLen < reply.length) {
        await new Promise((resolve) => {
          finishResolve = resolve;
          setTimeout(resolve, 2400);
        });
      } else {
        clearInterval(pacerTimer);
      }
      const entry = appendBedoChatEntry({
        sessionId,
        userText: q,
        assistantText: reply,
        provider: selectedProvider.label,
        source: 'text',
      });
      broadcastBedoChatSync({
        type: 'turn-done',
        sessionId: entry?.sessionId || sessionId,
        entry,
      });
      return { text: reply, provider: selectedProvider.label };
    }
    clearInterval(pacerTimer);
    const emptyErr = trMain(lang, 'roboEmptyReply', { provider: selectedProvider.label });
    broadcastBedoChatSync({ type: 'turn-error', sessionId, error: emptyErr });
    return { error: emptyErr };
  } catch (err) {
    console.error(`${selectedProvider.label} API call failed:`, err.message);
    const reason = /TIMEOUT/i.test(err.message)
      ? trMain(lang, 'roboTimeout', { provider: selectedProvider.label })
      : /^(429|500|502|503|504):/.test(err.message)
        ? trMain(lang, 'roboBusy', { provider: selectedProvider.label })
      : /401|403|API.?KEY.?INVALID|invalid API key|unauthorized/i.test(err.message)
        ? `${trMain(lang, 'roboBadApiKey')}${err.message ? ` (${err.message.slice(0, 140)})` : ''}`
        : trMain(lang, 'roboRequestFailed', { message: err.message });
    const fullErr = `${selectedProvider.label}: ${reason}`;
    broadcastBedoChatSync({ type: 'turn-error', sessionId, error: fullErr });
    return { error: fullErr };
  }
});

ipcMain.handle('bedo:start', async (_event, opts = {}) => {
  const svc = getBedoService();
  return svc.start({
    apiKey: opts.apiKey || userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '',
    openaiApiKey: opts.openaiApiKey || userSettings.codexApiKey || process.env.OPENAI_API_KEY || '',
    anthropicApiKey: opts.anthropicApiKey || userSettings.claudeApiKey || process.env.ANTHROPIC_API_KEY || '',
    voice: opts.voice || userSettings.bedoVoice || 'Charon',
    speakerVolume:
      opts.speakerVolume !== undefined
        ? Number(opts.speakerVolume)
        : Number.isFinite(Number(userSettings.bedoSpeakerVolume))
          ? Number(userSettings.bedoSpeakerVolume)
          : 1,
    speakerMuted:
      opts.speakerMuted !== undefined
        ? Boolean(opts.speakerMuted)
        : Boolean(userSettings.bedoSpeakerMuted),
    startPaused: Boolean(opts.startPaused),
    enableWake: opts.enableWake !== undefined ? opts.enableWake !== false : userSettings.bedoEnableWake !== false,
    enableClap: Boolean(opts.enableClap),
    dryRun: Boolean(opts.dryRun),
  });
});

ipcMain.handle('bedo:stop', async () => {
  if (!bedoService) return { ok: true };
  await bedoService.stop();
  return { ok: true, status: bedoService.getStatus() };
});

ipcMain.handle('bedo:status', async () => {
  return getBedoService().getStatus();
});

ipcMain.handle('bedo:send-text', async (_event, text) => {
  const cleanText = String(text || '').trim();
  if (!cleanText) return { ok: false };
  upsertLiveBedoChatTurn('user', cleanText, { isNewTurn: true, source: 'text', provider: 'Bedo' });
  const svc = getBedoService();
  if (!svc.getStatus().running && hasConfiguredGeminiKey()) {
    const started = svc.start(buildDefaultBedoStartOptions({ startPaused: false }));
    if (!started.ok) return { ok: false };
  }
  const ok = svc.sendText(cleanText);
  return { ok };
});

ipcMain.handle('bedo:get-chat-history', async () => {
  return loadBedoChatHistory();
});

ipcMain.handle('bedo:delete-chat-entry', async (_event, id) => {
  const list = loadBedoChatHistory();
  bedoChatHistoryCache = list.filter((item) => item.id !== id);
  if (activeLiveBedoTurnId === id) activeLiveBedoTurnId = null;
  flushBedoChatHistoryToDisk();
  broadcastBedoChatHistory(bedoChatHistoryCache);
  return { ok: true, history: bedoChatHistoryCache };
});

ipcMain.handle('bedo:clear-chat-history', async () => {
  bedoChatHistoryCache = [];
  activeLiveBedoTurnId = null;
  activeBedoSessionId = createBedoSessionId();
  flushBedoChatHistoryToDisk();
  broadcastBedoChatHistory(bedoChatHistoryCache);
  return { ok: true, history: [], sessionId: activeBedoSessionId };
});

ipcMain.handle('bedo:new-chat-session', async () => {
  activeLiveBedoTurnId = null;
  activeBedoSessionId = createBedoSessionId();
  explicitBedoSession = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('bedo-chat-session-reset', { sessionId: activeBedoSessionId }); } catch {}
  }
  broadcastBedoChatSync({ type: 'session-new', sessionId: activeBedoSessionId });
  return { ok: true, sessionId: activeBedoSessionId };
});

ipcMain.handle('bedo:select-chat-session', async (_event, sessionId) => {
  if (sessionId && typeof sessionId === 'string') {
    activeBedoSessionId = sessionId;
    explicitBedoSession = true;
    activeLiveBedoTurnId = null;
    const list = loadBedoChatHistory();
    const latestEntry = list.find((item) => item.sessionId === sessionId) || null;
    broadcastBedoChatSync({ type: 'session-selected', sessionId, latestEntry });
  }
  return { ok: true, sessionId: activeBedoSessionId };
});

ipcMain.handle('bedo:delete-chat-session', async (_event, sessionId) => {
  const list = loadBedoChatHistory();
  bedoChatHistoryCache = list.filter((item) => item.sessionId !== sessionId);
  if (activeBedoSessionId === sessionId) {
    activeBedoSessionId = createBedoSessionId();
    activeLiveBedoTurnId = null;
  }
  flushBedoChatHistoryToDisk();
  broadcastBedoChatHistory(bedoChatHistoryCache);
  return { ok: true, history: bedoChatHistoryCache, sessionId: activeBedoSessionId };
});

ipcMain.handle('bedo:set-muted', async (_event, muted) => {
  const ok = getBedoService().setMuted(Boolean(muted));
  return { ok };
});

ipcMain.handle('bedo:set-speaker-volume', async (_event, volume) => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(Number(volume)) ? Number(volume) : 1));
  userSettings.bedoSpeakerVolume = clamped;
  try { saveSettingsToDisk(userSettings); } catch {}
  const ok = getBedoService().setSpeakerVolume(clamped);
  return { ok, volume: clamped };
});

ipcMain.handle('bedo:set-speaker-muted', async (_event, muted) => {
  const flag = Boolean(muted);
  userSettings.bedoSpeakerMuted = flag;
  try { saveSettingsToDisk(userSettings); } catch {}
  const ok = getBedoService().setSpeakerMuted(flag);
  return { ok, muted: flag };
});

ipcMain.handle('bedo:set-system-mic-muted', async (_event, muted) => {
  const ok = getBedoService().setSystemMicMuted(Boolean(muted));
  return { ok };
});

ipcMain.handle('bedo:set-paused', async (_event, paused) => {
  const targetPaused = Boolean(paused);
  const svc = getBedoService();
  if (!targetPaused && !svc.getStatus().running) {
    if (!hasConfiguredGeminiKey()) return { ok: false };
    const started = svc.start(buildDefaultBedoStartOptions({ startPaused: false }));
    return { ok: Boolean(started.ok), status: svc.getStatus() };
  }
  if (targetPaused && userSettings.bedoEnableWake === false && svc.getStatus().running) {
    await svc.stop();
    return { ok: true, status: svc.getStatus() };
  }
  const ok = svc.setPaused(targetPaused);
  return { ok };
});

ipcMain.handle('bedo:set-webcam', async (_event, active) => {
  const targetActive = Boolean(active);
  const svc = getBedoService();
  if (targetActive && !svc.getStatus().running && hasConfiguredGeminiKey()) {
    svc.start(buildDefaultBedoStartOptions({ startPaused: false }));
  }
  const ok = svc.setWebcam(targetActive);
  return { ok };
});

ipcMain.handle('bedo:island-state', async (_event, state) => {
  const ok = getBedoService().syncIslandState(state);
  return { ok };
});

ipcMain.handle('bedo:preview-voice', async (_event, opts = {}) => {
  const apiKey = String(userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  const isTr = normalizeLanguage(userSettings.language) === 'tr';
  if (!apiKey) {
    return {
      ok: false,
      error: isTr
        ? 'Ses önizlemesi için Gemini API anahtarı gerekli.'
        : 'A Gemini API key is required to preview voices.',
    };
  }
  const voiceName = String(opts.voice || userSettings.bedoVoice || 'Charon').trim();
  const text = String(
    opts.text ||
      (isTr
        ? 'Merhaba, ben Bedo. Senin için buradayım, nasıl yardımcı olabilirim?'
        : "Hello, I'm Bedo. I'm right here for you, how can I help?")
  ).trim();

  const ttsModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
  const retryableStatuses = new Set([404, 429, 500, 502, 503, 504]);
  const bodyPayload = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  });

  let lastError = 'Ses önizleme hatası.';
  for (let index = 0; index < ttsModels.length; index += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[index]}:generateContent`;
      const response = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: bodyPayload,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = data?.error?.message || `HTTP ${response.status}`;
        if (retryableStatuses.has(response.status) && index < ttsModels.length - 1) continue;
        return { ok: false, error: lastError };
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p) => p?.inlineData?.data);
      if (!audioPart?.inlineData?.data) {
        lastError = 'Ses verisi alınamadı.';
        if (index < ttsModels.length - 1) continue;
        return { ok: false, error: lastError };
      }
      return {
        ok: true,
        mimeType: audioPart.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000',
        data: audioPart.inlineData.data,
      };
    } catch (err) {
      lastError = err?.message || 'Ses önizleme hatası.';
      if (index === ttsModels.length - 1) {
        return { ok: false, error: lastError };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: lastError };
});

let buddyOverlayWindow = null;

function captureWindowsRegionFast(physRect) {
  return new Promise((resolve) => {
    const x = Math.round(physRect.x);
    const y = Math.round(physRect.y);
    const w = Math.max(10, Math.round(physRect.width));
    const h = Math.max(10, Math.round(physRect.height));
    const ps = [
      'Add-Type -AssemblyName System.Drawing',
      'Add-Type -MemberDefinition "[DllImport(\\"user32.dll\\")] public static extern bool SetProcessDPIAware();" -Name Win32Dpi -Namespace BedoBuddy',
      '[void][BedoBuddy.Win32Dpi]::SetProcessDPIAware()',
      `$bmp = New-Object System.Drawing.Bitmap(${w}, ${h})`,
      '$g = [System.Drawing.Graphics]::FromImage($bmp)',
      `$g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)`,
      '$g.Dispose()',
      '$maxDim = 1600',
      '$outBmp = $bmp',
      'if ($bmp.Width -gt $maxDim -or $bmp.Height -gt $maxDim) {',
      '  $sc = [Math]::Min($maxDim / $bmp.Width, $maxDim / $bmp.Height)',
      '  $nw = [Math]::Max(1, [int][Math]::Round($bmp.Width * $sc))',
      '  $nh = [Math]::Max(1, [int][Math]::Round($bmp.Height * $sc))',
      '  $outBmp = New-Object System.Drawing.Bitmap($nw, $nh)',
      '  $rg = [System.Drawing.Graphics]::FromImage($outBmp)',
      '  $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
      '  $rg.DrawImage($bmp, 0, 0, $nw, $nh)',
      '  $rg.Dispose()',
      '  $bmp.Dispose()',
      '}',
      '$ms = New-Object System.IO.MemoryStream',
      '$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1',
      '$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)',
      '$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]86)',
      'if ($codec) { $outBmp.Save($ms, $codec, $ep) } else { $outBmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg) }',
      '$outBmp.Dispose()',
      '$b64 = [Convert]::ToBase64String($ms.ToArray())',
      '$ms.Dispose()',
      '[Console]::Out.Write($b64)',
    ].join('\n');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 4000, maxBuffer: 12 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve(`data:image/jpeg;base64,${stdout.trim()}`);
      }
    );
  });
}

ipcMain.handle('bedo-buddy:start', async () => {
  if (buddyOverlayWindow && !buddyOverlayWindow.isDestroyed()) {
    buddyOverlayWindow.focus();
    return { ok: true };
  }
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
  const scaleFactor = display.scaleFactor || 1;
  const eyeHex = String(userSettings.eyeColorHex || '#ffffff');

  buddyOverlayWindow = new BrowserWindow({
    x: dx,
    y: dy,
    width: dw,
    height: dh,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  buddyOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

  const isLightBuddy = String(userSettings?.theme || 'dark').toLowerCase() === 'light';
  const hintBg = isLightBuddy ? 'rgba(252,253,255,0.94)' : 'rgba(12,15,24,0.9)';
  const hintBorder = isLightBuddy ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.2)';
  const hintColor = isLightBuddy ? '#0f172a' : '#fff';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:rgba(6,9,18,0.14);cursor:none;user-select:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    .hint{position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:${hintBg};border:1px solid ${hintBorder};color:${hintColor};font-size:12.5px;font-weight:600;box-shadow:0 8px 20px rgba(0,0,0,0.25);pointer-events:none;}
    .sel{position:fixed;border:2px solid #38bdf8;background:rgba(56,189,248,0.14);border-radius:10px;display:none;pointer-events:none;box-shadow:0 0 0 1px rgba(56,189,248,0.35);}
    .orb{position:fixed;left:0;top:0;width:42px;height:28px;border-radius:16px 16px 8px 8px;background:rgba(14,18,28,0.92);border:1.5px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;gap:6px;will-change:transform;pointer-events:none;box-shadow:0 6px 16px rgba(0,0,0,0.45);}
    .eye{width:5.5px;height:9px;border-radius:50%;background:${eyeHex};box-shadow:0 0 8px ${eyeHex};}
  </style></head><body>
    <div class="hint">Bedo Buddy: Ekranda bir yere tıklayın veya sürükleyip bölge seçin (Esc: İptal)</div>
    <div class="sel" id="sel"></div>
    <div class="orb" id="orb"><span class="eye"></span><span class="eye"></span></div>
    <script>
      const orb=document.getElementById('orb'), sel=document.getElementById('sel');
      let start=null;
      window.addEventListener('mousemove',e=>{
        orb.style.transform='translate3d('+(e.clientX-21)+'px,'+(e.clientY-14)+'px,0)';
        if(start){
          const x=Math.min(start.x,e.clientX), y=Math.min(start.y,e.clientY);
          const w=Math.abs(e.clientX-start.x), h=Math.abs(e.clientY-start.y);
          sel.style.display='block'; sel.style.left=x+'px'; sel.style.top=y+'px'; sel.style.width=w+'px'; sel.style.height=h+'px';
        }
      });
      window.addEventListener('mousedown',e=>{
        if(e.button!==0){document.title='BUDDY_CANCEL';return;}
        start={x:e.clientX,y:e.clientY};
      });
      window.addEventListener('mouseup',e=>{
        if(!start)return;
        const w=Math.abs(e.clientX-start.x), h=Math.abs(e.clientY-start.y);
        let box;
        if(w>24 && h>24){
          box={x:Math.min(start.x,e.clientX),y:Math.min(start.y,e.clientY),width:w,height:h};
        } else {
          const bw=540, bh=340;
          box={x:Math.max(0,Math.min(window.innerWidth-bw,e.clientX-bw/2)),y:Math.max(0,Math.min(window.innerHeight-bh,e.clientY-bh/2)),width:bw,height:bh};
        }
        start=null;
        document.title='BUDDY_PICK:'+JSON.stringify(box);
      });
      window.addEventListener('keydown',e=>{if(e.key==='Escape')document.title='BUDDY_CANCEL';});
      window.addEventListener('contextmenu',e=>{e.preventDefault();document.title='BUDDY_CANCEL';});
    </script></body></html>`;

  buddyOverlayWindow.on('page-title-updated', async (_ev, title) => {
    if (!buddyOverlayWindow || buddyOverlayWindow.isDestroyed()) return;
    if (title === 'BUDDY_CANCEL') {
      const win = buddyOverlayWindow;
      buddyOverlayWindow = null;
      win.hide();
      setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 30);
      return;
    }
    if (title.startsWith('BUDDY_PICK:')) {
      let box = null;
      try { box = JSON.parse(title.slice('BUDDY_PICK:'.length)); } catch {}
      const win = buddyOverlayWindow;
      buddyOverlayWindow = null;
      win.hide();
      setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 30);
      if (!box) return;
      await new Promise((r) => setTimeout(r, 45));
      try {
        let imageDataUrl = null;
        if (process.platform === 'win32') {
          const dipRect = {
            x: Math.round(dx + box.x),
            y: Math.round(dy + box.y),
            width: Math.max(10, Math.round(box.width)),
            height: Math.max(10, Math.round(box.height)),
          };
          const physRect = typeof screen.dipToScreenRect === 'function'
            ? screen.dipToScreenRect(null, dipRect)
            : {
                x: Math.round(dipRect.x * scaleFactor),
                y: Math.round(dipRect.y * scaleFactor),
                width: Math.round(dipRect.width * scaleFactor),
                height: Math.round(dipRect.height * scaleFactor),
              };
          imageDataUrl = await captureWindowsRegionFast(physRect);
        }

        if (!imageDataUrl) {
          const capScale = Math.min(scaleFactor, 1920 / Math.max(dw, 1));
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(dw * capScale),
              height: Math.round(dh * capScale),
            },
          });
          const match =
            sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
          if (!match) return;
          const cropRect = {
            x: Math.max(0, Math.round(box.x * capScale)),
            y: Math.max(0, Math.round(box.y * capScale)),
            width: Math.max(10, Math.round(box.width * capScale)),
            height: Math.max(10, Math.round(box.height * capScale)),
          };
          const cropped = match.thumbnail.crop(cropRect);
          const jpgBuf = cropped.toJPEG(86);
          imageDataUrl = `data:image/jpeg;base64,${jpgBuf.toString('base64')}`;
        }

        if (imageDataUrl && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.webContents.send('buddy-captured', { imageDataUrl });
        }
      } catch {}
    }
  });

  buddyOverlayWindow.on('closed', () => {
    buddyOverlayWindow = null;
  });

  buddyOverlayWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return { ok: true };
});

ipcMain.handle('ask-robo-vision', async (_event, payload = {}) => {
  const apiKey = String(userSettings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  const isTr = normalizeLanguage(userSettings.language) === 'tr';
  if (!apiKey) {
    return {
      ok: false,
      error: isTr
        ? 'Ekran analizi için Ayarlar → AI & Sohbet bölümünden Gemini API anahtarı ekleyin.'
        : 'Add a Gemini API key in Settings → AI & Chat to analyze screen captures.',
    };
  }
  const dataUrl = String(payload.imageDataUrl || '');
  const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  if (!base64) return { ok: false, error: 'Görüntü verisi bulunamadı.' };

  const prompt = String(
    payload.question ||
      (isTr
        ? 'Bu ekran görüntüsündeki içeriği incele. Metin varsa yazım/dilbilgisi kontrolü veya gerekiyorsa çeviri yap; kod, hata mesajı veya görselse kısa, net ve anlaşılır şekilde kesinlikle Türkçe olarak açıkla.'
        : 'Analyze this screen capture. If it contains text, check spelling/grammar or translate if foreign; if it is code, an error, or a chart, explain it clearly and concisely in English.')
  );

  const models = await resolveGeminiModels(apiKey);
  const retryableStatuses = new Set([404, 429, 500, 502, 503, 504]);
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 700 },
  });

  let lastErr = 'Analiz yapılamadı.';
  for (let i = 0; i < models.length; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await net.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${models[i]}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: controller.signal,
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = data?.error?.message || `HTTP ${res.status}`;
        if (retryableStatuses.has(res.status) && i < models.length - 1) continue;
        return { ok: false, error: lastErr };
      }
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (text) {
        appendBedoChatEntry({
          userText: String(payload.question || '').trim() || (isTr ? 'Ekrandan seçilen bölge' : 'Selected screen region'),
          assistantText: text,
          provider: 'Gemini Vision',
          source: 'vision',
        });
        return { ok: true, text };
      }
      return { ok: false, error: 'Yanıt boş döndü.' };
    } catch (err) {
      lastErr = err?.message || 'Bağlantı hatası.';
      if (i === models.length - 1) return { ok: false, error: lastErr };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: lastErr };
});

ipcMain.on('quit-app', () => {
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
