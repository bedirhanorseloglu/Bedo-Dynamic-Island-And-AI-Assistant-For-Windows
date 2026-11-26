import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import RealAppIcon from './RealAppIcon';
import NotificationText from './NotificationText';
import RoboMarkdown from './RoboMarkdown';
import {
  Home,
  Plug,
  MessageSquare,
  Clock,
  Trash2,
  Scan,
  PenSquare,
  ListFilter,
  LayoutGrid,
  Bot,
  Shirt,
  User,
  SlidersHorizontal,
  Bell,
  PanelTop,
  Shield,
  Newspaper,
  Heart,
  Sun,
  Check,
  Calendar,
  Flame,
  ChevronRight,
  Hand,
  ExternalLink,
  Play,
  Search,
  Ban,
  Crown,
  Lock,
  Download,
  Copy,
  Minus,
  Square,
  X,
  Eye,
  EyeOff,
  Type,
  Monitor,
  Link2,
  RefreshCw,
  Mic,
  Volume2,
  Power,
  ArrowUp,
  ArrowDown,
  Plus,
  Gamepad2,
  Zap,
} from 'lucide-react';
import './settings.css';
import { playRoboSound, playNotifSound } from './sounds';
import { applyTypographyTokens, CLOCK_FONT_OPTIONS, CLOCK_STORAGE_KEY, normalizeFontIndex, readTypographyPreferences, TEXT_FONT_OPTIONS, TYPOGRAPHY_STORAGE_KEY } from './typography';
import { LanguageProvider, createTranslator, getLocale, languageLabel, normalizeLanguage } from './i18n';

function ProviderSymbol({ provider, size = 16 }) {
  if (provider === 'claude') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 1.8L13.55 7.95L18.1 3.45L15.6 9.3L21.7 8.1L16.35 11.4L22.2 13.75L16.05 13.95L19.45 19.15L14.2 15.65L13.95 21.8L11.9 16.0L8.85 21.45L9.95 15.35L4.35 18.2L8.45 13.5L2.25 12.75L8.05 10.65L3.1 6.75L9.15 8.55L7.65 2.45L11.2 7.75L12 1.8Z"
          fill="#D97757"
        />
      </svg>
    );
  }
  if (provider === 'codex') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6.8 18.5C4.1 18.5 2 16.4 2 13.8C2 11.5 3.65 9.6 5.85 9.2C6.65 6.2 9.4 4 12.65 4C16.35 4 19.4 6.8 19.65 10.4C21.05 10.95 22 12.3 22 13.9C22 16.45 19.9 18.5 17.3 18.5H6.8Z"
          fill="#F8FAFC"
        />
        <path d="M7.5 10.8L10.3 12.8L7.5 14.8" stroke="#0F172A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12.2" y1="15.2" x2="15.6" y2="15.2" stroke="#0F172A" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (provider === 'antigravity') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="agGradTop" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="28%" stopColor="#EF4444" />
            <stop offset="56%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="agGradLeft" x1="4" y1="16" x2="13" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="55%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.4C14.3 2.4 16.05 6.25 18.2 12.1C19.6 15.9 21.15 18.95 21.65 20.15C22.05 21.1 21.25 22 20.15 21.7C18.05 21.1 16.4 18.75 15.1 15.85C14.1 13.65 13.15 12.5 12 12.5C10.85 12.5 9.9 13.65 8.9 15.85C7.6 18.75 5.95 21.1 3.85 21.7C2.75 22 1.95 21.1 2.35 20.15C2.85 18.95 4.4 15.9 5.8 12.1C7.95 6.25 9.7 2.4 12 2.4Z"
          fill="url(#agGradTop)"
        />
        <path
          d="M12 2.4C9.7 2.4 7.95 6.25 5.8 12.1C4.4 15.9 2.85 18.95 2.35 20.15C1.95 21.1 2.75 22 3.85 21.7C5.95 21.1 7.6 18.75 8.9 15.85C9.9 13.65 10.85 12.5 12 12.5V2.4Z"
          fill="url(#agGradLeft)"
          opacity="0.78"
        />
      </svg>
    );
  }
  return null;
}

const DEFAULT_SETTINGS = {
  userName: '',
  onboardingCompleted: false,
  googleEmail: '',
  googleConnected: false,
  calEnabled: false,
  newMailEnabled: false,
  mailFileEnabled: false,
  claudeEnabled: true,
  codexEnabled: true,
  geminiEnabled: true,
  claudeApiKey: '',
  codexApiKey: '',
  geminiApiKey: '',
  bedoVoice: 'Charon',
  bedoEnableWake: true,
  bedoPauseMedia: true,
  bedoAutoStart: true,
  antigravityApiKey: '',
  apps: [],
  showAppsInDock: true,
  closeIslandOnAppOpen: false,
  roboBuddy: true,
  roboName: 'Robo',
  eyePreset: 'Classic',
  workingEyeColor: '#f59e0b',
  doneEyeColor: '#22c55e',
  errorEyeColor: '#ef4444',
  facesEnabled: true,
  blinkingEnabled: true,
  dancingEnabled: true,
  sleepEffectEnabled: true,
  fallAsleepMinutes: 10,
  startupAnimEnabled: true,
  hungerEnabled: true,
  outfit: 'Best',
  bodyColor: 'Cloud',
  eyeColorName: 'White',
  eyeColorHex: '#ffffff',
  soundEffects: true,
  globalShortcutsEnabled: true,
  startWithWindows: true,
  seasonalOutfits: true,
  language: 'English',
  windowsNotifications: true,
  doNotDisturb: false,
  notifShowWhere: 'In the island',
  notifSize: 'Big',
  notifDurationSec: 5,
  notifSound: 'Ding',
  notifColor: '#3b82f6',
  notifShowText: 'Show',
  notifDuringFocus: false,
  notifDuringGames: false,
  islandSize: 'Normal',
  islandStyle: 'Attached',
  islandSeeThrough: 4,
  islandMusicColour: true,
  islandOpenMode: 'On hover',
  leftOfRobo: 'Nothing',
  roboEyesVisible: true,
  rightOfRobo: 'Nothing',
  clockFormat: 'Automatic',
  lyricsEnabled: true,
  focusGuardEnabled: false,
  focusGuardOnlyDuringFocus: false,
  focusGuardApps: ['YouTube', 'TikTok', 'Instagram'],
  focusGuardCustom: '',
  focusGuardWaitSec: 5,
  focusGuardLeaveMin: 5,
  gameOptEnabled: true,
  gameOptHideIsland: true,
  gameOptPauseAnimations: true,
  gameOptDisableBlur: true,
  gameOptPauseBackgroundPolling: true,
  gameOptPauseBedoVoice: false,
  gameOptAllowHudAndNotifs: true,
  gameOptDeepHideWindow: false,
};

const PAGE_HEADERS = {
  home: { title: 'Home', subtitle: '' },
  connections: { title: 'Agents', subtitle: 'Connect Codex and Antigravity to Bedo' },
  aichat: { title: 'AI & Chat', subtitle: "Which AI Bedo's chat talks to" },
  bedochat: { title: 'Chat History', subtitle: 'Your text, voice, and screen conversations with Bedo' },
  apps: { title: 'Apps', subtitle: 'Pick which apps are in your Bedo' },
  robo: { title: 'Bedo', subtitle: 'His name, eyes, behaviour and badges', hasSearch: true },
  wardrobe: {
    title: 'Wardrobe',
    subtitle: 'Pick what Bedo wears. He tries it on right away.',
  },
  account: { title: 'Account', subtitle: 'Your account and your Bedo' },
  general: {
    title: 'General',
    subtitle: 'Language, behaviour and Bedo itself',
    hasSearch: true,
  },
  typography: { title: 'Typography', subtitle: 'Choose the fonts used across Bedo' },
  notifications: { title: 'Notifications', subtitle: '' },
  island: {
    title: 'Island',
    subtitle: 'How the island looks and what it shows',
    hasSearch: true,
  },
  focusguard: {
    title: 'Focus guard',
    subtitle: 'Bedo stops you for a moment when something distracts you',
    hasSearch: true,
  },
  gameopt: {
    title: 'Game optimization',
    subtitle: 'Automatically manages FPS-heavy features during games and restores them on exit',
  },
  news: { title: 'News', subtitle: 'What is new in Bedo' },
  support: { title: 'Support Bedo', subtitle: 'Help Bedo grow' },
};

const NOTIFICATION_ITEMS = [
  { group: 'MAIL AND OTHER APPS', items: ['New mail', 'Mail sent', "Other apps' notifications"] },
  {
    group: 'CLAUDE AND AI',
    items: [
      'Claude asks for permission',
      'Claude has a question',
      'Claude is done',
      'Claude: error',
      'ChatGPT or Claude in your browser',
      'Claude limit almost full',
    ],
  },
  { group: 'FOCUS', items: ['Focus done', 'Back to work'] },
  {
    group: 'MUSIC AND SOUND',
    items: ['Next or previous song', 'Sound moved', "Can't jump in this song", 'Volume'],
  },
  {
    group: 'PHONE, CALENDAR, BATTERY',
    items: [
      'Received from your phone',
      'Calendar: in 10 minutes',
      'Calendar linked',
      'Battery low',
      'Headphones almost empty',
    ],
  },
];

const BODY_COLOR_HEX = {
  Cloud: '#f4f4f5',
  Mint: '#6ee7b7',
  Sky: '#7dd3fc',
  Rose: '#f9a8d4',
  Classic: '#4b5563',
  Night: '#27272a',
  Blue: '#3b82f6',
  Purple: '#8b5cf6',
  Pink: '#ec4899',
  Gold: '#f59e0b',
};

// Crowned Robo SVG Avatar matching the screenshots
function RoboCrownAvatar({ outfit = 'Best', size = 64, eyeHex = '#ffffff', bodyColor = 'Cloud' }) {
  const domeColor = BODY_COLOR_HEX[bodyColor] || '#ffffff';
  return (
    <div className="robo-stage-avatar" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <defs>
          <linearGradient id="spotlightGrad" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        {/* Spotlight cone */}
        <polygon points="48,0 72,0 104,120 16,120" fill="url(#spotlightGrad)" />
        {/* Antenna */}
        <line x1="60" y1="22" x2="60" y2="48" stroke={domeColor} strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="60" cy="20" rx="4.5" ry="6.5" fill={domeColor} />
        {/* Crown if Best or Crown */}
        {(outfit === 'Best' || outfit === 'Crown') && (
          <g>
            <polygon
              points="37,88 37,54 49,68 60,48 71,68 83,54 83,88"
              fill="url(#crownGrad)"
              stroke="#fbbf24"
              strokeWidth="1.5"
            />
            <ellipse cx="60" cy="73" rx="3.8" ry="5.5" fill="#ec4899" />
          </g>
        )}
        {/* Party Hat */}
        {outfit === 'Party hat' && (
          <g>
            <polygon points="42,88 60,44 78,88" fill="#a855f7" stroke="#f472b6" strokeWidth="2" />
            <circle cx="60" cy="44" r="4" fill="#fde047" />
          </g>
        )}
        {/* Robo Head Dome */}
        <path
          d="M 28 118 C 32 88, 88 88, 92 118 Z"
          fill={domeColor}
          style={{ filter: `drop-shadow(0 0 12px ${domeColor}88)` }}
        />
        {/* Eyes on Dome */}
        <ellipse cx="50" cy="105" rx="3.2" ry="4.5" fill={eyeHex} stroke="rgba(0,0,0,0.28)" strokeWidth="0.8" />
        <ellipse cx="70" cy="105" rx="3.2" ry="4.5" fill={eyeHex} stroke="rgba(0,0,0,0.28)" strokeWidth="0.8" />
        {/* Sunglasses */}
        {outfit === 'Sunglasses' && (
          <g>
            <rect x="38" y="99" width="18" height="10" rx="2.5" fill="#111827" stroke="#e2e8f0" strokeWidth="1" />
            <rect x="64" y="99" width="18" height="10" rx="2.5" fill="#111827" stroke="#e2e8f0" strokeWidth="1" />
            <line x1="56" y1="104" x2="64" y2="104" stroke="#e2e8f0" strokeWidth="2" />
          </g>
        )}
        {/* Headphones */}
        {outfit === 'Headphones' && (
          <g>
            <path d="M 27 108 C 27 72, 93 72, 93 108" fill="none" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" />
            <rect x="21" y="100" width="9" height="16" rx="4.5" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            <rect x="90" y="100" width="9" height="16" rx="4.5" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
          </g>
        )}
        {/* Beanie */}
        {outfit === 'Beanie' && (
          <g>
            <path d="M 33 93 C 35 62, 85 62, 87 93 Z" fill="#f97316" />
            <rect x="30" y="88" width="60" height="8" rx="4" fill="#fb923c" />
            <circle cx="60" cy="61" r="5.5" fill="#fed7aa" />
          </g>
        )}
        {/* Halo */}
        {outfit === 'Halo' && (
          <ellipse cx="60" cy="64" rx="22" ry="6" fill="none" stroke="#fde047" strokeWidth="3.5" style={{ filter: 'drop-shadow(0 0 8px rgba(253,224,71,0.75))' }} />
        )}
        {/* Bowtie */}
        {outfit === 'Bowtie' && (
          <g>
            <polygon points="44,111 60,116 44,120" fill="#f43f5e" />
            <polygon points="76,111 60,116 76,120" fill="#f43f5e" />
            <circle cx="60" cy="116" r="3" fill="#fda4af" />
          </g>
        )}
      </svg>
    </div>
  );
}

export default function SettingsApp() {
  const [activePage, setActivePage] = useState('home');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [textFontIndex, setTextFontIndex] = useState(() => readTypographyPreferences().textFontIndex);
  const [numberFontIndex, setNumberFontIndex] = useState(() => {
    try { return normalizeFontIndex(JSON.parse(localStorage.getItem(CLOCK_STORAGE_KEY) || '{}').fontIndex, CLOCK_FONT_OPTIONS.length, 1); }
    catch { return 1; }
  });
  const [now, setNow] = useState(new Date());
  const [fgCustomDraft, setFgCustomDraft] = useState('');
  const [fgSavedFeedback, setFgSavedFeedback] = useState(false);
  const [fgStats, setFgStats] = useState(() => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const raw = JSON.parse(localStorage.getItem('twocode_focus_guard_stats') || '{}');
      return raw.date === todayKey ? { turnedBack: Number(raw.turnedBack || 0), openedAnyway: Number(raw.openedAnyway || 0) } : { turnedBack: 0, openedAnyway: 0 };
    } catch {
      return { turnedBack: 0, openedAnyway: 0 };
    }
  });

  useEffect(() => {
    setFgCustomDraft(settings.focusGuardCustom || '');
  }, [settings.focusGuardCustom]);

  const [installedApps, setInstalledApps] = useState([]);
  const [installedAppsLoading, setInstalledAppsLoading] = useState(false);
  const [installedAppsQuery, setInstalledAppsQuery] = useState('');
  const [fgAppQuery, setFgAppQuery] = useState('');
  const [pythonBootstrap, setPythonBootstrap] = useState({ state: 'idle', detail: '' });
  const [gameModeLive, setGameModeLive] = useState(false);

  useEffect(() => {
    window.twocode?.isGameModeActive?.().then((active) => setGameModeLive(Boolean(active))).catch(() => {});
    const unsub = window.twocode?.onGameModeChange?.((active) => setGameModeLive(Boolean(active)));
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const loadInstalledApps = async (forceRefresh = false) => {
    if (!window.twocode?.getInstalledApps) return;
    setInstalledAppsLoading(true);
    try {
      const list = await window.twocode.getInstalledApps({ forceRefresh });
      setInstalledApps(Array.isArray(list) ? list : []);
    } catch {
      setInstalledApps([]);
    } finally {
      setInstalledAppsLoading(false);
    }
  };

  useEffect(() => {
    if ((activePage === 'apps' || activePage === 'focusguard') && installedApps.length === 0 && !installedAppsLoading) {
      loadInstalledApps(false);
    }
  }, [activePage]);
  const [liveMedia, setLiveMedia] = useState({ hasSession: false });
  const [aiHistory, setAiHistory] = useState({
    codexJobs: [],
    claudeJobs: [],
    jobsToday: 0,
  });
  const [agentIntegration, setAgentIntegration] = useState({
    codexInstalled: false,
    antigravityInstalled: false,
    claudeInstalled: false,
    codexConnected: false,
    antigravityConnected: false,
    claudeConnected: false,
    antigravityIdePath: '',
  });
  const [agentIntegrationBusy, setAgentIntegrationBusy] = useState(false);
  const [agentIntegrationMessage, setAgentIntegrationMessage] = useState('');
  const [ghelperStatus, setGhelperStatus] = useState({ installed: false, running: false });
  const [ghelperBusy, setGhelperBusy] = useState(false);
  const [ghelperMessage, setGhelperMessage] = useState('');

  // Inputs for Apps page
  const [newAppName, setNewAppName] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [roboNameDraft, setRoboNameDraft] = useState('Robo');
  const [selectedNotifItem, setSelectedNotifItem] = useState('Claude is done');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPass, setAccountPass] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [showKeyClaude, setShowKeyClaude] = useState(false);
  const [showKeyCodex, setShowKeyCodex] = useState(false);
  const [showKeyGemini, setShowKeyGemini] = useState(false);
  const [keyVerify, setKeyVerify] = useState({});
  const [bedoChatHistory, setBedoChatHistory] = useState([]);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState(null);
  const [isNewChatDraft, setIsNewChatDraft] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatHistorySearch, setChatHistorySearch] = useState('');
  const [chatHistoryFilter, setChatHistoryFilter] = useState('all');
  const [chatComposerText, setChatComposerText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatPendingUserText, setChatPendingUserText] = useState('');
  const [chatStreamingReply, setChatStreamingReply] = useState('');
  const [chatResearchState, setChatResearchState] = useState(null);
  const [chatSendError, setChatSendError] = useState('');
  const [chatProviderChoice, setChatProviderChoice] = useState('auto');
  const [copiedChatId, setCopiedChatId] = useState(null);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [expandedChatIds, setExpandedChatIds] = useState({});
  const chatThreadScrollRef = useRef(null);

  const verifyProviderKey = async (provider, rawKey) => {
    const apiKey = String(rawKey || '').trim();
    if (!apiKey) {
      setKeyVerify((prev) => ({ ...prev, [provider]: null }));
      return;
    }
    setKeyVerify((prev) => ({ ...prev, [provider]: { state: 'checking', detail: '' } }));
    try {
      const res = await window.twocode?.validateApiKey?.({ provider, apiKey });
      if (res?.ok) {
        setKeyVerify((prev) => ({ ...prev, [provider]: { state: 'ok', detail: '' } }));
      } else {
        setKeyVerify((prev) => ({
          ...prev,
          [provider]: {
            state: 'error',
            detail:
              res?.detail ||
              (res?.reason === 'network'
                ? (langCode === 'tr' ? 'Ağ bağlantısı kurulamadı.' : 'Network connection failed.')
                : (langCode === 'tr' ? 'Anahtar sağlayıcı tarafından reddedildi.' : 'Key was rejected by provider.')),
          },
        }));
      }
    } catch {
      setKeyVerify((prev) => ({
        ...prev,
        [provider]: { state: 'error', detail: langCode === 'tr' ? 'Doğrulama başarısız.' : 'Verification failed.' },
      }));
    }
  };
  const [showKeyAntigravity, setShowKeyAntigravity] = useState(false);
  const [bedoStatus, setBedoStatus] = useState({ running: false, ready: false, paused: true, available: true, jarvisState: 'INITIALISING', lastError: null });
  const [bedoBusy, setBedoBusy] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState('');
  const [voicePreviewError, setVoicePreviewError] = useState('');
  const [activeTestEmotion, setActiveTestEmotion] = useState('');
  const voiceAudioRef = useRef(null);
  const voicePreviewCacheRef = useRef(new Map());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    applyTypographyTokens({ textFontIndex, numberFontIndex });
  }, [textFontIndex, numberFontIndex]);

  useEffect(() => {
    const syncTypography = (event) => {
      if (event.key === TYPOGRAPHY_STORAGE_KEY) setTextFontIndex(readTypographyPreferences().textFontIndex);
      if (event.key === CLOCK_STORAGE_KEY && event.newValue) {
        try { setNumberFontIndex(normalizeFontIndex(JSON.parse(event.newValue).fontIndex, CLOCK_FONT_OPTIONS.length, 1)); }
        catch { /* Ignore malformed storage updates. */ }
      }
    };
    window.addEventListener('storage', syncTypography);
    return () => window.removeEventListener('storage', syncTypography);
  }, []);

  const selectTextFont = (index) => {
    setTextFontIndex(index);
    localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify({ textFontIndex: index }));
  };

  const selectNumberFont = (index) => {
    setNumberFontIndex(index);
    let current = {};
    try { current = JSON.parse(localStorage.getItem(CLOCK_STORAGE_KEY) || '{}'); } catch { /* Start from defaults. */ }
    localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify({ ...current, fontIndex: index }));
  };

  // Load & sync settings + AI history + live media with Electron main process
  useEffect(() => {
    if (!window.twocode) return;

    window.twocode.getSettings?.().then((saved) => {
      if (saved && typeof saved === 'object') {
        const normalized = { ...saved, language: languageLabel(saved.language || 'en') };
        setSettings((prev) => ({ ...prev, ...normalized }));
        try { localStorage.setItem('twocode_lang', normalizeLanguage(normalized.language)); } catch {}
        if (saved.roboName) setRoboNameDraft(saved.roboName);
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));

    const unsubSettings = window.twocode.onSettingsUpdated?.((updated) => {
      if (updated && typeof updated === 'object') {
        const normalized = updated.language ? { ...updated, language: languageLabel(updated.language) } : updated;
        setSettings((prev) => ({ ...prev, ...normalized }));
        if (normalized.language) {
          try { localStorage.setItem('twocode_lang', normalizeLanguage(normalized.language)); } catch {}
        }
      }
    });

    const unsubNavigate = window.twocode.onNavigateSettingsTab?.((tabId) => {
      if (tabId && PAGE_HEADERS[tabId]) {
        setActivePage(tabId);
      }
    });

    window.twocode.getAiHistory?.().then((hist) => {
      if (hist) setAiHistory(hist);
    });

    window.twocode.getAgentIntegrationStatus?.().then((status) => {
      if (status) setAgentIntegration(status);
    });

    window.twocode.getGHelperBridgeStatus?.().then((status) => {
      if (status) setGhelperStatus(status);
    });

    const unsubAi = window.twocode.onAiHistoryUpdate?.((hist) => {
      if (hist) setAiHistory(hist);
    });

    window.twocode.getMediaStatus?.().then((m) => {
      if (m) setLiveMedia(m);
    });

    const unsubMedia = window.twocode.onMediaUpdate?.((m) => {
      if (m) setLiveMedia(m);
    });

    window.twocode.bedoGetStatus?.().then((st) => {
      if (st) setBedoStatus(st);
    });

    const unsubBedo = window.twocode.onBedoStatus?.((st) => {
      if (st) setBedoStatus(st);
    });

    window.twocode.getBedoChatHistory?.().then((list) => {
      if (Array.isArray(list)) setBedoChatHistory(list);
    });

    const unsubBedoChat = window.twocode.onBedoChatHistoryUpdate?.((list) => {
      if (Array.isArray(list)) {
        setBedoChatHistory(list);
        if (list.length > 0 && list[0]?.sessionId) {
          setIsNewChatDraft((wasDraft) => {
            if (wasDraft && Date.now() - (Number(list[0].timestamp) || 0) < 8000) {
              setSelectedChatSessionId(list[0].sessionId);
              return false;
            }
            return wasDraft;
          });
        }
        setTimeout(() => {
          const el = chatThreadScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 40);
      }
    });

    const unsubBedoChatSync = window.twocode.onBedoChatSync?.((ev) => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'turn-start') {
        if (ev.sessionId) setSelectedChatSessionId(ev.sessionId);
        setIsNewChatDraft(false);
        setChatPendingUserText(ev.userText || '');
        setChatStreamingReply('');
        setChatResearchState(null);
        setChatSending(true);
        setChatSendError('');
        setTimeout(() => {
          const el = chatThreadScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 40);
      } else if (ev.type === 'turn-research') {
        if (ev.sessionId) setSelectedChatSessionId(ev.sessionId);
        setIsNewChatDraft(false);
        if (ev.userText) setChatPendingUserText(ev.userText);
        setChatResearchState(ev.research?.phase === 'idle' ? null : ev.research || null);
        setChatSending(true);
        const el = chatThreadScrollRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight <= 96) {
          el.scrollTop = el.scrollHeight;
        }
      } else if (ev.type === 'turn-stream') {
        if (ev.sessionId) setSelectedChatSessionId(ev.sessionId);
        setIsNewChatDraft(false);
        if (ev.userText) setChatPendingUserText(ev.userText);
        if (ev.assistantText) setChatStreamingReply(ev.assistantText);
        setChatSending(true);
        const el = chatThreadScrollRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight <= 96) {
          el.scrollTop = el.scrollHeight;
        }
      } else if (ev.type === 'turn-done') {
        if (ev.sessionId) setSelectedChatSessionId(ev.sessionId);
        setIsNewChatDraft(false);
        setChatPendingUserText('');
        setChatStreamingReply('');
        setChatResearchState(null);
        setChatSending(false);
        setTimeout(() => {
          const el = chatThreadScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 40);
      } else if (ev.type === 'turn-error') {
        setChatPendingUserText('');
        setChatStreamingReply('');
        setChatResearchState(null);
        setChatSending(false);
      } else if (ev.type === 'session-new') {
        if (ev.sessionId) setSelectedChatSessionId(ev.sessionId);
        setChatPendingUserText('');
        setChatStreamingReply('');
        setChatResearchState(null);
        setChatSending(false);
        setIsNewChatDraft(true);
      }
    });

    window.twocode.getPythonBootstrapStatus?.().then((st) => {
      if (st) setPythonBootstrap(st);
    });

    const unsubPyBoot = window.twocode.onPythonBootstrapStatus?.((st) => {
      if (st) {
        setPythonBootstrap(st);
        if (st.state === 'ready') {
          window.twocode.bedoGetStatus?.().then((bs) => {
            if (bs) setBedoStatus(bs);
          });
        }
      }
    });

    const onStorageSync = (ev) => {
      if (ev.key === 'twocode_focus_guard_stats') {
        try {
          const todayKey = new Date().toISOString().slice(0, 10);
          const raw = JSON.parse(ev.newValue || '{}');
          if (raw.date === todayKey) {
            setFgStats({ turnedBack: Number(raw.turnedBack || 0), openedAnyway: Number(raw.openedAnyway || 0) });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorageSync);

    return () => {
      if (unsubSettings) unsubSettings();
      if (unsubNavigate) unsubNavigate();
      if (unsubAi) unsubAi();
      if (unsubMedia) unsubMedia();
      if (unsubBedo) unsubBedo();
      if (unsubBedoChat) unsubBedoChat();
      if (unsubBedoChatSync) unsubBedoChatSync();
      if (unsubPyBoot) unsubPyBoot();
      window.removeEventListener('storage', onStorageSync);
    };
  }, []);

  const langCode = normalizeLanguage(settings.language);
  const t = useMemo(() => createTranslator(langCode), [langCode]);
  const locale = getLocale(langCode);

  const updateSetting = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.language) {
        next.language = languageLabel(patch.language);
        try { localStorage.setItem('twocode_lang', normalizeLanguage(next.language)); } catch {}
      }
      window.twocode?.saveSettings?.(next);
      return next;
    });
  };

  const connectAgentTools = async () => {
    setAgentIntegrationBusy(true);
    setAgentIntegrationMessage('');
    const result = await window.twocode?.connectAgentIntegrations?.();
    if (result?.ok) {
      const st = result.status || {};
      setAgentIntegration(st);
      const anyInstalled = Boolean(st.codexInstalled || st.antigravityInstalled || st.claudeInstalled);
      if (!anyInstalled) {
        setAgentIntegrationMessage(
          langCode === 'tr'
            ? 'Bu bilgisayarda kurulu Codex, Antigravity veya Claude Code bulunamadı.'
            : 'No installed Codex, Antigravity, or Claude Code found on this PC.'
        );
      } else {
        setAgentIntegrationMessage(t('settings.agents.installSuccess'));
      }
    } else {
      setAgentIntegrationMessage(result?.error || t('settings.agents.installError'));
    }
    setAgentIntegrationBusy(false);
  };

  const testAgentTool = async (agent) => {
    setAgentIntegrationBusy(true);
    const result = await window.twocode?.testAgentIntegration?.(agent);
    setAgentIntegrationMessage(result?.ok ? t('settings.agents.testSuccess', { agent }) : (result?.error || t('settings.agents.testError')));
    setAgentIntegrationBusy(false);
  };

  const installGHelperBridge = async () => {
    setGhelperBusy(true);
    setGhelperMessage('');
    if (ghelperStatus.installed && !ghelperStatus.running) {
      await window.twocode?.startGHelperBridge?.();
      setTimeout(async () => {
        const next = await window.twocode?.getGHelperBridgeStatus?.();
        if (next) setGhelperStatus(next);
        setGhelperBusy(false);
      }, 1200);
      return;
    }
    const res = await window.twocode?.installGHelperBridge?.();
    if (res?.ok) {
      setGhelperStatus(res.status || { installed: true, running: true });
      setGhelperMessage(t('settings.agents.ghelperInstalled'));
    } else {
      setGhelperMessage(res?.error || t('settings.agents.ghelperError'));
    }
    setGhelperBusy(false);
  };

  const testGHelperHud = async (sample) => {
    await window.twocode?.testGHelperHud?.(sample);
  };

  const chooseAntigravityIde = async () => {
    const pickedPath = await window.twocode?.pickProgramFile?.();
    if (pickedPath) {
      updateSetting({ antigravityIdePath: pickedPath });
      setAgentIntegration((current) => ({ ...current, antigravityIdePath: pickedPath }));
    }
  };

  const formatTimeHHMM = (d) => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const formatDateTop = (d) => {
    const wd = d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').toUpperCase();
    const mo = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase();
    return `${wd} ${String(d.getDate()).padStart(2, '0')} ${mo}`;
  };

  const greetingTimeOfDay = useMemo(() => {
    const h = now.getHours();
    if (h < 6 || h >= 22) return t('settings.greeting.night');
    if (h < 12) return t('settings.greeting.morning');
    if (h < 18) return t('settings.greeting.afternoon');
    return t('settings.greeting.evening');
  }, [now, t]);

  const handleAddApp = async () => {
    const name = newAppName.trim();
    const url = newAppUrl.trim();
    if (!name || !url) return;
    const isLocal = /^[a-zA-Z]:\\/i.test(url) || /\.(exe|lnk)$/i.test(url);
    const formattedUrl =
      isLocal || /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const lower = name.toLowerCase();

    let type = 'app';
    let iconUrl = '';

    if (isLocal) {
      type = 'native-app';
      try {
        const nativeIco = await window.twocode?.getFileIcon?.(formattedUrl);
        if (nativeIco) iconUrl = nativeIco;
      } catch {}
    } else if (lower.includes('youtube') || formattedUrl.includes('youtube.com')) {
      type = 'youtube';
    } else if (lower.includes('gemini') || formattedUrl.includes('gemini.google')) {
      type = 'gemini';
    } else if (lower.includes('git') || formattedUrl.includes('github.com')) {
      type = 'github';
    } else if (lower.includes('spotify') || formattedUrl.includes('spotify.com')) {
      type = 'spotify';
    } else if (lower.includes('whatsapp') || formattedUrl.includes('whatsapp.com')) {
      type = 'whatsapp';
    } else if (lower.includes('google') || formattedUrl.includes('google.com')) {
      type = 'google';
    } else {
      type = 'custom';
      try {
        const domain = new URL(formattedUrl).hostname;
        iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      } catch {}
    }

    const nextApps = [
      ...(settings.apps || []),
      {
        id: 'app_' + Date.now(),
        name,
        url: formattedUrl,
        path: isLocal ? formattedUrl : '',
        type,
        iconUrl,
      },
    ].slice(0, 4);
    updateSetting({ apps: nextApps });
    setNewAppName('');
    setNewAppUrl('');
  };

  const handleChooseProgram = async () => {
    const pickedPath = await window.twocode?.pickProgramFile?.();
    if (pickedPath) {
      const base = pickedPath.split(/[/\\]/).pop().replace(/\.(exe|lnk)$/i, '');
      setNewAppName(base);
      setNewAppUrl(pickedPath);
      // Immediately extract icon and add
      try {
        const nativeIco = await window.twocode?.getFileIcon?.(pickedPath);
        const nextApps = [
          ...(settings.apps || []),
          {
            id: 'app_' + Date.now(),
            name: base,
            url: pickedPath,
            path: pickedPath,
            type: 'native-app',
            iconUrl: nativeIco || '',
          },
        ].slice(0, 4);
        updateSetting({ apps: nextApps });
        setNewAppName('');
        setNewAppUrl('');
      } catch {}
    }
  };

  const handleRemoveApp = (id) => {
    const nextApps = (settings.apps || []).filter((a) => a.id !== id);
    updateSetting({ apps: nextApps });
  };

  const handleMoveApp = (index, delta) => {
    const list = [...(settings.apps || [])];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    updateSetting({ apps: list });
  };

  const handleAddPresetApp = (preset) => {
    const current = settings.apps || [];
    if (current.length >= 4) return;
    if (current.some((a) => a.url === preset.url || a.name.toLowerCase() === preset.name.toLowerCase())) return;
    updateSetting({
      apps: [
        ...current,
        {
          id: `app_${Date.now()}_${preset.type}`,
          name: preset.name,
          url: preset.url,
          path: '',
          type: preset.type,
          iconUrl: preset.iconUrl || '',
        },
      ].slice(0, 4),
    });
  };

  const triggerEmotionOnIsland = (emotion) => {
    playRoboSound(emotion, settings.soundEffects !== false);
    window.twocode?.triggerIslandEmotion?.(emotion);
  };

  const triggerTestNotificationOnIsland = () => {
    playNotifSound(settings.notifSound || 'Ding', settings.soundEffects !== false);
    window.twocode?.triggerTestNotification?.({
      title: selectedNotifItem,
      subtitle: langCode === 'tr' ? 'Bildirim önizlemeniz hazır' : 'Your notification preview is ready',
      color: settings.notifColor,
    });
  };

  const headerInfo = {
    title: t(`settings.header.${activePage}.title`),
    subtitle: t(`settings.header.${activePage}.sub`),
    hasSearch: Boolean(PAGE_HEADERS[activePage]?.hasSearch),
  };

  const filteredActivities = useMemo(() => {
    const all = [
      ...(aiHistory.antigravityJobs || []),
      ...(aiHistory.geminiJobs || []),
      ...(aiHistory.codexJobs || []),
      ...(aiHistory.claudeJobs || []),
    ];
    if (!activitySearch.trim()) return all;
    const q = activitySearch.toLowerCase();
    return all.filter((item) => (item.title || '').toLowerCase().includes(q));
  }, [aiHistory, activitySearch]);

  const recentAgentJobs = useMemo(() => [
    ...(aiHistory.antigravityJobs || []),
    ...(aiHistory.codexJobs || []),
  ].sort((a, b) => String(b.time || '').localeCompare(String(a.time || ''))).slice(0, 4), [aiHistory]);

  const settingsSeeThrough = Math.min(60, Math.max(0, Number(settings.islandSeeThrough ?? 4)));
  const settingsBgOpacity = Math.max(0.32, 1 - (settingsSeeThrough / 100) * 0.95).toFixed(2);

  return (
    <LanguageProvider language={settings.language}>
    <div
      className={`twocode-settings-window ${settingsSeeThrough > 0 ? 'is-see-through' : ''}`}
      style={{ '--island-bg-opacity': settingsBgOpacity }}
    >
      {/* ============================================================
          LEFT SIDEBAR NAVIGATION
          ============================================================ */}
      <aside className="settings-sidebar">
        <div className="sidebar-brand-row">
          <div className="brand-logo-wrap">
            <div className="brand-robo-icon">
              <span />
              <span />
              <i className="brand-gear-badge">⚙</i>
            </div>
            <div className="brand-text-col">
              <strong>Bedo</strong>
              <span>{t('settings.subtitle')}</span>
            </div>
          </div>
          <span className="beta-pill">v1.0</span>
        </div>

        <div className="sidebar-scroll-nav">
          <div className="nav-section-group">
            <span className="nav-section-label">{t('settings.navGroup.twocode')}</span>
            {[
              { id: 'home', label: t('settings.nav.home'), icon: Home },
              { id: 'connections', label: t('settings.nav.connections'), icon: Plug },
              { id: 'aichat', label: t('settings.nav.aichat'), icon: MessageSquare },
              { id: 'apps', label: t('settings.nav.apps'), icon: LayoutGrid },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-btn ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => setActivePage(item.id)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="nav-section-group">
            <span className="nav-section-label">{t('settings.navGroup.robo')}</span>
            {[
              { id: 'robo', label: t('settings.nav.robo'), icon: Bot },
              { id: 'bedochat', label: t('settings.nav.bedochat'), icon: Clock },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-btn ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => setActivePage(item.id)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="nav-section-group">
            <span className="nav-section-label">{t('settings.navGroup.settings')}</span>
            {[
              { id: 'general', label: t('settings.nav.general'), icon: SlidersHorizontal },
              { id: 'typography', label: t('settings.nav.typography'), icon: Type },
              { id: 'notifications', label: t('settings.nav.notifications'), icon: Bell },
              { id: 'island', label: t('settings.nav.island'), icon: PanelTop },
              { id: 'focusguard', label: t('settings.nav.focusguard'), icon: Shield },
              { id: 'gameopt', label: t('settings.nav.gameopt'), icon: Gamepad2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-btn ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => setActivePage(item.id)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer-robo" onClick={() => setActivePage('robo')}>
          <div className="mini-robo-crown-box">
            <RoboCrownAvatar
              outfit={settings.outfit}
              size={34}
              eyeHex={settings.eyeColorHex || '#ffffff'}
              bodyColor={settings.bodyColor || 'Cloud'}
            />
          </div>
          <div className="mini-robo-meta">
            <strong>Bedo</strong>
            <span>{t('settings.tasksDone', { count: aiHistory.jobsToday || 2 })}</span>
          </div>
          <button
            type="button"
            className="sidebar-theme-btn"
            onClick={(e) => e.stopPropagation()}
            title={t('settings.theme')}
          >
            <Sun size={15} />
          </button>
        </div>
      </aside>

      {/* ============================================================
          RIGHT MAIN AREA (HERO BANNER + SCROLLABLE PAGE CONTENT)
          ============================================================ */}
      <div className="settings-main-area">
        {/* TOP HERO BANNER WITH LIVE NOTCH PREVIEW & WINDOW CONTROLS */}
        <header
          className={`settings-hero-banner ${
            activePage === 'notifications' || activePage === 'bedochat' ? 'compact-banner' : ''
          }`}
        >
          {/* Draggable titlebar region */}
          <div className="settings-window-dragbar" />

          {/* Window Minimize / Maximize / Close controls */}
          <div className="settings-win-controls">
            <button
              type="button"
              onClick={() => window.twocode?.settingsWindowControl?.('minimize')}
              title={t('settings.win.minimize')}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => window.twocode?.settingsWindowControl?.('maximize')}
              title={t('settings.win.maximize')}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              className="close-btn"
              onClick={() => window.twocode?.settingsWindowControl?.('close')}
              title={t('settings.win.close')}
            >
              <X size={15} />
            </button>
          </div>

          {/* Center Top Notch Preview inside the Hero Banner */}
          <div
            className="hero-notch-preview clock-notch-preview"
            style={{ '--hero-eye-color': settings.eyeColorHex || '#ffffff' }}
          >
            {liveMedia && liveMedia.hasSession && liveMedia.isPlaying ? (
              <>
                <div className="hero-media-top-pill">
                  {liveMedia.thumbnail && (
                    <img src={liveMedia.thumbnail} alt="" className="hero-preview-thumb" />
                  )}
                  <span className="hero-preview-song">{liveMedia.title}</span>
                  <div className="hero-preview-eq">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="hero-notch-clock">{formatTimeHHMM(now)}</div>
              </>
            ) : (
              <>
                <div className="hero-notch-eyes" aria-hidden="true">
                  <i />
                  <i />
                </div>
                <div className="hero-notch-clock">{formatTimeHHMM(now)}</div>
                <span className="hero-notch-date">{formatDateTop(now)}</span>
              </>
            )}
          </div>

          {/* Page Title & Subtitle at Bottom of Banner */}
          <div className="hero-banner-bottom">
            <div className="hero-title-col">
              <h1>{headerInfo.title}</h1>
              {headerInfo.subtitle && <p>{headerInfo.subtitle}</p>}
            </div>

            {headerInfo.hasSearch && (
              <div className="hero-search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder={t('settings.searchPlaceholder')}
                  value={pageSearch}
                  onChange={(e) => setPageSearch(e.target.value)}
                />
              </div>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            className="settings-page-motion"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
          >
        {/* ============================================================
            PAGE 1: HOME (Liquid Glass Bento Redesign)
            ============================================================ */}
        {activePage === 'home' && (
          <div className="settings-page-body home-lg-page">
            {/* Hero Welcome + Agent Pills */}
            <motion.section
              className="home-lg-hero"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            >
              <div className="home-lg-hero-glow" aria-hidden="true" />
              <div className="home-lg-hero-copy">
                <h2 className="home-lg-greeting">
                  {settings.userName?.trim()
                    ? `${greetingTimeOfDay}, ${settings.userName.trim()}`
                    : greetingTimeOfDay}
                </h2>
                <p className="home-lg-sub">
                  {t('settings.home.sub')}
                </p>
              </div>
              <div className="home-lg-agents">
                <button type="button" className="home-lg-agent-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon claude">
                    <ProviderSymbol provider="claude" size={15} />
                  </span>
                  <strong>Claude Code</strong>
                  <span className="home-lg-agent-state">{t('settings.home.idle')}</span>
                </button>
                <button type="button" className="home-lg-agent-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon codex">
                    <ProviderSymbol provider="codex" size={15} />
                  </span>
                  <strong>Codex</strong>
                  <span className="home-lg-agent-state">{t('settings.home.idle')}</span>
                </button>
                <button type="button" className="home-lg-agent-pill is-live" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon gemini">
                    <RealAppIcon sc={{ id: 'settings-pill-gemini', type: 'gemini' }} size={14} />
                  </span>
                  <strong>Gemini</strong>
                  <span className="home-lg-agent-state is-active">{t('settings.home.active')}</span>
                </button>
                <button type="button" className="home-lg-agent-pill is-live" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon antigravity">
                    <ProviderSymbol provider="antigravity" size={14} />
                  </span>
                  <strong>Antigravity</strong>
                  <span className="home-lg-agent-state is-active">{t('settings.home.active')}</span>
                </button>
              </div>
            </motion.section>

            {/* 3-Column Liquid Glass Metrics */}
            <div className="home-lg-stats">
              <div className="home-lg-stat-card">
                <div className="stat-icon-sq green">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong>{aiHistory.jobsToday || 0}</strong>
                  <span>{t('settings.home.tasksDone')}</span>
                </div>
              </div>

              <div className="home-lg-stat-card">
                <div className="stat-icon-sq blue">
                  <Calendar size={16} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong>{aiHistory.jobsToday || 0}</strong>
                  <span>{t('settings.home.today')}</span>
                </div>
              </div>

              <div className="home-lg-stat-card">
                <div className="stat-icon-sq amber">
                  <Flame size={16} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong>1</strong>
                  <span>{t('settings.home.daysStreak')}</span>
                </div>
              </div>
            </div>

            {/* 2-Column Bento: Activity + Quick Links */}
            <div className="home-lg-bento">
              <div className="home-lg-activity-col">
                <div className="home-lg-activity-head">
                  <h3>{t('settings.home.activity')}</h3>
                  <div className="home-lg-search-wrap">
                    <Search size={13} aria-hidden="true" />
                    <input
                      type="text"
                      className="home-lg-search-input"
                      placeholder={t('settings.home.searchActivity')}
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="home-lg-glass-card home-lg-activity-card">
                  <span className="home-lg-day-label">{t('common.today')}</span>
                  <div className="home-lg-activity-list">
                    {filteredActivities.slice(0, 8).map((job, idx) => {
                      const agent = (job.agent || '').toLowerCase();
                      const badgeClass = agent.includes('claude')
                        ? 'claude'
                        : agent.includes('gemini')
                        ? 'gemini'
                        : agent.includes('antigravity')
                        ? 'antigravity'
                        : 'codex';
                      const agentLabel = job.agent || (badgeClass === 'claude' ? 'Claude Code' : badgeClass === 'gemini' ? 'Gemini CLI' : badgeClass === 'antigravity' ? 'Antigravity' : 'Codex');
                      return (
                        <button
                          key={job.id || idx}
                          type="button"
                          className="home-lg-activity-row"
                          onClick={() => window.twocode?.focusAgentWindow?.({
                            agent: agentLabel,
                            file: job.file || '',
                            title: job.title || '',
                            conversationId: job.conversationId || job.threadId || '',
                          })}
                        >
                          <span className={`ai-badge-icon ${badgeClass}`}>
                            {badgeClass === 'gemini' ? (
                              <RealAppIcon sc={{ id: `activity-gemini-${idx}`, type: 'gemini' }} size={14} />
                            ) : (
                              <ProviderSymbol provider={badgeClass} size={14} />
                            )}
                          </span>
                          <div className="home-lg-activity-center">
                            <strong>{job.title}</strong>
                            <span>
                              {job.time} — {agentLabel} ({idx === 0 ? '2 s' : '1 s'})
                            </span>
                          </div>
                          <span className="home-lg-done-pill">{t('settings.home.done')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="home-lg-side-col">
                <div className="home-lg-glass-card home-lg-links-card">
                  <button
                    type="button"
                    className="home-lg-link-row"
                    onClick={() => setActivePage('wardrobe')}
                  >
                    <div className="ql-left">
                      <span className="ql-icon pink">
                        <Shirt size={15} />
                      </span>
                      <strong>{t('settings.nav.wardrobe')}</strong>
                    </div>
                    <ChevronRight size={15} />
                  </button>

                  <button
                    type="button"
                    className="home-lg-link-row"
                    onClick={() => setActivePage('connections')}
                  >
                    <div className="ql-left">
                      <span className="ql-icon green">
                        <Plug size={15} />
                      </span>
                      <strong>{t('settings.nav.connections')}</strong>
                    </div>
                    <ChevronRight size={15} />
                  </button>

                  <button
                    type="button"
                    className="home-lg-link-row"
                    onClick={() => setActivePage('general')}
                  >
                    <div className="ql-left">
                      <span className="ql-icon blue">
                        <SlidersHorizontal size={15} />
                      </span>
                      <strong>{t('settings.nav.general')}</strong>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="home-lg-glass-card home-lg-tip-card">
                  <div className="tip-header">
                    <Hand size={15} />
                    <strong>{t('settings.home.tipTitle')}</strong>
                  </div>
                  <p>
                    {t('settings.home.tipBody')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 2: CONNECTIONS (Liquid Glass Redesign)
            ============================================================ */}
        {activePage === 'connections' && (
          <div className="settings-page-body agents-lg-page">
            <motion.section
              className="agents-lg-hero"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            >
              <div className="agents-lg-hero-glow" aria-hidden="true" />
              <div className="agents-lg-hero-copy">
                <span className="agents-lg-eyebrow">{langCode === 'tr' ? 'YEREL AJAN MASANIZ' : 'YOUR LOCAL AGENT DESK'}</span>
                <h2>{langCode === 'tr' ? (<>Tüm ajanların,<br /><span>tek sessiz sinyal.</span></>) : (<>All your agents,<br /><span>one quiet signal.</span></>)}</h2>
                <p>{langCode === 'tr' ? 'Codex, Antigravity veya Claude Code düşünmeye başladığında ve yanıtı hazır olduğunda görün. Etkinlik bu PC’de kalır ve Ada’da görünür.' : 'See when Codex, Antigravity, or Claude Code starts thinking and when its answer is ready. Activity stays on this PC and appears in the Island.'}</p>
              </div>
              <div className="agents-lg-hero-action">
                <span className={`agents-lg-bridge-pill ${agentIntegration.codexConnected || agentIntegration.antigravityConnected || agentIntegration.claudeConnected ? 'is-ready' : ''}`}>
                  {agentIntegration.codexConnected || agentIntegration.antigravityConnected || agentIntegration.claudeConnected ? <Check size={12} strokeWidth={2.5} /> : <Plug size={12} />}
                  {agentIntegration.codexConnected || agentIntegration.antigravityConnected || agentIntegration.claudeConnected ? (langCode === 'tr' ? 'Köprü hazır' : 'Bridge ready') : (langCode === 'tr' ? 'Köprü bağlı değil' : 'Bridge not connected')}
                </span>
                <button type="button" className="agents-lg-connect-btn" onClick={connectAgentTools} disabled={agentIntegrationBusy}>
                  {agentIntegrationBusy ? <RefreshCw size={14} className="agent-spin-icon" /> : <Link2 size={14} />}
                  {agentIntegrationBusy ? (langCode === 'tr' ? 'Bağlanıyor…' : 'Connecting…') : (agentIntegration.codexConnected || agentIntegration.antigravityConnected || agentIntegration.claudeConnected) ? (langCode === 'tr' ? 'Kurulumu yenile' : 'Refresh setup') : (langCode === 'tr' ? 'Ajanları bağla' : 'Connect agents')}
                </button>
              </div>
            </motion.section>

            {agentIntegrationMessage && (
              <div className={`agent-integration-message ${/could not|not responding|yanıt vermiyor|bulunamad|kurulamad|başarısız|no installed/i.test(agentIntegrationMessage) ? 'error' : 'success'}`} role="status">
                {agentIntegrationMessage}
              </div>
            )}

            <div className="agents-lg-stats">
              <div className="home-lg-stat-card">
                <div className="stat-icon-sq blue">
                  <Link2 size={15} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong>{Number(Boolean(agentIntegration.codexConnected)) + Number(Boolean(agentIntegration.antigravityConnected)) + Number(Boolean(agentIntegration.claudeConnected))}<small> / 3</small></strong>
                  <span>{langCode === 'tr' ? 'kanca kurulu' : 'hooks installed'}</span>
                </div>
              </div>

              <div className="home-lg-stat-card">
                <div className="stat-icon-sq green">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong>{aiHistory.jobsToday || 0}</strong>
                  <span>{langCode === 'tr' ? 'bugünkü görev' : 'tasks today'}</span>
                </div>
              </div>

              <div className="home-lg-stat-card">
                <div className="stat-icon-sq pink">
                  <Bell size={15} />
                </div>
                <div className="home-lg-stat-meta">
                  <strong className="agents-lg-stat-text">{recentAgentJobs.length ? recentAgentJobs[0].agent : t('common.ready')}</strong>
                  <span>{recentAgentJobs.length ? (langCode === 'tr' ? `son aktif — ${recentAgentJobs[0].time}` : `last active — ${recentAgentJobs[0].time}`) : (langCode === 'tr' ? 'etkinlik bekleniyor' : 'waiting for activity')}</span>
                </div>
              </div>
            </div>

            <div className="agents-lg-grid">
              <section className="agents-lg-card">
                <div className="agents-lg-card-head">
                  <span className="ai-badge-icon lg codex"><ProviderSymbol provider="codex" size={20} /></span>
                  <div className="agents-lg-card-title">
                    <strong>Codex</strong>
                    <span>App / CLI / VS Code</span>
                  </div>
                  <span className={`agents-lg-status-pill ${agentIntegration.codexConnected ? 'is-ready' : ''}`}>
                    {agentIntegration.codexConnected && <Check size={11} strokeWidth={2.5} />}
                    {agentIntegration.codexConnected
                      ? (langCode === 'tr' ? 'Kanca hazır' : 'Hook ready')
                      : agentIntegration.codexInstalled
                        ? (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')
                        : (langCode === 'tr' ? 'Kurulu değil' : 'Not installed')}
                  </span>
                </div>
                <p className="agents-lg-card-desc">
                  {langCode === 'tr' ? 'Codex başladığında ve yanıt verdiğinde Ada’dan sinyal alın.' : 'Get an Island signal when Codex starts and replies.'}
                </p>
                <div className="agents-lg-card-detail">
                  <span>{langCode === 'tr' ? 'Yerel kanca' : 'Local hook'}</span>
                  <code>
                    {agentIntegration.codexConnected
                      ? (langCode === 'tr' ? 'Kuruldu — Codex’i yeniden başlatın' : 'Installed — restart Codex')
                      : agentIntegration.codexInstalled
                        ? '~/.codex/hooks.json'
                        : (langCode === 'tr' ? 'Bu PC’de Codex bulunamadı' : 'Codex not found on this PC')}
                  </code>
                </div>
              </section>

              <section className="agents-lg-card">
                <div className="agents-lg-card-head">
                  <span className="ai-badge-icon lg antigravity"><ProviderSymbol provider="antigravity" size={20} /></span>
                  <div className="agents-lg-card-title">
                    <strong>Antigravity</strong>
                    <span>{langCode === 'tr' ? 'Uygulama / Bağımsız IDE' : 'App / Standalone IDE'}</span>
                  </div>
                  <span className={`agents-lg-status-pill ${agentIntegration.antigravityConnected ? 'is-ready' : ''}`}>
                    {agentIntegration.antigravityConnected && <Check size={11} strokeWidth={2.5} />}
                    {agentIntegration.antigravityConnected
                      ? (langCode === 'tr' ? 'Kanca hazır' : 'Hook ready')
                      : agentIntegration.antigravityInstalled
                        ? (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')
                        : (langCode === 'tr' ? 'Kurulu değil' : 'Not installed')}
                  </span>
                </div>
                <p className="agents-lg-card-desc">
                  {langCode === 'tr' ? 'Uygulama ve IDE’deki düşünme ve tamamlanan yanıtları takip edin.' : 'Follow thinking and finished replies in the app and IDE.'}
                </p>
                <div className="agents-lg-card-detail">
                  <span>{langCode === 'tr' ? 'Genel kanca' : 'Global hook'}</span>
                  <code>
                    {agentIntegration.antigravityConnected
                      ? (langCode === 'tr' ? 'Kuruldu — Antigravity’yi yeniden başlatın' : 'Installed — restart Antigravity')
                      : agentIntegration.antigravityInstalled
                        ? '~/.gemini/config/hooks.json'
                        : (langCode === 'tr' ? 'Bu PC’de Antigravity bulunamadı' : 'Antigravity not found on this PC')}
                  </code>
                </div>
                <div className="agents-lg-card-actions">
                  <button type="button" className="agents-lg-btn-primary" onClick={chooseAntigravityIde}>
                    <Monitor size={13} /> {agentIntegration.antigravityIdePath ? (langCode === 'tr' ? 'IDE’yi değiştir' : 'Change IDE') : (langCode === 'tr' ? 'IDE’yi bul' : 'Locate IDE')}
                  </button>
                  {agentIntegration.antigravityIdePath && (
                    <button type="button" className="agents-lg-btn-ghost" onClick={() => window.twocode?.openApp?.({ type: 'native-app', path: agentIntegration.antigravityIdePath })}>
                      <ExternalLink size={13} /> {langCode === 'tr' ? 'IDE’yi aç' : 'Open IDE'}
                    </button>
                  )}
                </div>
              </section>

              <section className="agents-lg-card">
                <div className="agents-lg-card-head">
                  <span className="ai-badge-icon lg claude"><ProviderSymbol provider="claude" size={20} /></span>
                  <div className="agents-lg-card-title">
                    <strong>Claude Code</strong>
                    <span>CLI / Terminal / IDE</span>
                  </div>
                  <span className={`agents-lg-status-pill ${agentIntegration.claudeConnected ? 'is-ready' : ''}`}>
                    {agentIntegration.claudeConnected && <Check size={11} strokeWidth={2.5} />}
                    {agentIntegration.claudeConnected
                      ? (langCode === 'tr' ? 'Kanca hazır' : 'Hook ready')
                      : agentIntegration.claudeInstalled
                        ? (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')
                        : (langCode === 'tr' ? 'Kurulu değil' : 'Not installed')}
                  </span>
                </div>
                <p className="agents-lg-card-desc">
                  {langCode === 'tr' ? 'Claude Code düşünmeye başladığında ve yanıt verdiğinde Ada’dan anında haberdar olun.' : 'Get an instant Island signal when Claude Code starts thinking and replies.'}
                </p>
                <div className="agents-lg-card-detail">
                  <span>{langCode === 'tr' ? 'Yerel kanca' : 'Local hook'}</span>
                  <code>
                    {agentIntegration.claudeConnected
                      ? (langCode === 'tr' ? 'Kuruldu — Claude Code’u yeniden başlatın' : 'Installed — restart Claude Code')
                      : agentIntegration.claudeInstalled
                        ? '~/.claude/settings.json'
                        : (langCode === 'tr' ? 'Bu PC’de Claude Code bulunamadı' : 'Claude Code not found on this PC')}
                  </code>
                </div>
              </section>
            </div>

            <div className="agents-lg-footnote">
              <RefreshCw size={12} /> {langCode === 'tr' ? 'Mevcut kanca ayarları korunur. Codex yeni kancayı bir kez incelemenizi ister.' : 'Existing hook settings are preserved. Codex asks you to review the new hook once.'}
            </div>

            <section className="home-lg-glass-card agents-lg-activity">
              <div className="agents-lg-activity-head">
                <div>
                  <span className="agents-lg-eyebrow">{langCode === 'tr' ? 'CANLI ETKİNLİK' : 'LIVE ACTIVITY'}</span>
                  <strong>{langCode === 'tr' ? 'Son ajan çalışmaları' : 'Recent agent work'}</strong>
                </div>
                <span className="home-lg-done-pill">{langCode === 'tr' ? `${recentAgentJobs.length} kayıt` : `${recentAgentJobs.length} recent`}</span>
              </div>
              {recentAgentJobs.length ? (
                <div className="home-lg-activity-list">
                  {recentAgentJobs.slice(0, 4).map((job, index) => {
                    const antigravityJob = (job.agent || '').toLowerCase().includes('antigravity');
                    const providerKey = antigravityJob ? 'antigravity' : 'codex';
                    return (
                      <button
                        type="button"
                        className="home-lg-activity-row"
                        key={job.id || `${job.time}-${index}`}
                        onClick={() => window.twocode?.focusAgentWindow?.({
                          agent: job.agent || 'Agent',
                          file: job.file || '',
                          title: job.title || '',
                          conversationId: job.conversationId || job.threadId || '',
                        })}
                      >
                        <span className={`ai-badge-icon ${providerKey}`}>
                          <ProviderSymbol provider={providerKey} size={14} />
                        </span>
                        <div className="home-lg-activity-center">
                          <strong>{job.title}</strong>
                          <span>{job.agent || 'Agent'} — {job.time || (langCode === 'tr' ? 'Yakın zamanda' : 'Recently')}</span>
                        </div>
                        <span className="home-lg-done-pill">{t('common.done')}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="agent-activity-empty">
                  <span><Bot size={16} /></span>
                  <div>
                    <strong>{langCode === 'tr' ? 'Henüz ajan etkinliği yok' : 'No agent activity yet'}</strong>
                    <small>{langCode === 'tr' ? 'Bir ajan bağladığınızda tamamlanan görevleri burada görünür.' : 'Connect an agent and its finished tasks will show up here.'}</small>
                  </div>
                </div>
              )}
            </section>

            {/* Google hesabı (BAĞLI HESAPLAR) geçici olarak yorum satırına alındı
            <span className="section-eyebrow">{langCode === 'tr' ? 'BAĞLI HESAPLAR' : 'LINKED'}</span>
            <div className="home-lg-glass-card settings-card">
              <div className="settings-row">
                <div className="row-left-with-icon">
                  <span className="google-g-circle">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  </span>
                  <div className="row-text-col">
                    <strong>
                      {settings.googleConnected ? settings.googleEmail : 'Google'}
                    </strong>
                    <span>
                      {settings.googleConnected ? (langCode === 'tr' ? 'Google hesabı · Bağlı' : 'Google account · Connected') : (langCode === 'tr' ? 'Takvim ve Gmail' : 'Calendar and Gmail')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dark-pill-btn"
                  disabled={isConnectingGoogle}
                  onClick={async () => {
                    if (settings.googleConnected) {
                      await window.twocode?.disconnectGoogle?.();
                      updateSetting({ googleConnected: false, googleEmail: '' });
                    } else {
                      setIsConnectingGoogle(true);
                      try {
                        const res = await window.twocode?.connectGoogle?.();
                        if (res?.connected && res?.account) {
                          updateSetting({ googleConnected: true, googleEmail: res.account });
                        }
                      } catch (err) {
                        console.error('Google connect error:', err);
                      } finally {
                        setIsConnectingGoogle(false);
                      }
                    }
                  }}
                >
                  {settings.googleConnected
                    ? (langCode === 'tr' ? 'Bağlantıyı kes' : 'Disconnect')
                    : isConnectingGoogle
                    ? (langCode === 'tr' ? 'Bağlanıyor...' : 'Connecting...')
                    : (langCode === 'tr' ? 'Bağla' : 'Connect')}
                </button>
              </div>

              {!settings.googleConnected && (
                <div className="settings-row google-link-input-row" style={{ paddingTop: 0, paddingBottom: 14 }}>
                  <input
                    type="email"
                    className="settings-input full google-email-field"
                    placeholder="example@gmail.com"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && accountEmail.trim()) {
                        setIsConnectingGoogle(true);
                        try {
                          const res = await window.twocode?.connectGoogle?.({ email: accountEmail.trim() });
                          if (res?.connected && res?.account) {
                            updateSetting({ googleConnected: true, googleEmail: res.account });
                            setAccountEmail('');
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsConnectingGoogle(false);
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="link-account-blue-btn"
                    disabled={isConnectingGoogle || !accountEmail.trim()}
                    onClick={async () => {
                      if (!accountEmail.trim()) return;
                      setIsConnectingGoogle(true);
                      try {
                        const res = await window.twocode?.connectGoogle?.({ email: accountEmail.trim() });
                        if (res?.connected && res?.account) {
                          updateSetting({ googleConnected: true, googleEmail: res.account });
                          setAccountEmail('');
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setIsConnectingGoogle(false);
                      }
                    }}
                  >
                    {isConnectingGoogle ? (langCode === 'tr' ? 'Bağlanıyor...' : 'Linking...') : (langCode === 'tr' ? 'Hesabı bağla' : 'Link account')}
                  </button>
                </div>
              )}

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Takvim' : 'Calendar'}</strong>
                  <span>{langCode === 'tr' ? 'Etkinlikleri gör ve ekle' : 'See and add events'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.calEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ calEnabled: !settings.calEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Yeni posta' : 'New mail'}</strong>
                  <span>{langCode === 'tr' ? 'Yalnızca kaç adet olduğu. Kimden veya ne olduğu değil' : 'Only how many. Not who, and not what'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.newMailEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ newMailEnabled: !settings.newMailEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Dosya postala' : 'Mail a file'}</strong>
                  <span>{langCode === 'tr' ? 'Yalnızca Gönder’e bastığınızda' : 'Only when you press Send'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.mailFileEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ mailFileEnabled: !settings.mailFileEnabled })}
                >
                  <i />
                </button>
              </div>
            </div>
            */}

            <span className="section-eyebrow" style={{ marginTop: 22 }}>
              {langCode === 'tr' ? 'KODLAMA YAPAY ZEKASI' : 'CODING AI'}
            </span>
            <div className="settings-card">
              {/* 1. Claude Code */}
              <div className="settings-row align-top">
                <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                  <span className="ai-badge-icon lg claude">
                    <ProviderSymbol provider="claude" size={22} />
                  </span>
                  <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                    <strong>Claude Code</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Terminalde, VS Code’da ve Claude uygulamasının Code sekmesinde Claude Code’u takip eder. Aşağıdaki API anahtarı Bedo sohbeti içindir; izleme için gerekmez.'
                        : 'Follows Claude Code in the terminal, in VS Code and in the Code tab of the Claude app. The API key below is for Bedo chat; it is not needed for monitoring.'}
                    </span>
                    <em className="amber-notice-text">
                      {langCode === 'tr'
                        ? 'Henüz görev gelmedi. Claude Code’u kapatıp yeniden açın (yeni sohbet), ardından bir görev verin. Eski sürüm mü? Şununla güncelleyin: claude update'
                        : 'No task has come in yet. Close Claude Code and open it again (a new chat), then give it a task. An old version? Update it with: claude update'}
                    </em>

                    <div className="ai-api-key-box">
                      <button
                        type="button"
                        className="ai-get-key-btn"
                        onClick={() =>
                          window.twocode?.openExternal?.('https://console.anthropic.com/settings/keys')
                        }
                        title={langCode === 'tr' ? "Anthropic Console'a git ve API anahtarı oluştur" : 'Go to Anthropic Console and create an API key'}
                      >
                        <ExternalLink size={12} />
                        <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                      </button>
                      <div className="ai-api-key-input-wrap">
                        <input
                          type={showKeyClaude ? 'text' : 'password'}
                          className="ai-api-key-input"
                          placeholder="sk-ant-api03-..."
                          value={settings.claudeApiKey || ''}
                          onChange={(e) => {
                            updateSetting({ claudeApiKey: e.target.value.trim() });
                            setKeyVerify((prev) => ({ ...prev, claude: null }));
                          }}
                        />
                        <button
                          type="button"
                          className="ai-api-key-eye-btn"
                          onClick={() => setShowKeyClaude(!showKeyClaude)}
                          title={showKeyClaude ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                        >
                          {showKeyClaude ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      {settings.claudeApiKey ? (
                        <button
                          type="button"
                          className={`key-verify-btn ${keyVerify.claude?.state === 'ok' ? 'is-ok' : keyVerify.claude?.state === 'error' ? 'is-err' : ''}`}
                          onClick={() => verifyProviderKey('claude', settings.claudeApiKey)}
                          disabled={keyVerify.claude?.state === 'checking'}
                        >
                          {keyVerify.claude?.state === 'checking'
                            ? (langCode === 'tr' ? 'Kontrol...' : 'Testing...')
                            : keyVerify.claude?.state === 'ok'
                              ? (langCode === 'tr' ? '✓ Bağlandı' : '✓ Connected')
                              : keyVerify.claude?.state === 'error'
                                ? (langCode === 'tr' ? '✕ Geçersiz' : '✕ Invalid')
                                : (langCode === 'tr' ? 'Test Et' : 'Test')}
                        </button>
                      ) : null}
                    </div>
                    {keyVerify.claude?.state === 'error' && keyVerify.claude?.detail && (
                      <div className="key-verify-error">{keyVerify.claude.detail}</div>
                    )}
                  </div>
                </div>
                <div className="row-right-group">
                  <span
                    className={`status-badge ${settings.claudeApiKey ? 'green' : 'amber'}`}
                  >
                      {settings.claudeApiKey ? (langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved') : (langCode === 'tr' ? 'Anahtar bekleniyor' : 'Waiting for key')}
                  </span>
                  <button
                    type="button"
                    className={`settings-switch ${settings.claudeEnabled ? 'on' : ''}`}
                    onClick={() => updateSetting({ claudeEnabled: !settings.claudeEnabled })}
                  >
                    <i />
                  </button>
                </div>
              </div>

              {/* 2. Codex */}
              <div className="settings-row align-top">
                <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                  <span className="ai-badge-icon lg codex">
                    <ProviderSymbol provider="codex" size={22} />
                  </span>
                  <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                    <strong>Codex</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Sizin için kod yazarken OpenAI Codex’i (uygulama, terminal veya VS Code) takip eder. Aşağıdaki API anahtarı Bedo sohbeti içindir; Codex oturumu API erişimi sağlamaz.'
                        : 'Follows OpenAI Codex (the app, the terminal or VS Code) while it codes for you. The API key below is for Bedo chat; Codex sign-in does not provide API access.'}
                    </span>

                    <div className="ai-api-key-box">
                      <button
                        type="button"
                        className="ai-get-key-btn"
                        onClick={() =>
                          window.twocode?.openExternal?.('https://platform.openai.com/api-keys')
                        }
                        title={langCode === 'tr' ? "OpenAI Platform'a git ve API anahtarı oluştur" : 'Go to OpenAI Platform and create an API key'}
                      >
                        <ExternalLink size={12} />
                        <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                      </button>
                      <div className="ai-api-key-input-wrap">
                        <input
                          type={showKeyCodex ? 'text' : 'password'}
                          className="ai-api-key-input"
                          placeholder="sk-proj-..."
                          value={settings.codexApiKey || ''}
                          onChange={(e) => {
                            updateSetting({ codexApiKey: e.target.value.trim() });
                            setKeyVerify((prev) => ({ ...prev, openai: null }));
                          }}
                        />
                        <button
                          type="button"
                          className="ai-api-key-eye-btn"
                          onClick={() => setShowKeyCodex(!showKeyCodex)}
                          title={showKeyCodex ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                        >
                          {showKeyCodex ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      {settings.codexApiKey ? (
                        <button
                          type="button"
                          className={`key-verify-btn ${keyVerify.openai?.state === 'ok' ? 'is-ok' : keyVerify.openai?.state === 'error' ? 'is-err' : ''}`}
                          onClick={() => verifyProviderKey('openai', settings.codexApiKey)}
                          disabled={keyVerify.openai?.state === 'checking'}
                        >
                          {keyVerify.openai?.state === 'checking'
                            ? (langCode === 'tr' ? 'Kontrol...' : 'Testing...')
                            : keyVerify.openai?.state === 'ok'
                              ? (langCode === 'tr' ? '✓ Bağlandı' : '✓ Connected')
                              : keyVerify.openai?.state === 'error'
                                ? (langCode === 'tr' ? '✕ Geçersiz' : '✕ Invalid')
                                : (langCode === 'tr' ? 'Test Et' : 'Test')}
                        </button>
                      ) : null}
                    </div>
                    {keyVerify.openai?.state === 'error' && keyVerify.openai?.detail && (
                      <div className="key-verify-error">{keyVerify.openai.detail}</div>
                    )}
                  </div>
                </div>
                <div className="row-right-group">
                  <span
                    className={`status-badge ${settings.codexApiKey ? 'green' : 'amber'}`}
                  >
                      {settings.codexApiKey ? (langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved') : (langCode === 'tr' ? 'Anahtar bekleniyor' : 'Waiting for key')}
                  </span>
                  <button
                    type="button"
                    className={`settings-switch ${settings.codexEnabled ? 'on' : ''}`}
                    onClick={() => updateSetting({ codexEnabled: !settings.codexEnabled })}
                  >
                    <i />
                  </button>
                </div>
              </div>

              {/* 3. Gemini CLI */}
              <div className="settings-row align-top">
                <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                  <span className="ai-badge-icon lg gemini">
                    <RealAppIcon sc={{ id: 'settings-cli-gemini', type: 'gemini' }} size={22} />
                  </span>
                  <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                    <strong>Gemini CLI</strong>
                    <span>
                      {langCode === 'tr' ? 'Terminal ve VS Code oturumlarında Google Gemini CLI’ı takip eder.' : 'Follows Google Gemini CLI in the terminal and VS Code sessions.'}
                    </span>

                    <div className="ai-api-key-box">
                      <button
                        type="button"
                        className="ai-get-key-btn"
                        onClick={() =>
                          window.twocode?.openExternal?.('https://aistudio.google.com/app/apikey')
                        }
                        title={langCode === 'tr' ? "Google AI Studio'dan Ücretsiz Gemini API anahtarı al" : 'Get a free Gemini API key from Google AI Studio'}
                      >
                        <ExternalLink size={12} />
                        <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                      </button>
                      <div className="ai-api-key-input-wrap">
                        <input
                          type={showKeyGemini ? 'text' : 'password'}
                          className="ai-api-key-input"
                          placeholder="AIzaSy... / AQ...."
                          value={settings.geminiApiKey || ''}
                          onChange={(e) => {
                            updateSetting({ geminiApiKey: e.target.value.trim() });
                            setKeyVerify((prev) => ({ ...prev, gemini: null }));
                          }}
                        />
                        <button
                          type="button"
                          className="ai-api-key-eye-btn"
                          onClick={() => setShowKeyGemini(!showKeyGemini)}
                          title={showKeyGemini ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                        >
                          {showKeyGemini ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      {settings.geminiApiKey ? (
                        <button
                          type="button"
                          className={`key-verify-btn ${keyVerify.gemini?.state === 'ok' ? 'is-ok' : keyVerify.gemini?.state === 'error' ? 'is-err' : ''}`}
                          onClick={() => verifyProviderKey('gemini', settings.geminiApiKey)}
                          disabled={keyVerify.gemini?.state === 'checking'}
                        >
                          {keyVerify.gemini?.state === 'checking'
                            ? (langCode === 'tr' ? 'Kontrol...' : 'Testing...')
                            : keyVerify.gemini?.state === 'ok'
                              ? (langCode === 'tr' ? '✓ Bağlandı' : '✓ Connected')
                              : keyVerify.gemini?.state === 'error'
                                ? (langCode === 'tr' ? '✕ Geçersiz' : '✕ Invalid')
                                : (langCode === 'tr' ? 'Test Et' : 'Test')}
                        </button>
                      ) : null}
                    </div>
                    {keyVerify.gemini?.state === 'error' && keyVerify.gemini?.detail && (
                      <div className="key-verify-error">{keyVerify.gemini.detail}</div>
                    )}
                  </div>
                </div>
                <div className="row-right-group">
                  <span
                    className={`status-badge ${settings.geminiApiKey ? 'green' : 'amber'}`}
                  >
                      {settings.geminiApiKey ? (langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved') : (langCode === 'tr' ? 'Anahtar bekleniyor' : 'Waiting for key')}
                  </span>
                  <button
                    type="button"
                    className={`settings-switch ${settings.geminiEnabled !== false ? 'on' : ''}`}
                    onClick={() =>
                      updateSetting({
                        geminiEnabled: settings.geminiEnabled === false ? true : false,
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
              </div>

              {/* 4. Antigravity */}
              <div className="settings-row align-top">
                <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                  <span className="ai-badge-icon lg antigravity">
                    <ProviderSymbol provider="antigravity" size={20} />
                  </span>
                  <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                    <strong>Antigravity</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Yerel etkinlik kancası üzerinden Antigravity uygulamasını ve bağımsız IDE’yi izler.'
                        : 'Monitors Antigravity App and the standalone IDE through the local activity hook.'}
                    </span>
                  </div>
                </div>
                <div className="row-right-group">
                  <span className={`status-badge ${agentIntegration.antigravityConnected ? 'green' : 'amber'}`}>
                    {agentIntegration.antigravityConnected ? (langCode === 'tr' ? 'Kanca kurulu' : 'Hook installed') : (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')}
                  </span>
                  <button
                    type="button"
                    className={`settings-switch ${
                      settings.antigravityEnabled !== false ? 'on' : ''
                    }`}
                    onClick={() =>
                      updateSetting({
                        antigravityEnabled: settings.antigravityEnabled === false ? true : false,
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 3: AI & CHAT (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'aichat' && (() => {
          const voiceOptions = [
            { id: 'Charon', tr: 'Varsayılan • Derin', en: 'Default • Deep' },
            { id: 'Fenrir', tr: 'Net • Güçlü', en: 'Crisp • Strong' },
            { id: 'Puck', tr: 'Dinamik • Genç', en: 'Dynamic • Youthful' },
            { id: 'Aoede', tr: 'Yumuşak • Doğal', en: 'Soft • Natural' },
            { id: 'Kore', tr: 'Sıcak • Sakin', en: 'Warm • Calm' },
            { id: 'Zephyr', tr: 'Hafif • Akıcı', en: 'Light • Fluid' },
          ];
          const bedoIsReady = Boolean(bedoStatus.running && !bedoStatus.paused);
          const isBootstrappingPython = pythonBootstrap.state === 'downloading-python' || pythonBootstrap.state === 'installing-deps';
          const bedoPillLabel = !bedoStatus.available
            ? isBootstrappingPython
              ? (langCode === 'tr' ? 'Arka planda hazırlanıyor…' : 'Preparing runtime…')
              : (langCode === 'tr' ? 'Köprü bulunamadı' : 'Bridge missing')
            : !bedoStatus.running
              ? (langCode === 'tr' ? 'Çevrimdışı' : 'Offline')
              : bedoStatus.paused
                ? (langCode === 'tr' ? 'Uyku Modu' : 'Sleeping')
                : bedoStatus.jarvisState === 'SPEAKING'
                  ? (langCode === 'tr' ? 'Konuşuyor' : 'Speaking')
                  : bedoStatus.jarvisState === 'THINKING'
                    ? (langCode === 'tr' ? 'Düşünüyor' : 'Thinking')
                    : (langCode === 'tr' ? 'Dinliyor' : 'Listening');

          const handleToggleBedoService = async () => {
            if (bedoBusy) return;
            setBedoBusy(true);
            try {
              if (!bedoStatus.running) {
                const res = await window.twocode?.bedoStart?.({
                  startPaused: false,
                  enableWake: settings.bedoEnableWake !== false,
                  enableClap: false,
                });
                if (res?.status) setBedoStatus(res.status);
              } else {
                await window.twocode?.bedoSetPaused?.(!bedoStatus.paused);
              }
            } finally {
              setBedoBusy(false);
            }
          };

          const handleStopBedoService = async () => {
            if (bedoBusy || !bedoStatus.running) return;
            setBedoBusy(true);
            try {
              const res = await window.twocode?.bedoStop?.();
              if (res?.status) setBedoStatus(res.status);
            } finally {
              setBedoBusy(false);
            }
          };

          const pcmBase64ToPlayableUrl = (base64Data, mimeType = '') => {
            const bin = atob(base64Data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) {
              bytes[i] = bin.charCodeAt(i);
            }
            if (/audio\/(wav|mp3|mpeg|ogg|webm)/i.test(mimeType)) {
              return URL.createObjectURL(new Blob([bytes], { type: mimeType.split(';')[0] }));
            }
            const rateMatch = /rate=(\d+)/i.exec(mimeType);
            const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
            const buffer = new ArrayBuffer(44 + bytes.length);
            const view = new DataView(buffer);
            const writeStr = (offset, str) => {
              for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
            };
            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + bytes.length, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, bytes.length, true);
            new Uint8Array(buffer, 44).set(bytes);
            return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
          };

          const handleSelectBedoVoice = async (voiceId) => {
            updateSetting({ bedoVoice: voiceId });
            setVoicePreviewError('');
            if (voiceAudioRef.current) {
              try {
                voiceAudioRef.current.pause();
                voiceAudioRef.current.currentTime = 0;
              } catch {}
              voiceAudioRef.current = null;
            }
            setPreviewingVoice(voiceId);
            const cacheKey = `${voiceId}:${langCode}`;
            try {
              let audioUrl = voicePreviewCacheRef.current.get(cacheKey);
              if (!audioUrl) {
                const sampleText = langCode === 'tr'
                  ? 'Merhaba, ben Bedo. Senin için buradayım, nasıl yardımcı olabilirim?'
                  : "Hello, I'm Bedo. I'm right here for you, how can I help?";
                const res = await window.twocode?.bedoPreviewVoice?.({
                  voice: voiceId,
                  text: sampleText,
                });
                if (!res?.ok || !res?.data) {
                  setVoicePreviewError(res?.error || (langCode === 'tr' ? 'Ses önizlemesi çalınamadı.' : 'Could not play voice preview.'));
                  setPreviewingVoice('');
                  return;
                }
                audioUrl = pcmBase64ToPlayableUrl(res.data, res.mimeType);
                voicePreviewCacheRef.current.set(cacheKey, audioUrl);
              }
              const audio = new Audio(audioUrl);
              voiceAudioRef.current = audio;
              audio.onended = () => {
                setPreviewingVoice((curr) => (curr === voiceId ? '' : curr));
              };
              audio.onerror = () => {
                setPreviewingVoice((curr) => (curr === voiceId ? '' : curr));
              };
              await audio.play();
            } catch (err) {
              setVoicePreviewError(err?.message || (langCode === 'tr' ? 'Ses oynatılamadı.' : 'Audio playback failed.'));
              setPreviewingVoice('');
            }
          };

          return (
            <div className="settings-page-body ai-lg-page">
              {/* Liquid Glass Hero */}
              <section className="ai-lg-hero">
                <div className="ai-lg-hero-glow" aria-hidden="true" />
                <div className="ai-lg-hero-copy">
                  <span className="ai-lg-eyebrow">
                    {langCode === 'tr' ? 'BEDO & YAPAY ZEKA' : 'BEDO & AI'}
                  </span>
                  <h2>
                    {langCode === 'tr' ? 'Sesli Asistan' : 'Voice Assistant'}{' '}
                    <span>{langCode === 'tr' ? '& API Motoru' : '& AI Engine'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'Bedo’nun ses karakterini, uyandırma davranışını ve yapay zeka API anahtarlarını buradan yönetin.'
                      : 'Manage Bedo’s voice persona, wake behavior, and AI API keys from one place.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <span className={`ai-lg-status-pill ${bedoIsReady ? 'is-active' : bedoStatus.running ? 'is-standby' : ''}`}>
                    {bedoPillLabel}
                  </span>
                  <div className="ai-lg-hero-btns">
                    <button
                      type="button"
                      className="agents-lg-connect-btn"
                      disabled={bedoBusy || !bedoStatus.available}
                      onClick={handleToggleBedoService}
                    >
                      <Mic size={14} />
                      <span>
                        {!bedoStatus.running
                          ? (langCode === 'tr' ? 'Bedo’yu Başlat' : 'Start Bedo')
                          : bedoStatus.paused
                            ? (langCode === 'tr' ? 'Uyandır' : 'Wake Up')
                            : (langCode === 'tr' ? 'Uyku Moduna Al' : 'Put to Sleep')}
                      </span>
                    </button>
                    {bedoStatus.running && (
                      <button
                        type="button"
                        className="ai-lg-icon-btn"
                        disabled={bedoBusy}
                        onClick={handleStopBedoService}
                        title={langCode === 'tr' ? 'Servisi Durdur' : 'Stop Service'}
                      >
                        <Power size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Bedo Voice Persona */}
              <section className="ai-lg-card">
                <div className="ai-lg-card-head">
                  <div className="row-left-with-icon">
                    <span className="ai-lg-icon-badge violet">
                      <Volume2 size={17} />
                    </span>
                    <div className="row-text-col">
                      <strong>{langCode === 'tr' ? 'Bedo Ses Karakteri' : 'Bedo Voice Persona'}</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'Sesli yanıt verirken kullanılacak ton (değişince otomatik yeniden bağlanır)'
                          : 'Voice tone used for spoken replies (reconnects automatically on change)'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ai-lg-voice-grid">
                  {voiceOptions.map((voice) => {
                    const active = (settings.bedoVoice || 'Charon') === voice.id;
                    const isPreviewing = previewingVoice === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        className={`ai-lg-voice-btn ${active ? 'is-active' : ''} ${isPreviewing ? 'is-previewing' : ''}`}
                        onClick={() => handleSelectBedoVoice(voice.id)}
                      >
                        <div className="ai-lg-voice-top">
                          <strong>{voice.id}</strong>
                          {isPreviewing ? (
                            <span className="ai-lg-voice-check is-speaking" title={langCode === 'tr' ? 'Örnek cümle okunuyor...' : 'Playing sample...'}>
                              <Volume2 size={11} strokeWidth={2.4} />
                            </span>
                          ) : active ? (
                            <span className="ai-lg-voice-check">
                              <Check size={11} strokeWidth={2.6} />
                            </span>
                          ) : null}
                        </div>
                        <span>{langCode === 'tr' ? voice.tr : voice.en}</span>
                      </button>
                    );
                  })}
                </div>
                {voicePreviewError && (
                  <div className="ai-lg-voice-error">{voicePreviewError}</div>
                )}
              </section>

              {/* Behavior & Missing Settings */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Sesle Uyandırma (“Bedo”)' : 'Wake Word (“Bedo”)'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Arka planda “Bedo” kelimesini dinler ve seslendiğinizde adayı otomatik açar.'
                        : 'Listens for “Bedo” in the background and opens the island when called.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.bedoEnableWake !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ bedoEnableWake: settings.bedoEnableWake === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Konuşurken Medyayı Duraklat' : 'Pause Media When Listening'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Bedo uyandığında çalan müzik veya videoyu duraklatır, uyuduğunda devam ettirir.'
                        : 'Pauses playing music or video when Bedo wakes up and resumes when it sleeps.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.bedoPauseMedia !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ bedoPauseMedia: settings.bedoPauseMedia === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Açılışta Bedo’yu Hazır Beklet' : 'Auto-Start Bedo on Launch'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Bedo açıldığında ses servisini uyku modunda hazır başlatır.'
                        : 'Starts the Bedo voice service in standby automatically when Bedo launches.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.bedoAutoStart !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ bedoAutoStart: settings.bedoAutoStart === false })}
                  >
                    <i />
                  </button>
                </div>
              </section>

              {/* API Keys (All working & editable) */}
              <section className="ai-lg-card">
                {/* 1. Google Gemini */}
                <div className="settings-row align-top">
                  <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                    <span className="ai-badge-icon lg gemini">
                      <RealAppIcon sc={{ id: 'settings-api-gemini', type: 'gemini' }} size={22} />
                    </span>
                    <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                      <strong>Google Gemini API</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'Bedo sesli asistanı ve Gemini sohbeti için birincil motor.'
                          : 'Primary engine for Bedo voice assistant and Gemini chat.'}
                      </span>
                      <div className="ai-api-key-box">
                        <button
                          type="button"
                          className="ai-get-key-btn"
                          onClick={() => window.twocode?.openExternal?.('https://aistudio.google.com/app/apikey')}
                        >
                          <ExternalLink size={12} />
                          <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                        </button>
                        <div className="ai-api-key-input-wrap">
                          <input
                            type={showKeyGemini ? 'text' : 'password'}
                            className="ai-api-key-input"
                            placeholder="AIzaSy..."
                            value={settings.geminiApiKey || ''}
                            onChange={(e) => updateSetting({ geminiApiKey: e.target.value.trim() })}
                          />
                          <button
                            type="button"
                            className="ai-api-key-eye-btn"
                            onClick={() => setShowKeyGemini(!showKeyGemini)}
                            title={showKeyGemini ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                          >
                            {showKeyGemini ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                        {settings.geminiApiKey ? (
                          <span className="key-saved-pill">{langCode === 'tr' ? '✓ Kaydedildi' : '✓ Saved'}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="row-right-group">
                    <span className={`status-badge ${settings.geminiApiKey ? 'green' : 'amber'}`}>
                      {settings.geminiApiKey ? (langCode === 'tr' ? 'Kayıtlı' : 'Saved') : (langCode === 'tr' ? 'Gerekli' : 'Required')}
                    </span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.geminiEnabled !== false ? 'on' : ''}`}
                      onClick={() => updateSetting({ geminiEnabled: settings.geminiEnabled === false })}
                    >
                      <i />
                    </button>
                  </div>
                </div>

                {/* 2. Anthropic Claude */}
                <div className="settings-row align-top">
                  <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                    <span className="ai-badge-icon lg claude">
                      <ProviderSymbol provider="claude" size={22} />
                    </span>
                    <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                      <strong>Anthropic Claude API</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'İsteğe bağlı — Bedo’ya bağlı Claude destekli araç ve yanıtlar için.'
                          : 'Optional — for Claude-backed tools and replies inside Bedo.'}
                      </span>
                      <div className="ai-api-key-box">
                        <button
                          type="button"
                          className="ai-get-key-btn"
                          onClick={() => window.twocode?.openExternal?.('https://console.anthropic.com/settings/keys')}
                        >
                          <ExternalLink size={12} />
                          <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                        </button>
                        <div className="ai-api-key-input-wrap">
                          <input
                            type={showKeyClaude ? 'text' : 'password'}
                            className="ai-api-key-input"
                            placeholder="sk-ant-api03-..."
                            value={settings.claudeApiKey || ''}
                            onChange={(e) => updateSetting({ claudeApiKey: e.target.value.trim() })}
                          />
                          <button
                            type="button"
                            className="ai-api-key-eye-btn"
                            onClick={() => setShowKeyClaude(!showKeyClaude)}
                            title={showKeyClaude ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                          >
                            {showKeyClaude ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                        {settings.claudeApiKey ? (
                          <span className="key-saved-pill">{langCode === 'tr' ? '✓ Kaydedildi' : '✓ Saved'}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="row-right-group">
                    <span className={`status-badge ${settings.claudeApiKey ? 'green' : ''}`}>
                      {settings.claudeApiKey ? (langCode === 'tr' ? 'Kayıtlı' : 'Saved') : (langCode === 'tr' ? 'İsteğe bağlı' : 'Optional')}
                    </span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.claudeEnabled ? 'on' : ''}`}
                      onClick={() => updateSetting({ claudeEnabled: !settings.claudeEnabled })}
                    >
                      <i />
                    </button>
                  </div>
                </div>

                {/* 3. OpenAI / Codex */}
                <div className="settings-row align-top no-border">
                  <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                    <span className="ai-badge-icon lg codex">
                      <ProviderSymbol provider="codex" size={22} />
                    </span>
                    <div className="row-text-col" style={{ flex: 1, minWidth: 0 }}>
                      <strong>OpenAI API</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'İsteğe bağlı — Bedo’ya bağlı OpenAI destekli araç ve yanıtlar için.'
                          : 'Optional — for OpenAI-backed tools and replies inside Bedo.'}
                      </span>
                      <div className="ai-api-key-box">
                        <button
                          type="button"
                          className="ai-get-key-btn"
                          onClick={() => window.twocode?.openExternal?.('https://platform.openai.com/api-keys')}
                        >
                          <ExternalLink size={12} />
                          <span>{langCode === 'tr' ? 'API Anahtarı Al' : 'Get API Key'}</span>
                        </button>
                        <div className="ai-api-key-input-wrap">
                          <input
                            type={showKeyCodex ? 'text' : 'password'}
                            className="ai-api-key-input"
                            placeholder="sk-proj-..."
                            value={settings.codexApiKey || ''}
                            onChange={(e) => updateSetting({ codexApiKey: e.target.value.trim() })}
                          />
                          <button
                            type="button"
                            className="ai-api-key-eye-btn"
                            onClick={() => setShowKeyCodex(!showKeyCodex)}
                            title={showKeyCodex ? (langCode === 'tr' ? 'Gizle' : 'Hide') : (langCode === 'tr' ? 'Göster' : 'Show')}
                          >
                            {showKeyCodex ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                        {settings.codexApiKey ? (
                          <span className="key-saved-pill">{langCode === 'tr' ? '✓ Kaydedildi' : '✓ Saved'}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="row-right-group">
                    <span className={`status-badge ${settings.codexApiKey ? 'green' : ''}`}>
                      {settings.codexApiKey ? (langCode === 'tr' ? 'Kayıtlı' : 'Saved') : (langCode === 'tr' ? 'İsteğe bağlı' : 'Optional')}
                    </span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.codexEnabled ? 'on' : ''}`}
                      onClick={() => updateSetting({ codexEnabled: !settings.codexEnabled })}
                    >
                      <i />
                    </button>
                  </div>
                </div>
              </section>

              {/* Quick Jump to Bedo Chat History */}
              <section className="ai-lg-card">
                <button
                  type="button"
                  className="chat-lg-jump-row"
                  onClick={() => setActivePage('bedochat')}
                >
                  <div className="row-left-with-icon">
                    <span className="ai-lg-icon-badge sky">
                      <Clock size={16} />
                    </span>
                    <div className="row-text-col">
                      <strong>{langCode === 'tr' ? 'Bedo Sohbet Geçmişi' : 'Bedo Chat History'}</strong>
                      <span>
                        {langCode === 'tr'
                          ? `${bedoChatHistory.length} kayıtlı sohbet — yazılı, sesli ve ekran analizlerini görüntüle`
                          : `${bedoChatHistory.length} saved conversations — browse text, voice, and screen chats`}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>
              </section>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 3B: BEDO CHAT STUDIO (Gemini / GPT / Claude Style)
            ============================================================ */}
        {activePage === 'bedochat' && (() => {
          const isTr = langCode === 'tr';
          const q = chatHistorySearch.trim().toLowerCase();

          // Group entries into sessions (newest session first)
          const sessionMap = new Map();
          const chronoAll = [...bedoChatHistory]
            .filter((item) => item && (item.userText || item.assistantText))
            .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

          chronoAll.forEach((entry) => {
            const sid = entry.sessionId || 'sess_default';
            if (!sessionMap.has(sid)) {
              sessionMap.set(sid, {
                id: sid,
                title: '',
                items: [],
                lastTs: Number(entry.timestamp) || Date.now(),
              });
            }
            const sess = sessionMap.get(sid);
            sess.items.push(entry);
            sess.lastTs = Math.max(sess.lastTs, Number(entry.timestamp) || 0);
            if (!sess.title && entry.userText) {
              sess.title = entry.userText.trim();
            }
          });

          const allSessions = Array.from(sessionMap.values())
            .map((s) => ({
              ...s,
              title: s.title || (isTr ? 'Yeni sohbet' : 'New chat'),
            }))
            .sort((a, b) => b.lastTs - a.lastTs);

          const visibleSessions = allSessions.filter((sess) => {
            const sourceMatch =
              chatHistoryFilter === 'all' ||
              sess.items.some((it) => (it.source || 'text') === chatHistoryFilter);
            if (!sourceMatch) return false;
            if (!q) return true;
            return (
              sess.title.toLowerCase().includes(q) ||
              sess.items.some(
                (it) =>
                  String(it.userText || '').toLowerCase().includes(q) ||
                  String(it.assistantText || '').toLowerCase().includes(q)
              )
            );
          });

          const activeSession = isNewChatDraft
            ? null
            : visibleSessions.find((s) => s.id === selectedChatSessionId) || null;

          const showWelcomeCanvas = (isNewChatDraft || !activeSession) && !chatSending;

          const activeMessages = activeSession
            ? activeSession.items.filter((it) => {
                if (chatHistoryFilter !== 'all' && (it.source || 'text') !== chatHistoryFilter) {
                  return false;
                }
                if (!q) return true;
                return (
                  String(it.userText || '').toLowerCase().includes(q) ||
                  String(it.assistantText || '').toLowerCase().includes(q)
                );
              })
            : [];

          const availableProviders = [
            settings.geminiApiKey?.trim() ? { id: 'Gemini', label: 'Gemini' } : null,
            (settings.codexApiKey || settings.openaiApiKey)?.trim() ? { id: 'OpenAI', label: 'GPT' } : null,
            settings.claudeApiKey?.trim() ? { id: 'Claude', label: 'Claude' } : null,
          ].filter(Boolean);

          const effectiveProvider =
            chatProviderChoice !== 'auto' && availableProviders.some((p) => p.id === chatProviderChoice)
              ? chatProviderChoice
              : availableProviders[0]?.id || 'Gemini';

          const effectiveProviderLabel =
            availableProviders.find((p) => p.id === effectiveProvider)?.label || effectiveProvider;

          const formatChatTime = (ts) => {
            try {
              return new Date(Number(ts) || Date.now()).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              });
            } catch {
              return '';
            }
          };

          const filterLabels = {
            all: isTr ? 'Tümü' : 'All',
            text: isTr ? 'Metin' : 'Text',
            voice: isTr ? 'Sesli' : 'Voice',
            vision: isTr ? 'Ekran' : 'Screen',
          };

          const cycleFilter = () => {
            const order = ['all', 'text', 'voice', 'vision'];
            const next = order[(order.indexOf(chatHistoryFilter) + 1) % order.length];
            setChatHistoryFilter(next);
          };

          const cycleProvider = () => {
            if (availableProviders.length <= 1) return;
            const idx = availableProviders.findIndex((p) => p.id === effectiveProvider);
            const next = availableProviders[(idx + 1) % availableProviders.length];
            setChatProviderChoice(next.id);
          };

          const handleStartNewSession = async () => {
            setChatSendError('');
            setIsNewChatDraft(true);
            try {
              const res = await window.twocode?.newBedoChatSession?.();
              if (res?.sessionId) setSelectedChatSessionId(res.sessionId);
            } catch {}
          };

          const handleSelectSession = async (sessionId) => {
            setChatSendError('');
            setIsNewChatDraft(false);
            setSelectedChatSessionId(sessionId);
            try {
              await window.twocode?.selectBedoChatSession?.(sessionId);
            } catch {}
          };

          const handleDeleteSession = async (e, sessionId) => {
            e?.stopPropagation?.();
            try {
              const res = await window.twocode?.deleteBedoChatSession?.(sessionId);
              if (Array.isArray(res?.history)) setBedoChatHistory(res.history);
              else setBedoChatHistory((prev) => prev.filter((item) => item.sessionId !== sessionId));
              if (selectedChatSessionId === sessionId) {
                setSelectedChatSessionId(null);
                setIsNewChatDraft(true);
              }
            } catch {}
          };

          const handleSendFromStudio = async () => {
            const text = chatComposerText.trim();
            if (!text || chatSending) return;
            setChatSendError('');
            setChatComposerText('');

            let targetSid = activeSession?.id || null;
            if (showWelcomeCanvas || !targetSid) {
              // Create a brand-new isolated session ID immediately without racing session-new broadcast
              targetSid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              setSelectedChatSessionId(targetSid);
              setIsNewChatDraft(false);
            }
            setChatPendingUserText(text);
            setChatStreamingReply('');
            setChatSending(true);

            try {
              const res = await window.twocode?.askRobo?.({
                question: text,
                provider: effectiveProvider,
                sessionId: targetSid,
              });
              if (res?.error) {
                setChatSendError(res.error);
              } else {
                setIsNewChatDraft(false);
                if (targetSid) setSelectedChatSessionId(targetSid);
                const fresh = await window.twocode?.getBedoChatHistory?.();
                if (Array.isArray(fresh)) setBedoChatHistory(fresh);
                setTimeout(() => {
                  const el = chatThreadScrollRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                }, 40);
              }
            } catch (err) {
              setChatSendError(err?.message || (isTr ? 'Mesaj gönderilemedi.' : 'Could not send message.'));
            } finally {
              setChatPendingUserText('');
              setChatStreamingReply('');
              setChatSending(false);
            }
          };

          const handleCopyChat = (entry) => {
            const textToCopy = entry.assistantText || entry.userText || '';
            if (!textToCopy) return;
            try {
              navigator.clipboard?.writeText?.(textToCopy);
            } catch {}
            setCopiedChatId(entry.id);
            setTimeout(() => {
              setCopiedChatId((curr) => (curr === entry.id ? null : curr));
            }, 1400);
          };

          const handleDeleteChat = async (id) => {
            try {
              const res = await window.twocode?.deleteBedoChatEntry?.(id);
              if (Array.isArray(res?.history)) setBedoChatHistory(res.history);
              else setBedoChatHistory((prev) => prev.filter((item) => item.id !== id));
            } catch {}
          };

          const handleClearAllChats = async () => {
            if (!confirmClearChat) {
              setConfirmClearChat(true);
              setTimeout(() => setConfirmClearChat(false), 3500);
              return;
            }
            setConfirmClearChat(false);
            try {
              await window.twocode?.clearBedoChatHistory?.();
              setBedoChatHistory([]);
              setSelectedChatSessionId(null);
              setIsNewChatDraft(true);
            } catch {}
          };

          const renderComposer = (isHero) => (
            <div className={`chat-studio-composer ${isHero ? 'is-hero' : 'is-docked'}`}>
              <div className="chat-studio-bar-row">
                <button
                  type="button"
                  className="chat-studio-capture-btn"
                  onClick={() => window.twocode?.startBedoBuddy?.()}
                  title={isTr ? 'Ekrandan bölge seçip Bedo’ya sor' : 'Capture screen region for Bedo'}
                  aria-label={isTr ? 'Ekran yakala' : 'Capture screen'}
                >
                  <Scan size={14} />
                </button>
                <input
                  type="text"
                  className="chat-studio-input"
                  placeholder={
                    chatSending
                      ? (isTr ? 'Bedo yanıtlıyor...' : 'Bedo is replying...')
                      : (isTr ? 'Bedo’ya yaz...' : 'Message Bedo...')
                  }
                  value={chatComposerText}
                  disabled={chatSending}
                  onChange={(e) => setChatComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent?.isComposing) {
                      e.preventDefault();
                      handleSendFromStudio();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`chat-studio-send-btn ${chatComposerText.trim() && !chatSending ? 'is-ready' : ''}`}
                  disabled={!chatComposerText.trim() || chatSending}
                  onClick={handleSendFromStudio}
                  aria-label={isTr ? 'Gönder' : 'Send'}
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
              </div>
              {chatSendError && <div className="chat-studio-error">{chatSendError}</div>}
            </div>
          );

          return (
            <div className="settings-page-body chat-lg-page">
              <div className="chat-studio-shell">
                {/* LEFT SIDEBAR — Bedo Frosted Glass Sessions */}
                <aside className="chat-studio-sidebar">
                  <div className="chat-studio-sb-top">
                    <span className="chat-studio-sb-heading">
                      {isTr ? 'Sohbetler' : 'Chats'}
                      {allSessions.length > 0 && <em>{allSessions.length}</em>}
                    </span>
                    <div className="chat-studio-sb-tools">
                      <button
                        type="button"
                        className={`chat-studio-icon-btn ${chatSearchOpen ? 'is-active' : ''}`}
                        onClick={() => {
                          setChatSearchOpen((prev) => {
                            if (prev) setChatHistorySearch('');
                            return !prev;
                          });
                        }}
                        title={isTr ? 'Sohbetlerde ara' : 'Search chats'}
                      >
                        <Search size={13} />
                      </button>
                      <button
                        type="button"
                        className={`chat-studio-icon-btn ${chatHistoryFilter !== 'all' ? 'is-active' : ''}`}
                        onClick={cycleFilter}
                        title={`${isTr ? 'Filtre' : 'Filter'}: ${filterLabels[chatHistoryFilter]}`}
                      >
                        <ListFilter size={13} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`chat-studio-new-btn ${showWelcomeCanvas ? 'is-active' : ''}`}
                    onClick={handleStartNewSession}
                  >
                    <PenSquare size={13} />
                    <span>{isTr ? 'Yeni Sohbet' : 'New Chat'}</span>
                  </button>

                  {chatSearchOpen && (
                    <div className="home-lg-search-wrap chat-lg-sb-search">
                      <Search size={12} aria-hidden="true" />
                      <input
                        type="text"
                        className="home-lg-search-input"
                        placeholder={isTr ? 'Ara...' : 'Search...'}
                        value={chatHistorySearch}
                        onChange={(e) => setChatHistorySearch(e.target.value)}
                        autoFocus
                      />
                      {chatHistorySearch && (
                        <button
                          type="button"
                          className="chat-lg-search-clear"
                          onClick={() => setChatHistorySearch('')}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )}

                  {chatHistoryFilter !== 'all' && (
                    <div className="chat-studio-active-filter">
                      <span>{filterLabels[chatHistoryFilter]}</span>
                      <button type="button" onClick={() => setChatHistoryFilter('all')}>
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  <div className="chat-studio-sb-list">
                    {visibleSessions.length === 0 ? (
                      <div className="chat-lg-sb-empty">
                        {isTr ? 'Henüz sohbet yok' : 'No chats yet'}
                      </div>
                    ) : (
                      visibleSessions.map((sess) => {
                        const isActive = !showWelcomeCanvas && activeSession?.id === sess.id;
                        return (
                          <div
                            key={sess.id}
                            role="button"
                            tabIndex={0}
                            className={`chat-studio-sb-item ${isActive ? 'is-active' : ''}`}
                            onClick={() => handleSelectSession(sess.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectSession(sess.id);
                              }
                            }}
                          >
                            <span className="chat-studio-sb-title">{sess.title}</span>
                            <button
                              type="button"
                              className="chat-lg-sb-del"
                              onClick={(e) => handleDeleteSession(e, sess.id)}
                              title={isTr ? 'Sohbeti sil' : 'Delete chat'}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {allSessions.length > 0 && (
                    <div className="chat-lg-sb-footer">
                      <button
                        type="button"
                        className={`chat-lg-clear-btn ${confirmClearChat ? 'is-confirm' : ''}`}
                        onClick={handleClearAllChats}
                      >
                        <Trash2 size={12} />
                        <span>
                          {confirmClearChat
                            ? (isTr ? 'Emin misin? Tekrar tıkla' : 'Confirm clear all')
                            : (isTr ? 'Geçmişi Temizle' : 'Clear History')}
                        </span>
                      </button>
                    </div>
                  )}
                </aside>

                {/* RIGHT STAGE — Bedo Liquid Glass Welcome or Active Thread */}
                <section className="chat-studio-stage">
                  <div className="chat-studio-ambient" aria-hidden="true" />

                  {showWelcomeCanvas ? (
                    <div className="chat-studio-welcome">
                      <div className="chat-studio-bedo-emblem" aria-hidden="true">
                        <span />
                        <span />
                      </div>
                      <div className="chat-studio-welcome-copy">
                        <h2>
                          {settings.userName
                            ? (isTr ? `Selam ${settings.userName}, neyi halledelim?` : `Hey ${settings.userName}, what are we working on?`)
                            : (isTr ? 'Bugün neyi halledelim?' : 'What shall we tackle today?')}
                        </h2>
                        <p>
                          {isTr
                            ? 'Ada’dan ya da buradan yazabilirsin — tüm sohbetlerin burada oturum olarak saklanır.'
                            : 'Type from the Island or right here — all your chats stay organized by session.'}
                        </p>
                      </div>
                      {renderComposer(true)}
                    </div>
                  ) : (
                    <>
                      <div className="chat-studio-thread-head">
                        <strong className="chat-studio-thread-title">
                          {activeSession?.title || chatPendingUserText || (isTr ? 'Yeni Sohbet' : 'New Chat')}
                        </strong>
                        <button
                          type="button"
                          className="chat-studio-icon-btn"
                          onClick={handleStartNewSession}
                          title={isTr ? 'Yeni sohbet' : 'New chat'}
                        >
                          <PenSquare size={13} />
                        </button>
                      </div>

                      <div ref={chatThreadScrollRef} className="chat-studio-thread-scroll">
                        <div className="chat-lg-messages">
                          {activeMessages.map((entry) => {
                            const isLongReply = (entry.assistantText || '').length > 560;
                            const isExpanded = Boolean(expandedChatIds[entry.id]);
                            const displayReply =
                              isLongReply && !isExpanded
                                ? `${entry.assistantText.slice(0, 560).trimEnd()}…`
                                : entry.assistantText;
                            const timeLabel = formatChatTime(entry.timestamp);

                            return (
                              <div key={entry.id} className="chat-lg-exchange">
                                {entry.userText && (
                                  <div className="chat-lg-msg-row is-user">
                                    <div className="chat-lg-bubble is-user">
                                      <p>{entry.userText}</p>
                                      <div className="chat-lg-bubble-meta">
                                        {entry.source === 'voice' && <Mic size={10} />}
                                        {entry.source === 'vision' && <Scan size={10} />}
                                        <span>{timeLabel}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {entry.assistantText ? (
                                  <div className="chat-lg-msg-row is-assistant">
                                    <div className="chat-lg-avatar" aria-hidden="true">
                                      <span />
                                      <span />
                                    </div>
                                    <div className="chat-lg-bubble is-assistant">
                                      <div className="chat-lg-reply-body">
                                        <RoboMarkdown content={displayReply} />
                                        {isLongReply && (
                                          <button
                                            type="button"
                                            className="chat-lg-expand-btn"
                                            onClick={() =>
                                              setExpandedChatIds((prev) => ({
                                                ...prev,
                                                [entry.id]: !prev[entry.id],
                                              }))
                                            }
                                          >
                                            {isExpanded
                                              ? (isTr ? 'Daha az göster' : 'Show less')
                                              : (isTr ? 'Devamını gör' : 'Show more')}
                                          </button>
                                        )}
                                      </div>
                                      <div className="chat-lg-bubble-footer">
                                        <span className="chat-lg-meta-label">
                                          {entry.provider || 'Bedo'} · {timeLabel}
                                        </span>
                                        <div className="chat-lg-hover-actions">
                                          <button
                                            type="button"
                                            className="chat-lg-mini-btn"
                                            onClick={() => handleCopyChat(entry)}
                                            title={isTr ? 'Kopyala' : 'Copy'}
                                          >
                                            {copiedChatId === entry.id ? <Check size={11} /> : <Copy size={11} />}
                                          </button>
                                          <button
                                            type="button"
                                            className="chat-lg-mini-btn is-danger"
                                            onClick={() => handleDeleteChat(entry.id)}
                                            title={isTr ? 'Sil' : 'Delete'}
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                          {chatSending && (
                            <div className="chat-lg-exchange is-live-stream">
                              {chatPendingUserText && (
                                <div className="chat-lg-msg-row is-user">
                                  <div className="chat-lg-bubble is-user">
                                    <p>{chatPendingUserText}</p>
                                  </div>
                                </div>
                              )}
                              <div className="chat-lg-msg-row is-assistant">
                                <div className="chat-lg-avatar is-thinking" aria-hidden="true">
                                  <span />
                                  <span />
                                </div>
                                {chatStreamingReply ? (
                                  <div className="chat-lg-bubble is-assistant is-streaming">
                                    {Array.isArray(chatResearchState?.domains) && chatResearchState.domains.length > 0 && (
                                      <div className="chat-lg-inline-trail">
                                        <span className="chat-lg-trail-ring" aria-hidden="true" />
                                        <span className="chat-lg-trail-domains">
                                          {chatResearchState.domains.slice(0, 3).join(' · ')}
                                          {(chatResearchState.totalSources || 0) > 3
                                            ? ` +${chatResearchState.totalSources - 3}`
                                            : ''}
                                        </span>
                                      </div>
                                    )}
                                    <div className="chat-lg-reply-body">
                                      <RoboMarkdown content={chatStreamingReply} />
                                    </div>
                                  </div>
                                ) : chatResearchState && chatResearchState.phase ? (
                                  <div className={`chat-lg-research-whisper is-${chatResearchState.phase}`}>
                                    <div className="chat-lg-whisper-row">
                                      <span className="chat-lg-orbital-spinner" aria-hidden="true" />
                                      <span className="chat-lg-shimmer-text">
                                        {chatResearchState.phase === 'planning'
                                          ? (isTr ? 'Düşünüyor' : 'Thinking')
                                          : chatResearchState.phase === 'searching'
                                            ? (isTr ? 'Web taranıyor' : 'Searching web')
                                            : chatResearchState.phase === 'reading'
                                              ? (isTr
                                                  ? `Kaynaklar okunuyor${chatResearchState.readableTotal ? ` · ${chatResearchState.readCount || 0}/${chatResearchState.readableTotal}` : ''}`
                                                  : `Reading sources${chatResearchState.readableTotal ? ` · ${chatResearchState.readCount || 0}/${chatResearchState.readableTotal}` : ''}`)
                                              : (isTr
                                                  ? `${chatResearchState.totalSources && chatResearchState.totalSources > 1 ? `${chatResearchState.totalSources} kaynaktan ` : ''}yanıt yazılıyor`
                                                  : 'Writing response')}
                                      </span>
                                      {chatResearchState.phase === 'searching' && chatResearchState.queries?.[0] && (
                                        <span className="chat-lg-whisper-sub">
                                          {chatResearchState.queries[0]}
                                        </span>
                                      )}
                                    </div>
                                    {Array.isArray(chatResearchState.domains) && chatResearchState.domains.length > 0 && (
                                      <div className="chat-lg-whisper-domains">
                                        {chatResearchState.domains.slice(0, 4).map((dom, idx) => (
                                          <span
                                            key={dom}
                                            className="chat-lg-domain-chip"
                                            style={{ animationDelay: `${idx * 55}ms` }}
                                          >
                                            {dom}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="chat-lg-bubble is-assistant is-thinking-pill" aria-label={isTr ? 'Düşünüyor' : 'Thinking'}>
                                    <div className="chat-lg-thinking-wave" aria-hidden="true">
                                      <i />
                                      <i />
                                      <i />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="chat-studio-dock">
                        {renderComposer(false)}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 4: APPS (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'apps' && (() => {
          const appsList = settings.apps || [];
          const isFull = appsList.length >= 4;
          const presetApps = [
            { name: 'YouTube', url: 'https://youtube.com', type: 'youtube' },
            { name: 'Spotify', url: 'https://open.spotify.com', type: 'spotify' },
            { name: 'GitHub', url: 'https://github.com', type: 'github' },
            { name: 'WhatsApp', url: 'https://web.whatsapp.com', type: 'whatsapp' },
            { name: 'Gemini', url: 'https://gemini.google.com', type: 'gemini' },
            { name: 'ChatGPT', url: 'https://chatgpt.com', type: 'custom', iconUrl: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64' },
          ];

          return (
            <div className="settings-page-body apps-lg-page">
              {/* Liquid Glass Hero */}
              <section className="apps-lg-hero">
                <div className="apps-lg-hero-glow" aria-hidden="true" />
                <div className="ai-lg-hero-copy">
                  <span className="apps-lg-eyebrow">
                    {langCode === 'tr' ? 'ADA KISAYOLLARI' : 'ISLAND SHORTCUTS'}
                  </span>
                  <h2>
                    {langCode === 'tr' ? 'Uygulamalar' : 'Apps'}{' '}
                    <span>{langCode === 'tr' ? '& Hızlı Erişim' : '& Quick Launch'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'En fazla 4 web sitesi veya yerel program ekleyin. Adanın alt çubuğundan ve Tüm Uygulamalar menüsünden tek tıkla açılır.'
                      : 'Add up to 4 websites or local programs. Launch them in one click from the Island dock and All Apps menu.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <span className={`ai-lg-status-pill ${appsList.length > 0 ? 'is-active' : ''}`}>
                    {appsList.length} / 4 {langCode === 'tr' ? 'dolu' : 'used'}
                  </span>
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    disabled={isFull}
                    onClick={handleChooseProgram}
                  >
                    <Plus size={14} />
                    <span>{langCode === 'tr' ? 'Program Seç (.exe)' : 'Choose Program'}</span>
                  </button>
                </div>
              </section>

              {/* Installed Shortcuts + Add Form */}
              <section className="ai-lg-card">
                <div className="apps-lg-list-head">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Ekli Kısayollar' : 'Pinned Shortcuts'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Sıralamayı değiştirebilir, doğrudan test edebilir veya kaldırabilirsiniz.'
                        : 'Reorder, test-launch, or remove your pinned shortcuts.'}
                    </span>
                  </div>
                </div>

                {appsList.length === 0 ? (
                  <div className="apps-lg-empty">
                    <LayoutGrid size={18} />
                    <span>
                      {langCode === 'tr'
                        ? 'Henüz kısayol eklenmedi. Aşağıdan web sitesi, popüler uygulama veya .exe seçin.'
                        : 'No shortcuts added yet. Add a website, preset app, or .exe below.'}
                    </span>
                  </div>
                ) : (
                  <div className="apps-lg-list">
                    {appsList.map((app, index) => (
                      <div key={app.id} className="apps-lg-item">
                        <div className="app-item-left">
                          <span className="app-brand-badge">
                            <RealAppIcon sc={app} size={17} />
                          </span>
                          <div className="apps-lg-item-meta">
                            <strong className="app-item-name">{app.name}</strong>
                            <span className="app-item-path">{app.url}</span>
                          </div>
                        </div>
                        <div className="apps-lg-item-actions">
                          <button
                            type="button"
                            className="apps-lg-mini-btn"
                            disabled={index === 0}
                            onClick={() => handleMoveApp(index, -1)}
                            title={langCode === 'tr' ? 'Yukarı taşı' : 'Move up'}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="apps-lg-mini-btn"
                            disabled={index === appsList.length - 1}
                            onClick={() => handleMoveApp(index, 1)}
                            title={langCode === 'tr' ? 'Aşağı taşı' : 'Move down'}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="apps-lg-mini-btn"
                            onClick={() => window.twocode?.openApp?.(app)}
                            title={langCode === 'tr' ? 'Şimdi aç' : 'Open now'}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            type="button"
                            className="apps-lg-remove-btn"
                            onClick={() => handleRemoveApp(app.id)}
                          >
                            {t('common.remove')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add custom URL / local path */}
                <div className="apps-lg-add-row">
                  <input
                    type="text"
                    className="settings-input"
                    disabled={isFull}
                    placeholder={langCode === 'tr' ? 'Ad (ör. YouTube)' : 'Name (e.g. YouTube)'}
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="settings-input"
                    disabled={isFull}
                    placeholder={langCode === 'tr' ? 'Adres veya dosya yolu (ör. youtube.com)' : 'URL or path (e.g. youtube.com)'}
                    value={newAppUrl}
                    onChange={(e) => setNewAppUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isFull && handleAddApp()}
                  />
                  <button
                    type="button"
                    className="white-pill-btn"
                    disabled={isFull || !newAppName.trim() || !newAppUrl.trim()}
                    onClick={handleAddApp}
                  >
                    {t('common.add')}
                  </button>
                </div>

                {/* One-click popular presets */}
                <div className="apps-lg-presets-wrap">
                  <span className="apps-lg-presets-label">
                    {isFull
                      ? (langCode === 'tr' ? 'Maksimum 4 kısayol sınırına ulaşıldı.' : 'Maximum of 4 shortcuts reached.')
                      : (langCode === 'tr' ? 'Hızlı Ekle:' : 'Quick Add:')}
                  </span>
                  <div className="apps-lg-presets">
                    {presetApps.map((preset) => {
                      const alreadyAdded = appsList.some(
                        (a) => a.url === preset.url || a.name.toLowerCase() === preset.name.toLowerCase()
                      );
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          className={`apps-lg-preset-chip ${alreadyAdded ? 'is-added' : ''}`}
                          disabled={isFull || alreadyAdded}
                          onClick={() => handleAddPresetApp(preset)}
                        >
                          <RealAppIcon sc={{ id: `preset-${preset.name}`, ...preset }} size={13} />
                          <span>{preset.name}</span>
                          {alreadyAdded ? <Check size={11} /> : <Plus size={11} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Installed Apps Auto-Discovery */}
              <section className="ai-lg-card">
                <div className="apps-lg-installed-head">
                  <div className="row-text-col">
                    <strong>
                      {langCode === 'tr' ? 'Bu Bilgisayarda Yüklü Uygulamalar' : 'Installed Apps on This PC'}
                    </strong>
                    <span>
                      {installedAppsLoading
                        ? langCode === 'tr'
                          ? 'Başlat Menüsü ve Microsoft Store uygulamaları taranıyor…'
                          : 'Scanning Start Menu and Microsoft Store apps…'
                        : langCode === 'tr'
                        ? `${installedApps.length} uygulama algılandı · Tek tıkla adaya ekle`
                        : `${installedApps.length} apps detected · Add to island in one click`}
                    </span>
                  </div>
                  <div className="apps-lg-installed-tools">
                    <input
                      type="text"
                      className="settings-input apps-lg-installed-search"
                      placeholder={langCode === 'tr' ? 'Uygulama ara…' : 'Search apps…'}
                      value={installedAppsQuery}
                      onChange={(e) => setInstalledAppsQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="apps-lg-mini-btn"
                      disabled={installedAppsLoading}
                      onClick={() => loadInstalledApps(true)}
                      title={langCode === 'tr' ? 'Listeyi yenile' : 'Refresh list'}
                    >
                      <RefreshCw size={13} className={installedAppsLoading ? 'spin-icon' : ''} />
                    </button>
                  </div>
                </div>

                {installedAppsLoading && installedApps.length === 0 ? (
                  <div className="apps-lg-empty">
                    <RefreshCw size={16} className="spin-icon" />
                    <span>
                      {langCode === 'tr' ? 'Yüklü programlar taranıyor…' : 'Scanning installed programs…'}
                    </span>
                  </div>
                ) : (
                  <div className="apps-lg-installed-grid">
                    {installedApps
                      .filter((item) =>
                        !installedAppsQuery.trim()
                          ? true
                          : item.name.toLowerCase().includes(installedAppsQuery.trim().toLowerCase())
                      )
                      .slice(0, 24)
                      .map((item) => {
                        const alreadyAdded = appsList.some(
                          (a) =>
                            a.name.toLowerCase() === item.name.toLowerCase() ||
                            (item.path && a.path === item.path) ||
                            (item.aumid && a.aumid === item.aumid)
                        );
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`apps-lg-installed-item ${alreadyAdded ? 'is-added' : ''}`}
                            disabled={isFull || alreadyAdded}
                            onClick={() => {
                              if (isFull || alreadyAdded) return;
                              const nextApp = {
                                id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                name: item.name,
                                url: item.path || item.aumid || '',
                                path: item.path || '',
                                aumid: item.aumid || '',
                                type: item.type,
                                iconUrl: item.iconDataUrl || '',
                              };
                              updateSetting({ apps: [...appsList, nextApp] });
                            }}
                          >
                            <span className="apps-lg-installed-icon">
                              {item.iconDataUrl ? (
                                <img src={item.iconDataUrl} alt="" />
                              ) : (
                                <span className="apps-lg-installed-mono">
                                  {item.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <span className="apps-lg-installed-info">
                              <strong>{item.name}</strong>
                              <small>
                                {item.source === 'store'
                                  ? 'Store'
                                  : langCode === 'tr'
                                  ? 'Masaüstü'
                                  : 'Desktop'}
                              </small>
                            </span>
                            <span className="apps-lg-installed-act">
                              {alreadyAdded ? <Check size={12} /> : <Plus size={12} />}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </section>

              {/* Island Dock Behavior Settings */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Adada Hızlı Kısayollar' : 'Show Shortcuts in Island Dock'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Eklediğiniz uygulamaları genişletilmiş adanın alt çubuğunda gösterir.'
                        : 'Displays your pinned apps in the bottom dock of the expanded island.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.showAppsInDock !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ showAppsInDock: settings.showAppsInDock === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Uygulama Açılınca Adayı Küçült' : 'Collapse Island on App Launch'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Bir kısayola tıkladığınızda uygulamayı açar ve adayı otomatik kapatır.'
                        : 'Automatically collapses the island after launching a shortcut.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.closeIslandOnAppOpen ? 'on' : ''}`}
                    onClick={() => updateSetting({ closeIslandOnAppOpen: !settings.closeIslandOnAppOpen })}
                  >
                    <i />
                  </button>
                </div>
              </section>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 5: ROBO (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'robo' && (() => {
          const eyeColorOptions = [
            { name: 'White', label: langCode === 'tr' ? 'Beyaz' : 'White', hex: '#ffffff' },
            { name: 'Sky', label: langCode === 'tr' ? 'Mavi' : 'Sky', hex: '#38bdf8' },
            { name: 'Mint', label: langCode === 'tr' ? 'Nane' : 'Mint', hex: '#34d399' },
            { name: 'Violet', label: langCode === 'tr' ? 'Mor' : 'Violet', hex: '#a78bfa' },
            { name: 'Rose', label: langCode === 'tr' ? 'Pembe' : 'Rose', hex: '#f472b6' },
            { name: 'Amber', label: langCode === 'tr' ? 'Kehribar' : 'Amber', hex: '#fbbf24' },
          ];
          const emotionOptions = [
            { label: langCode === 'tr' ? '😊 Mutlu' : '😊 Happy', mood: 'happy' },
            { label: langCode === 'tr' ? '😍 Aşık' : '😍 In love', mood: 'inlove' },
            { label: langCode === 'tr' ? '🧐 Meraklı' : '🧐 Curious', mood: 'curious' },
            { label: langCode === 'tr' ? '🤨 Odaklı' : '🤨 Focused', mood: 'focus-arc' },
            { label: langCode === 'tr' ? '😉 Göz kırp' : '😉 Wink', mood: 'wink' },
            { label: langCode === 'tr' ? '😢 Üzgün' : '😢 Sad', mood: 'sad' },
            { label: langCode === 'tr' ? '😵 Baş dönmesi' : '😵 Dizzy', mood: 'dizzy' },
            { label: langCode === 'tr' ? '😴 Uykulu' : '😴 Sleepy', mood: 'dnd-sleep' },
            { label: langCode === 'tr' ? '💭 Düşünüyor' : '💭 Thinking', mood: 'thinking' },
          ];

          return (
            <div className="settings-page-body robo-lg-page">
              {/* Liquid Glass Hero */}
              <section className="robo-lg-hero">
                <div className="robo-lg-hero-glow" aria-hidden="true" />
                <div className="robo-lg-avatar-wrap">
                  <RoboCrownAvatar
                    outfit={settings.outfit}
                    size={96}
                    eyeHex={settings.eyeColorHex || '#ffffff'}
                    bodyColor={settings.bodyColor || 'Cloud'}
                  />
                </div>
                <div className="ai-lg-hero-copy">
                  <span className="robo-lg-eyebrow">
                    {langCode === 'tr' ? 'BEDO KARAKTERİ' : 'BEDO CHARACTER'}
                  </span>
                  <h2>
                    Bedo <span>{langCode === 'tr' ? '& İfadeler' : '& Expressions'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'Adadaki göz rengini, ses efektlerini, göz kırpma davranışını ve canlı ifadeleri buradan kontrol edin.'
                      : 'Control Bedo’s eye colour, sound effects, blinking behaviour, and live island expressions.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    onClick={() => setActivePage('wardrobe')}
                  >
                    <Shirt size={14} />
                    <span>{langCode === 'tr' ? 'Gardırobu Aç' : 'Open Wardrobe'}</span>
                  </button>
                </div>
              </section>

              {/* Eye Color & Visibility */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Göz Rengi' : 'Eye Colour'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Adadaki Bedo gözlerinin parlama rengini seçin.'
                        : 'Pick the glow colour for Bedo’s eyes in the island.'}
                    </span>
                  </div>
                  <div className="robo-lg-swatches">
                    {eyeColorOptions.map((opt) => {
                      const selected = (settings.eyeColorHex || '#ffffff').toLowerCase() === opt.hex.toLowerCase();
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          className={`robo-lg-swatch ${selected ? 'is-selected' : ''}`}
                          style={{ background: opt.hex }}
                          title={opt.label}
                          onClick={() => updateSetting({ eyeColorHex: opt.hex, eyeColorName: opt.name })}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Adada Gözleri Göster' : 'Show Eyes in Island'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Ada beklemedeyken Bedo’nun gözlerini üst çubukta gösterir.'
                        : 'Shows Bedo’s eyes in the island when idle.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.roboEyesVisible !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ roboEyesVisible: settings.roboEyesVisible === false })}
                  >
                    <i />
                  </button>
                </div>
              </section>

              {/* Behaviour & Sound */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Göz Kırpma' : 'Blinking'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Bedo’nun doğal aralıklarla göz kırpmasını sağlar.'
                        : 'Makes Bedo blink naturally at intervals.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.blinkingEnabled !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ blinkingEnabled: settings.blinkingEnabled === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Bedo Ses Efektleri' : 'Bedo Sound Effects'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Tıklama, bildirim ve ifade tepkilerinde yumuşak ses efektleri çalar.'
                        : 'Plays subtle sound effects for taps, notifications, and reactions.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.soundEffects !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ soundEffects: settings.soundEffects === false })}
                  >
                    <i />
                  </button>
                </div>
              </section>

              {/* Live Expression Test */}
              <section className="ai-lg-card">
                <div className="robo-lg-emotions-head">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Canlı İfade Testi' : 'Live Expression Test'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Adadaki Bedo’nun tepkisini anlık görmek için bir ifadeye tıklayın.'
                        : 'Click an expression to preview Bedo’s reaction live on the island.'}
                    </span>
                  </div>
                </div>
                <div className="robo-lg-emotions-grid">
                  {emotionOptions.map((em) => (
                    <button
                      key={em.mood}
                      type="button"
                      className={`robo-lg-emotion-btn ${activeTestEmotion === em.mood ? 'is-active' : ''}`}
                      onClick={() => {
                        setActiveTestEmotion(em.mood);
                        triggerEmotionOnIsland(em.mood);
                        setTimeout(() => {
                          setActiveTestEmotion((curr) => (curr === em.mood ? '' : curr));
                        }, 3200);
                      }}
                    >
                      <NotificationText text={em.label} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 6: WARDROBE (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'wardrobe' && (() => {
          const normalizedOutfit = settings.outfit === 'Best' ? 'Crown' : (settings.outfit || 'Crown');
          const outfitLabelMap = {
            None: langCode === 'tr' ? 'Yok' : 'None',
            Crown: langCode === 'tr' ? 'Taç' : 'Crown',
            'Party hat': langCode === 'tr' ? 'Parti şapkası' : 'Party hat',
            Sunglasses: langCode === 'tr' ? 'Güneş gözlüğü' : 'Sunglasses',
            Headphones: langCode === 'tr' ? 'Kulaklık' : 'Headphones',
            Beanie: langCode === 'tr' ? 'Bere' : 'Beanie',
            Halo: langCode === 'tr' ? 'Hale' : 'Halo',
            Bowtie: langCode === 'tr' ? 'Papyon' : 'Bowtie',
          };
          const outfits = [
            { id: 'None', label: outfitLabelMap.None, icon: '🚫' },
            { id: 'Crown', label: outfitLabelMap.Crown, icon: '👑' },
            { id: 'Party hat', label: outfitLabelMap['Party hat'], icon: '🥳' },
            { id: 'Sunglasses', label: outfitLabelMap.Sunglasses, icon: '😎' },
            { id: 'Headphones', label: outfitLabelMap.Headphones, icon: '🎧' },
            { id: 'Beanie', label: outfitLabelMap.Beanie, icon: '🧢' },
            { id: 'Halo', label: outfitLabelMap.Halo, icon: '😇' },
            { id: 'Bowtie', label: outfitLabelMap.Bowtie, icon: '🎀' },
          ];
          const bodyColors = [
            { name: 'Cloud', label: langCode === 'tr' ? 'Bulut' : 'Cloud', bg: 'radial-gradient(circle at 30% 30%, #ffffff, #d4d4d8)' },
            { name: 'Mint', label: langCode === 'tr' ? 'Nane' : 'Mint', bg: 'radial-gradient(circle at 30% 30%, #d1fae5, #6ee7b7)' },
            { name: 'Sky', label: langCode === 'tr' ? 'Gökyüzü' : 'Sky', bg: 'radial-gradient(circle at 30% 30%, #e0f2fe, #7dd3fc)' },
            { name: 'Rose', label: langCode === 'tr' ? 'Gül' : 'Rose', bg: 'radial-gradient(circle at 30% 30%, #fce7f3, #f9a8d4)' },
            { name: 'Classic', label: langCode === 'tr' ? 'Klasik' : 'Classic', bg: 'radial-gradient(circle at 30% 30%, #4b5563, #1f2937)' },
            { name: 'Night', label: langCode === 'tr' ? 'Gece' : 'Night', bg: 'radial-gradient(circle at 30% 30%, #3f3f46, #18181b)' },
            { name: 'Blue', label: langCode === 'tr' ? 'Mavi' : 'Blue', bg: 'radial-gradient(circle at 30% 30%, #3b82f6, #1d4ed8)' },
            { name: 'Purple', label: langCode === 'tr' ? 'Mor' : 'Purple', bg: 'radial-gradient(circle at 30% 30%, #8b5cf6, #4c1d95)' },
            { name: 'Pink', label: langCode === 'tr' ? 'Pembe' : 'Pink', bg: 'radial-gradient(circle at 30% 30%, #be185d, #500724)' },
            { name: 'Gold', label: langCode === 'tr' ? 'Altın' : 'Gold', bg: 'radial-gradient(circle at 30% 30%, #a16207, #422006)' },
          ];
          const eyeColors = [
            { name: 'Mint', label: langCode === 'tr' ? 'Nane' : 'Mint', hex: '#a7f3d0' },
            { name: 'White', label: langCode === 'tr' ? 'Beyaz' : 'White', hex: '#ffffff' },
            { name: 'Blue', label: langCode === 'tr' ? 'Mavi' : 'Blue', hex: '#7dd3fc' },
            { name: 'Pink', label: langCode === 'tr' ? 'Pembe' : 'Pink', hex: '#f9a8d4' },
            { name: 'Purple', label: langCode === 'tr' ? 'Mor' : 'Purple', hex: '#c4b5fd' },
            { name: 'Yellow', label: langCode === 'tr' ? 'Sarı' : 'Yellow', hex: '#fef08a' },
          ];

          return (
            <div className="settings-page-body wardrobe-lg-page">
              <div className="wardrobe-lg-layout">
                {/* Left Liquid Glass Live Preview */}
                <section className="wardrobe-lg-preview">
                  <div
                    className="wardrobe-lg-preview-glow"
                    aria-hidden="true"
                    style={{
                      background: `radial-gradient(circle at center, ${BODY_COLOR_HEX[settings.bodyColor || 'Cloud'] || '#ffffff'}33 0%, transparent 72%)`,
                    }}
                  />
                  <RoboCrownAvatar
                    outfit={normalizedOutfit}
                    size={164}
                    eyeHex={settings.eyeColorHex || '#ffffff'}
                    bodyColor={settings.bodyColor || 'Cloud'}
                  />
                  <div className="wardrobe-lg-preview-meta">
                    <strong>Bedo</strong>
                    <span>
                      {langCode === 'tr'
                        ? `Kıyafet: ${outfitLabelMap[normalizedOutfit] || normalizedOutfit}`
                        : `Wearing: ${outfitLabelMap[normalizedOutfit] || normalizedOutfit}`}
                    </span>
                  </div>
                </section>

                {/* Right Options */}
                <div className="wardrobe-lg-options">
                  <section className="ai-lg-card">
                    <div className="wardrobe-lg-group-head">
                      <strong>{langCode === 'tr' ? 'Kıyafet' : 'Outfit'}</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'Seçtiğiniz aksesuar adadaki Bedo üzerinde anında görünür.'
                          : 'Selected accessory appears immediately on Bedo in the island.'}
                      </span>
                    </div>
                    <div className="wardrobe-lg-outfit-grid">
                      {outfits.map((o) => {
                        const selected = normalizedOutfit === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className={`wardrobe-lg-outfit-btn ${selected ? 'is-selected' : ''}`}
                            onClick={() => updateSetting({ outfit: o.id })}
                          >
                            {selected && (
                              <span className="wardrobe-lg-check">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                            <span className="wardrobe-lg-emoji">
                              <NotificationText text={o.icon} />
                            </span>
                            <strong>{o.label}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="ai-lg-card">
                    <div className="wardrobe-lg-group-head">
                      <strong>{langCode === 'tr' ? 'Gövde Rengi' : 'Body Colour'}</strong>
                    </div>
                    <div className="wardrobe-lg-spheres">
                      {bodyColors.map((b) => (
                        <button
                          key={b.name}
                          type="button"
                          className="wardrobe-lg-sphere-item"
                          onClick={() => updateSetting({ bodyColor: b.name })}
                        >
                          <span
                            className={`wardrobe-lg-sphere ${settings.bodyColor === b.name ? 'is-selected' : ''}`}
                            style={{ background: b.bg }}
                          />
                          <small>{b.label}</small>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="ai-lg-card">
                    <div className="wardrobe-lg-group-head">
                      <strong>{langCode === 'tr' ? 'Göz Rengi' : 'Eye Colour'}</strong>
                    </div>
                    <div className="wardrobe-lg-spheres">
                      {eyeColors.map((ey) => (
                        <button
                          key={ey.name}
                          type="button"
                          className="wardrobe-lg-sphere-item"
                          onClick={() => updateSetting({ eyeColorName: ey.name, eyeColorHex: ey.hex })}
                        >
                          <span
                            className={`wardrobe-lg-sphere ${(settings.eyeColorHex || '#ffffff').toLowerCase() === ey.hex.toLowerCase() ? 'is-selected' : ''}`}
                            style={{ background: ey.hex }}
                          />
                          <small>{ey.label}</small>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="ai-lg-card">
                    <div className="settings-row no-border">
                      <div className="row-left-with-icon">
                        <div className="stat-icon-sq amber">
                          <Calendar size={15} />
                        </div>
                        <div className="row-text-col">
                          <strong>{langCode === 'tr' ? 'Mevsimlik kıyafetler' : 'Seasonal outfits'}</strong>
                          <span>
                            {langCode === 'tr'
                              ? 'Yılbaşı ve Cadılar Bayramı gibi özel günlerde otomatik şapka takar.'
                              : 'Automatically wears themed hats on holidays like Halloween and New Year.'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`settings-switch ${settings.seasonalOutfits ? 'on' : ''}`}
                        onClick={() => updateSetting({ seasonalOutfits: !settings.seasonalOutfits })}
                      >
                        <i />
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 8: GENERAL (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'general' && (() => {
          const shortcutsEnabled = settings.globalShortcutsEnabled !== false;
          const shortcuts = [
            { label: t('settings.general.openIsland'), keys: 'Ctrl + Alt + T' },
            { label: t('settings.general.tuckIsland'), keys: 'Ctrl + Alt + H' },
            { label: langCode === 'tr' ? 'Bedo ile konuş' : 'Talk to Bedo', keys: 'Ctrl + Alt + Space' },
            { label: t('settings.nav.home'), keys: 'Ctrl + Alt + Shift + 1' },
            { label: t('settings.opt.Music'), keys: 'Ctrl + Alt + Shift + 2' },
            { label: 'Bedo', keys: 'Ctrl + Alt + Shift + 3' },
            { label: langCode === 'tr' ? 'Odak sayacı' : 'Focus timer', keys: 'Ctrl + Alt + Shift + 4' },
            { label: langCode === 'tr' ? 'Notlar' : 'Notes', keys: 'Ctrl + Alt + Shift + 5' },
            { label: langCode === 'tr' ? 'Takvim' : 'Calendar', keys: 'Ctrl + Alt + Shift + 6' },
          ];

          return (
            <div className="settings-page-body general-lg-page">
              {/* Liquid Glass Hero */}
              <section className="general-lg-hero">
                <div className="general-lg-hero-glow" aria-hidden="true" />
                <div className="ai-lg-hero-copy">
                  <span className="general-lg-eyebrow">
                    {langCode === 'tr' ? 'SİSTEM & TERCİHLER' : 'SYSTEM & PREFERENCES'}
                  </span>
                  <h2>
                    {langCode === 'tr' ? 'Genel' : 'General'}{' '}
                    <span>{langCode === 'tr' ? '& Kısayollar' : '& Shortcuts'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'Uygulama dili, Windows başlangıç davranışı, ses efektleri ve global klavye kısayollarını yönetin.'
                      : 'Manage app language, Windows startup behaviour, sound effects, and global keyboard shortcuts.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <span className={`ai-lg-status-pill ${shortcutsEnabled ? 'is-active' : ''}`}>
                    {shortcutsEnabled
                      ? (langCode === 'tr' ? 'Kısayollar Aktif' : 'Shortcuts Active')
                      : (langCode === 'tr' ? 'Kısayollar Kapalı' : 'Shortcuts Paused')}
                  </span>
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    onClick={() => {
                      setOnboardingStep(1);
                      setShowOnboarding(true);
                    }}
                  >
                    <SlidersHorizontal size={14} />
                    <span>{langCode === 'tr' ? 'Karşılama Ekranı' : 'Welcome Setup'}</span>
                  </button>
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    onClick={() => {
                      updateSetting({ replayIslandTour: Date.now(), islandTourCompleted: false });
                    }}
                  >
                    <Eye size={14} />
                    <span>{langCode === 'tr' ? 'Ada Tanıtım Turu' : 'Island Walkthrough'}</span>
                  </button>
                </div>
              </section>

              {/* Language & System Behaviour */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{t('settings.general.languageTitle')}</strong>
                    <span>{t('settings.general.languageDesc')}</span>
                  </div>
                  <div className="seg-btn-group">
                    {['Türkçe', 'English'].map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={`seg-choice-btn ${languageLabel(settings.language) === lang ? 'active' : ''}`}
                        onClick={() => updateSetting({ language: lang })}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{t('settings.general.startWithWindows')}</strong>
                    <span>{t('settings.general.startWithWindowsDesc')}</span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.startWithWindows !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ startWithWindows: settings.startWithWindows === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{t('settings.general.soundEffects')}</strong>
                    <span>{t('settings.general.soundEffectsDesc')}</span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.soundEffects !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ soundEffects: settings.soundEffects === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Global Klavye Kısayolları' : 'Global Keyboard Shortcuts'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Adayı ve Bedo’yu herhangi bir uygulamadayken klavye ile açmanızı sağlar.'
                        : 'Allows opening the Island and Bedo from anywhere using keyboard shortcuts.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${shortcutsEnabled ? 'on' : ''}`}
                    onClick={() => updateSetting({ globalShortcutsEnabled: !shortcutsEnabled })}
                  >
                    <i />
                  </button>
                </div>
              </section>

              {/* Working Global Shortcuts Grid */}
              <section className="ai-lg-card">
                <div className="general-lg-shortcuts-head">
                  <div className="row-text-col">
                    <strong>{t('settings.general.shortcuts')}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Tüm kısayollar sistem genelinde anlık olarak çalışır.'
                        : 'All shortcuts work system-wide in real time.'}
                    </span>
                  </div>
                </div>
                <div className={`general-lg-shortcuts-grid ${!shortcutsEnabled ? 'is-disabled' : ''}`}>
                  {shortcuts.map((sc) => (
                    <div key={sc.label} className="general-lg-shortcut-item">
                      <span>{sc.label}</span>
                      <kbd className="general-lg-kbd">{sc.keys}</kbd>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
        })()}

        {activePage === 'typography' && (() => {
          const activeTextFont = TEXT_FONT_OPTIONS[textFontIndex] || TEXT_FONT_OPTIONS[0];
          const activeNumFont = CLOCK_FONT_OPTIONS[numberFontIndex] || CLOCK_FONT_OPTIONS[1] || CLOCK_FONT_OPTIONS[0];
          const isDefault = textFontIndex === 0 && numberFontIndex === 1;

          return (
            <div className="settings-page-body typo-lg-page">
              {/* Liquid Glass Hero */}
              <section className="typo-lg-hero">
                <div className="typo-lg-hero-glow" aria-hidden="true" />
                <div className="ai-lg-hero-copy">
                  <span className="typo-lg-eyebrow">
                    {langCode === 'tr' ? 'YAZI TİPİ & OKUNABİLİRLİK' : 'TYPOGRAPHY & READABILITY'}
                  </span>
                  <h2>
                    {langCode === 'tr' ? 'Tipografi' : 'Typography'}{' '}
                    <span>{langCode === 'tr' ? '& Saat Stili' : '& Clock Style'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'Seçtiğiniz yazı tipleri Ada, Ayarlar ve tüm sayısal göstergelerde anlık olarak güncellenir.'
                      : 'Selected fonts update instantaneously across the Island, Settings, and all numeric readouts.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <div className="typo-lg-live-pill">
                    <span style={{ fontFamily: activeTextFont?.family }}>Ag</span>
                    <strong style={{ fontFamily: activeNumFont?.family }}>12:34</strong>
                  </div>
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    disabled={isDefault}
                    onClick={() => {
                      selectTextFont(0);
                      selectNumberFont(1);
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>{langCode === 'tr' ? 'Varsayılana Sıfırla' : 'Reset to Default'}</span>
                  </button>
                </div>
              </section>

              {/* Interface Text */}
              <section className="ai-lg-card">
                <div className="wardrobe-lg-group-head">
                  <strong>{langCode === 'tr' ? 'Arayüz Metni' : 'Interface Text'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Etiketler, menüler, kartlar ve açıklamalar için yazı tipi.'
                      : 'Font used for labels, menus, cards, and descriptions.'}
                  </span>
                </div>
                <div className="typo-lg-grid">
                  {TEXT_FONT_OPTIONS.map((font, index) => {
                    const active = textFontIndex === index;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        className={`typo-lg-tile ${active ? 'is-active' : ''}`}
                        onClick={() => selectTextFont(index)}
                        aria-pressed={active}
                      >
                        {active && (
                          <span className="typo-lg-check">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                        <span className="typo-lg-preview" style={{ fontFamily: font.family }}>Ag</span>
                        <strong className="typo-lg-name">{font.name}</strong>
                        <span className="typo-lg-sample" style={{ fontFamily: font.family }}>
                          {langCode === 'tr' ? 'Hızlı kahverengi tilki' : 'The quick brown fox'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Numbers & Clock */}
              <section className="ai-lg-card">
                <div className="wardrobe-lg-group-head">
                  <strong>{langCode === 'tr' ? 'Sayılar ve Saat' : 'Numbers & Clock'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Ana Sayfa saati, zamanlayıcılar, tarihler ve sayısal göstergeler bunu takip eder.'
                      : 'Shared with the Home clock; timers, dates, and numeric readouts follow it.'}
                  </span>
                </div>
                <div className="typo-lg-grid">
                  {CLOCK_FONT_OPTIONS.map((font, index) => {
                    const active = numberFontIndex === index;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        className={`typo-lg-tile ${active ? 'is-active' : ''}`}
                        onClick={() => selectNumberFont(index)}
                        aria-pressed={active}
                      >
                        {active && (
                          <span className="typo-lg-check">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                        <span className="typo-lg-num-preview" style={{ fontFamily: font.family }}>12:34</span>
                        <strong className="typo-lg-name">{font.name}</strong>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Code Font Note */}
              <section className="ai-lg-card">
                <div className="settings-row no-border">
                  <div className="row-left-with-icon">
                    <span className="typo-lg-code-badge">&lt;/&gt;</span>
                    <div className="row-text-col">
                      <strong>{langCode === 'tr' ? 'Kod ve Teknik Değerler' : 'Code and Technical Values'}</strong>
                      <span>
                        {langCode === 'tr'
                          ? 'JetBrains Mono · Uygulama genelinde sabit kullanılır.'
                          : 'JetBrains Mono · Consistent throughout the app.'}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 9: NOTIFICATIONS (Liquid Glass & Glassmorphism)
            ============================================================ */}
        {activePage === 'notifications' && (() => {
          const isMutedAll = settings.doNotDisturb || settings.windowsNotifications === false;
          const hideText = settings.notifShowText === 'Hide';

          return (
            <div className="settings-page-body notif-lg-page">
              {/* Liquid Glass Hero */}
              <section className="notif-lg-hero">
                <div className="notif-lg-hero-glow" aria-hidden="true" />
                <div className="ai-lg-hero-copy">
                  <span className="notif-lg-eyebrow">
                    {langCode === 'tr' ? 'BİLDİRİMLER & GİZLİLİK' : 'NOTIFICATIONS & PRIVACY'}
                  </span>
                  <h2>
                    {langCode === 'tr' ? 'Bildirimler' : 'Notifications'}{' '}
                    <span>{langCode === 'tr' ? '& Sesler' : '& Sounds'}</span>
                  </h2>
                  <p>
                    {langCode === 'tr'
                      ? 'Windows bildirimlerini, Rahatsız Etme modunu, G-Helper köprüsünü ve bildirim gizliliğini yönetin.'
                      : 'Manage Windows notifications, Do Not Disturb, G-Helper Bridge, and notification privacy.'}
                  </p>
                </div>
                <div className="ai-lg-hero-action">
                  <span className={`ai-lg-status-pill ${!isMutedAll ? 'is-active' : ''}`}>
                    {settings.doNotDisturb
                      ? (langCode === 'tr' ? 'Rahatsız Etme' : 'Do Not Disturb')
                      : settings.windowsNotifications === false
                        ? (langCode === 'tr' ? 'Kapalı' : 'Off')
                        : (langCode === 'tr' ? 'Bildirimler Aktif' : 'Active')}
                  </span>
                  <button
                    type="button"
                    className="agents-lg-connect-btn"
                    onClick={triggerTestNotificationOnIsland}
                  >
                    <Bell size={14} />
                    <span>{langCode === 'tr' ? 'Bildirim Test Et' : 'Test Notification'}</span>
                  </button>
                </div>
              </section>

              {/* Live Preview */}
              <section className="notif-lg-preview-stage">
                <div className="notif-lg-preview-pill">
                  <span className="notif-lg-preview-icon">
                    <Bell size={15} />
                  </span>
                  <div className="notif-preview-copy">
                    <small>{langCode === 'tr' ? 'BEDO · AZ ÖNCE' : 'BEDO · JUST NOW'}</small>
                    <strong>
                      {hideText
                        ? (langCode === 'tr' ? 'Yeni bildirim' : 'New notification')
                        : (langCode === 'tr' ? 'Örnek Bildirim' : 'Sample Notification')}
                    </strong>
                    {!hideText && (
                      <span>
                        {langCode === 'tr'
                          ? 'Bildiriminiz adada bu şekilde görüntülenir'
                          : 'Your notification appears like this in the island'}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* Core Notification Controls & G-Helper Bridge */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Windows Bildirimleri' : 'Windows Notifications'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Sistem ve uygulama bildirimlerini adada gösterir.'
                        : 'Shows system and app notifications in the island.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.windowsNotifications !== false ? 'on' : ''}`}
                    onClick={() => updateSetting({ windowsNotifications: settings.windowsNotifications === false })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Rahatsız Etme' : 'Do Not Disturb'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Açıkken hiçbir bildirim adayı bölmez.'
                        : 'Silences all incoming notifications while enabled.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.doNotDisturb ? 'on' : ''}`}
                    onClick={() => updateSetting({ doNotDisturb: !settings.doNotDisturb })}
                  >
                    <i />
                  </button>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Odak Sırasında Bildirimler' : 'Show During Focus Timer'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Odak sayacı çalışırken gelen bildirimlerin görünmesine izin verir.'
                        : 'Allows notifications to appear while the Focus timer is running.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.notifDuringFocus ? 'on' : ''}`}
                    onClick={() => updateSetting({ notifDuringFocus: !settings.notifDuringFocus })}
                  >
                    <i />
                  </button>
                </div>

                {(ghelperStatus.ghelperInstalled || ghelperStatus.running || ghelperStatus.installed) && (
                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <div className="notif-lg-bridge-title">
                      <strong>G-Helper Bridge</strong>
                      <span className={`status-badge ${ghelperStatus.running ? 'green' : ghelperStatus.installed ? 'amber' : ''}`}>
                        {langCode === 'tr'
                          ? (ghelperStatus.running ? 'Bağlı' : ghelperStatus.installed ? 'Beklemede' : 'Kurulum gerekli')
                          : (ghelperStatus.running ? 'Connected' : ghelperStatus.installed ? 'Idle' : 'Setup required')}
                      </span>
                    </div>
                    <span>
                      {langCode === 'tr'
                        ? (ghelperStatus.running
                            ? 'G-Helper OSD bildirimleri adaya yönlendiriliyor.'
                            : 'ASUS G-Helper mod ve fan bildirimlerini adada gösterir.')
                        : (ghelperStatus.running
                            ? 'G-Helper OSD notifications are routed to the island.'
                            : 'Routes ASUS G-Helper mode and fan OSD alerts into the island.')}
                    </span>
                    {ghelperMessage && (
                      <em className="notif-lg-bridge-msg">{ghelperMessage}</em>
                    )}
                  </div>
                  <button
                    type="button"
                    className="dark-pill-btn"
                    onClick={installGHelperBridge}
                    disabled={ghelperBusy}
                  >
                    {langCode === 'tr'
                      ? (ghelperBusy ? 'İşleniyor…' : ghelperStatus.running ? 'Yeniden Kur' : ghelperStatus.installed ? 'Başlat' : 'Bağla')
                      : (ghelperBusy ? 'Working…' : ghelperStatus.running ? 'Reinstall' : ghelperStatus.installed ? 'Start' : 'Connect')}
                  </button>
                </div>
                )}
              </section>

              {/* Duration, Sound, Privacy */}
              <section className="ai-lg-card">
                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Kalma Süresi' : 'Stay Duration'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Bildirimin adada kaç saniye kalacağını belirler.'
                        : 'How many seconds a notification stays visible.'}
                    </span>
                  </div>
                  <div className="slider-with-val">
                    <input
                      type="range"
                      min="2"
                      max="15"
                      value={settings.notifDurationSec || 5}
                      onChange={(e) =>
                        updateSetting({ notifDurationSec: parseInt(e.target.value, 10) })
                      }
                    />
                    <span>{langCode === 'tr' ? `${settings.notifDurationSec || 5} sn` : `${settings.notifDurationSec || 5} s`}</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Bildirim Sesi' : 'Notification Sound'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Önizlemek için bir ses tonuna tıklayın.'
                        : 'Click a sound to preview it.'}
                    </span>
                  </div>
                  <div className="seg-btn-group">
                    {[
                      { value: 'Ding', label: 'Ding' },
                      { value: 'Pling', label: 'Pling' },
                      { value: 'Pop', label: 'Pop' },
                      { value: 'Warning', label: langCode === 'tr' ? 'Uyarı' : 'Warning' },
                      { value: 'Party', label: langCode === 'tr' ? 'Parti' : 'Party' },
                      { value: 'None', label: langCode === 'tr' ? 'Yok' : 'None' },
                    ].map((snd) => (
                      <button
                        key={snd.value}
                        type="button"
                        className={`seg-choice-btn ${(settings.notifSound || 'Ding') === snd.value ? 'active' : ''}`}
                        onClick={() => {
                          updateSetting({ notifSound: snd.value });
                          playNotifSound(snd.value, settings.soundEffects !== false);
                        }}
                      >
                        {snd.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row no-border">
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Bildirim İçeriği (Gizlilik)' : 'Notification Content (Privacy)'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Gizle seçildiğinde yalnızca uygulama adı görünür, mesaj içeriği saklanır.'
                        : 'When hidden, only the app name is shown and message text is masked.'}
                    </span>
                  </div>
                  <div className="seg-btn-group">
                    {[
                      { value: 'Show', label: langCode === 'tr' ? 'Göster' : 'Show' },
                      { value: 'Hide', label: langCode === 'tr' ? 'Gizle' : 'Hide' },
                    ].map((tx) => (
                      <button
                        key={tx.value}
                        type="button"
                        className={`seg-choice-btn ${(settings.notifShowText || 'Show') === tx.value ? 'active' : ''}`}
                        onClick={() => updateSetting({ notifShowText: tx.value })}
                      >
                        {tx.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          );
        })()}

        {/* ============================================================
            PAGE 10: ISLAND
            ============================================================ */}
        {activePage === 'island' && (() => {
          const optMap = {
            Compact: langCode === 'tr' ? 'Kompakt' : 'Compact',
            Normal: 'Normal',
            Large: langCode === 'tr' ? 'Büyük' : 'Large',
            Attached: langCode === 'tr' ? 'Yapışık' : 'Attached',
            Floating: langCode === 'tr' ? 'Yüzen' : 'Floating',
            'On hover': langCode === 'tr' ? 'Üzerine gelince' : 'On hover',
            'On click': langCode === 'tr' ? 'Tıklayınca' : 'On click',
            Nothing: langCode === 'tr' ? 'Hiçbiri' : 'Nothing',
            Time: langCode === 'tr' ? 'Saat' : 'Time',
            Battery: langCode === 'tr' ? 'Pil' : 'Battery',
            'Wi-Fi': 'Wi-Fi',
            Bluetooth: 'Bluetooth',
            Automatic: langCode === 'tr' ? 'Otomatik' : 'Automatic',
            '12-hour · 6:30 PM': langCode === 'tr' ? '12 saat · 6:30 PM' : '12-hour · 6:30 PM',
            '24-hour · 18:30': langCode === 'tr' ? '24 saat · 18:30' : '24-hour · 18:30',
          };
          const restingOptions = ['Nothing', 'Time', 'Battery', 'Wi-Fi', 'Bluetooth'];
          const previewOpacity = Math.max(0.32, 1 - (Math.min(60, Math.max(0, Number(settings.islandSeeThrough ?? 4))) / 100) * 0.95);
          const previewScale = settings.islandSize === 'Compact' ? 0.92 : settings.islandSize === 'Large' ? 1.06 : 1;
          const isFloating = settings.islandStyle === 'Floating';
          const renderPreviewSlot = (val) => {
            if (!val || val === 'Nothing') return null;
            if (val === 'Time') return <span className="island-lg-preview-slot">{settings.clockFormat === '12-hour · 6:30 PM' ? '10:12 PM' : '22:12'}</span>;
            if (val === 'Battery') return <span className="island-lg-preview-slot is-battery">84%</span>;
            if (val === 'Wi-Fi') return <span className="island-lg-preview-slot is-net">Wi-Fi</span>;
            if (val === 'Bluetooth') return <span className="island-lg-preview-slot is-net">BT</span>;
            return null;
          };

          return (
          <div className="settings-page-body narrow-body island-lg-page">
            <div className="island-lg-hero">
              <div className="island-lg-hero-glow" aria-hidden="true" />
              <div className="island-lg-hero-top">
                <div className="island-lg-hero-copy">
                  <span className="island-lg-eyebrow">
                    <PanelTop size={13} />
                    {langCode === 'tr' ? 'DİNAMİK ADA STÜDYOSU' : 'DYNAMIC ISLAND STUDIO'}
                  </span>
                  <h3>{langCode === 'tr' ? 'Ada Görünümü ve Davranışı' : 'Island Appearance & Behavior'}</h3>
                  <p>
                    {langCode === 'tr'
                      ? 'Boyut, saydamlık, bekleme göstergeleri ve dock davranışları adaya anlık olarak yansır.'
                      : 'Size, translucency, resting indicators, and dock behavior apply to the island in real time.'}
                  </p>
                </div>
                <div className="island-lg-status-pill">
                  <span>{optMap[settings.islandStyle || 'Attached']}</span>
                  <span className="island-lg-sep">·</span>
                  <span>{optMap[settings.islandSize || 'Normal']}</span>
                  <span className="island-lg-sep">·</span>
                  <span>{settings.islandSeeThrough ?? 4}%</span>
                </div>
              </div>

              <div className="island-lg-preview-stage">
                <div
                  className={`island-lg-preview-pill ${isFloating ? 'is-floating' : 'is-attached'}`}
                  style={{
                    background: `rgba(10, 13, 20, ${previewOpacity.toFixed(2)})`,
                    transform: `scale(${previewScale})`,
                  }}
                >
                  {renderPreviewSlot(settings.leftOfRobo)}
                  {settings.roboEyesVisible !== false ? (
                    <span className="island-lg-preview-eyes" aria-hidden="true">
                      <i style={{ background: settings.eyeColorHex || '#ffffff' }} />
                      <i style={{ background: settings.eyeColorHex || '#ffffff' }} />
                    </span>
                  ) : (
                    !renderPreviewSlot(settings.leftOfRobo) &&
                    !renderPreviewSlot(settings.rightOfRobo) && <span className="island-lg-preview-bar" />
                  )}
                  {renderPreviewSlot(settings.rightOfRobo)}
                </div>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'GÖRÜNÜM' : 'LOOK'}</span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Boyut' : 'Size'}</strong>
                  <span>{langCode === 'tr' ? 'Adanın ölçeği ve kapladığı alan' : 'Overall scale of the island'}</span>
                </div>
                <div className="seg-btn-group">
                  {['Compact', 'Normal', 'Large'].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`seg-choice-btn ${settings.islandSize === sz ? 'active' : ''}`}
                      onClick={() => updateSetting({ islandSize: sz })}
                    >
                      {optMap[sz]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Stil' : 'Style'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Üst kenara yapışık çentik veya hemen altında yüzen kapsül'
                      : 'Attached to the top edge like a notch, or floating just below it'}
                  </span>
                </div>
                <div className="seg-btn-group">
                  {['Attached', 'Floating'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`seg-choice-btn ${settings.islandStyle === st ? 'active' : ''}`}
                      onClick={() => updateSetting({ islandStyle: st })}
                    >
                      {optMap[st]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Saydamlık' : 'See-through'}</strong>
                  <span>{langCode === 'tr' ? 'Ada ve ayarlar için Liquid Glass bulanıklığı ve arka plan koyuluğu' : 'Liquid Glass blur and background translucency for the island and settings'}</span>
                </div>
                <div className="slider-with-val">
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={settings.islandSeeThrough ?? 4}
                    onChange={(e) =>
                      updateSetting({ islandSeeThrough: parseInt(e.target.value, 10) })
                    }
                  />
                  <span>{settings.islandSeeThrough ?? 4}%</span>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Müzik rengi' : 'Music colour'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Çalan albüm kapağının baskın rengini adaya yansıtır'
                      : 'Reflects the dominant colour of the playing album cover on the island'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.islandMusicColour ? 'on' : ''}`}
                  onClick={() => updateSetting({ islandMusicColour: !settings.islandMusicColour })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Açılma' : 'Open'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Fare üzerine geldiğinde mi yoksa yalnızca tıkladığında mı açılsın'
                      : 'Opens the island when your mouse moves over it, or only when you click it'}
                  </span>
                </div>
                <div className="seg-btn-group">
                  {['On hover', 'On click'].map((op) => (
                    <button
                      key={op}
                      type="button"
                      className={`seg-choice-btn ${settings.islandOpenMode === op ? 'active' : ''}`}
                      onClick={() => updateSetting({ islandOpenMode: op })}
                    >
                      {optMap[op]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 20 }}>
              {langCode === 'tr' ? 'BEKLEME ADASI' : 'RESTING ISLAND'}
            </span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bedo’nun solu' : 'Left of Bedo'}</strong>
                  <span>{langCode === 'tr' ? 'Ada boştayken sol tarafta gösterilecek bilgi' : 'What it shows on the left when nothing is going on'}</span>
                </div>
                <div className="seg-btn-group">
                  {restingOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`seg-choice-btn ${settings.leftOfRobo === opt ? 'active' : ''}`}
                      onClick={() => updateSetting({ leftOfRobo: opt })}
                    >
                      {optMap[opt]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bedo’nun gözleri' : "Bedo's eyes"}</strong>
                  <span>{langCode === 'tr' ? 'Bekleme adasının ortasında Bedo’nun gözlerini gösterir' : 'Shows Bedo’s eyes in the center of the resting island'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.roboEyesVisible ? 'on' : ''}`}
                  onClick={() => updateSetting({ roboEyesVisible: !settings.roboEyesVisible })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bedo’nun sağı' : 'Right of Bedo'}</strong>
                  <span>{langCode === 'tr' ? 'Ada boştayken sağ tarafta gösterilecek bilgi' : 'What it shows on the right when nothing is going on'}</span>
                </div>
                <div className="seg-btn-group">
                  {restingOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`seg-choice-btn ${settings.rightOfRobo === opt ? 'active' : ''}`}
                      onClick={() => updateSetting({ rightOfRobo: opt })}
                    >
                      {optMap[opt]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Saat' : 'Clock'}</strong>
                  <span>{langCode === 'tr' ? 'Adada ve Ana Sayfa’da saatin nasıl görüneceği' : 'How the time looks, in the island and on Home'}</span>
                </div>
                <div className="seg-btn-group">
                  {['Automatic', '12-hour · 6:30 PM', '24-hour · 18:30'].map((cf) => (
                    <button
                      key={cf}
                      type="button"
                      className={`seg-choice-btn ${settings.clockFormat === cf ? 'active' : ''}`}
                      onClick={() => updateSetting({ clockFormat: cf })}
                    >
                      {optMap[cf]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 20 }}>
              {langCode === 'tr' ? 'ADA DAVRANIŞI VE İÇERİK' : 'ISLAND BEHAVIOR & CONTENT'}
            </span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Şarkı sözleri' : 'Lyrics'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Çalan şarkının sözleri adada görünür. lrclib.net veya NetEase kaynaklı (yalnızca şarkı adı gönderilir)'
                      : "The line that is sung, in the island. From lrclib.net or NetEase (only the song's name goes there)"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.lyricsEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ lyricsEnabled: !settings.lyricsEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Dock’ta uygulamaları göster' : 'Show apps in dock'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Genişletilmiş adanın alt çubuğunda sabitlenmiş uygulama kısayollarını gösterir'
                      : 'Displays pinned app shortcuts in the expanded island dock'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.showAppsInDock !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ showAppsInDock: settings.showAppsInDock === false })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Uygulama açılınca adayı kapat' : 'Close island on app open'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Adadan bir uygulama başlattığında adayı otomatik olarak küçültür'
                      : 'Automatically collapses the island after launching an app from it'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.closeIslandOnAppOpen ? 'on' : ''}`}
                  onClick={() => updateSetting({ closeIslandOnAppOpen: !settings.closeIslandOnAppOpen })}
                >
                  <i />
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ============================================================
            PAGE 11: FOCUS GUARD
            ============================================================ */}
        {activePage === 'focusguard' && (() => {
          const focusSites = [
            { name: 'YouTube', domain: 'youtube.com' },
            { name: 'TikTok', domain: 'tiktok.com' },
            { name: 'Instagram', domain: 'instagram.com' },
            { name: 'X', domain: 'x.com' },
            { name: 'Reddit', domain: 'reddit.com' },
            { name: 'Facebook', domain: 'facebook.com' },
            { name: 'Netflix', domain: 'netflix.com' },
            { name: 'Twitch', domain: 'twitch.tv' },
            { name: 'Discord', domain: 'discord.com' },
          ];
          const selectedCount = (settings.focusGuardApps || []).length + (
            String(settings.focusGuardCustom || '')
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length >= 2).length
          );
          const saveCustomTerms = () => {
            updateSetting({ focusGuardCustom: fgCustomDraft.trim() });
            setFgSavedFeedback(true);
            setTimeout(() => setFgSavedFeedback(false), 1800);
          };
          const resetTodayStats = () => {
            try {
              const todayKey = new Date().toISOString().slice(0, 10);
              localStorage.setItem('twocode_focus_guard_stats', JSON.stringify({ date: todayKey, turnedBack: 0, openedAnyway: 0 }));
            } catch {}
            setFgStats({ turnedBack: 0, openedAnyway: 0 });
          };

          return (
          <div className="settings-page-body narrow-body fg-lg-page">
            <div className="fg-lg-hero">
              <div className="fg-lg-hero-glow" aria-hidden="true" />
              <div className="fg-lg-hero-main">
                <div className="fg-lg-hero-copy">
                  <span className="fg-lg-eyebrow">
                    <Shield size={13} />
                    {langCode === 'tr' ? 'BİLİNÇLİ ODAK KORUMASI' : 'MINDFUL FOCUS GUARD'}
                  </span>
                  <h3>{langCode === 'tr' ? 'Dikkat Dağıtıcıları Durdur' : 'Pause Distractions Before They Start'}</h3>
                  <p>
                    {langCode === 'tr'
                      ? 'Seçtiğin uygulama veya site öne geldiğinde ada nefes molası başlatır; geri dönüp dönmeyeceğine sen karar verirsin.'
                      : 'When a selected app or site comes into focus, the island triggers a breathing pause so you decide intentionally.'}
                  </p>
                </div>
                <div className={`fg-lg-status-pill ${settings.focusGuardEnabled ? 'is-on' : ''}`}>
                  <span>
                    {settings.focusGuardEnabled
                      ? langCode === 'tr'
                        ? `Aktif · ${selectedCount} hedef`
                        : `Active · ${selectedCount} targets`
                      : langCode === 'tr'
                      ? 'Kapalı'
                      : 'Off'}
                  </span>
                </div>
              </div>

              <div className="fg-lg-stats-bar">
                <div className="fg-lg-stat-chip">
                  <strong>{fgStats.turnedBack}×</strong>
                  <span>{langCode === 'tr' ? 'Geri döndün' : 'Turned back'}</span>
                </div>
                <div className="fg-lg-stat-chip">
                  <strong>{fgStats.openedAnyway}×</strong>
                  <span>{langCode === 'tr' ? 'Yine de açtın' : 'Opened anyway'}</span>
                </div>
                <button type="button" className="fg-lg-reset-btn" onClick={resetTodayStats}>
                  {langCode === 'tr' ? 'Bugünü sıfırla' : 'Reset today'}
                </button>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'KORUMA VE HEDEFLER' : 'GUARD & TARGETS'}</span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Odak koruması' : 'Focus guard'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Dikkatinizi dağıtan bir şey açtığınızda Bedo sizi bir an durdurur: önce nefes alın, sonra karar verin.'
                      : 'Open something that distracts you and Bedo stops you for a moment: breathe first, then you choose.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.focusGuardEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ focusGuardEnabled: !settings.focusGuardEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Yalnızca Odak Sayacı çalışırken' : 'Only while Focus Timer runs'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Açıkken odak koruması yalnızca ada üzerindeki odak sayacı aktifken devreye girer'
                      : 'When enabled, Focus Guard only triggers while the island Focus Timer is running'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.focusGuardOnlyDuringFocus ? 'on' : ''}`}
                  onClick={() => updateSetting({ focusGuardOnlyDuringFocus: !settings.focusGuardOnlyDuringFocus })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row align-top">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Uygulamalar ve siteler' : 'Apps and sites'}</strong>
                  <span>{langCode === 'tr' ? 'Dikkatinizi neyin dağıttığını seçin' : 'Pick what distracts you'}</span>
                </div>
                <div className="fg-lg-site-grid">
                  {focusSites.map(({ name, domain }) => {
                    const active = (settings.focusGuardApps || []).includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`fg-lg-site-chip ${active ? 'active' : ''}`}
                        onClick={() => {
                          const curr = settings.focusGuardApps || [];
                          const next = active ? curr.filter((x) => x !== name) : [...curr, name];
                          updateSetting({ focusGuardApps: next });
                        }}
                      >
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                          alt=""
                          className="fg-lg-site-logo"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="settings-row align-top">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bilgisayardaki uygulamalar' : 'Apps on this PC'}</strong>
                  <span>
                    {installedAppsLoading
                      ? langCode === 'tr'
                        ? 'Yüklü uygulamalar taranıyor…'
                        : 'Scanning installed apps…'
                      : langCode === 'tr'
                      ? 'PC’nizde algılanan programları da tek tıkla odak korumasına ekleyin'
                      : 'Add detected apps on your PC to Focus Guard in one click'}
                  </span>
                  <div className="fg-lg-local-tools">
                    <input
                      type="text"
                      className="settings-input apps-lg-installed-search"
                      placeholder={langCode === 'tr' ? 'Program ara…' : 'Search apps…'}
                      value={fgAppQuery}
                      onChange={(e) => setFgAppQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="apps-lg-mini-btn"
                      disabled={installedAppsLoading}
                      onClick={() => loadInstalledApps(true)}
                      title={langCode === 'tr' ? 'Listeyi yenile' : 'Refresh list'}
                    >
                      <RefreshCw size={13} className={installedAppsLoading ? 'spin-icon' : ''} />
                    </button>
                  </div>
                </div>
                <div className="fg-lg-site-grid fg-lg-local-grid">
                  {installedApps
                    .filter((item) =>
                      !fgAppQuery.trim()
                        ? true
                        : item.name.toLowerCase().includes(fgAppQuery.trim().toLowerCase())
                    )
                    .slice(0, 15)
                    .map((item) => {
                      const active = (settings.focusGuardApps || []).includes(item.name);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`fg-lg-site-chip ${active ? 'active' : ''}`}
                          onClick={() => {
                            const curr = settings.focusGuardApps || [];
                            const next = active ? curr.filter((x) => x !== item.name) : [...curr, item.name];
                            updateSetting({ focusGuardApps: next });
                          }}
                          title={item.name}
                        >
                          {item.iconDataUrl ? (
                            <img src={item.iconDataUrl} alt="" className="fg-lg-site-logo" />
                          ) : (
                            <span className="fg-lg-site-mono">{item.name.slice(0, 1).toUpperCase()}</span>
                          )}
                          <span className="fg-lg-site-name">{item.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Kendi uygulamanız veya siteniz' : 'Your own app or site'}</strong>
                  <span>{langCode === 'tr' ? 'Adından kelimeler, aralarına virgül koyarak (ör. roblox, fortnite)' : 'Words from its name, with commas in between (e.g. roblox, fortnite)'}</span>
                </div>
                <div className="row-right-group">
                  <input
                    type="text"
                    className="settings-input w-200"
                    placeholder="roblox, fortnite"
                    value={fgCustomDraft}
                    onChange={(e) => setFgCustomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveCustomTerms();
                    }}
                  />
                  <button type="button" className="dark-pill-btn sm" onClick={saveCustomTerms}>
                    {fgSavedFeedback ? (langCode === 'tr' ? 'Kaydedildi ✓' : 'Saved ✓') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 20 }}>
              {langCode === 'tr' ? 'ZAMANLAMA VE GİZLİLİK' : 'TIMING & PRIVACY'}
            </span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bekleme' : 'Wait'}</strong>
                  <span>{langCode === 'tr' ? 'Önce ne kadar süre nefes alıp vereceğiniz' : 'How long you breathe in and out first'}</span>
                </div>
                <div className="seg-btn-group">
                  {[3, 5, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`seg-choice-btn ${
                        settings.focusGuardWaitSec === s ? 'active' : ''
                      }`}
                      onClick={() => updateSetting({ focusGuardWaitSec: s })}
                    >
                      {langCode === 'tr' ? `${s} sn` : `${s} sec`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Sonra şu kadar rahat bırak' : 'Then leave you alone for'}</strong>
                  <span>{langCode === 'tr' ? 'Yine de açtığınızda Bedo’nun sizi ne kadar süre rahatsız etmeyeceği' : 'How long Bedo lets you be when you open it anyway'}</span>
                </div>
                <div className="seg-btn-group">
                  {[5, 15, 30].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`seg-choice-btn ${
                        settings.focusGuardLeaveMin === m ? 'active' : ''
                      }`}
                      onClick={() => updateSetting({ focusGuardLeaveMin: m })}
                    >
                      {langCode === 'tr' ? `${m} dk` : `${m} min`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Gizlilik' : 'Privacy'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Bedo yalnızca kendi PC’nizdeki ön pencerenin adına bakar. Hiçbir şey saklanmaz veya gönderilmez.'
                      : 'Bedo only looks at the name of the window in front, on your own PC. Nothing is stored or sent.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {activePage === 'gameopt' && (() => {
          const optEnabled = settings.gameOptEnabled !== false;
          const activeOptCount = [
            settings.gameOptHideIsland !== false,
            settings.gameOptPauseAnimations !== false,
            settings.gameOptDisableBlur !== false,
            settings.gameOptPauseBackgroundPolling !== false,
            settings.gameOptPauseBedoVoice === true,
            settings.gameOptAllowHudAndNotifs === false,
            settings.gameOptDeepHideWindow === true,
          ].filter(Boolean).length;

          const applyPreset = (preset) => {
            if (preset === 'balanced') {
              updateSetting({
                gameOptEnabled: true,
                gameOptHideIsland: true,
                gameOptPauseAnimations: true,
                gameOptDisableBlur: true,
                gameOptPauseBackgroundPolling: true,
                gameOptPauseBedoVoice: false,
                gameOptAllowHudAndNotifs: true,
                gameOptDeepHideWindow: false,
              });
            } else if (preset === 'maxfps') {
              updateSetting({
                gameOptEnabled: true,
                gameOptHideIsland: true,
                gameOptPauseAnimations: true,
                gameOptDisableBlur: true,
                gameOptPauseBackgroundPolling: true,
                gameOptPauseBedoVoice: true,
                gameOptAllowHudAndNotifs: false,
                gameOptDeepHideWindow: true,
              });
            } else if (preset === 'light') {
              updateSetting({
                gameOptEnabled: true,
                gameOptHideIsland: false,
                gameOptPauseAnimations: true,
                gameOptDisableBlur: false,
                gameOptPauseBackgroundPolling: true,
                gameOptPauseBedoVoice: false,
                gameOptAllowHudAndNotifs: true,
                gameOptDeepHideWindow: false,
              });
            }
          };

          const isBalanced =
            optEnabled &&
            settings.gameOptHideIsland !== false &&
            settings.gameOptPauseAnimations !== false &&
            settings.gameOptDisableBlur !== false &&
            settings.gameOptPauseBackgroundPolling !== false &&
            settings.gameOptPauseBedoVoice !== true &&
            settings.gameOptAllowHudAndNotifs !== false &&
            settings.gameOptDeepHideWindow !== true;

          const isMaxFps =
            optEnabled &&
            settings.gameOptPauseBackgroundPolling !== false &&
            settings.gameOptPauseBedoVoice === true &&
            settings.gameOptAllowHudAndNotifs === false &&
            settings.gameOptDeepHideWindow === true;

          const isLight =
            optEnabled &&
            settings.gameOptHideIsland === false &&
            settings.gameOptPauseAnimations !== false &&
            settings.gameOptDisableBlur === false &&
            settings.gameOptPauseBackgroundPolling !== false &&
            settings.gameOptPauseBedoVoice !== true &&
            settings.gameOptAllowHudAndNotifs !== false &&
            settings.gameOptDeepHideWindow !== true;

          return (
          <div className="settings-section ai-lg-section gameopt-lg-page">
            <div className={`gameopt-lg-hero ${optEnabled ? 'is-enabled' : 'is-off'} ${gameModeLive ? 'is-live' : ''}`}>
              <div className="gameopt-lg-hero-glow" aria-hidden="true" />
              <div className="gameopt-hero-top">
                <div className="gameopt-hero-lead">
                  <div className="gameopt-hero-icon" aria-hidden="true">
                    <Gamepad2 size={20} strokeWidth={1.8} />
                  </div>
                  <div className="gameopt-hero-copy">
                    <span className="gameopt-hero-eyebrow">
                      {langCode === 'tr' ? 'OTOMATİK OYUN OPTİMİZASYONU' : 'AUTOMATIC GAME OPTIMIZATION'}
                    </span>
                    <h3>
                      {langCode === 'tr'
                        ? 'FPS Düşüren Özellikleri Oyunda Otomatik Kapat'
                        : 'Automatically Pause FPS-Heavy Features in Games'}
                    </h3>
                    <p>
                      {langCode === 'tr'
                        ? 'Tam ekran oyun algılandığında seçtiğin ağır özellikler anında durdurulur; oyundan çıktığında veya Alt+Tab yaptığında otomatik olarak geri açılır.'
                        : 'When a fullscreen game is detected, selected heavy features pause automatically and restore the moment you exit or Alt+Tab.'}
                    </p>
                  </div>
                </div>

                <div className={`gameopt-status-capsule ${optEnabled ? (gameModeLive ? 'is-live' : 'is-ready') : 'is-off'}`}>
                  <span className="gameopt-status-primary">
                    {!optEnabled
                      ? langCode === 'tr'
                        ? 'Kapalı'
                        : 'Off'
                      : gameModeLive
                      ? langCode === 'tr'
                        ? 'Oyun Aktif'
                        : 'Game Active'
                      : langCode === 'tr'
                      ? 'Hazır'
                      : 'Ready'}
                  </span>
                  {optEnabled && (
                    <span className="gameopt-status-meta">
                      {langCode === 'tr'
                        ? `${activeOptCount} aktif`
                        : `${activeOptCount} active`}
                    </span>
                  )}
                </div>
              </div>

              <div className="gameopt-preset-bar">
                <span className="gameopt-preset-label">
                  {langCode === 'tr' ? 'Hızlı profil' : 'Quick preset'}
                </span>
                <div className="gameopt-segmented" role="group" aria-label={langCode === 'tr' ? 'Hızlı profiller' : 'Quick presets'}>
                  <button
                    type="button"
                    className={`gameopt-seg-btn ${isBalanced ? 'active' : ''}`}
                    onClick={() => applyPreset('balanced')}
                  >
                    {langCode === 'tr' ? 'Dengeli' : 'Balanced'}
                  </button>
                  <button
                    type="button"
                    className={`gameopt-seg-btn ${isMaxFps ? 'active' : ''}`}
                    onClick={() => applyPreset('maxfps')}
                  >
                    {langCode === 'tr' ? 'Maksimum FPS' : 'Max FPS'}
                  </button>
                  <button
                    type="button"
                    className={`gameopt-seg-btn ${isLight ? 'active' : ''}`}
                    onClick={() => applyPreset('light')}
                  >
                    {langCode === 'tr' ? 'Hafif' : 'Light'}
                  </button>
                </div>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'GENEL KONTROL' : 'MASTER CONTROL'}</span>
            <div className="settings-card ai-lg-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Otomatik oyun optimizasyonu' : 'Automatic game optimization'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Tam ekran oyun (EA AntiCheat, Vanguard, EAC dahil) algılandığında aşağıdaki ayarları uygular ve oyun kapanınca otomatik geri açar.'
                      : 'Applies the toggles below when a fullscreen game runs (including anti-cheat games) and automatically restores them when the game closes.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${optEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptEnabled: !optEnabled })}
                >
                  <i />
                </button>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'GÖRSEL & GPU OPTİMİZASYONLARI' : 'VISUAL & GPU OPTIMIZATIONS'}</span>
            <div className={`settings-card ai-lg-card ${!optEnabled ? 'gameopt-card-disabled' : ''}`}>
              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Oyunda boştayken adayı gizle (Akıcı)' : 'Smoothly hide island while idle in game'}</strong>
                    <span className="gameopt-impact-tag is-high">GPU / DWM</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Bildirim veya HUD yokken adayı GPU üzerinden yumuşakça gizler. HUD/bildirim geldiğinde kasmadan akıcı şekilde açılır, oyun bitince geri gelir.'
                      : 'Smoothly fades the island out on the GPU when idle so DWM does zero repaints; HUDs and notifications glide in smoothly and the island restores on exit.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptHideIsland !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptHideIsland: !(settings.gameOptHideIsland !== false) })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Boştaki sonsuz animasyonları duraklat' : 'Pause background infinite animations'}</strong>
                    <span className="gameopt-impact-tag is-high">GPU / CPU</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Robo göz, glow ve arka plan CSS animasyonlarını oyun sırasında duraklatır; HUD/bildirim animasyonları akıcı kalır, oyun bitince otomatik açılır.'
                      : 'Pauses idle glow/breathe CSS animations during games to eliminate continuous GPU/renderer frames while keeping HUD and notification animations fluid.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptPauseAnimations !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptPauseAnimations: !(settings.gameOptPauseAnimations !== false) })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Cam efektini (Backdrop Blur) oyunda kapat' : 'Disable backdrop blur in games'}</strong>
                    <span className="gameopt-impact-tag is-med">iGPU / DWM</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Oyun sırasında ağır backdrop-filter blur hesaplamasını kapatır; HUD/bildirim geçişleri daha akıcı olur, oyun kapanınca otomatik geri açılır.'
                      : 'Disables heavy backdrop-filter blur passes during games for smoother HUD/notification transitions, automatically restored on exit.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptDisableBlur !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptDisableBlur: !(settings.gameOptDisableBlur !== false) })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Agresif mod: Pencereyi DWM’den tamamen gizle' : 'Aggressive mode: Fully hide window from DWM'}</strong>
                    <span className="gameopt-impact-tag is-max">{langCode === 'tr' ? 'Maksimum FPS' : 'Max FPS'}</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Şeffaf pencereyi oyunda tamamen kapatır (hide) ve oyun kapanınca otomatik geri açar. Not: HUD/bildirim açıksa gelirken ufak bir uyanma gecikmesi olabilir.'
                      : 'Fully hides the transparent Electron window during gameplay for maximum MPO/Flip Model FPS and restores on exit. May add a brief wake hiccup if HUDs are enabled.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptDeepHideWindow === true ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptDeepHideWindow: !(settings.gameOptDeepHideWindow === true) })}
                >
                  <i />
                </button>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'ARKA PLAN, CPU & RAM OPTİMİZASYONLARI' : 'BACKGROUND, CPU & RAM OPTIMIZATIONS'}</span>
            <div className={`settings-card ai-lg-card ${!optEnabled ? 'gameopt-card-disabled' : ''}`}>
              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Arka plan taramalarını durdur (Medya / Pano / AI)' : 'Pause background polling (Media / Clipboard / AI)'}</strong>
                    <span className="gameopt-impact-tag is-high">CPU / Defender</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Periyodik PowerShell medya sorgularını, pano ve AI geçmiş taramasını oyunda durdurur. Windows Defender kaynaklı anlık FPS droplarını keser; oyun kapanınca devam eder.'
                      : 'Stops periodic PowerShell media spawns, clipboard polling, and AI history disk scans during games to prevent Windows Defender CPU spikes; resumes automatically on exit.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptPauseBackgroundPolling !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptPauseBackgroundPolling: !(settings.gameOptPauseBackgroundPolling !== false) })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Bedo sesli asistanı (Mikrofon) oyunda uyut' : 'Pause Bedo voice assistant during games'}</strong>
                    <span className="gameopt-impact-tag is-high">CPU / RAM</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Oyun sırasında Python sesli dinleyiciyi uyutur; oyun bittiğinde önceden açıksa otomatik olarak tekrar aktif eder.'
                      : 'Pauses the Bedo voice listener while gaming and automatically resumes it after the game closes if it was running before.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptPauseBedoVoice === true ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptPauseBedoVoice: !(settings.gameOptPauseBedoVoice === true) })}
                >
                  <i />
                </button>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'OYUN İÇİ BİLDİRİM & HUD' : 'IN-GAME NOTIFICATIONS & HUDS'}</span>
            <div className={`settings-card ai-lg-card ${!optEnabled ? 'gameopt-card-disabled' : ''}`}>
              <div className="settings-row">
                <div className="row-text-col">
                  <div className="gameopt-row-title">
                    <strong>{langCode === 'tr' ? 'Oyun sırasında HUD ve bildirimlere izin ver' : 'Allow HUDs & notifications during games'}</strong>
                    <span className="gameopt-impact-tag is-info">{langCode === 'tr' ? 'HUD & Bildirim' : 'HUD & Alerts'}</span>
                  </div>
                  <span>
                    {langCode === 'tr'
                      ? 'Açıkken ses, parlaklık, G-Helper HUD ve Windows bildirimleri oyun üstünde görünür. Kapatırsan oyun sırasında sıfır kesinti olur, çıkınca her şey normale döner.'
                      : 'When enabled, volume, brightness, G-Helper HUDs, and Windows notifications appear over games. Turn off for zero-interruption competitive play.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.gameOptAllowHudAndNotifs !== false ? 'on' : ''}`}
                  onClick={() => updateSetting({ gameOptAllowHudAndNotifs: !(settings.gameOptAllowHudAndNotifs !== false) })}
                >
                  <i />
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ============================================================
            PAGE 12: END
            ============================================================ */}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
      {settingsLoaded && (showOnboarding || settings.onboardingCompleted === false) && (
        <motion.div
          key="welcome-backdrop"
          className="bedo-welcome-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Bedo Welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="bedo-welcome-card"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.9 }}
          >
            <div className="bedo-welcome-steps">
              {[1, 2, 3].map((step) => (
                <span key={step} className={`bedo-welcome-pip ${onboardingStep === step ? 'is-active' : onboardingStep > step ? 'is-done' : ''}`} />
              ))}
            </div>

            <AnimatePresence mode="wait">
            {onboardingStep === 1 && (
              <motion.div
                key="welcome-step-1"
                className="bedo-welcome-body"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              >
                <div className="bedo-welcome-orb">
                  <span />
                  <span />
                </div>
                <h2>{langCode === 'tr' ? 'Bedo’ya Hoş Geldiniz' : 'Welcome to Bedo'}</h2>
                <p>
                  {langCode === 'tr'
                    ? 'Windows için akıllı Dynamic Island ve sesli yapay zekâ asistanınız. Başlamak için dilinizi ve adınızı seçin.'
                    : 'Your intelligent Dynamic Island and voice AI assistant for Windows. Choose your language and name to begin.'}
                </p>

                <div className="bedo-welcome-fields">
                  <div className="bedo-welcome-field">
                    <label>{langCode === 'tr' ? 'Dil / Language' : 'Language'}</label>
                    <div className="seg-btn-group bedo-welcome-seg">
                      {[
                        { value: 'Turkish', code: 'tr', label: 'Türkçe' },
                        { value: 'English', code: 'en', label: 'English' },
                      ].map((lng) => (
                        <button
                          key={lng.value}
                          type="button"
                          className={`seg-choice-btn ${langCode === lng.code ? 'active' : ''}`}
                          onClick={() => updateSetting({ language: lng.value })}
                        >
                          {lng.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bedo-welcome-field">
                    <label>{langCode === 'tr' ? 'Adınız' : 'Your Name'}</label>
                    <input
                      type="text"
                      className="settings-input full"
                      placeholder={langCode === 'tr' ? 'Örn. Ahmet' : 'e.g. Alex'}
                      value={settings.userName || ''}
                      onChange={(e) => updateSetting({ userName: e.target.value })}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {onboardingStep === 2 && (
              <motion.div
                key="welcome-step-2"
                className="bedo-welcome-body"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              >
                <h2>{langCode === 'tr' ? 'Bedo Ses ve API Kurulumu' : 'Voice & API Setup'}</h2>
                <p>
                  {langCode === 'tr'
                    ? 'Sesli asistan için Google Gemini API anahtarınızı ve Bedo’nun ses tonunu seçebilirsiniz.'
                    : 'Enter your Google Gemini API key for voice AI and pick Bedo’s voice.'}
                </p>

                <div className="bedo-welcome-fields">
                  <div className="bedo-welcome-field">
                    <label>
                      {langCode === 'tr' ? 'Gemini API Anahtarı (İsteğe Bağlı)' : 'Gemini API Key (Optional)'}
                    </label>
                    <input
                      type="password"
                      className="settings-input full"
                      placeholder="AIzaSy..."
                      value={settings.geminiApiKey || ''}
                      onChange={(e) => updateSetting({ geminiApiKey: e.target.value })}
                    />
                  </div>
                  <div className="bedo-welcome-field">
                    <label>{langCode === 'tr' ? 'Bedo Sesi' : 'Bedo Voice'}</label>
                    <div className="seg-btn-group">
                      {['Charon', 'Fenrir', 'Puck', 'Aoede', 'Zephyr'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`seg-choice-btn ${(settings.bedoVoice || 'Charon') === v ? 'active' : ''}`}
                          onClick={() => updateSetting({ bedoVoice: v })}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bedo-welcome-switch-row">
                    <span>{langCode === 'tr' ? 'Windows ile başlat' : 'Start with Windows'}</span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.startWithWindows !== false ? 'on' : ''}`}
                      onClick={() => updateSetting({ startWithWindows: settings.startWithWindows === false })}
                    >
                      <i />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {onboardingStep === 3 && (
              <motion.div
                key="welcome-step-3"
                className="bedo-welcome-body"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                <div className="bedo-welcome-check">
                  <Check size={26} strokeWidth={2.5} />
                </div>
                <h2>{langCode === 'tr' ? 'Her Şey Hazır!' : 'All Set!'}</h2>
                <p>
                  {langCode === 'tr'
                    ? 'Ekranın üstündeki Dynamic Island’a dokunun veya istediğiniz an "Bedo" diyerek asistanınızı uyandırın.'
                    : 'Tap the Dynamic Island at the top of your screen or say "Bedo" anytime to wake your assistant.'}
                </p>
                <div className="bedo-welcome-shortcuts">
                  <div className="bedo-welcome-shortcut-card">
                    <strong>Ctrl+Alt+T</strong>
                    <span>{langCode === 'tr' ? 'Adayı Aç / Kapat' : 'Toggle Island'}</span>
                  </div>
                  <div className="bedo-welcome-shortcut-card">
                    <strong>Ctrl+Alt+Space</strong>
                    <span>{langCode === 'tr' ? 'Bedo ile Konuş' : 'Talk to Bedo'}</span>
                  </div>
                  <div className="bedo-welcome-shortcut-card">
                    <strong>{langCode === 'tr' ? 'Akıllı Odak' : 'Smart Focus'}</strong>
                    <span>{langCode === 'tr' ? 'Sayaç & Koruma' : 'Timer & Guard'}</span>
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>

            <div className="bedo-welcome-footer">
              {onboardingStep > 1 ? (
                <button
                  type="button"
                  className="dark-pill-btn"
                  onClick={() => setOnboardingStep((s) => Math.max(1, s - 1))}
                >
                  {langCode === 'tr' ? 'Geri' : 'Back'}
                </button>
              ) : (
                <button
                  type="button"
                  className="dark-pill-btn"
                  onClick={() => {
                    updateSetting({ onboardingCompleted: true });
                    setShowOnboarding(false);
                  }}
                >
                  {langCode === 'tr' ? 'Atla' : 'Skip'}
                </button>
              )}

              {onboardingStep < 3 ? (
                <button
                  type="button"
                  className="white-pill-btn"
                  onClick={() => setOnboardingStep((s) => Math.min(3, s + 1))}
                >
                  {langCode === 'tr' ? 'Devam Et' : 'Continue'}
                </button>
              ) : (
                <button
                  type="button"
                  className="white-pill-btn"
                  onClick={() => {
                    updateSetting({ onboardingCompleted: true });
                    setShowOnboarding(false);
                  }}
                >
                  {langCode === 'tr' ? 'Bedo’yu Başlat' : 'Start Bedo'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
    </LanguageProvider>
  );
}
