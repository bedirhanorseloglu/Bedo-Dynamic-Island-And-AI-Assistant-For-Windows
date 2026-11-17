import React, { useState, useEffect, useMemo } from 'react';
import RealAppIcon from './RealAppIcon';
import {
  Home,
  Plug,
  MessageSquare,
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
  Sparkles,
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
} from 'lucide-react';
import './settings.css';
import { playRoboSound, playNotifSound } from './sounds';
import { applyTypographyTokens, CLOCK_FONT_OPTIONS, CLOCK_STORAGE_KEY, normalizeFontIndex, readTypographyPreferences, TEXT_FONT_OPTIONS, TYPOGRAPHY_STORAGE_KEY } from './typography';
import { LanguageProvider, createTranslator, getLocale, languageLabel, normalizeLanguage } from './i18n';

const DEFAULT_SETTINGS = {
  userName: 'Bedirhan',
  googleEmail: '',
  googleConnected: false,
  calEnabled: false,
  newMailEnabled: false,
  mailFileEnabled: false,
  claudeEnabled: true,
  codexEnabled: true,
  claudeApiKey: '',
  codexApiKey: '',
  geminiApiKey: '',
  bedoVoice: 'Charon',
  antigravityApiKey: '',
  apps: [],
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
  islandSeeThrough: 0,
  islandMusicColour: true,
  islandOpenMode: 'On hover',
  leftOfRobo: 'Nothing',
  roboEyesVisible: true,
  rightOfRobo: 'Nothing',
  clockFormat: 'Automatic',
  lyricsEnabled: true,
  focusGuardEnabled: false,
  focusGuardApps: ['YouTube', 'TikTok', 'Instagram'],
  focusGuardCustom: '',
  focusGuardWaitSec: 5,
  focusGuardLeaveMin: 5,
};

const PAGE_HEADERS = {
  home: { title: 'Home', subtitle: '' },
  connections: { title: 'Agents', subtitle: 'Connect Codex and Antigravity to TwoCode' },
  aichat: { title: 'AI & Chat', subtitle: "Which AI Robo's chat talks to" },
  apps: { title: 'Apps', subtitle: 'Pick which apps are in your TwoCode' },
  robo: { title: 'Robo', subtitle: 'His name, eyes, behaviour and badges', hasSearch: true },
  wardrobe: {
    title: 'Wardrobe',
    subtitle: 'Pick what Robo wears. He tries it on right away.',
  },
  account: { title: 'Account', subtitle: 'Your account and your TwoCode' },
  general: {
    title: 'General',
    subtitle: 'Language, behaviour and TwoCode itself',
    hasSearch: true,
  },
  typography: { title: 'Typography', subtitle: 'Choose the fonts used across TwoCode' },
  notifications: { title: 'Notifications', subtitle: '' },
  island: {
    title: 'Island',
    subtitle: 'How the island looks and what it shows',
    hasSearch: true,
  },
  focusguard: {
    title: 'Focus guard',
    subtitle: 'Robo stops you for a moment when something distracts you',
    hasSearch: true,
  },
  news: { title: 'News', subtitle: 'What is new in TwoCode' },
  support: { title: 'Support TwoCode', subtitle: 'Help TwoCode grow' },
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

// Crowned Robo SVG Avatar matching the screenshots
function RoboCrownAvatar({ outfit = 'Best', size = 64, eyeHex = '#ffffff' }) {
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
        <line x1="60" y1="22" x2="60" y2="48" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="60" cy="20" rx="4.5" ry="6.5" fill="#ffffff" />
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
          <polygon points="42,88 60,44 78,88" fill="#a855f7" stroke="#f472b6" strokeWidth="2" />
        )}
        {/* Robo White Head Dome */}
        <path
          d="M 28 118 C 32 88, 88 88, 92 118 Z"
          fill="#ffffff"
          style={{ filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.65))' }}
        />
        {/* Sunglasses */}
        {outfit === 'Sunglasses' && (
          <g>
            <rect x="38" y="96" width="18" height="10" rx="2" fill="#111" />
            <rect x="64" y="96" width="18" height="10" rx="2" fill="#111" />
            <line x1="56" y1="100" x2="64" y2="100" stroke="#111" strokeWidth="2.5" />
          </g>
        )}
      </svg>
    </div>
  );
}

export default function SettingsApp() {
  const [activePage, setActivePage] = useState('home');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [textFontIndex, setTextFontIndex] = useState(() => readTypographyPreferences().textFontIndex);
  const [numberFontIndex, setNumberFontIndex] = useState(() => {
    try { return normalizeFontIndex(JSON.parse(localStorage.getItem(CLOCK_STORAGE_KEY) || '{}').fontIndex, CLOCK_FONT_OPTIONS.length, 3); }
    catch { return 3; }
  });
  const [now, setNow] = useState(new Date());
  const [liveMedia, setLiveMedia] = useState({ hasSession: false });
  const [aiHistory, setAiHistory] = useState({
    codexJobs: [
      {
        id: 'c1',
        agent: 'Codex',
        title: 'ne kadar limitim kaldığını görebiliyor muyum',
        time: '02:49',
      },
      { id: 'c2', agent: 'Codex', title: 'naber', time: '02:48' },
    ],
    claudeJobs: [],
    jobsToday: 2,
  });
  const [agentIntegration, setAgentIntegration] = useState({ codexConnected: false, antigravityConnected: false, antigravityIdePath: '' });
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
  const [showKeyAntigravity, setShowKeyAntigravity] = useState(false);

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
        try { setNumberFontIndex(normalizeFontIndex(JSON.parse(event.newValue).fontIndex, CLOCK_FONT_OPTIONS.length, 3)); }
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
    });

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

    return () => {
      if (unsubSettings) unsubSettings();
      if (unsubNavigate) unsubNavigate();
      if (unsubAi) unsubAi();
      if (unsubMedia) unsubMedia();
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
      setAgentIntegration(result.status);
      setAgentIntegrationMessage(t('settings.agents.installSuccess'));
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

  return (
    <LanguageProvider language={settings.language}>
    <div className="twocode-settings-window">
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
              <strong>TwoCode</strong>
              <span>{t('settings.subtitle')}</span>
            </div>
          </div>
          <span className="beta-pill">BETA</span>
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
              { id: 'wardrobe', label: t('settings.nav.wardrobe'), icon: Shirt },
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
              { id: 'account', label: t('settings.nav.account'), icon: User },
              { id: 'general', label: t('settings.nav.general'), icon: SlidersHorizontal },
              { id: 'typography', label: t('settings.nav.typography'), icon: Type },
              { id: 'notifications', label: t('settings.nav.notifications'), icon: Bell },
              { id: 'island', label: t('settings.nav.island'), icon: PanelTop },
              { id: 'focusguard', label: t('settings.nav.focusguard'), icon: Shield },
              { id: 'news', label: t('settings.nav.news'), icon: Newspaper },
              { id: 'support', label: t('settings.nav.support'), icon: Heart },
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
            <RoboCrownAvatar outfit={settings.outfit} size={34} />
          </div>
          <div className="mini-robo-meta">
            <strong>{settings.roboName || 'Robo'}</strong>
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
            activePage === 'notifications' ? 'compact-banner' : ''
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
          <div className="hero-notch-preview clock-notch-preview">
            {liveMedia && liveMedia.hasSession && liveMedia.isPlaying ? (
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
            ) : (
              <div className="hero-notch-toprow">
                <span className="hero-notch-date">{formatDateTop(now)}</span>
                <div className="hero-notch-eyes">
                  <i style={{ background: settings.eyeColorHex || '#fff' }} />
                  <i style={{ background: settings.eyeColorHex || '#fff' }} />
                </div>
              </div>
            )}
            <div className="hero-notch-clock">{formatTimeHHMM(now)}</div>
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

        {/* ============================================================
            PAGE 1: HOME
            ============================================================ */}
        {activePage === 'home' && (
          <div className="settings-page-body">
            <div className="home-greeting-bar">
              <div>
                <h2 className="greeting-heading">
                  {greetingTimeOfDay}, {settings.userName}
                </h2>
                <p className="greeting-sub">
                  {t('settings.home.sub')}
                </p>
              </div>
              <div className="greeting-ai-pills">
                <div className="ai-status-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon claude">
                    <i />
                    <i />
                  </span>
                  <strong>Claude Code</strong>
                  <span>{t('settings.home.idle')}</span>
                </div>
                <div className="ai-status-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon codex">
                    <i />
                    <i />
                  </span>
                  <strong>Codex</strong>
                  <span>{t('settings.home.idle')}</span>
                </div>
                <div className="ai-status-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon gemini">
                    <RealAppIcon sc={{ id: 'settings-pill-gemini', type: 'gemini' }} size={15} />
                  </span>
                  <strong>Gemini</strong>
                  <span>{t('settings.home.active')}</span>
                </div>
                <div className="ai-status-pill" onClick={() => setActivePage('connections')}>
                  <span className="ai-badge-icon antigravity">
                    <i />
                    <i />
                  </span>
                  <strong>Antigravity</strong>
                  <span>{t('settings.home.active')}</span>
                </div>
              </div>
            </div>

            <div className="home-stats-grid">
              <div className="stat-box-card">
                <div className="stat-icon-sq green">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <div className="stat-meta">
                  <strong>{aiHistory.jobsToday || 0}</strong>
                  <span>{t('settings.home.tasksDone')}</span>
                </div>
              </div>

              <div className="stat-box-card">
                <div className="stat-icon-sq blue">
                  <Calendar size={16} />
                </div>
                <div className="stat-meta">
                  <strong>{aiHistory.jobsToday || 0}</strong>
                  <span>{t('settings.home.today')}</span>
                </div>
              </div>

              <div className="stat-box-card">
                <div className="stat-icon-sq amber">
                  <Flame size={16} />
                </div>
                <div className="stat-meta">
                  <strong>1</strong>
                  <span>{t('settings.home.daysStreak')}</span>
                </div>
              </div>
            </div>

            <div className="home-two-col">
              <div className="home-activity-col">
                <div className="activity-header-row">
                  <h3>{t('settings.home.activity')}</h3>
                  <input
                    type="text"
                    className="activity-search-input"
                    placeholder={t('settings.home.searchActivity')}
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                  />
                </div>

                <div className="settings-card activity-list-card">
                  <span className="activity-day-label">{t('common.today')}</span>
                  <div className="activity-items-wrap">
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
                        <div key={job.id || idx} className="activity-item-row">
                          <span className={`ai-badge-icon ${badgeClass}`}>
                            {badgeClass === 'gemini' ? (
                              <RealAppIcon sc={{ id: `activity-gemini-${idx}`, type: 'gemini' }} size={15} />
                            ) : (
                              <>
                                <i />
                                <i />
                              </>
                            )}
                          </span>
                          <div className="activity-item-center">
                            <strong>{job.title}</strong>
                            <span>
                              {job.time} · {agentLabel} · {idx === 0 ? '2 s' : '1 s'}
                            </span>
                          </div>
                          <span className="activity-done-tag">{t('settings.home.done')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="home-side-col">
                <div className="settings-card quick-links-card">
                  <button
                    type="button"
                    className="quick-link-row"
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
                    className="quick-link-row"
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
                    className="quick-link-row"
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

                <div className="settings-card tip-card">
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
            PAGE 2: CONNECTIONS
            ============================================================ */}
        {activePage === 'connections' && (
          <div className="settings-page-body">
            <section className="agents-hero">
              <div className="agents-hero-orbit agents-hero-orbit-one" />
              <div className="agents-hero-orbit agents-hero-orbit-two" />
              <div className="agents-hero-copy">
                <span className="agents-eyebrow"><Sparkles size={12} /> {langCode === 'tr' ? 'YEREL AJAN MASANIZ' : 'YOUR LOCAL AGENT DESK'}</span>
                <h2>{langCode === 'tr' ? (<>Tüm ajanların,<br /><span>tek sessiz sinyal.</span></>) : (<>All your agents,<br /><span>one quiet signal.</span></>)}</h2>
                <p>{langCode === 'tr' ? 'Codex veya Antigravity düşünmeye başladığında ve yanıtı hazır olduğunda görün. Etkinlik bu PC’de kalır ve Ada’da görünür.' : 'See when Codex or Antigravity starts thinking and when its answer is ready. Activity stays on this PC and appears in the Island.'}</p>
              </div>
              <div className="agents-hero-action">
                <span className={`agents-bridge-status ${agentIntegration.codexConnected || agentIntegration.antigravityConnected ? 'is-ready' : ''}`}><i />{agentIntegration.codexConnected || agentIntegration.antigravityConnected ? (langCode === 'tr' ? 'Köprü hazır' : 'Bridge ready') : (langCode === 'tr' ? 'Köprü bağlı değil' : 'Bridge not connected')}</span>
                <button type="button" className="agent-connect-button" onClick={connectAgentTools} disabled={agentIntegrationBusy}>
                  {agentIntegrationBusy ? <RefreshCw size={14} className="agent-spin-icon" /> : <Link2 size={14} />}
                  {agentIntegrationBusy ? (langCode === 'tr' ? 'Bağlanıyor…' : 'Connecting…') : agentIntegration.codexConnected && agentIntegration.antigravityConnected ? (langCode === 'tr' ? 'Kurulumu yenile' : 'Refresh setup') : (langCode === 'tr' ? 'Ajanları bağla' : 'Connect agents')}
                </button>
              </div>
            </section>
            {agentIntegrationMessage && <div className={`agent-integration-message ${/could not|not responding|yanıt vermiyor|bulunamad|kurulamad|başarısız/i.test(agentIntegrationMessage) ? 'error' : 'success'}`} role="status">{agentIntegrationMessage}</div>}

            <div className="agents-summary-strip">
              <div><span className="agents-summary-icon blue"><Link2 size={14} /></span><span><strong>{Number(agentIntegration.codexConnected) + Number(agentIntegration.antigravityConnected)}<small> / 2</small></strong><small>{langCode === 'tr' ? 'kanca kurulu' : 'hooks installed'}</small></span></div>
              <div><span className="agents-summary-icon mint"><Check size={14} /></span><span><strong>{aiHistory.jobsToday || 0}</strong><small>{langCode === 'tr' ? 'bugünkü görev' : 'tasks today'}</small></span></div>
              <div><span className="agents-summary-icon violet"><Bell size={14} /></span><span><strong>{recentAgentJobs.length ? recentAgentJobs[0].agent : t('common.ready')}</strong><small>{recentAgentJobs.length ? (langCode === 'tr' ? `son aktif · ${recentAgentJobs[0].time}` : `last active · ${recentAgentJobs[0].time}`) : (langCode === 'tr' ? 'etkinlik bekleniyor' : 'waiting for activity')}</small></span></div>
            </div>

            <div className="agent-connection-grid">
              <section className="agent-connection-card codex" style={{ '--agent-rgb': '97, 152, 255', '--agent-hex': '#6198ff' }}>
                <div className="agent-card-heading"><span className="ai-badge-icon lg codex"><i /><i /></span><div><strong>Codex</strong><span>App · CLI · VS Code</span></div><span className={`agent-status-pill ${agentIntegration.codexConnected ? 'connected' : ''}`}><i />{agentIntegration.codexConnected ? (langCode === 'tr' ? 'Kanca hazır' : 'Hook ready') : (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')}</span></div>
                <p className="agent-card-description">{langCode === 'tr' ? 'Codex başladığında ve yanıt verdiğinde Ada’dan sinyal alın.' : 'Get an Island signal when Codex starts and replies.'}</p>
                <div className="agent-card-detail"><span>{langCode === 'tr' ? 'Yerel kanca' : 'Local hook'}</span><code>{agentIntegration.codexConnected ? (langCode === 'tr' ? 'Kuruldu · Codex’i yeniden başlatın' : 'Installed · restart Codex') : '~/.codex/hooks.json'}</code></div>
                <button type="button" className="agent-test-button" onClick={() => testAgentTool('Codex')} disabled={agentIntegrationBusy}><Play size={13} /> {langCode === 'tr' ? 'Bildirimi önizle' : 'Preview notification'}</button>
              </section>
              <section className="agent-connection-card antigravity" style={{ '--agent-rgb': '73, 218, 202', '--agent-hex': '#49daca' }}>
                <div className="agent-card-heading"><span className="ai-badge-icon lg antigravity"><i /><i /></span><div><strong>Antigravity</strong><span>{langCode === 'tr' ? 'Uygulama · bağımsız IDE' : 'App · standalone IDE'}</span></div><span className={`agent-status-pill ${agentIntegration.antigravityConnected ? 'connected' : ''}`}><i />{agentIntegration.antigravityConnected ? (langCode === 'tr' ? 'Kanca hazır' : 'Hook ready') : (langCode === 'tr' ? 'Bağlı değil' : 'Not connected')}</span></div>
                <p className="agent-card-description">{langCode === 'tr' ? 'Uygulama ve IDE’deki düşünme ve tamamlanan yanıtları takip edin.' : 'Follow thinking and finished replies in the app and IDE.'}</p>
                <div className="agent-card-detail"><span>{langCode === 'tr' ? 'Genel kanca' : 'Global hook'}</span><code>{agentIntegration.antigravityConnected ? (langCode === 'tr' ? 'Kuruldu · Antigravity’yi yeniden başlatın' : 'Installed · restart Antigravity') : '~/.gemini/config/hooks.json'}</code></div>
                <div className="agent-card-actions">
                  <button type="button" className="agent-test-button" onClick={() => testAgentTool('Antigravity IDE')} disabled={agentIntegrationBusy}><Play size={13} /> {langCode === 'tr' ? 'Bildirimi önizle' : 'Preview notification'}</button>
                  <button type="button" className="agent-secondary-button" onClick={chooseAntigravityIde}><Monitor size={13} /> {agentIntegration.antigravityIdePath ? (langCode === 'tr' ? 'IDE’yi değiştir' : 'Change IDE') : (langCode === 'tr' ? 'IDE’yi bul' : 'Locate IDE')}</button>
                  {agentIntegration.antigravityIdePath && <button type="button" className="agent-secondary-button" onClick={() => window.twocode?.openApp?.({ type: 'native-app', path: agentIntegration.antigravityIdePath })}><ExternalLink size={13} /> {langCode === 'tr' ? 'IDE’yi aç' : 'Open IDE'}</button>}
                </div>
              </section>
            </div>
            <div className="agent-connection-footnote"><RefreshCw size={12} /> {langCode === 'tr' ? 'Mevcut kanca ayarları korunur. Codex yeni kancayı bir kez incelemenizi ister.' : 'Existing hook settings are preserved. Codex asks you to review the new hook once.'}</div>

            <section className="agent-activity-panel">
              <div className="agent-activity-heading"><div><span className="agents-eyebrow"><Sparkles size={11} /> {langCode === 'tr' ? 'CANLI ETKİNLİK' : 'LIVE ACTIVITY'}</span><strong>{langCode === 'tr' ? 'Son ajan çalışmaları' : 'Recent agent work'}</strong></div><span>{langCode === 'tr' ? `${recentAgentJobs.length} son` : `${recentAgentJobs.length} recent`}</span></div>
              {recentAgentJobs.length ? <div className="agent-activity-list">{recentAgentJobs.slice(0, 4).map((job, index) => {
                const antigravityJob = (job.agent || '').toLowerCase().includes('antigravity');
                return <div className="agent-activity-row" key={job.id || `${job.time}-${index}`} style={{ '--agent-rgb': antigravityJob ? '73, 218, 202' : '97, 152, 255' }}><span className={`agent-activity-marker ${antigravityJob ? 'antigravity' : ''}`}><i /></span><div><strong>{job.title}</strong><span>{job.agent || 'Agent'} · {job.time || (langCode === 'tr' ? 'Yakın zamanda' : 'Recently')}</span></div><span className="agent-activity-state"><Check size={11} /> {t('common.done')}</span></div>;
              })}</div> : <div className="agent-activity-empty"><span><Bot size={16} /></span><div><strong>{langCode === 'tr' ? 'Henüz ajan etkinliği yok' : 'No agent activity yet'}</strong><small>{langCode === 'tr' ? 'Bir ajan bağladığınızda tamamlanan görevleri burada görünür.' : 'Connect an agent and its finished tasks will show up here.'}</small></div></div>}
            </section>

            <span className="section-eyebrow">{langCode === 'tr' ? 'BAĞLI HESAPLAR' : 'LINKED'}</span>
            <div className="settings-card">
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

              <div className="settings-row" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Bildirim Testi' : 'Notification Test'}</strong>
                  <span>{langCode === 'tr' ? 'Adada Mail ve Takvim bildirimini anında test edin' : 'Instantly test Mail and Calendar notifications on the Island'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="dark-pill-btn"
                    onClick={() => window.twocode?.testMailNotif?.()}
                    title={langCode === 'tr' ? 'Adada canlı Mail bildirimi göster' : 'Show live Mail notification on the Island'}
                  >
                    {langCode === 'tr' ? 'Postayı Test Et' : 'Test Mail'}
                  </button>
                  <button
                    type="button"
                    className="dark-pill-btn"
                    onClick={() => window.twocode?.testAgendaNotif?.()}
                    title={langCode === 'tr' ? 'Adada canlı Ajanda bildirimi göster' : 'Show live Agenda notification on the Island'}
                  >
                    {langCode === 'tr' ? 'Ajandayı Test Et' : 'Test Agenda'}
                  </button>
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 22 }}>
              {langCode === 'tr' ? 'KODLAMA YAPAY ZEKASI' : 'CODING AI'}
            </span>
            <div className="settings-card">
              {/* 1. Claude Code */}
              <div className="settings-row align-top">
                <div className="row-left-with-icon align-top" style={{ flex: 1 }}>
                  <span className="ai-badge-icon lg claude">
                    <i />
                    <i />
                  </span>
                  <div className="row-text-col" style={{ width: '100%' }}>
                    <strong>Claude Code</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Terminalde, VS Code’da ve Claude uygulamasının Code sekmesinde Claude Code’u takip eder. Aşağıdaki API anahtarı Robo sohbeti içindir; izleme için gerekmez.'
                        : 'Follows Claude Code in the terminal, in VS Code and in the Code tab of the Claude app. The API key below is for Robo chat; it is not needed for monitoring.'}
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
                    <i />
                    <i />
                  </span>
                  <div className="row-text-col" style={{ width: '100%' }}>
                    <strong>Codex</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Sizin için kod yazarken OpenAI Codex’i (uygulama, terminal veya VS Code) takip eder. Aşağıdaki API anahtarı Robo sohbeti içindir; Codex oturumu API erişimi sağlamaz.'
                        : 'Follows OpenAI Codex (the app, the terminal or VS Code) while it codes for you. The API key below is for Robo chat; Codex sign-in does not provide API access.'}
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
                  <div className="row-text-col" style={{ width: '100%' }}>
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
                    <i />
                    <i />
                  </span>
                  <div className="row-text-col" style={{ width: '100%' }}>
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
            PAGE 3: AI & CHAT
            ============================================================ */}
        {activePage === 'aichat' && (
          <div className="settings-page-body">
            <p className="page-lead-text">
              {langCode === 'tr'
                ? 'Robo sohbeti Ajanlar’da açtığınız yapay zekayı kullanır. İkisi de açık mı? Sohbet içinde birini seçersiniz.'
                : "Robo's chat uses the AI you turned on in Agents. Both on? Then you pick one in the chat."}
            </p>

            <div className="settings-card">
              <div className="settings-row">
                <div className="row-left-with-icon">
                  <span className="ai-badge-icon lg claude">
                    <i />
                    <i />
                  </span>
                  <div className="row-text-col">
                    <strong>Claude</strong>
                    <span>{langCode === 'tr' ? 'Robo sohbetinde Claude API anahtarını kullanır. Claude Code görevleri ayrı olarak izlenir.' : 'Uses your Claude API key in Robo chat. Claude Code tasks are monitored separately.'}</span>
                  </div>
                </div>
                <span className={`status-badge ${settings.claudeApiKey ? 'green' : 'amber'}`}>
                  {settings.claudeApiKey ? (langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved') : (langCode === 'tr' ? 'API anahtarı yok' : 'No API key')}
                </span>
              </div>

              <div className="settings-row">
                <div className="row-left-with-icon">
                  <span className="ai-badge-icon lg codex">
                    <i />
                    <i />
                  </span>
                  <div className="row-text-col">
                    <strong>Codex</strong>
                    <span>{langCode === 'tr' ? 'Robo sohbetinde OpenAI API anahtarını kullanır. Google bağlantısı yalnızca Gmail ve Takvim içindir.' : 'Uses your OpenAI API key in Robo chat. Google sign-in is only for Gmail and Calendar.'}</span>
                  </div>
                </div>
                <span className={`status-badge ${settings.codexApiKey ? 'green' : 'amber'}`}>
                  {settings.codexApiKey ? (langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved') : (langCode === 'tr' ? 'API anahtarı yok' : 'No API key')}
                </span>
              </div>
            </div>

            <div className="settings-card" style={{ marginTop: 14 }}>
              <div className="settings-row no-border">
                <div className="row-left-with-icon">
                  <span className="ai-badge-icon lg gemini">
                    <RealAppIcon sc={{ id: 'settings-api-gemini', type: 'gemini' }} size={22} />
                  </span>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Google Gemini API Anahtarı' : 'Google Gemini API Key'}</strong>
                    <span>{langCode === 'tr' ? 'Robo sohbeti için Gemini API. Google API kullanımı için ücret alabilir.' : 'Gemini API for Robo chat. Google may charge for API usage.'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="password"
                    placeholder={langCode === 'tr' ? 'AIzaSy... (İsteğe bağlı)' : 'AIzaSy... (Optional)'}
                    value={settings.geminiApiKey || ''}
                    onChange={(e) => updateSetting({ geminiApiKey: e.target.value })}
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: '#ffffff',
                      fontSize: 12,
                      width: 180,
                      outline: 'none',
                    }}
                  />
                  {settings.geminiApiKey ? (
                    <span className="status-badge green">{langCode === 'tr' ? 'API anahtarı kayıtlı' : 'API key saved'}</span>
                  ) : (
                    <span className="status-badge">{langCode === 'tr' ? 'API anahtarı gerekli' : 'API key required'}</span>
                  )}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-info">
                  <strong>{langCode === 'tr' ? 'Bedo Ses Karakteri' : 'Bedo Voice'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Bedo sesli yanıt verirken kullanılacak ses tonu (değişince otomatik yeniden bağlanır)'
                      : 'Voice persona used by Bedo (reconnects automatically on change)'}
                  </span>
                </div>
                <div className="row-right-group">
                  <select
                    value={settings.bedoVoice || 'Charon'}
                    onChange={(e) => updateSetting({ bedoVoice: e.target.value })}
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="Charon" style={{ background: '#14161c' }}>Charon (Varsayılan • Derin)</option>
                    <option value="Fenrir" style={{ background: '#14161c' }}>Fenrir (Net • Güçlü)</option>
                    <option value="Puck" style={{ background: '#14161c' }}>Puck (Dinamik • Genç)</option>
                    <option value="Aoede" style={{ background: '#14161c' }}>Aoede (Yumuşak • Doğal)</option>
                    <option value="Kore" style={{ background: '#14161c' }}>Kore (Sıcak • Sakin)</option>
                    <option value="Zephyr" style={{ background: '#14161c' }}>Zephyr (Hafif • Akıcı)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 4: APPS
            ============================================================ */}
        {activePage === 'apps' && (
          <div className="settings-page-body">
            <div className="settings-card">
              <div className="settings-row no-border">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq blue">
                    <ExternalLink size={16} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Kendi uygulamaların' : 'Your own apps'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'En fazla 4 web sitesi veya program. Her sayfada sekmelerin yanında adada dururlar. Birine tıklayın, açılsın.'
                        : 'Up to 4 websites or programs. They sit in the island next to your tabs, on every page. Click one and it opens.'}
                    </span>
                  </div>
                </div>
              </div>

              {(settings.apps || []).map((app) => (
                <div key={app.id} className="settings-row app-item-row">
                  <div className="app-item-left">
                    <span className="app-brand-badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <RealAppIcon sc={app} size={16} />
                    </span>
                    <strong className="app-item-name">{app.name}</strong>
                    <span className="app-item-path">{app.url}</span>
                  </div>
                  <button
                    type="button"
                    className="dark-pill-btn"
                    onClick={() => handleRemoveApp(app.id)}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}

              <div className="apps-add-form-row">
                <input
                  type="text"
                  className="settings-input"
                  placeholder={langCode === 'tr' ? 'Ad (ör. YouTube)' : 'Name (e.g. YouTube)'}
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                />
                <input
                  type="text"
                  className="settings-input"
                  placeholder={langCode === 'tr' ? 'Adres (ör. youtube.com)' : 'Address (e.g. youtube.com)'}
                  value={newAppUrl}
                  onChange={(e) => setNewAppUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddApp()}
                />
                <button type="button" className="white-pill-btn" onClick={handleAddApp}>
                  {t('common.add')}
                </button>
                <button type="button" className="dark-pill-btn" onClick={handleChooseProgram}>
                  {langCode === 'tr' ? 'Program seç...' : 'Choose a program...'}
                </button>
              </div>
            </div>

            <div className="apps-bottom-three-grid">
              <div className="settings-card feature-card">
                <div className="feature-card-top">
                  <div className="row-left-with-icon">
                    <div className="stat-icon-sq blue">
                      <Shield size={16} />
                    </div>
                    <div className="row-text-col">
                      <strong>{langCode === 'tr' ? 'Odak koruması' : 'Focus guard'}</strong>
                      <span>{langCode === 'tr' ? 'Şimdilik ücretsiz ✓' : 'Free for now ✓'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dark-pill-btn"
                    onClick={() => setActivePage('focusguard')}
                  >
                    {t('common.open')}
                  </button>
                </div>
                <p>{langCode === 'tr' ? 'Dikkatinizi dağıtan bir şey açtığınızda Robo sizi kısa bir an durdurur.' : 'Robo stops you for a moment when you open something that distracts you.'}</p>
                <button
                  type="button"
                  className="how-it-works-btn"
                  onClick={() => setActivePage('focusguard')}
                >
                  <Play size={11} /> {langCode === 'tr' ? 'Nasıl çalışır?' : 'How does it work?'}
                </button>
              </div>

              <div className="settings-card feature-card">
                <div className="feature-card-top">
                  <div className="row-left-with-icon">
                    <div className="stat-icon-sq green">
                      <Bot size={16} />
                    </div>
                    <div className="row-text-col">
                      <strong>{langCode === 'tr' ? 'Yapay zeka asistanları' : 'AI assistants'}</strong>
                      <span>{langCode === 'tr' ? 'Ücretsiz' : 'Free'}</span>
                    </div>
                  </div>
                  <span className="status-badge subtle">{langCode === 'tr' ? 'Her zaman açık' : 'Always on'}</span>
                </div>
                <p>
                  {langCode === 'tr'
                    ? 'Claude Code ve Codex: Robo yapay zekanızın meşgul olduğunu, sorusu olduğunu veya işi bitirdiğini gösterir.'
                    : 'Claude Code and Codex: Robo shows whether your AI is busy, has a question or is done.'}
                </p>
                <button
                  type="button"
                  className="how-it-works-btn"
                  onClick={() => setActivePage('connections')}
                >
                  <Play size={11} /> {langCode === 'tr' ? 'Nasıl çalışır?' : 'How does it work?'}
                </button>
              </div>

              <div className="settings-card feature-card">
                <div className="feature-card-top">
                  <div className="row-left-with-icon">
                    <div className="stat-icon-sq blue">
                      <Hand size={16} />
                    </div>
                    <div className="row-text-col">
                      <strong>Robo Buddy</strong>
                      <span>{langCode === 'tr' ? 'TwoCode’unun içinde' : 'In your TwoCode'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-switch ${settings.roboBuddy ? 'on' : ''}`}
                    onClick={() => updateSetting({ roboBuddy: !settings.roboBuddy })}
                  >
                    <i />
                  </button>
                </div>
                <p>{langCode === 'tr' ? 'Robo’yu adadan tutup çıkarın, herhangi bir şeyin üzerine bırakın ve hakkında soru sorun.' : 'Grab Robo out of the island, drop him on anything and ask about it.'}</p>
                <button
                  type="button"
                  className="how-it-works-btn"
                  onClick={() => setActivePage('robo')}
                >
                  <Play size={11} /> {langCode === 'tr' ? 'Nasıl çalışır?' : 'How does it work?'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 5: ROBO
            ============================================================ */}
        {activePage === 'robo' && (
          <div className="settings-page-body">
            <div className="settings-card robo-hero-card">
              <div className="robo-hero-avatar-box">
                <RoboCrownAvatar outfit={settings.outfit} size={110} />
              </div>
              <div className="robo-hero-info">
                <h2>{settings.roboName || 'Robo'}</h2>
                <span>{langCode === 'tr' ? `${aiHistory.jobsToday || 2} görev tamamlandı · 12 rozetten 5'i` : `${aiHistory.jobsToday || 2} tasks done · 5 of 12 badges`}</span>
                <div className="robo-badge-progress">
                  <div className="robo-badge-fill" style={{ width: '42%' }} />
                </div>
              </div>
            </div>

            <span className="section-eyebrow">{langCode === 'tr' ? 'İSİM' : 'NAME'}</span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Adı ne olsun?' : "What's his name?"}</strong>
                  <span>{langCode === 'tr' ? 'Merhaba derken bu adı söyler' : 'He says it when he says hi'}</span>
                </div>
                <div className="row-right-group">
                  <input
                    type="text"
                    className="settings-input w-180"
                    value={roboNameDraft}
                    onChange={(e) => setRoboNameDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="white-pill-btn"
                    onClick={() => updateSetting({ roboName: roboNameDraft || 'Robo' })}
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 18 }}>
              {langCode === 'tr' ? 'GÖRÜNÜM' : 'LOOK'}
            </span>
            <div className="settings-card">
              <div className="settings-row no-border">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Trafik ışığı gözler' : 'Traffic-light eyes'}</strong>
                  <span>{langCode === 'tr' ? 'Her durum için rengi seçin. Test etmek için bloğa tıklayın.' : 'Pick the colour for each state. Click the block for a test.'}</span>
                  <div className="preset-pills-row">
                    {[
                      { value: 'Classic', label: langCode === 'tr' ? 'Klasik' : 'Classic' },
                      { value: 'Soft', label: langCode === 'tr' ? 'Yumuşak' : 'Soft' },
                      { value: 'Colour-blind', label: langCode === 'tr' ? 'Renk körlüğü dostu' : 'Colour-blind' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`preset-pill-btn ${
                          settings.eyePreset === preset.value ? 'active' : ''
                        }`}
                        onClick={() => updateSetting({ eyePreset: preset.value })}
                      >
                        <span className="preset-dots">
                          <i style={{ background: '#f59e0b' }} />
                          <i style={{ background: '#22c55e' }} />
                          <i style={{ background: '#ef4444' }} />
                        </span>
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="traffic-subrow" onClick={() => triggerEmotionOnIsland('curious')}>
                <div className="traffic-left">
                  <i className="state-dot" style={{ background: settings.workingEyeColor }} />
                  <strong>{langCode === 'tr' ? 'Çalışıyor veya sorusu var' : 'Working or a question'}</strong>
                </div>
                <div className="swatch-group">
                  {['#f59e0b', '#fbbf24', '#fde047', '#f472b6', '#c084fc', '#60a5fa'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot-btn ${
                        settings.workingEyeColor === c ? 'selected' : ''
                      }`}
                      style={{ background: c }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSetting({ workingEyeColor: c });
                        triggerEmotionOnIsland('curious');
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="traffic-subrow" onClick={() => triggerEmotionOnIsland('happy')}>
                <div className="traffic-left">
                  <i className="state-dot" style={{ background: settings.doneEyeColor }} />
                  <strong>{t('common.done')}</strong>
                </div>
                <div className="swatch-group">
                  {['#22c55e', '#86efac', '#bef264', '#2dd4bf', '#3b82f6', '#ffffff'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot-btn ${settings.doneEyeColor === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSetting({ doneEyeColor: c });
                        triggerEmotionOnIsland('happy');
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="traffic-subrow" onClick={() => triggerEmotionOnIsland('dizzy')}>
                <div className="traffic-left">
                  <i className="state-dot" style={{ background: settings.errorEyeColor }} />
                  <strong>{t('agents.error')}</strong>
                </div>
                <div className="swatch-group">
                  {['#ef4444', '#f87171', '#fb7185', '#e879f9', '#a855f7', '#f97316'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot-btn ${settings.errorEyeColor === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSetting({ errorEyeColor: c });
                        triggerEmotionOnIsland('dizzy');
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 18 }}>
              {langCode === 'tr' ? 'DAVRANIŞ · ÖRNEK İÇİN BİR BLOĞA TIKLAYIN' : 'BEHAVIOUR · CLICK A BLOCK FOR AN EXAMPLE'}
            </span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'İfadeler' : 'Faces'}</strong>
                  <span>{langCode === 'tr' ? 'Mutlu, üzgün, meraklı, odaklı' : 'Happy, sad, curious, focused'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.facesEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ facesEnabled: !settings.facesEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row align-top">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Duyguları gör' : 'See emotions'}</strong>
                  <span>{langCode === 'tr' ? 'Görmek için birine tıklayın' : 'Click one to see it'}</span>
                </div>
                <div className="emotions-grid">
                  {[
                    { label: langCode === 'tr' ? '😊 Mutlu' : '😊 Happy', mood: 'happy' },
                    { label: langCode === 'tr' ? '😍 Aşık' : '😍 In love', mood: 'happy' },
                    { label: langCode === 'tr' ? '😮 Şaşkın' : '😮 Surprised', mood: 'curious' },
                    { label: langCode === 'tr' ? '🧐 Meraklı' : '🧐 Curious', mood: 'curious' },
                    { label: langCode === 'tr' ? '🤨 Odaklı' : '🤨 Focused', mood: 'focus-arc' },
                    { label: langCode === 'tr' ? '😉 Göz kırp' : '😉 Wink', mood: 'wink' },
                    { label: langCode === 'tr' ? '😢 Üzgün' : '😢 Sad', mood: 'normal' },
                    { label: langCode === 'tr' ? '😵 Baş dönmesi' : '😵 Dizzy', mood: 'dizzy' },
                    { label: langCode === 'tr' ? '😴 Uykulu' : '😴 Sleepy', mood: 'focus-arc' },
                  ].map((em) => (
                    <button
                      key={em.label}
                      type="button"
                      className="emotion-chip-btn"
                      onClick={() => triggerEmotionOnIsland(em.mood)}
                    >
                      {em.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Göz kırpma' : 'Blinking'}</strong>
                  <span>{langCode === 'tr' ? 'Ara sıra göz kırpar' : 'He blinks now and then'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.blinkingEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ blinkingEnabled: !settings.blinkingEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Müzikle dans' : 'Dancing to music'}</strong>
                  <span>{langCode === 'tr' ? 'Spotify çalarken eşlik eder' : 'Moves along when Spotify plays'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.dancingEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ dancingEnabled: !settings.dancingEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Uyku efekti' : 'Sleep effect'}</strong>
                  <span>{langCode === 'tr' ? 'Bir süre hiçbir şey olmadığında uykuya dalar' : 'He falls asleep when nothing happens for a while'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.sleepEffectEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ sleepEffectEnabled: !settings.sleepEffectEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Uyku süresi' : 'Fall asleep after'}</strong>
                  <span>{langCode === 'tr' ? 'Hiçbir şey olmadığında (Uyku efekti açık olmalı)' : 'When nothing happens (Sleep effect must be on)'}</span>
                </div>
                <div className="seg-btn-group">
                  {[5, 10, 30].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`seg-choice-btn ${
                        settings.fallAsleepMinutes === m ? 'active' : ''
                      }`}
                      onClick={() => updateSetting({ fallAsleepMinutes: m })}
                    >
                      {langCode === 'tr' ? `${m} dk` : `${m} min`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Başlangıç animasyonu' : 'Startup animation'}</strong>
                  <span>{langCode === 'tr' ? 'Açılışta el sallayıp "merhaba" der' : 'Wave and say "hi" at startup'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.startupAnimEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ startupAnimEnabled: !settings.startupAnimEnabled })}
                >
                  <i />
                </button>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Açlık' : 'Hunger'}</strong>
                  <span>{langCode === 'tr' ? 'Robo %100 tok. Her görev yiyecek verir 🍪' : 'Robo is 100% full. Every task gives food 🍪'}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.hungerEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting({ hungerEnabled: !settings.hungerEnabled })}
                >
                  <i />
                </button>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 18 }}>
              {langCode === 'tr' ? 'BAŞARIMLAR · 5/12' : 'ACHIEVEMENTS · 5/12'}
            </span>
            <div className="achievements-grid">
              {[
                { icon: '🌱', title: langCode === 'tr' ? 'İlk görev' : 'First task', unlocked: true },
                { icon: '🔒', title: langCode === 'tr' ? 'On görev' : 'Ten tasks', unlocked: false },
                { icon: '🔒', title: langCode === 'tr' ? 'Elli görev' : 'Fifty tasks', unlocked: false },
                { icon: '🔒', title: langCode === 'tr' ? 'Yardımsever' : 'Helpful', unlocked: false },
                { icon: '🦉', title: langCode === 'tr' ? 'Gece kuşu' : 'Night owl', unlocked: true },
                { icon: '🌅', title: langCode === 'tr' ? 'Erkenci kuş' : 'Early bird', unlocked: true },
                { icon: '🎵', title: langCode === 'tr' ? 'Müziksever' : 'Music lover', unlocked: true },
                { icon: '🎯', title: langCode === 'tr' ? 'Derin odak' : 'Deep focus', unlocked: true },
                { icon: '🔒', title: langCode === 'tr' ? '7 günlük seri' : 'Streak 7', unlocked: false },
                { icon: '🔒', title: langCode === 'tr' ? 'Pano ustası' : 'Clipboard pro', unlocked: false },
                { icon: '🔒', title: langCode === 'tr' ? 'Not tutucu' : 'Note taker', unlocked: false },
                { icon: '🔒', title: langCode === 'tr' ? 'En şık' : 'Best dressed', unlocked: false },
              ].map((ach) => (
                <div
                  key={ach.title}
                  className={`achievement-card ${ach.unlocked ? 'unlocked' : 'locked'}`}
                >
                  <span className="ach-emoji">{ach.icon}</span>
                  <strong>{ach.title}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 6: WARDROBE
            ============================================================ */}
        {activePage === 'wardrobe' && (
          <div className="settings-page-body">
            <div className="wardrobe-layout">
              <div className="settings-card wardrobe-preview-card">
                <RoboCrownAvatar
                  outfit={settings.outfit}
                  size={170}
                  eyeHex={settings.eyeColorHex}
                />
                <div className="wardrobe-preview-caption">
                  <strong>{settings.roboName || 'Robo'}</strong>
                  <span>{langCode === 'tr' ? `Giydiği: ${({ Best: 'En iyi', None: 'Yok', 'Party hat': 'Parti şapkası', Sunglasses: 'Güneş gözlüğü', Crown: 'Taç' }[settings.outfit] || settings.outfit)}` : `Wearing: ${settings.outfit}`}</span>
                </div>
              </div>

              <div className="wardrobe-options-col">
                <div className="wardrobe-group">
                  <div className="wardrobe-group-header">
                    <strong>{langCode === 'tr' ? 'Kıyafet' : 'Outfit'}</strong>
                    <span>{langCode === 'tr' ? 'Görev tamamlayarak daha fazlasını kazanın' : 'Earn more by finishing tasks'}</span>
                  </div>
                  <div className="outfit-cards-grid">
                    {[
                      { id: 'Best', label: langCode === 'tr' ? 'En iyi' : 'Best', icon: '✨', sub: '' },
                      { id: 'None', label: langCode === 'tr' ? 'Yok' : 'None', icon: '🚫', sub: '' },
                      { id: 'Party hat', label: langCode === 'tr' ? 'Parti şapkası' : 'Party hat', icon: '🥳', sub: langCode === 'tr' ? '5 görevde açılır' : 'Earned at 5 tasks' },
                      { id: 'Sunglasses', label: langCode === 'tr' ? 'Güneş gözlüğü' : 'Sunglasses', icon: '😎', sub: langCode === 'tr' ? '15 görevde açılır' : 'Earned at 15 tasks' },
                      { id: 'Crown', label: langCode === 'tr' ? 'Taç' : 'Crown', icon: '👑', sub: langCode === 'tr' ? '30 görevde açılır' : 'Earned at 30 tasks' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`outfit-tile-btn ${settings.outfit === o.id ? 'selected' : ''}`}
                        onClick={() => updateSetting({ outfit: o.id })}
                      >
                        {settings.outfit === o.id && (
                          <span className="outfit-check-badge">
                            <Check size={10} strokeWidth={3.2} color="#050507" />
                          </span>
                        )}
                        <span className="outfit-emoji">{o.icon}</span>
                        <strong>{o.label}</strong>
                        {o.sub && <span>{o.sub}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wardrobe-group">
                  <div className="wardrobe-group-header">
                    <strong>{langCode === 'tr' ? 'Gövde' : 'Body'}</strong>
                  </div>
                  <div className="sphere-swatches-row">
                    {[
                      { name: 'Cloud', label: langCode === 'tr' ? 'Bulut' : 'Cloud', bg: 'radial-gradient(circle at 30% 30%, #ffffff, #d4d4d8)' },
                      { name: 'Mint', label: langCode === 'tr' ? 'Nane' : 'Mint', bg: 'radial-gradient(circle at 30% 30%, #d1fae5, #6ee7b7)' },
                      { name: 'Sky', label: langCode === 'tr' ? 'Gökyüzü' : 'Sky', bg: 'radial-gradient(circle at 30% 30%, #e0f2fe, #7dd3fc)' },
                      { name: 'Rose', label: langCode === 'tr' ? 'Gül' : 'Rose', bg: 'radial-gradient(circle at 30% 30%, #fce7f3, #f9a8d4)' },
                      {
                        name: 'Classic',
                        label: langCode === 'tr' ? 'Klasik' : 'Classic',
                        bg: 'radial-gradient(circle at 30% 30%, #4b5563, #1f2937)',
                      },
                      { name: 'Night', label: langCode === 'tr' ? 'Gece' : 'Night', bg: 'radial-gradient(circle at 30% 30%, #3f3f46, #18181b)' },
                      { name: 'Blue', label: langCode === 'tr' ? 'Mavi' : 'Blue', bg: 'radial-gradient(circle at 30% 30%, #3b82f6, #1d4ed8)' },
                      {
                        name: 'Purple',
                        label: langCode === 'tr' ? 'Mor' : 'Purple',
                        bg: 'radial-gradient(circle at 30% 30%, #8b5cf6, #4c1d95)',
                      },
                      { name: 'Pink', label: langCode === 'tr' ? 'Pembe' : 'Pink', bg: 'radial-gradient(circle at 30% 30%, #be185d, #500724)' },
                      { name: 'Gold', label: langCode === 'tr' ? 'Altın' : 'Gold', bg: 'radial-gradient(circle at 30% 30%, #a16207, #422006)' },
                    ].map((b) => (
                      <div
                        key={b.name}
                        className="sphere-swatch-item"
                        onClick={() => updateSetting({ bodyColor: b.name })}
                      >
                        <span
                          className={`sphere-circle ${
                            settings.bodyColor === b.name ? 'selected' : ''
                          }`}
                          style={{ background: b.bg }}
                        />
                        <small>{b.label}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="wardrobe-group">
                  <div className="wardrobe-group-header">
                    <strong>{langCode === 'tr' ? 'Gözler' : 'Eyes'}</strong>
                  </div>
                  <div className="sphere-swatches-row">
                    {[
                      { name: 'Mint', label: langCode === 'tr' ? 'Nane' : 'Mint', hex: '#a7f3d0' },
                      { name: 'White', label: langCode === 'tr' ? 'Beyaz' : 'White', hex: '#ffffff' },
                      { name: 'Blue', label: langCode === 'tr' ? 'Mavi' : 'Blue', hex: '#7dd3fc' },
                      { name: 'Pink', label: langCode === 'tr' ? 'Pembe' : 'Pink', hex: '#f9a8d4' },
                      { name: 'Purple', label: langCode === 'tr' ? 'Mor' : 'Purple', hex: '#c4b5fd' },
                      { name: 'Yellow', label: langCode === 'tr' ? 'Sarı' : 'Yellow', hex: '#fef08a' },
                    ].map((ey) => (
                      <div
                        key={ey.name}
                        className="sphere-swatch-item"
                        onClick={() =>
                          updateSetting({ eyeColorName: ey.name, eyeColorHex: ey.hex })
                        }
                      >
                        <span
                          className={`sphere-circle ${
                            settings.eyeColorName === ey.name ? 'selected' : ''
                          }`}
                          style={{ background: ey.hex }}
                        />
                        <small>{ey.label}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="row-left-with-icon">
                      <div className="stat-icon-sq amber">
                        <Sparkles size={15} />
                      </div>
                      <div className="row-text-col">
                        <strong>{langCode === 'tr' ? 'Mevsimlik kıyafetler' : 'Seasonal outfits'}</strong>
                        <span>{langCode === 'tr' ? 'Noel Baba şapkası, cadı şapkası, özel gün taçları' : "Santa hat, witch hat, orange crown on King's Day"}</span>
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
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 7: ACCOUNT
            ============================================================ */}
        {activePage === 'account' && (
          <div className="settings-page-body narrow-body">
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq green">
                    <Bot size={16} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? '1 ücretsiz gün kaldı' : '1 free day left'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'Ücretsiz gününüzde satın alın ve indirim kazanın: €9,99 yerine €8,99. Tek seferlik, sonsuza dek.'
                        : 'Buy it during your free day and get a discount: €8,99 instead of €9,99. Once, forever.'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="white-pill-btn"
                  onClick={() => window.twocode?.openExternal('https://twocode.nl/')}
                >
                  {langCode === 'tr' ? 'Satın al · €8,99' : 'Buy · €8,99'}
                </button>
              </div>
            </div>

            <div className="settings-card" style={{ marginTop: 14 }}>
              <div className="settings-row no-border">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq blue">
                    <User size={16} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Giriş yap' : 'Sign in'}</strong>
                    <span>
                      {langCode === 'tr'
                        ? 'TwoCode hesabınızla. Satın aldıklarınız ve Kurucu durumunuz her PC’de sizinle gelir.'
                        : 'With your TwoCode account. What you bought and your Founder status come with you to every PC.'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="account-form-stack">
                <input
                  type="email"
                  className="settings-input full"
                  placeholder={langCode === 'tr' ? 'siz@ornek.com' : 'you@example.com'}
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                />
                <div className="account-pass-row">
                  <input
                    type="password"
                    className="settings-input full"
                    placeholder={langCode === 'tr' ? 'Şifre' : 'Password'}
                    value={accountPass}
                    onChange={(e) => setAccountPass(e.target.value)}
                  />
                  <button type="button" className="white-pill-btn">
                    {langCode === 'tr' ? 'Giriş yap' : 'Sign in'}
                  </button>
                </div>
                <div className="account-sub-links">
                  <button type="button" className="dark-pill-btn sm">
                    {langCode === 'tr' ? 'Henüz hesabınız yok mu? Oluşturun' : 'No account yet? Create one'}
                  </button>
                  <button type="button" className="dark-pill-btn sm">
                    {langCode === 'tr' ? 'Şifrenizi mi unuttunuz?' : 'Forgot password?'}
                  </button>
                </div>
              </div>
            </div>

            <button type="button" className="dark-pill-btn sm" style={{ marginTop: 14 }}>
              {langCode === 'tr' ? 'Bizden bir kodunuz mu var?' : 'Got a code from us?'}
            </button>
          </div>
        )}

        {/* ============================================================
            PAGE 8: GENERAL
            ============================================================ */}
        {activePage === 'general' && (
          <div className="settings-page-body narrow-body">
            <span className="section-eyebrow">{t('settings.general.shortcuts')}</span>
            <div className="settings-card">
              {[
                { label: t('settings.general.openIsland'), keys: 'Ctrl + Alt + T' },
                { label: t('settings.general.tuckIsland'), keys: 'Ctrl + Alt + H' },
                { label: langCode === 'tr' ? "Robo ile konuş" : 'Talk to Robo', keys: 'Ctrl + Alt + Space' },
                { label: t('settings.nav.home'), keys: 'Ctrl + Alt + Shift + 1' },
                { label: t('settings.opt.Music'), keys: 'Ctrl + Alt + Shift + 2' },
                { label: 'Claude Code', keys: 'Ctrl + Alt + Shift + 3' },
                { label: langCode === 'tr' ? 'Odak sayacı' : 'Focus timer', keys: 'Ctrl + Alt + Shift + 4' },
                { label: langCode === 'tr' ? 'Pano' : 'Clipboard', keys: 'Ctrl + Alt + Shift + 5' },
                { label: langCode === 'tr' ? 'Not' : 'Note', keys: 'Ctrl + Alt + Shift + 6' },
              ].map((sc) => (
                <div key={sc.label} className="settings-row">
                  <strong>{sc.label}</strong>
                  <kbd className="shortcut-kbd-pill">{sc.keys}</kbd>
                </div>
              ))}
              <div className="settings-row">
                <strong>{t('settings.general.resetShortcuts')}</strong>
                <button type="button" className="dark-pill-btn sm">
                  {t('common.reset')}
                </button>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 20 }}>
              {t('settings.general.languageEyebrow')}
            </span>
            <div className="settings-card">
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
            </div>

            <span className="section-eyebrow" style={{ marginTop: 20 }}>
              {t('settings.general.behaviourEyebrow')}
            </span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{t('settings.general.startWithWindows')}</strong>
                  <span>{t('settings.general.startWithWindowsDesc')}</span>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${settings.startWithWindows !== false ? 'on' : ''}`}
                  onClick={() =>
                    updateSetting({ startWithWindows: settings.startWithWindows === false })
                  }
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
            </div>
          </div>
        )}

        {activePage === 'typography' && (
          <div className="settings-page-body narrow-body typography-settings-page">
            <span className="section-eyebrow">{langCode === 'tr' ? 'ARAYÜZ METNİ' : 'INTERFACE TEXT'}</span>
            <p className="typography-intro">{langCode === 'tr' ? 'Tek bir seçim TwoCode genelindeki etiketleri, menüleri, kartları ve açıklamaları günceller.' : 'One choice updates labels, menus, cards and descriptions throughout TwoCode.'}</p>
            <div className="typography-font-grid">
              {TEXT_FONT_OPTIONS.map((font, index) => (
                <button
                  key={font.id}
                  type="button"
                  className={`typography-font-option ${textFontIndex === index ? 'active' : ''}`}
                  onClick={() => selectTextFont(index)}
                  aria-pressed={textFontIndex === index}
                >
                  <span className="typography-font-preview" style={{ fontFamily: font.family }}>Ag</span>
                  <span className="typography-font-name">{font.name}</span>
                  <span className="typography-font-sample" style={{ fontFamily: font.family }}>{langCode === 'tr' ? 'Pijamalı hasta yağız şoföre çabucak güvendi' : 'The quick brown fox'}</span>
                  {textFontIndex === index && <Check size={15} className="typography-font-check" />}
                </button>
              ))}
            </div>

            <span className="section-eyebrow typography-number-eyebrow">{langCode === 'tr' ? 'SAYILAR VE SAAT' : 'NUMBERS & CLOCK'}</span>
            <p className="typography-intro">{langCode === 'tr' ? 'Bu ayar Ana Sayfa’daki saat yazı tipi seçici ile paylaşılır. Zamanlayıcılar, tarihler ve sayısal göstergeler bunu takip eder.' : 'This is shared with the clock font picker on Home. Timers, dates and numeric readouts follow it.'}</p>
            <div className="typography-font-grid number-font-grid">
              {CLOCK_FONT_OPTIONS.map((font, index) => (
                <button
                  key={font.id}
                  type="button"
                  className={`typography-font-option ${numberFontIndex === index ? 'active' : ''}`}
                  onClick={() => selectNumberFont(index)}
                  aria-pressed={numberFontIndex === index}
                >
                  <span className="typography-number-preview" style={{ fontFamily: font.family }}>12:34</span>
                  <span className="typography-font-name">{font.name}</span>
                  {numberFontIndex === index && <Check size={15} className="typography-font-check" />}
                </button>
              ))}
            </div>

            <div className="typography-role-note">
              <span className="typography-code-sample">&lt;/&gt;</span>
              <span><strong>Code and technical values</strong><small>JetBrains Mono · consistent throughout</small></span>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 9: NOTIFICATIONS
            ============================================================ */}
        {activePage === 'notifications' && (
          <div className="notifications-split-layout">
            <div className="notif-left-list">
              <div className="notif-top-toggles">
                <div className="notif-toggle-line">
                  <strong>{langCode === 'tr' ? 'Windows bildirimleri' : 'Windows notifications'}</strong>
                  <button
                    type="button"
                    className={`settings-switch ${settings.windowsNotifications ? 'on' : ''}`}
                    onClick={() =>
                      updateSetting({ windowsNotifications: !settings.windowsNotifications })
                    }
                  >
                    <i />
                  </button>
                </div>
                <div className="notif-toggle-line">
                  <strong>{langCode === 'tr' ? 'Rahatsız etme' : 'Do not disturb'}</strong>
                  <button
                    type="button"
                    className={`settings-switch ${settings.doNotDisturb ? 'on' : ''}`}
                    onClick={() => updateSetting({ doNotDisturb: !settings.doNotDisturb })}
                  >
                    <i />
                  </button>
                </div>
              </div>

              {/* G-Helper Bridge Section (21st.dev / Minimal Obsidian Card) */}
              <div className="gh-bridge-card">
                <div className="gh-bridge-header">
                  <div className="gh-bridge-meta">
                    <div className="gh-bridge-title-row">
                      <span className="gh-bridge-title">G-Helper Bridge</span>
                      <span className={`gh-bridge-status-pill ${ghelperStatus.running ? 'is-active' : ghelperStatus.installed ? 'is-idle' : 'is-action'}`}>
                        {langCode === 'tr'
                          ? (ghelperStatus.running ? 'BAĞLI' : ghelperStatus.installed ? 'BEKLEMEDE' : 'KURULUM')
                          : (ghelperStatus.running ? 'CONNECTED' : ghelperStatus.installed ? 'IDLE' : 'SETUP')}
                      </span>
                    </div>
                    <span className="gh-bridge-subtitle">
                      {langCode === 'tr'
                        ? (ghelperStatus.running ? 'OSD adaya yönlendirildi' : ghelperStatus.installed ? 'Kurulu (Çalışmıyor)' : 'Yetkili görev kurulumu gerekiyor')
                        : (ghelperStatus.running ? 'OSD routed to island' : ghelperStatus.installed ? 'Installed (Not running)' : 'Elevated task setup required')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="gh-bridge-action-btn"
                    onClick={installGHelperBridge}
                    disabled={ghelperBusy}
                  >
                    {langCode === 'tr'
                      ? (ghelperBusy ? 'İşleniyor…' : ghelperStatus.running ? 'Yeniden Kur' : ghelperStatus.installed ? 'Başlat' : 'Bağla')
                      : (ghelperBusy ? 'Working…' : ghelperStatus.running ? 'Reinstall' : ghelperStatus.installed ? 'Start' : 'Connect')}
                  </button>
                </div>
                {ghelperMessage && (
                  <div className={`gh-bridge-alert ${ghelperMessage.includes('Could not') || ghelperMessage.includes('kurulamadı') ? 'is-err' : 'is-ok'}`}>
                    {ghelperMessage}
                  </div>
                )}
                <div className="gh-bridge-tests-row">
                  <span className="gh-bridge-tests-label">TEST</span>
                  <button
                    type="button"
                    className="gh-bridge-chip"
                    onClick={() => testGHelperHud(langCode === 'tr' ? 'Yüksek' : 'High')}
                  >
                    {langCode === 'tr' ? 'Klavye' : 'Keyboard'}
                  </button>
                  <button
                    type="button"
                    className="gh-bridge-chip"
                    onClick={() => testGHelperHud(langCode === 'tr' ? 'Ses açık' : 'Mic on')}
                  >
                    Mic
                  </button>
                  <button
                    type="button"
                    className="gh-bridge-chip"
                    onClick={() => testGHelperHud('Zone Test')}
                  >
                    Aura
                  </button>
                </div>
              </div>

              {NOTIFICATION_ITEMS.map((grp) => {
                const trGroup = {
                  'MAIL AND OTHER APPS': 'POSTA VE DİĞER UYGULAMALAR',
                  'CLAUDE AND AI': 'CLAUDE VE YAPAY ZEKA',
                  FOCUS: 'ODAK',
                  'MUSIC AND SOUND': 'MÜZİK VE SES',
                  'PHONE, CALENDAR, BATTERY': 'TELEFON, TAKVİM, PİL',
                }[grp.group] || grp.group;
                const trItem = (it) => ({
                  'New mail': 'Yeni posta',
                  'Mail sent': 'Posta gönderildi',
                  "Other apps' notifications": 'Diğer uygulama bildirimleri',
                  'Claude asks for permission': 'Claude izin istiyor',
                  'Claude has a question': 'Claude’un bir sorusu var',
                  'Claude is done': 'Claude tamamladı',
                  'Claude: error': 'Claude: hata',
                  'ChatGPT or Claude in your browser': 'Tarayıcıda ChatGPT veya Claude',
                  'Claude limit almost full': 'Claude limiti neredeyse doldu',
                  'Focus done': 'Odak tamamlandı',
                  'Back to work': 'İşe dönüş',
                  'Next or previous song': 'Sonraki veya önceki şarkı',
                  'Sound moved': 'Ses aktarıldı',
                  "Can't jump in this song": 'Bu şarkıda ileri/geri sarma yok',
                  Volume: 'Ses düzeyi',
                  'Received from your phone': 'Telefonunuzdan alındı',
                  'Calendar: in 10 minutes': 'Takvim: 10 dakika içinde',
                  'Calendar linked': 'Takvim bağlandı',
                  'Battery low': 'Pil düşük',
                  'Headphones almost empty': 'Kulaklık şarjı bitmek üzere',
                }[it] || it);
                return (
                <div key={grp.group} className="notif-group-block">
                  <span className="notif-group-title">{langCode === 'tr' ? trGroup : grp.group}</span>
                  {grp.items.map((it) => (
                    <button
                      key={it}
                      type="button"
                      className={`notif-item-btn ${selectedNotifItem === it ? 'active' : ''}`}
                      onClick={() => setSelectedNotifItem(it)}
                    >
                      {langCode === 'tr' ? trItem(it) : it}
                    </button>
                  ))}
                </div>
                );
              })}
            </div>

            <div className="notif-right-detail">
              <div
                className="notif-preview-stage"
                style={{ '--notif-preview-accent': settings.notifColor }}
              >
                <div className="notif-preview-island">
                  <span
                    className="notif-preview-check"
                    style={{ background: settings.notifColor }}
                  >
                    <Check size={14} strokeWidth={3} color="#fff" />
                  </span>
                  <div className="notif-preview-copy">
                    <small>{langCode === 'tr' ? 'TWOCODE · AZ ÖNCE' : 'TWOCODE · JUST NOW'}</small>
                    <strong>{langCode === 'tr' ? ({
                      'New mail': 'Yeni posta',
                      'Mail sent': 'Posta gönderildi',
                      "Other apps' notifications": 'Diğer uygulama bildirimleri',
                      'Claude asks for permission': 'Claude izin istiyor',
                      'Claude has a question': 'Claude’un bir sorusu var',
                      'Claude is done': 'Claude tamamladı',
                      'Claude: error': 'Claude: hata',
                      'ChatGPT or Claude in your browser': 'Tarayıcıda ChatGPT veya Claude',
                      'Claude limit almost full': 'Claude limiti neredeyse doldu',
                      'Focus done': 'Odak tamamlandı',
                      'Back to work': 'İşe dönüş',
                      'Next or previous song': 'Sonraki veya önceki şarkı',
                      'Sound moved': 'Ses aktarıldı',
                      "Can't jump in this song": 'Bu şarkıda ileri/geri sarma yok',
                      Volume: 'Ses düzeyi',
                      'Received from your phone': 'Telefonunuzdan alındı',
                      'Calendar: in 10 minutes': 'Takvim: 10 dakika içinde',
                      'Calendar linked': 'Takvim bağlandı',
                      'Battery low': 'Pil düşük',
                      'Headphones almost empty': 'Kulaklık şarjı bitmek üzere',
                    }[selectedNotifItem] || selectedNotifItem) : selectedNotifItem}</strong>
                    <span>{langCode === 'tr' ? 'Bildiriminiz görüntülenmeye hazır' : 'Your notification is ready to view'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="white-pill-btn try-it-btn"
                  onClick={triggerTestNotificationOnIsland}
                >
                  {langCode === 'tr' ? 'Dene' : 'Try it'}
                </button>
              </div>

              <div className="notif-options-table">
                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Gösterim yeri' : 'Show it'}</strong>
                  <div className="seg-btn-group">
                    {[
                      { value: 'In the island', label: langCode === 'tr' ? 'Ada içinde' : 'In the island' },
                      { value: 'Own card', label: langCode === 'tr' ? 'Kendi kartında' : 'Own card' },
                      { value: 'Windows', label: 'Windows' },
                      { value: 'Off', label: t('common.off') },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`seg-choice-btn ${
                          settings.notifShowWhere === opt.value ? 'active' : ''
                        }`}
                        onClick={() => updateSetting({ notifShowWhere: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Boyut' : 'Size'}</strong>
                  <div className="seg-btn-group">
                    {[
                      { value: 'Small', label: langCode === 'tr' ? 'Küçük' : 'Small' },
                      { value: 'Big', label: langCode === 'tr' ? 'Büyük' : 'Big' },
                    ].map((sz) => (
                      <button
                        key={sz.value}
                        type="button"
                        className={`seg-choice-btn ${settings.notifSize === sz.value ? 'active' : ''}`}
                        onClick={() => updateSetting({ notifSize: sz.value })}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Kalma süresi' : 'Stay for'}</strong>
                  <div className="slider-with-val">
                    <input
                      type="range"
                      min="2"
                      max="15"
                      value={settings.notifDurationSec}
                      onChange={(e) =>
                        updateSetting({ notifDurationSec: parseInt(e.target.value, 10) })
                      }
                    />
                    <span>{langCode === 'tr' ? `${settings.notifDurationSec} sn` : `${settings.notifDurationSec} s`}</span>
                  </div>
                </div>

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Ses' : 'Sound'}</strong>
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
                        className={`seg-choice-btn ${settings.notifSound === snd.value ? 'active' : ''}`}
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

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Renk' : 'Colour'}</strong>
                  <div className="swatch-group">
                    <button
                      type="button"
                      className={`color-dot-btn rainbow-dot ${
                        settings.notifColor === '#3b82f6' ? 'selected' : ''
                      }`}
                      onClick={() => updateSetting({ notifColor: '#3b82f6' })}
                      title={langCode === 'tr' ? 'Özel renk' : 'Custom colour'}
                    />
                    {['#f97316', '#ef4444', '#8b5cf6', '#3b82f6', '#22c55e', '#ffffff'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-dot-btn ${settings.notifColor === c ? 'selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => updateSetting({ notifColor: c })}
                      />
                    ))}
                  </div>
                </div>

                <div
                  className={`settings-row ${
                    settings.notifShowWhere !== 'Own card' ? 'row-dimmed' : ''
                  }`}
                >
                  <strong>{langCode === 'tr' ? 'Konum' : 'Place'}</strong>
                  <div className="notif-place-grid">
                    {['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(
                      (pos) => (
                        <button
                          key={pos}
                          type="button"
                          className={`notif-place-cell ${
                            (settings.notifPlace || 'top-center') === pos ? 'active' : ''
                          }`}
                          onClick={() => updateSetting({ notifPlace: pos })}
                        />
                      )
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Metniniz' : 'Your text'}</strong>
                  <div className="seg-btn-group">
                    {[
                      { value: 'Show', label: langCode === 'tr' ? 'Göster' : 'Show' },
                      { value: 'Hide', label: langCode === 'tr' ? 'Gizle' : 'Hide' },
                    ].map((tx) => (
                      <button
                        key={tx.value}
                        type="button"
                        className={`seg-choice-btn ${
                          settings.notifShowText === tx.value ? 'active' : ''
                        }`}
                        onClick={() => updateSetting({ notifShowText: tx.value })}
                      >
                        {tx.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <strong>{langCode === 'tr' ? 'Ayrıca şu sırada' : 'Also during'}</strong>
                  <div className="row-right-group">
                    <span className="inline-toggle-label">{langCode === 'tr' ? 'Odak' : 'Focus'}</span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.notifDuringFocus ? 'on' : ''}`}
                      onClick={() =>
                        updateSetting({ notifDuringFocus: !settings.notifDuringFocus })
                      }
                    >
                      <i />
                    </button>
                    <span className="inline-toggle-label" style={{ marginLeft: 10 }}>
                      Games
                    </span>
                    <button
                      type="button"
                      className={`settings-switch ${settings.notifDuringGames ? 'on' : ''}`}
                      onClick={() =>
                        updateSetting({ notifDuringGames: !settings.notifDuringGames })
                      }
                    >
                      <i />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
            CPU: 'CPU',
            RAM: 'RAM',
            'Wi-Fi': 'Wi-Fi',
            Bluetooth: 'Bluetooth',
            Automatic: langCode === 'tr' ? 'Otomatik' : 'Automatic',
            '12-hour · 6:30 PM': langCode === 'tr' ? '12 saat · 6:30 PM' : '12-hour · 6:30 PM',
            '24-hour · 18:30': langCode === 'tr' ? '24 saat · 18:30' : '24-hour · 18:30',
          };
          return (
          <div className="settings-page-body narrow-body">
            <span className="section-eyebrow">{langCode === 'tr' ? 'GÖRÜNÜM' : 'LOOK'}</span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Boyut' : 'Size'}</strong>
                  <span>{langCode === 'tr' ? 'Adanın ne kadar büyük olacağı' : 'How big the island is'}</span>
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
                      ? 'Dizüstü bilgisayar çentiği gibi üst kenara yapışık veya iPhone’daki gibi hemen altında yüzen'
                      : "Attached to the top edge like a laptop's notch, or floating just below it like on an iPhone"}
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
                  <span>{langCode === 'tr' ? 'Adanın arkasının ne kadar görüneceği' : 'How much you see through the island'}</span>
                </div>
                <div className="slider-with-val">
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={settings.islandSeeThrough}
                    onChange={(e) =>
                      updateSetting({ islandSeeThrough: parseInt(e.target.value, 10) })
                    }
                  />
                  <span>{settings.islandSeeThrough}%</span>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Müzik rengi' : 'Music colour'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Ada saydamken çalan albüm kapağının rengini alır'
                      : 'When the island is see-through, it takes on the colour of the album cover that is playing'}
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
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Robo’nun solu' : 'Left of Robo'}</strong>
                  <span>{langCode === 'tr' ? 'Hiçbir şey yokken sol tarafta ne gösterilsin' : 'What it shows when nothing is going on'}</span>
                </div>
                <div className="seg-btn-group">
                  {['Nothing', 'Time', 'Battery', 'CPU', 'RAM', 'Wi-Fi', 'Bluetooth'].map((opt) => (
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
                  <strong>{langCode === 'tr' ? 'Robo’nun gözleri' : "Robo's eyes"}</strong>
                  <span>{langCode === 'tr' ? 'Ortada, dizüstü bilgisayarının kamerasının olduğu yerde' : "In the middle, where your laptop's camera is"}</span>
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
                  <strong>{langCode === 'tr' ? 'Robo’nun sağı' : 'Right of Robo'}</strong>
                  <span>{langCode === 'tr' ? 'Hiçbir şey yokken sağ tarafta ne gösterilsin' : 'What it shows when nothing is going on'}</span>
                </div>
                <div className="seg-btn-group">
                  {['Nothing', 'Time', 'Battery', 'CPU', 'RAM', 'Wi-Fi', 'Bluetooth'].map((opt) => (
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
              {langCode === 'tr' ? 'ADA ÜZERİNDE' : 'ON THE ISLAND'}
            </span>
            <div className="settings-card">
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
            </div>
          </div>
          );
        })()}

        {/* ============================================================
            PAGE 11: FOCUS GUARD
            ============================================================ */}
        {activePage === 'focusguard' && (
          <div className="settings-page-body narrow-body">
            <span className="section-eyebrow">{langCode === 'tr' ? 'ODAK KORUMASI' : 'FOCUS GUARD'}</span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Odak koruması' : 'Focus guard'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'Dikkatinizi dağıtan bir şey açtığınızda Robo sizi bir an durdurur: önce nefes alın, sonra karar verin. Telefonunuzdaki "one sec" gibi.'
                      : 'Open something that distracts you and Robo stops you for a moment: breathe first, then you choose. Like "one sec" on your phone.'}
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

              <div className="settings-row align-top">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Uygulamalar ve siteler' : 'Apps and sites'}</strong>
                  <span>{langCode === 'tr' ? 'Dikkatinizi neyin dağıttığını seçin' : 'Pick what distracts you'}</span>
                </div>
                <div className="seg-btn-group wrap-right">
                  {[
                    'YouTube',
                    'TikTok',
                    'Instagram',
                    'X',
                    'Reddit',
                    'Facebook',
                    'Netflix',
                    'Twitch',
                    'Discord',
                  ].map((site) => {
                    const active = (settings.focusGuardApps || []).includes(site);
                    return (
                      <button
                        key={site}
                        type="button"
                        className={`seg-choice-btn ${active ? 'active' : ''}`}
                        onClick={() => {
                          const curr = settings.focusGuardApps || [];
                          const next = active ? curr.filter((x) => x !== site) : [...curr, site];
                          updateSetting({ focusGuardApps: next });
                        }}
                      >
                        {site}
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
                    value={settings.focusGuardCustom || ''}
                    onChange={(e) => updateSetting({ focusGuardCustom: e.target.value })}
                  />
                  <button type="button" className="dark-pill-btn sm">
                    {t('common.save')}
                  </button>
                </div>
              </div>

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
                  <span>{langCode === 'tr' ? 'Yine de açtığınızda Robo’nun sizi ne kadar süre rahatsız etmeyeceği' : 'How long Robo lets you be when you open it anyway'}</span>
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
                  <strong>{t('common.today')}</strong>
                  <span>{langCode === 'tr' ? '0× geri döndünüz · 0× yine de açtınız' : 'You went back 0× · opened it anyway 0×'}</span>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-text-col">
                  <strong>{langCode === 'tr' ? 'Gizlilik' : 'Privacy'}</strong>
                  <span>
                    {langCode === 'tr'
                      ? 'TwoCode yalnızca kendi PC’nizdeki ön pencerenin adına bakar. Hiçbir şey saklanmaz veya gönderilmez.'
                      : 'TwoCode only looks at the name of the window in front, on your own PC. Nothing is stored or sent.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 12: NEWS
            ============================================================ */}
        {activePage === 'news' && (
          <div className="settings-page-body narrow-body">
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq green">
                    <Check size={16} strokeWidth={2.5} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'TwoCode 1.2.0-beta.93 kullanıyorsunuz' : 'You have TwoCode 1.2.0-beta.93'}</strong>
                    <span>{langCode === 'tr' ? 'Güncelsiniz · En yeni sürüm: v1.2.0-beta.93' : 'You are up to date · Newest version: v1.2.0-beta.93'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dark-pill-btn"
                  onClick={() => window.twocode?.openExternal('https://twocode.nl/')}
                >
                  <Download size={13} style={{ marginRight: 6 }} /> {langCode === 'tr' ? 'İndir' : 'Download'}
                </button>
              </div>
            </div>

            <div className="news-timeline">
              {[
                {
                  ver: 'TwoCode 1.2.0-beta.93',
                  newest: true,
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Diğer uygulama bildirimleri her zaman kendi uygulamasının adını gösterir ve Discord mesajları kanal adı olmadan kimden ve nereden geldiğini gösterir'
                    : "Other apps' notifications always name their app, and Discord messages show who and where without the channel",
                },
                {
                  ver: 'TwoCode 1.2.0-beta.92',
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Şarkı satırı ve sözleri ortalandı, ses dalgası kısık müzikte ve her hoparlörde hareket eder, diğer uygulamalardan gelen bildirimler kaybolmaz ve daha hızlı gelir, özel kart solar ve saydamdır, Ayarlar son bildirimi gösterir'
                    : 'Song line and lyrics centred, the sound wave also moves on soft music and any speaker, notifications from other apps are not lost when unreadable and come faster, own card fades out and is see-through, Settings shows the last notification',
                },
                {
                  ver: 'TwoCode 1.2.0-beta.91',
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Menüde gerçek bir dişli simgesi ve Ayarlar artık diğer uygulama bildirimlerinin çalışıp çalışmadığını gösteriyor.'
                    : "A real gear icon in the menu, and Settings now shows whether other apps' notifications are working.",
                },
                {
                  ver: 'TwoCode 1.2.0-beta.90',
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Google ile giriş yapın: adada takviminiz, etkinlik ekleyin, kaç yeni postanız olduğunu görün ve postalamak için adaya dosya sürükleyin.'
                    : 'Sign in with Google: your calendar in the island, add events, see how many new mails you have, and drag a file onto the island to mail it.',
                },
                {
                  ver: 'TwoCode 1.2.0-beta.89',
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Saat için kendi yazı tipinizi, kalınlığınızı ve renginizi seçin, müzik ve Claude altına uygulamalar ekleyin, ses dalgası geri döndü, menü çubuğu PC’nizin ses düzeyidir ve diğer uygulama bildirimleri adada gösterilebilir.'
                    : "Pick your own font, thickness and colour for the clock, add apps under music and Claude, the sound wave is back, the menu's bar is your PC's volume, and other apps' notifications can show in the island.",
                },
                {
                  ver: 'TwoCode 1.2.0-beta.88',
                  date: langCode === 'tr' ? '6 Kasım 2026' : '6 November 2026',
                  desc: langCode === 'tr'
                    ? 'Daha hızlı açılış, daha akıcı ada üzerine gelme animasyonu ve geliştirilmiş Spotify ve tarayıcı medya algılaması.'
                    : 'Faster startup, smoother island hover animation, and improved Spotify and browser media detection.',
                },
              ].map((rel) => (
                <div key={rel.ver} className="news-item">
                  <div className="news-dot-col">
                    <span className={`news-dot ${rel.newest ? 'bright' : ''}`} />
                    <span className="news-line" />
                  </div>
                  <div className="news-content-col">
                    <div className="news-meta-row">
                      <strong>{rel.ver}</strong>
                      {rel.newest && <span className="news-tag">{langCode === 'tr' ? 'En yeni' : 'Newest'}</span>}
                      <span className="news-tag amber">beta</span>
                      <span className="news-date">{rel.date}</span>
                    </div>
                    <div className="settings-card news-body-card">
                      <p>{rel.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================
            PAGE 13: SUPPORT TWOCODE
            ============================================================ */}
        {activePage === 'support' && (
          <div className="settings-page-body narrow-body">
            <div className="settings-card support-hero-card">
              <div className="stat-icon-sq pink">
                <Heart size={18} />
              </div>
              <h3>{langCode === 'tr' ? 'TwoCode hoşunuza gidiyor mu?' : 'Enjoying TwoCode?'}</h3>
              <p>
                {langCode === 'tr'
                  ? 'TwoCode Hollanda’da tek bir kişi tarafından geliştiriliyor. Beta sürecinde her şey ücretsizdir ve bağış yapsanız da yapmasanız da öyle kalacaktır. TwoCode size zaman kazandırıyorsa, küçük bir bağış geliştirmeye devam etmeme yardımcı olur.'
                  : 'TwoCode is made by one person in the Netherlands. Everything is free during the beta, and it stays that way whether you donate or not. If TwoCode saves you time, a small donation helps me keep building it.'}
              </p>
              <div className="support-donate-row">
                <button
                  type="button"
                  className="white-pill-btn"
                  onClick={() => window.twocode?.openExternal('https://twocode.nl/')}
                >
                  {langCode === 'tr' ? '♡ Bağış yap ↗' : '♡ Donate ↗'}
                </button>
                <span>{langCode === 'tr' ? 'Tutarı siz seçersiniz · Stripe ile güvenli ödeme' : 'You choose the amount · secure payment by Stripe'}</span>
              </div>
            </div>

            <span className="section-eyebrow" style={{ marginTop: 22 }}>
              {langCode === 'tr' ? 'YARDIM ETMENİN DİĞER YOLLARI' : 'OTHER WAYS TO HELP'}
            </span>
            <div className="settings-card">
              <div className="settings-row">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq blue">
                    <Sparkles size={15} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Bir arkadaşınıza TwoCode’dan bahsedin' : 'Tell a friend about TwoCode'}</strong>
                    <span>twocode.nl</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dark-pill-btn"
                  onClick={() => {
                    window.twocode?.copyText('https://twocode.nl/');
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1500);
                  }}
                >
                  {copiedLink ? (langCode === 'tr' ? '✓ Kopyalandı' : '✓ Copied') : (langCode === 'tr' ? 'Bağlantıyı kopyala' : 'Copy link')}
                </button>
              </div>

              <div className="settings-row">
                <div className="row-left-with-icon">
                  <div className="stat-icon-sq green">
                    <MessageSquare size={15} />
                  </div>
                  <div className="row-text-col">
                    <strong>{langCode === 'tr' ? 'Bir fikriniz mi var veya hata mı buldunuz?' : 'An idea, or found a bug?'}</strong>
                    <span>{langCode === 'tr' ? 'Bana bildirin, her şeyi okuyorum' : 'Let me know, I read everything'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dark-pill-btn"
                  onClick={() => window.twocode?.openExternal('https://twocode.nl/')}
                >
                  {langCode === 'tr' ? 'İletişim ↗' : 'Contact ↗'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </LanguageProvider>
  );
}
