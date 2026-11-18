import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import RealAppIcon from './RealAppIcon';
import { shouldPersistNotification } from './notification-history-policy.mjs';
import MusicTabView, { formatMMSS, useIsolatedMediaPosition } from './components/MusicTabView.jsx';
import {
  Home,
  Terminal,
  Music,
  Timer,
  Moon,
  Inbox,
  Copy,
  FileText,
  Calendar,
  Mail,
  Volume2,
  VolumeX,
  Wifi,
  Bluetooth,
  MoreHorizontal,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Laptop,
  Fan,
  Flame,
  Leaf,
  Zap,
  Bike,
  Car,
  Rocket,
  Flower2,
  Plus,
  Check,
  X,
  Mic,
  ArrowUp,
  Briefcase,
  BookOpen,
  Gamepad2,
  Shield,
  Bell,
  LayoutGrid,
  Pencil,
  Settings,
  RotateCw,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Power,
  Video,
  Sun,
  Trash2,
  Search,
  ExternalLink,
  Radio,
  Tag,
  Bot,
  Sunrise,
  MicOff,
  Gauge,
  Layers,
  Lock,
  Cpu,
  Palette,
  Keyboard,
  Sparkles,
  Activity,
  Paperclip,
  AlignLeft,
  Touchpad as TouchpadIcon,
  UploadCloud,
  Smartphone,
  Image as ImageIcon,
  File as FileIcon,
} from 'lucide-react';
import RoboEyes from './RoboEyes';
import MirrorOverlay from './components/MirrorOverlay';
import PerfMonitorTab from './components/PerfMonitorTab';
import DropShareTab from './components/DropShareTab';
import NotifToastContent from './components/NotifToastContent';
import BedoStage from './components/BedoStage';
import BedoIslandOverlay from './components/BedoIslandOverlay';
import {
  IdleLiveActivityPill,
  HomeLiveAndContextStrip,
  InlineDownloadOrb,
} from './components/LiveActivityBar';
import HeroClock, { CLOCK_FONT_FAMILIES } from './HeroClock';
import { applyTypographyTokens, readTypographyPreferences, TYPOGRAPHY_STORAGE_KEY } from './typography';
import NotificationText from './NotificationText';
import AgendaCalendar from './AgendaCalendar';
import RoboMarkdown from './RoboMarkdown';
import { playRoboSound, playNotifSound } from './sounds';
import { LanguageProvider, createTranslator, getLocale, normalizeLanguage } from './i18n';

// Extract vibrant dominant RGB color from live album/video thumbnail
// When nothing is playing (no thumbnail), defaults to the crimson/burgundy placeholder glow
// matching the original TwoCode app (media_1794022256939_a2c228a1.jpg)
function useDominantColor(imageSrc) {
  const [accent, setAccent] = useState({
    rgb: '110, 142, 185',
    hex: '#6e8eb9',
    hasColor: true,
    isLiveCover: false,
  });

  useEffect(() => {
    if (!imageSrc) {
      setAccent({
        rgb: '110, 142, 185',
        hex: '#6e8eb9',
        hasColor: true,
        isLiveCover: false,
      });
      return;
    }
    let cancelled = false;
    const img = new Image();
    if (/^https?:\/\//i.test(imageSrc)) img.crossOrigin = 'Anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const size = 28;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          const sat = max === 0 ? 0 : (max - min) / max;

          // Weight colorful, mid-bright pixels heavily over black/grey/white bars
          if (lum < 18 || lum > 246) continue;
          const weight = (0.25 + sat * 2.6) * (lum > 35 && lum < 225 ? 1.4 : 0.4);
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          weightSum += weight;
        }

        if (weightSum > 0) {
          let r = Math.round(rSum / weightSum);
          let g = Math.round(gSum / weightSum);
          let b = Math.round(bSum / weightSum);

          // Boost saturation slightly so ambient glow looks vivid
          const avg = (r + g + b) / 3;
          r = Math.min(255, Math.max(0, Math.round(avg + (r - avg) * 1.28)));
          g = Math.min(255, Math.max(0, Math.round(avg + (g - avg) * 1.28)));
          b = Math.min(255, Math.max(0, Math.round(avg + (b - avg) * 1.28)));

          // Ensure enough brightness for dark notch background
          const minBri = 145;
          const peak = Math.max(r, g, b, 1);
          if (peak < minBri) {
            const scale = minBri / peak;
            r = Math.min(255, Math.round(r * scale));
            g = Math.min(255, Math.round(g * scale));
            b = Math.min(255, Math.round(b * scale));
          }

          const toHex = (n) => n.toString(16).padStart(2, '0');
          setAccent({
            rgb: `${r}, ${g}, ${b}`,
            hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
            hasColor: true,
            isLiveCover: true,
          });
        }
      } catch { }
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  return accent;
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function generateAppGradient(name) {
  let hash = 0;
  const str = String(name || 'App').trim();
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 42) % 360;
  const rgb1 = hslToRgb(hue1, 92, 54);
  const rgb2 = hslToRgb(hue2, 92, 42);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return {
    rgb: `${rgb1[0]}, ${rgb1[1]}, ${rgb1[2]}`,
    hex: `#${toHex(rgb1[0])}${toHex(rgb1[1])}${toHex(rgb1[2])}`,
    secondaryRgb: `${rgb2[0]}, ${rgb2[1]}, ${rgb2[2]}`,
    secondaryHex: `#${toHex(rgb2[0])}${toHex(rgb2[1])}${toHex(rgb2[2])}`,
  };
}

// Brand color definitions with rich primary + secondary gradients
const NOTIFICATION_BRANDS = [
  { match: /gmail|google.?mail|com\.google\.android\.gm/, rgb: '234, 67, 53', hex: '#EA4335', secondaryRgb: '66, 133, 244', secondaryHex: '#4285F4', brand: 'gmail' },
  { match: /google.?calendar|calendar|takvim|ajanda/, rgb: '66, 133, 244', hex: '#4285F4', secondaryRgb: '52, 168, 83', secondaryHex: '#34A853', brand: 'calendar' },
  { match: /outlook|microsoft\.office\.outlook/, rgb: '0, 120, 212', hex: '#0078D4', secondaryRgb: '0, 90, 158', secondaryHex: '#005A9E', brand: 'outlook' },
  { match: /teams|msteams/, rgb: '98, 100, 167', hex: '#6264A7', secondaryRgb: '70, 71, 117', secondaryHex: '#464775', brand: 'teams' },
  { match: /whatsapp/, rgb: '37, 211, 102', hex: '#25D366', secondaryRgb: '18, 140, 126', secondaryHex: '#128C7E', brand: 'whatsapp' },
  { match: /discord/, rgb: '88, 101, 242', hex: '#5865F2', secondaryRgb: '71, 82, 196', secondaryHex: '#4752C4', brand: 'discord' },
  { match: /telegram/, rgb: '42, 171, 238', hex: '#2AABEE', secondaryRgb: '34, 158, 217', secondaryHex: '#229ED9', brand: 'telegram' },
  { match: /spotify/, rgb: '30, 215, 96', hex: '#1ED760', secondaryRgb: '29, 185, 84', secondaryHex: '#1DB954', brand: 'spotify' },
  { match: /youtube|ytmusic/, rgb: '255, 0, 51', hex: '#FF0033', secondaryRgb: '196, 48, 43', secondaryHex: '#C4302B', brand: 'youtube' },
  { match: /instagram/, rgb: '225, 48, 108', hex: '#E1306C', secondaryRgb: '253, 29, 29', secondaryHex: '#FD1D1D', brand: 'instagram' },
  { match: /slack/, rgb: '97, 31, 105', hex: '#611F69', secondaryRgb: '236, 178, 46', secondaryHex: '#ECB22E', brand: 'slack' },
  { match: /twitter|(^|[\s._-])x($|[\s._-])/, rgb: '29, 155, 240', hex: '#1D9BF0', secondaryRgb: '15, 20, 25', secondaryHex: '#0F1419', brand: 'x' },
  { match: /linkedin/, rgb: '10, 102, 194', hex: '#0A66C2', secondaryRgb: '0, 65, 130', secondaryHex: '#004182', brand: 'linkedin' },
  { match: /facebook|messenger|meta/, rgb: '8, 102, 255', hex: '#0866FF', secondaryRgb: '0, 198, 255', secondaryHex: '#00C6FF', brand: 'facebook' },
  { match: /tiktok/, rgb: '254, 44, 85', hex: '#FE2C55', secondaryRgb: '37, 244, 238', secondaryHex: '#25F4EE', brand: 'tiktok' },
  { match: /snapchat/, rgb: '255, 252, 0', hex: '#FFFC00', secondaryRgb: '230, 220, 0', secondaryHex: '#E6DC00', brand: 'snapchat' },
  { match: /steam/, rgb: '102, 192, 244', hex: '#66C0F4', secondaryRgb: '27, 40, 56', secondaryHex: '#1B2838', brand: 'steam' },
  { match: /epic\s*games|epicgames/, rgb: '0, 120, 242', hex: '#0078F2', secondaryRgb: '49, 49, 49', secondaryHex: '#313131', brand: 'epic' },
  { match: /github/, rgb: '110, 64, 201', hex: '#6E40C9', secondaryRgb: '36, 41, 47', secondaryHex: '#24292F', brand: 'github' },
  { match: /claude|anthropic/, rgb: '217, 119, 87', hex: '#D97757', secondaryRgb: '193, 95, 60', secondaryHex: '#C15F3C', brand: 'claude' },
  { match: /chatgpt|openai/, rgb: '16, 163, 127', hex: '#10A37F', secondaryRgb: '26, 127, 100', secondaryHex: '#1A7F64', brand: 'openai' },
  { match: /codex/, rgb: '97, 152, 255', hex: '#6198FF', secondaryRgb: '138, 92, 246', secondaryHex: '#8A5CF6', brand: 'codex' },
  { match: /antigravity/, rgb: '73, 218, 202', hex: '#49DACA', secondaryRgb: '42, 157, 143', secondaryHex: '#2A9D8F', brand: 'antigravity' },
  { match: /ghelper|g-helper/, rgb: '56, 166, 255', hex: '#38A6FF', secondaryRgb: '0, 184, 116', secondaryHex: '#00B874', brand: 'ghelper' },
  { match: /twocode|two.?code/, rgb: '97, 152, 255', hex: '#6198FF', secondaryRgb: '138, 92, 246', secondaryHex: '#8A5CF6', brand: 'twocode' },
  { match: /chrome|google chrome/, rgb: '66, 133, 244', hex: '#4285F4', secondaryRgb: '234, 67, 53', secondaryHex: '#EA4335', brand: 'chrome' },
  { match: /microsoft edge|\bedge\b/, rgb: '10, 155, 140', hex: '#0A9B8C', secondaryRgb: '0, 120, 212', secondaryHex: '#0078D4', brand: 'edge' },
  { match: /firefox|mozilla/, rgb: '255, 113, 57', hex: '#FF7139', secondaryRgb: '255, 59, 48', secondaryHex: '#FF3B30', brand: 'firefox' },
  { match: /visual studio code|vscode/, rgb: '0, 122, 204', hex: '#007ACC', secondaryRgb: '0, 152, 255', secondaryHex: '#0098FF', brand: 'vscode' },
  { match: /onedrive/, rgb: '0, 120, 212', hex: '#0078D4', secondaryRgb: '35, 144, 235', secondaryHex: '#2390EB', brand: 'onedrive' },
  { match: /güç\s*&?\s*pil|power\s*&?\s*battery|enerji\s*tasarrufu|energy\s*saver|battery\s*saver|pil\s*tasarrufu|windows\.systemtoast\.power/i, rgb: '52, 211, 153', hex: '#34D399', secondaryRgb: '16, 185, 129', secondaryHex: '#10B981', brand: 'power' },
  { match: /windows security|defender/, rgb: '0, 164, 239', hex: '#00A4EF', secondaryRgb: '0, 102, 204', secondaryHex: '#0066CC', brand: 'security' },
  { match: /windows|system|ayarlar|settings|explorer|dosya yöneticisi|terminal|cmd|powershell/, rgb: '0, 120, 212', hex: '#0078D4', secondaryRgb: '0, 199, 253', secondaryHex: '#00C7FD', brand: 'windows' },
  { match: /brave/, rgb: '251, 84, 43', hex: '#FB542B', secondaryRgb: '255, 26, 85', secondaryHex: '#FF1A55', brand: 'brave' },
  { match: /notion/, rgb: '35, 35, 35', hex: '#232323', secondaryRgb: '0, 0, 0', secondaryHex: '#000000', brand: 'notion' },
  { match: /riot|valorant|league of legends/, rgb: '235, 0, 41', hex: '#EB0029', secondaryRgb: '20, 20, 20', secondaryHex: '#141414', brand: 'riot' },
];

function resolveNotifBrand(banner, logoAccent) {
  const appIdentity = `${banner?.app || ''} ${banner?.appId || ''}`.toLowerCase();
  const genericApp = /^(windows|notification|unknown|app)?\s*$/i.test(banner?.app || '');
  const fallbackText = genericApp ? `${banner?.title || ''} ${banner?.body || ''}` : '';
  const identity = `${appIdentity} ${fallbackText}`;

  const knownBrand = NOTIFICATION_BRANDS.find(({ match }) => match.test(identity));
  const customAccentRgb = String(banner?.accentRgb || '');
  const customAccentHex = String(banner?.accentHex || '');
  const customAccentSecondaryRgb = String(banner?.accentSecondaryRgb || '');
  const customAccentSecondaryHex = String(banner?.accentSecondaryHex || '');
  const validAccentRgb = (rgb) => /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(rgb) && rgb.split(',').every((part) => Number(part.trim()) <= 255);
  if (
    /ghelper|g-helper/i.test(appIdentity) &&
    validAccentRgb(customAccentRgb) &&
    /^#[\da-f]{6}$/i.test(customAccentHex) &&
    validAccentRgb(customAccentSecondaryRgb) &&
    /^#[\da-f]{6}$/i.test(customAccentSecondaryHex)
  ) {
    return { rgb: customAccentRgb, hex: customAccentHex, secondaryRgb: customAccentSecondaryRgb, secondaryHex: customAccentSecondaryHex, brand: 'ghelper' };
  }
  if (knownBrand) {
    return {
      ...knownBrand,
      secondaryRgb: knownBrand.secondaryRgb || knownBrand.rgb,
      secondaryHex: knownBrand.secondaryHex || knownBrand.hex,
    };
  }
  if (logoAccent?.isLiveCover) {
    return {
      rgb: logoAccent.rgb,
      hex: logoAccent.hex,
      secondaryRgb: logoAccent.rgb,
      secondaryHex: logoAccent.hex,
      brand: 'native-logo',
    };
  }

  // Dynamic consistent gradient generation for any app
  const appName = banner?.app || banner?.appId || 'Notification';
  const dynamic = generateAppGradient(appName);
  return {
    ...dynamic,
    brand: 'generated-app',
  };
}

function resolveNotificationPresentation(banner) {
  const app = String(banner?.app || 'Windows');
  const title = String(banner?.title || app);
  const body = String(banner?.body || '');
  const identity = `${app} ${banner?.appId || ''}`.toLowerCase();
  const text = `${title} ${body}`.toLowerCase();
  const videoCall = /video call|video calling|görüntülü arama|görüntülü arıyor|görüntülü çağrı|görüntülü görüşme/.test(text);
  const audioCall = /voice call|audio call|calling you|incoming call|sesli arama|sesli arıyor|sesli çağrı|seni arıyor|aranıyor/.test(text);
  const call = banner?.notificationKind === 'call' || videoCall || audioCall;
  const chatApp = /whatsapp|telegram|messenger|facebook|instagram|discord|slack|teams|signal|messages|gmail|google.?mail|com\.google\.android\.gm/.test(identity);
  const titleLooksLikeApp = title.toLowerCase() === app.toLowerCase() || /^(incoming|missed|video|voice|audio) (call|arama)|^(new message|message from|\d+ new messages?)\b|^(google mail|gmail|google calendar|whatsapp|telegram|messenger|microsoft teams)(\s|\(|:|$)/i.test(title);
  const bodySender = body.match(/^(.*?)\s+(?:is calling|seni arıyor|arıyor)(?=$|\s|[.,!?])/i)?.[1]?.trim()
    || body.match(/(?:from|arayan|şu kişiden)\s*:?\s*([^\n]+)/i)?.[1]?.trim()
    || body.match(/^([^:–—\n]{1,70})\s*[:–—]\s*\S/)?.[1]?.trim()
    || body.split(/[\n:]/)[0];
  const sender = String(banner?.sender || ((call || chatApp) && titleLooksLikeApp ? bodySender : title))
    .replace(/\s*\((?:gmail|whatsapp|telegram|messenger)\)\s*$/i, '')
    .trim();
  const hasPerson = Boolean(banner?.profileImage || (sender && sender.toLowerCase() !== app.toLowerCase() && (chatApp || call)));
  const kind = call ? (videoCall || banner?.callKind === 'video' ? 'video' : 'audio') : chatApp ? 'message' : 'notification';
  const titleText = hasPerson ? sender : title;
  const subtitle = call
    ? `${kind === 'video' ? 'Görüntülü arama' : 'Sesli arama'} · ${app}`
    : body;

  return { app, title: titleText, subtitle, sender, hasPerson, kind };
}

function isSafeNotificationImage(src) {
  if (typeof src !== 'string' || !src.trim()) return false;
  return (
    /^data:image\//i.test(src) ||
    /^https?:\/\//i.test(src) ||
    /^file:\/\//i.test(src) ||
    /^[a-zA-Z]:[/\\]/i.test(src)
  );
}

function formatNotifTime(timestamp, lang = 'tr') {
  const isTr = lang === 'tr';
  if (!timestamp) return isTr ? 'şimdi' : 'now';
  const now = Date.now();
  const time = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(time)) return isTr ? 'şimdi' : 'now';
  const diffSec = Math.max(0, Math.floor((now - time) / 1000));
  if (diffSec < 45) return isTr ? 'şimdi' : 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isTr ? `${diffMin} dk` : `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return isTr ? `${diffHours} sa` : `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return isTr ? 'dün' : 'yesterday';
  if (diffDays < 7) return isTr ? `${diffDays} gün` : `${diffDays}d`;
  const d = new Date(time);
  return d.toLocaleDateString(isTr ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short' });
}

function NotificationAvatar({ banner, brand, presentation }) {
  const profileImage = isSafeNotificationImage(banner?.profileImage) ? banner.profileImage : '';
  const initials = presentation.sender
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase('tr-TR') || '')
    .join('');
  const personAvatar = Boolean(profileImage);

  return (
    <div className={`notif-toast-avatar ${personAvatar ? 'is-person-avatar' : 'is-app-avatar'} ${presentation.kind === 'audio' || presentation.kind === 'video' ? 'is-call-avatar' : ''}`}>
      {profileImage ? (
        <>
          <span className="notif-toast-initials is-image-fallback">{initials || '?'}</span>
          <img className="notif-toast-profile-image" src={profileImage} alt={`${presentation.sender} profil fotoğrafı`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          <span className="notif-toast-app-chip" aria-label={`${presentation.app} logosu`}>
            <NotifBrandIcon key={`${brand}-${banner?.logo || 'brand'}`} brand={brand} logo={banner?.logo} appName={presentation.app || banner?.app} banner={banner} />
          </span>
        </>
      ) : (
        <NotifBrandIcon key={`${brand}-${banner?.logo || 'brand'}`} brand={brand} logo={banner?.logo} appName={presentation.app || banner?.app} banner={banner} />
      )}
    </div>
  );
}

const resolvedAppLogoCache = new Map();
const resolvedAppLogoInFlight = new Map();

function getAppLogoCacheKey(appName, appId) {
  return `${String(appId || '').trim()}|${String(appName || '').trim()}`.toLowerCase();
}

function resolveCachedAppLogo(appName, appId, title) {
  const key = getAppLogoCacheKey(appName, appId);
  if (!key || key === '|' || !window.twocode?.resolveAppLogo) {
    return Promise.resolve(null);
  }
  if (resolvedAppLogoCache.has(key)) {
    return Promise.resolve(resolvedAppLogoCache.get(key));
  }
  if (resolvedAppLogoInFlight.has(key)) {
    return resolvedAppLogoInFlight.get(key);
  }
  const promise = window.twocode
    .resolveAppLogo({ app: appName, appId, title })
    .then((dataUri) => {
      const valid = isSafeNotificationImage(dataUri) ? dataUri : null;
      resolvedAppLogoCache.set(key, valid);
      return valid;
    })
    .catch(() => null)
    .finally(() => {
      resolvedAppLogoInFlight.delete(key);
    });
  resolvedAppLogoInFlight.set(key, promise);
  return promise;
}

function NotifBrandIcon({ brand, logo, appName, banner }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const resolvedAppName = appName || banner?.app || '';
  const resolvedAppId = banner?.appId || '';
  const cacheKey = getAppLogoCacheKey(resolvedAppName, resolvedAppId);
  const [resolvedLogo, setResolvedLogo] = useState(() => resolvedAppLogoCache.get(cacheKey) || '');

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  useEffect(() => {
    const hasDirectLogo = Boolean(logo && isSafeNotificationImage(logo) && !logoFailed);
    if (hasDirectLogo) {
      setResolvedLogo('');
      return;
    }
    const cached = resolvedAppLogoCache.get(cacheKey);
    if (cached !== undefined) {
      setResolvedLogo(cached || '');
      return;
    }
    let cancelled = false;
    resolveCachedAppLogo(resolvedAppName, resolvedAppId, banner?.title).then((dataUri) => {
      if (!cancelled && dataUri) {
        setResolvedLogo(dataUri);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [logo, logoFailed, cacheKey, resolvedAppName, resolvedAppId, banner?.title]);

  const powerIdentity = `${resolvedAppName} ${resolvedAppId} ${banner?.title || ''} ${banner?.body || ''}`;
  const isPowerNotif =
    brand === 'power' ||
    /güç\s*&?\s*pil|power\s*&?\s*battery|windows\.systemtoast\.power/i.test(`${resolvedAppName} ${resolvedAppId}`);
  if (isPowerNotif) {
    const isLowBattery = /düşük|zayıf|kritik|low\s*battery|critical/i.test(powerIdentity);
    const bg = isLowBattery
      ? 'linear-gradient(145deg, #F59E0B, #EF4444)'
      : 'linear-gradient(145deg, #34D399, #059669)';
    return (
      <div
        className="notif-custom-app-badge"
        style={{
          background: bg,
          boxShadow: isLowBattery
            ? 'inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 12px rgba(239,68,68,0.32)'
            : 'inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 12px rgba(16,185,129,0.32)',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="6.5" width="16.5" height="11" rx="3" stroke="#ffffff" strokeWidth="1.9" />
          <path d="M20.8 10v4" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M11.6 8.6L8.8 12.2h2.6l-.8 3.2 3-3.6h-2.6l.6-3.2z" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  const b = String(brand || '').toLowerCase();
  if (b === 'gemini' || /gemini/i.test(`${resolvedAppName} ${resolvedAppId}`)) {
    return <RealAppIcon sc={{ id: 'gemini-agent-mark', type: 'gemini' }} size={26} />;
  }

  const effectiveLogo = (!logoFailed && logo && isSafeNotificationImage(logo) ? logo : '') || resolvedLogo;
  if (effectiveLogo && isSafeNotificationImage(effectiveLogo)) {
    return <img src={effectiveLogo} alt="" className="notif-toast-app-logo" onError={() => { if (!logoFailed && logo) setLogoFailed(true); else setResolvedLogo(''); }} />;
  }
  const name = String(appName || banner?.app || banner?.title || '').toLowerCase();

  if (b === 'gmail' || /gmail|google.?mail/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="3" width="20" height="18" rx="4" fill="#ffffff" />
        <path d="M4.5 17.5V7.2l7.5 5.5 7.5-5.5v10.3" fill="none" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 7.2v10.3" stroke="#4285F4" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M19.5 7.2v10.3" stroke="#34A853" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M12 12.7 19.5 7.2" stroke="#FBBC04" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (b === 'calendar' || /calendar|takvim|ajanda/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="4" fill="#ffffff" />
        <path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3V10H3z" fill="#4285F4" />
        <path d="M7 2.5v3.5M17 2.5v3.5" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
        <text x="12" y="18" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fontSize="8.5" fontWeight="800" fill="#4285F4">31</text>
      </svg>
    );
  }
  if (b === 'whatsapp' || /whatsapp/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-wa-grad)" />
        <defs>
          <linearGradient id="gh-wa-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#25D366" />
            <stop offset="1" stopColor="#128C7E" />
          </linearGradient>
        </defs>
        <path
          d="M12 4.2C7.7 4.2 4.2 7.7 4.2 12c0 1.4.4 2.8 1.1 4L4 20l4.2-1.1c1.2.6 2.5 1 3.8 1 4.3 0 7.8-3.5 7.8-7.8S16.3 4.2 12 4.2zm4.6 11.1c-.2.6-1.1 1-1.5 1.1-.4.1-.9.1-1.5-.1-.4-.1-.8-.3-1.4-.5-2.4-1-3.9-3.4-4-3.6-.1-.2-.9-1.3-.9-2.5 0-1.2.6-1.7.8-2 .2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.1.1.3 0 .4s-.2.3-.3.4l-.3.3c-.1.1-.2.2 0 .5.2.3.7 1.1 1.4 1.8 1 .9 1.8 1.1 2 .1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.4.7 1.6.8.2.1.4.2.5.3 0 .2 0 .7-.4 1.3z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }
  if (b === 'discord' || /discord/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#5865F2" />
        <path
          d="M17.4 6.8c-.9-.4-1.9-.7-2.9-.9-.1.3-.3.6-.4.9-1.1-.2-2.2-.2-3.3 0-.1-.3-.3-.6-.4-.9-1 .2-2 .5-2.9.9-1.8 2.7-2.3 5.4-2.1 8.1 1.2.9 2.4 1.5 3.6 1.8.3-.4.6-.8.8-1.3-.4-.2-.8-.4-1.2-.6.1-.1.2-.2.3-.2 2.3 1.1 4.8 1.1 7.1 0 .1.1.2.2.3.2-.4.2-.8.4-1.2.6.2.4.5.9.8 1.3 1.2-.4 2.4-.9 3.6-1.8.3-3.1-.5-5.7-2.2-8.1zm-7.2 6.4c-.7 0-1.3-.6-1.3-1.4 0-.8.6-1.4 1.3-1.4.7 0 1.3.6 1.3 1.4 0 .8-.6 1.4-1.3 1.4zm3.6 0c-.7 0-1.3-.6-1.3-1.4 0-.8.6-1.4 1.3-1.4.7 0 1.3.6 1.3 1.4 0 .8-.6 1.4-1.3 1.4z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }
  if (b === 'telegram' || /telegram/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-tg-grad)" />
        <defs>
          <linearGradient id="gh-tg-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2AABEE" />
            <stop offset="1" stopColor="#229ED9" />
          </linearGradient>
        </defs>
        <path
          d="M18.8 5.6L4.5 11.1c-1 .4-1 1-.2 1.2l3.7 1.1 8.5-5.4c.4-.2.8-.1.5.2l-6.9 6.2h-.1l-.2 3.8c.4 0 .5-.2.7-.4l1.8-1.7 3.7 2.7c.7.4 1.2.2 1.4-.6l2.4-11.5c.3-1-.4-1.5-1-.9z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }
  if (b === 'spotify' || /spotify/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1ED760" />
        <path
          d="M16.5 9.7c-2.9-1.7-7.6-1.9-10.3-1.1-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.1-.9 8.3-.7 11.5 1.2.4.2.5.7.3 1.1-.2.4-.6.5-1 .3zm-.9 3.6c-.2.3-.6.4-1 .2-2-.9-5.1-1.3-7.5-.6-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 2.7-.8 6.1-.4 8.4.6.4.2.5.7.3 1zm-1.1 2.3c-.2.2-.5.3-.7.1-1.8-1.1-4-1.3-6.5-.7-.3.1-.5-.1-.6-.4-.1-.3.1-.5.4-.6 2.8-.6 5.3-.4 7.3.9.2.2.3.5.1.7z"
          fill="#000000"
        />
      </svg>
    );
  }
  if (b === 'youtube' || /youtube|ytmusic/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#FF0000" />
        <polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'instagram' || /instagram/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-ig-grad)" />
        <defs>
          <linearGradient id="gh-ig-grad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FCB045" />
            <stop offset="0.5" stopColor="#FD1D1D" />
            <stop offset="1" stopColor="#833AB4" />
          </linearGradient>
        </defs>
        <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" stroke="#FFFFFF" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3" stroke="#FFFFFF" strokeWidth="1.8" />
        <circle cx="15.5" cy="8.5" r="0.9" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'x' || /twitter|\bx\b/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#000000" />
        <path
          d="M16.5 5.5h2.1l-4.6 5.3 5.4 7.2h-4.3l-3.3-4.4-3.8 4.4H5.9l4.9-5.6L5.5 5.5h4.4l3 4 3.6-4zm-.7 11.2h1.2L8.3 6.7H7L15.8 16.7z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }
  if (b === 'steam' || /steam/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-steam-grad)" />
        <defs>
          <linearGradient id="gh-steam-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1B2838" />
            <stop offset="1" stopColor="#2A475E" />
          </linearGradient>
        </defs>
        <circle cx="14.5" cy="8.5" r="3.2" stroke="#66C0F4" strokeWidth="1.8" fill="none" />
        <circle cx="9" cy="15.5" r="2.2" stroke="#66C0F4" strokeWidth="1.6" fill="none" />
        <path d="M12.5 10.5L8.5 14" stroke="#66C0F4" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (b === 'vscode' || /visual studio code|vscode/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1E1E1E" />
        <path d="M17.5 4.5l-6 5.5-4-3-3 1.5 3 3.5-3 3.5 3 1.5 4-3 6 5.5 2.5-1V5.5l-2.5-1zM15 15.5l-4-3.5 4-3.5v7z" fill="#007ACC" />
      </svg>
    );
  }
  if (b === 'chrome' || /chrome/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#FFFFFF" />
        <circle cx="12" cy="12" r="4" fill="#4285F4" />
        <path d="M12 4a8 8 0 0 1 6.9 4H12z" fill="#EA4335" />
        <path d="M18.9 8A8 8 0 0 1 15.5 18.5L12 12z" fill="#FBBC04" />
        <path d="M15.5 18.5A8 8 0 0 1 5.1 8H12z" fill="#34A853" />
      </svg>
    );
  }
  if (b === 'edge' || /microsoft edge|\bedge\b/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-edge-grad)" />
        <defs>
          <linearGradient id="gh-edge-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0A9B8C" />
            <stop offset="1" stopColor="#0078D4" />
          </linearGradient>
        </defs>
        <path d="M12 5a7 7 0 0 1 7 7c0 4-3 7-7 7s-7-3-7-7c0-2 1-4 3-5 .5 1.5 1.5 2.5 3 2.5 2 0 3-1.5 3-3.5 0-1-.3-1.8-.8-2.4C10.7 5.2 11.3 5 12 5z" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'firefox' || /firefox|mozilla/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-ff-grad)" />
        <defs>
          <linearGradient id="gh-ff-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF7139" />
            <stop offset="1" stopColor="#FF3B30" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="5" fill="#FFCC00" />
        <circle cx="12" cy="12" r="3.5" fill="#007ACC" />
      </svg>
    );
  }
  if (b === 'github' || /github/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#24292F" />
        <path
          d="M12 4.5a7.5 7.5 0 0 0-2.4 14.6c.4.1.5-.2.5-.4v-1.4c-2.1.5-2.5-.9-2.5-.9-.3-.8-.8-1-.8-1-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.8.8 2.2.6.1-.5.3-.8.5-1-1.7-.2-3.4-.8-3.4-3.7 0-.8.3-1.5.8-2-.1-.2-.4-1 .1-2 0 0 .6-.2 2.1.8a7.2 7.2 0 0 1 3.8 0c1.5-1 2.1-.8 2.1-.8.5 1 .2 1.8.1 2 .5.5.8 1.2.8 2 0 2.9-1.8 3.5-3.5 3.7.3.3.6.8.6 1.6v2.4c0 .2.1.5.5.4A7.5 7.5 0 0 0 12 4.5z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }
  if (b === 'slack' || /slack/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#FFFFFF" />
        <path d="M6 10.5a1.5 1.5 0 1 1 1.5-1.5v1.5H6zm2.5 0a1.5 1.5 0 1 1 3 0v4a1.5 1.5 0 1 1-3 0v-4z" fill="#36C5F0" />
        <path d="M13.5 6a1.5 1.5 0 1 1 1.5 1.5H13.5V6zm0 2.5a1.5 1.5 0 1 1 0 3h-4a1.5 1.5 0 1 1 0-3h4z" fill="#2EB67D" />
        <path d="M18 13.5a1.5 1.5 0 1 1-1.5 1.5v-1.5H18zm-2.5 0a1.5 1.5 0 1 1-3 0v-4a1.5 1.5 0 1 1 3 0v4z" fill="#ECB22E" />
        <path d="M10.5 18a1.5 1.5 0 1 1-1.5-1.5h1.5V18zm0-2.5a1.5 1.5 0 1 1 0-3h4a1.5 1.5 0 1 1 0 3h-4z" fill="#E01E5A" />
      </svg>
    );
  }
  if (b === 'teams' || /teams|msteams/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#6264A7" />
        <circle cx="15.5" cy="8.5" r="2" fill="#FFFFFF" opacity="0.85" />
        <path d="M13.5 12h4c1 0 2 .8 2 1.8V15h-8v-1.2c0-1 1-1.8 2-1.8z" fill="#FFFFFF" opacity="0.85" />
        <circle cx="9.5" cy="9.5" r="2.5" fill="#FFFFFF" />
        <path d="M7 14h5c1.1 0 2 .9 2 2v1.5H5V16c0-1.1.9-2 2-2z" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'outlook' || /outlook/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0078D4" />
        <path d="M5 8l7 4.5L19 8v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" fill="#FFFFFF" opacity="0.4" />
        <rect x="4.5" y="6" width="9" height="12" rx="2" fill="#FFFFFF" />
        <text x="9" y="14.5" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fontSize="8" fontWeight="850" fill="#0078D4">O</text>
      </svg>
    );
  }
  if (b === 'linkedin' || /linkedin/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0A66C2" />
        <text x="12" y="16.5" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fontSize="13" fontWeight="850" fill="#FFFFFF">in</text>
      </svg>
    );
  }
  if (b === 'facebook' || /facebook|meta|messenger/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0866FF" />
        <path d="M13 18v-5.5h2l.3-2.3H13V8.8c0-.7.2-1.1 1.2-1.1h1.1V5.7c-.2 0-.9-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.5H8.5v2.3H10.5V18H13z" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'tiktok' || /tiktok/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#000000" />
        <path d="M16.5 8.5c-1-.2-1.9-.9-2.2-1.8h-2.1v9c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2 1-2.2 2.2-2.2c.3 0 .5 0 .8.1v-2.2c-.3 0-.5-.1-.8-.1-2.4 0-4.3 1.9-4.3 4.4s1.9 4.4 4.3 4.4 4.3-1.9 4.3-4.4v-4.8c1.1.8 2.4 1.2 3.8 1.2V10.2c-1.3 0-2.4-.7-2.9-1.7h1.6V8.5z" fill="#25F4EE" />
        <path d="M15.5 7.5c-1-.2-1.9-.9-2.2-1.8h-2.1v9c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2 1-2.2 2.2-2.2c.3 0 .5 0 .8.1v-2.2c-.3 0-.5-.1-.8-.1-2.4 0-4.3 1.9-4.3 4.4s1.9 4.4 4.3 4.4 4.3-1.9 4.3-4.4v-4.8c1.1.8 2.4 1.2 3.8 1.2V9.2c-1.3 0-2.4-.7-2.9-1.7h1.6V7.5z" fill="#FE2C55" opacity="0.8" />
      </svg>
    );
  }
  if (b === 'windows' || b === 'security' || /windows|system|ayarlar|settings|defender|explorer/.test(name)) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="url(#gh-win-grad)" />
        <defs>
          <linearGradient id="gh-win-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0078D4" />
            <stop offset="1" stopColor="#00C7FD" />
          </linearGradient>
        </defs>
        <rect x="5.5" y="5.5" width="5.8" height="5.8" rx="1" fill="#FFFFFF" />
        <rect x="12.7" y="5.5" width="5.8" height="5.8" rx="1" fill="#FFFFFF" />
        <rect x="5.5" y="12.7" width="5.8" height="5.8" rx="1" fill="#FFFFFF" />
        <rect x="12.7" y="12.7" width="5.8" height="5.8" rx="1" fill="#FFFFFF" />
      </svg>
    );
  }
  if (b === 'claude' || /claude|anthropic/.test(name)) {
    return <AiProviderLogo provider="claude" size={26} />;
  }
  if (b === 'openai' || /chatgpt|openai/.test(name)) {
    return <AiProviderLogo provider="ChatGPT" size={26} />;
  }
  if (b === 'codex' || b === 'twocode' || /twocode|codex/.test(name)) {
    return (
      <div className="notif-custom-app-badge" style={{ background: 'linear-gradient(135deg, #6198FF, #8A5CF6)' }}>
        <span className="notif-badge-letter">2</span>
      </div>
    );
  }
  if (b === 'antigravity' || /antigravity/.test(name)) {
    return <RealAppIcon sc={{ id: 'antigravity-agent-mark', type: 'antigravity' }} size={26} />;
  }
  if (b === 'gemini' || /gemini/.test(name)) {
    return <RealAppIcon sc={{ id: 'gemini-agent-mark', type: 'gemini' }} size={26} />;
  }
  if (b === 'ghelper' || /ghelper|g-helper/.test(name)) {
    return (
      <div className="notif-custom-app-badge" style={{ background: 'linear-gradient(135deg, #38A6FF, #00B874)' }}>
        <span className="notif-badge-letter">G</span>
      </div>
    );
  }
  if (b === 'mail' || /mail|posta/.test(name)) {
    return (
      <div className="notif-custom-app-badge" style={{ background: 'linear-gradient(135deg, #0078D4, #4285F4)' }}>
        <Mail size={17} strokeWidth={2.4} color="#ffffff" />
      </div>
    );
  }

  // Universal dynamic monogram tile for all other applications
  const effectiveName = appName || banner?.app || banner?.title || 'App';
  const initial = String(effectiveName).trim().charAt(0).toLocaleUpperCase('tr-TR') || 'A';
  const grad = generateAppGradient(effectiveName);

  return (
    <div
      className="notif-custom-app-badge"
      style={{
        background: `linear-gradient(135deg, ${grad.hex}, ${grad.secondaryHex})`,
      }}
    >
      <span className="notif-badge-letter">{initial}</span>
    </div>
  );
}
function RoboDockIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <rect x="1.5" y="3.5" width="15" height="11" rx="5.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="7" y1="7" x2="7" y2="11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="11" y1="7" x2="11" y2="11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const CLOCK_COLORS = [
  '#ffffff',
  '#f4bfd4',
  '#f0687e',
  '#f2a359',
  '#f7dc6f',
  '#76e094',
  '#6dd5fa',
  '#8ab4f8',
  '#c2a5f9',
];

const MODE_PRESETS = {
  Work: { blockSocial: true, onlyClaude: true, keepMusic: true },
  Study: { blockSocial: true, onlyClaude: false, keepMusic: true },
  Sleep: { blockSocial: true, onlyClaude: false, keepMusic: false },
  Game: { blockSocial: false, onlyClaude: false, keepMusic: true },
  Serbest: { blockSocial: false, onlyClaude: false, keepMusic: true },
};
const MODE_OPTIONS = [
  { id: 'Work', label: 'Work', icon: Briefcase, color: '#74a9ff' },
  { id: 'Study', label: 'Study', icon: BookOpen, color: '#bd9bff' },
  { id: 'Sleep', label: 'Sleep', icon: Moon, color: '#8d91ff' },
  { id: 'Game', label: 'Game', icon: Gamepad2, color: '#ffad66' },
  { id: 'Serbest', label: 'Serbest', icon: Radio, color: '#75e6ad' },
];

const GHELPER_PERF_MODES = {
  0: { name: 'Dengeli', color: '#38a6ff', icon: Car },
  1: { name: 'Turbo', color: '#ff453a', icon: Rocket },
  2: { name: 'Sessiz', color: '#64d2ff', icon: Bike },
};

const GHELPER_GPU_MODES = {
  0: { name: 'Eko', color: '#00b874', icon: Leaf },
  1: { name: 'Standart', color: '#0a84ff', icon: Flower2 },
  2: { name: 'Ultimate', color: '#ff453a', icon: Gamepad2 },
  3: { name: 'Optimize', color: '#ffd60a', icon: RotateCw },
};

const MAIL_FOLDERS = [
  { id: 'primary', label: 'Öncelikli', countKey: 'primary', icon: Inbox, url: 'https://mail.google.com/mail/u/0/#inbox' },
  { id: 'updates', label: 'Güncellemeler', countKey: 'updates', icon: RotateCw, url: 'https://mail.google.com/mail/u/0/#category/updates' },
  { id: 'promotions', label: 'Tanıtımlar', countKey: 'promotions', icon: Tag, url: 'https://mail.google.com/mail/u/0/#category/promotions' },
];

function AiProviderLogo({ provider, size = 18 }) {
  const normalized = String(provider || '').toLowerCase();
  if (normalized === 'bedo') {
    return (
      <span
        className="ai-provider-logo bedo-logo"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 35% 35%, #38bdf8, #0284c7)',
          color: '#04121d',
          fontWeight: 800,
          fontSize: Math.max(9, Math.round(size * 0.56)),
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        B
      </span>
    );
  }
  if (normalized === 'gemini') {
    return <RealAppIcon sc={{ id: 'gemini-provider-mark', type: 'gemini' }} size={size} />;
  }
  if (normalized === 'claude') {
    return (
      <svg className="ai-provider-logo claude-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z" />
      </svg>
    );
  }
  return (
    <svg className="ai-provider-logo openai-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.306 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.376-3.454l-.142.081L8.704 5.46a.8.8 0 0 0-.393.681zm1.098-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5z" />
    </svg>
  );
}

function readModePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('twocode-mode-preferences') || '{}');
    const name = MODE_PRESETS[saved.selectedModeName] ? saved.selectedModeName : 'Work';
    return { selectedModeName: name, modeToggles: { ...MODE_PRESETS[name], ...(saved.modeToggles || {}) } };
  } catch {
    return { selectedModeName: 'Work', modeToggles: { ...MODE_PRESETS.Work } };
  }
}

function readClockPreferences() {
  try {
    return JSON.parse(localStorage.getItem('twocode-clock-preferences') || '{}');
  } catch {
    return {};
  }
}

const HOME_LAYOUTS = [
  { id: 'clock', name: 'Clock' },
  { id: 'grid', name: 'Grid' },
  { id: 'dial', name: 'Dial' },
  { id: 'minimal', name: 'Minimal' },
];

function renderTooltipContent(text) {
  if (!text) return null;

  // Format "Title (Hint)" - e.g. "Ses Kontrolü (Tıkla: Sessize Al, Tekerlek: Ses Aç/Kıs)"
  const parenMatch = text.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    const mainTitle = parenMatch[1].trim();
    const hint = parenMatch[2].trim();
    return (
      <div className="modern-tooltip-inner">
        <span className="modern-tooltip-main">{mainTitle}</span>
        <span className="modern-tooltip-kbd">{hint}</span>
      </div>
    );
  }

  // Format "Category: Value" - e.g. "G-Helper Performans: Turbo" or "G-Helper GPU: Eko"
  if (text.includes(': ') && !text.startsWith('http')) {
    const idx = text.indexOf(': ');
    const label = text.slice(0, idx).trim();
    const value = text.slice(idx + 2).trim();
    return (
      <div className="modern-tooltip-inner">
        <span className="modern-tooltip-label">{label}</span>
        <span className="modern-tooltip-pill">{value}</span>
      </div>
    );
  }

  // Format "Primary · Secondary"
  if (text.includes(' · ')) {
    const parts = text.split(' · ');
    return (
      <div className="modern-tooltip-inner">
        <span className="modern-tooltip-main">{parts[0]}</span>
        <span className="modern-tooltip-sep">•</span>
        <span className="modern-tooltip-sub">{parts.slice(1).join(' · ')}</span>
      </div>
    );
  }

  return <span className="modern-tooltip-main">{text}</span>;
}

const MiniProgressBar = React.memo(function MiniProgressBar({ liveMedia, active }) {
  const [pos] = useIsolatedMediaPosition(liveMedia, active, false, 600);
  const pct =
    liveMedia?.duration > 0
      ? Math.min(100, Math.max(0, (pos / liveMedia.duration) * 100))
      : liveMedia?.hasSession
        ? 35
        : 0;
  return (
    <div className="mini-progress-track">
      <div
        className="mini-progress-fill"
        style={{ width: `${Math.max(6, pct)}%` }}
      />
    </div>
  );
});

export default function App() {
  // Island mode: 'idle' | 'mini-progress' | 'battery' | 'music-bar' | 'expanded'
  const [islandMode, setIslandMode] = useState('idle');
  const islandModeRef = useRef(islandMode);
  islandModeRef.current = islandMode;
  const [expandedWarm, setExpandedWarm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExpandedWarm(true), 120);
    return () => clearTimeout(t);
  }, []);
  const shouldRenderExpanded = islandMode === 'expanded' || expandedWarm;
  const [gameModeActive, setGameModeActive] = useState(false);
  useEffect(() => {
    const isGameIdle = Boolean(gameModeActive && islandMode === 'idle');
    document.body.classList.toggle('game-mode-idle', isGameIdle);
    return () => {
      document.body.classList.remove('game-mode-idle');
    };
  }, [gameModeActive, islandMode]);
  // Right-click thin progress bar toggle
  const [isMiniProgressBar, setIsMiniProgressBar] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  // Overlay inside expanded island: null | 'all-apps' | 'customize-carousel' | 'mirror'
  const [islandOverlay, setIslandOverlay] = useState(null);
  const dockTabsRef = useRef(null);
  const [dockBubble, setDockBubble] = useState({ left: 0, width: 0, visible: false });

  useLayoutEffect(() => {
    const nav = dockTabsRef.current;
    if (!nav || !shouldRenderExpanded) {
      setDockBubble((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const updateBubble = () => {
      const activeBtn = nav.querySelector('.dock-tab-btn.is-active');
      if (!activeBtn) {
        setDockBubble((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const nextLeft = activeBtn.offsetLeft;
      const nextWidth = activeBtn.offsetWidth;
      setDockBubble((prev) =>
        prev.left === nextLeft && prev.width === nextWidth && prev.visible
          ? prev
          : { left: nextLeft, width: nextWidth, visible: true }
      );
    };
    updateBubble();
    const rafId = requestAnimationFrame(updateBubble);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateBubble);
      ro.observe(nav);
      const activeBtn = nav.querySelector('.dock-tab-btn.is-active');
      if (activeBtn) ro.observe(activeBtn);
      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, islandOverlay, shouldRenderExpanded]);
  const [homeLayoutIndex, setHomeLayoutIndex] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [notificationHistoryOpen, setNotificationHistoryOpen] = useState(false);
  const notificationHistoryPanelRef = useRef(null);
  const notificationHistoryTriggerRef = useRef(null);
  const [notifPreview, setNotifPreview] = useState({
    visible: false,
    title: '',
    body: '',
    time: '',
    accentRgb: '56, 189, 248',
    accentHex: '#38bdf8',
    x: 0,
    y: 0,
    width: 340,
    maxHeight: 220,
    placement: 'bottom',
  });
  const notifPreviewTimerRef = useRef(null);

  const hideNotifPreview = useCallback(() => {
    clearTimeout(notifPreviewTimerRef.current);
    notifPreviewTimerRef.current = null;
    setNotifPreview((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const scheduleNotifPreview = useCallback((event, item, title, body, accent) => {
    clearTimeout(notifPreviewTimerRef.current);
    const buttonEl = event.currentTarget;
    if (!buttonEl) return;

    notifPreviewTimerRef.current = setTimeout(() => {
      if (!buttonEl.isConnected) return;
      const titleEl = buttonEl.querySelector('.notif-card-title');
      const bodyEl = buttonEl.querySelector('.notif-card-body');
      const isTitleTruncated = Boolean(titleEl && titleEl.scrollWidth > titleEl.clientWidth + 1);
      const isBodyTruncated = Boolean(bodyEl && bodyEl.scrollWidth > bodyEl.clientWidth + 1);
      if (!isTitleTruncated && !isBodyTruncated) return;

      const cardEl = buttonEl.closest('.notif-card') || buttonEl;
      const rect = cardEl.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 260), viewportW - 20);
      const left = Math.max(10, Math.min(viewportW - width - 10, rect.left));
      const spaceBelow = viewportH - rect.bottom - 10;
      const spaceAbove = rect.top - 10;
      const placement = spaceBelow >= 130 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
      const availableSpace = placement === 'bottom' ? spaceBelow : spaceAbove;
      const maxHeight = Math.min(240, Math.max(96, availableSpace - 6));
      const top = placement === 'bottom' ? rect.bottom + 6 : rect.top - 6;

      setNotifPreview({
        visible: true,
        title,
        body,
        time: formatNotifTime(item.timestamp),
        accentRgb: accent.rgb,
        accentHex: accent.hex,
        x: left,
        y: top,
        width,
        maxHeight,
        placement,
      });
    }, 450);
  }, []);

  useEffect(() => {
    if (!notificationHistoryOpen) {
      hideNotifPreview();
    }
  }, [notificationHistoryOpen, hideNotifPreview]);

  useEffect(() => () => {
    clearTimeout(notifPreviewTimerRef.current);
  }, []);
  const [notificationHistory, setNotificationHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('twocode-notification-history') || '[]')
        .filter(shouldPersistNotification)
        .slice(0, 100)
        .map((item) => ({ ...item, isRead: item.isRead !== false }));
    }
    catch { return []; }
  });
  const [quitConfirming, setQuitConfirming] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [networkInfo, setNetworkInfo] = useState({ wifi: 'Ağ aranıyor…', bluetooth: 'On', wifiConnected: false, wifiState: null, bluetoothState: null });
  const [radioBusy, setRadioBusy] = useState('');
  const [radioError, setRadioError] = useState('');
  const [radioPanel, setRadioPanel] = useState('');
  const [radioScanBusy, setRadioScanBusy] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [bluetoothDevices, setBluetoothDevices] = useState([]);

  // Clock & Customization state
  const [now, setNow] = useState(new Date());
  const [batteryDelta] = useState(-10);
  const [batteryPercent, setBatteryPercent] = useState(80);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [batteryAlertKind, setBatteryAlertKind] = useState('charging');
  const [isCustomizingClock, setIsCustomizingClock] = useState(false);
  const [clockFontIndex, setClockFontIndex] = useState(() => {
    const value = Number(readClockPreferences().fontIndex);
    return Number.isInteger(value) && value >= 0 && value <= 4 ? value : 3;
  });
  const [clockColor, setClockColor] = useState(() => readClockPreferences().color || '#ffffff');
  const [userPickedClockColor, setUserPickedClockColor] = useState(() => readClockPreferences().customColor === true);
  const [clockScale, setClockScale] = useState(() => {
    const value = Number(readClockPreferences().scale);
    return Number.isFinite(value) ? Math.min(1.12, Math.max(0.78, value)) : 1;
  });
  const [clock24Hour, setClock24Hour] = useState(() => readClockPreferences().clock24Hour !== false);
  const [clockShowSeconds, setClockShowSeconds] = useState(() => readClockPreferences().showSeconds === true);
  const [textFontIndex, setTextFontIndex] = useState(() => readTypographyPreferences().textFontIndex);
  const [showClockAdvanced, setShowClockAdvanced] = useState(false);

  // Modern Sleek Global Tooltip State
  const [tooltipState, setTooltipState] = useState({
    visible: false,
    text: '',
    x: 0,
    y: 0,
    placement: 'bottom',
  });
  const tooltipTimerRef = useRef(null);
  const activeTooltipElRef = useRef(null);
  const tooltipWarmRef = useRef(false);
  const tooltipWarmTimerRef = useRef(null);

  useEffect(() => {
    const handlePointerOver = (e) => {
      const target = e.target?.closest?.('[title], [data-tooltip], [data-modern-tooltip]');
      if (!target || target.closest('[data-no-tooltip]')) return;

      let text = target.getAttribute('data-modern-tooltip') || target.getAttribute('data-tooltip');
      if (!text && target.hasAttribute('title')) {
        text = target.getAttribute('title');
        target.setAttribute('data-modern-tooltip', text);
        target.removeAttribute('title');
      }

      if (!text || !text.trim()) return;

      if (activeTooltipElRef.current === target && tooltipState.visible) {
        return;
      }

      activeTooltipElRef.current = target;
      clearTimeout(tooltipTimerRef.current);

      const show = () => {
        if (activeTooltipElRef.current !== target) return;
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const placement = rect.top < 100 ? 'bottom' : 'top';
        const y = placement === 'bottom' ? rect.bottom + 7 : rect.top - 7;

        setTooltipState({
          visible: true,
          text,
          x,
          y,
          placement,
        });

        tooltipWarmRef.current = true;
        clearTimeout(tooltipWarmTimerRef.current);
      };

      const delay = tooltipWarmRef.current ? 40 : 200;
      tooltipTimerRef.current = setTimeout(show, delay);
    };

    const hideTooltip = () => {
      clearTimeout(tooltipTimerRef.current);
      activeTooltipElRef.current = null;
      setTooltipState((prev) => (prev.visible ? { ...prev, visible: false } : prev));

      clearTimeout(tooltipWarmTimerRef.current);
      tooltipWarmTimerRef.current = setTimeout(() => {
        tooltipWarmRef.current = false;
      }, 350);
    };

    const handlePointerOut = (e) => {
      if (activeTooltipElRef.current && !e.relatedTarget?.closest?.('[data-modern-tooltip], [data-tooltip], [title]')) {
        hideTooltip();
      }
    };

    const handlePointerDown = () => {
      hideTooltip();
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('scroll', hideTooltip, true);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', hideTooltip, true);
      clearTimeout(tooltipTimerRef.current);
      clearTimeout(tooltipWarmTimerRef.current);
    };
  }, [tooltipState.visible]);

  useEffect(() => {
    localStorage.setItem('twocode-clock-preferences', JSON.stringify({
      fontIndex: clockFontIndex,
      color: clockColor,
      customColor: userPickedClockColor,
      scale: clockScale,
      clock24Hour,
      showSeconds: clockShowSeconds,
    }));
  }, [clockFontIndex, clockColor, userPickedClockColor, clockScale, clock24Hour, clockShowSeconds]);

  useEffect(() => {
    applyTypographyTokens({ textFontIndex, numberFontIndex: clockFontIndex });
  }, [textFontIndex, clockFontIndex]);

  useEffect(() => {
    const syncTypography = (event) => {
      if (event.key === TYPOGRAPHY_STORAGE_KEY) {
        setTextFontIndex(readTypographyPreferences().textFontIndex);
      }
      if (event.key === 'twocode-clock-preferences' && event.newValue) {
        try {
          const value = Number(JSON.parse(event.newValue).fontIndex);
          if (Number.isInteger(value) && value >= 0 && value < CLOCK_FONT_FAMILIES.length) setClockFontIndex(value);
        } catch { /* Ignore malformed storage updates. */ }
      }
    };
    window.addEventListener('storage', syncTypography);
    return () => window.removeEventListener('storage', syncTypography);
  }, []);

  // Live Windows Media (SMTC) state — NO mock track
  const [liveMedia, setLiveMedia] = useState({
    hasSession: false,
    title: '',
    artist: '',
    album: '',
    isPlaying: false,
    position: 0,
    duration: 0,
    thumbnail: '',
    lyrics: [],
  });

  // Focus / Timer state
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRunningRef = useRef(false);
  timerRunningRef.current = timerRunning;
  const rulerRef = useRef(null);
  const [isDraggingRuler, setIsDraggingRuler] = useState(false);
  const [showPlayOnPopover, setShowPlayOnPopover] = useState(false);
  const [showMusicServicePicker, setShowMusicServicePicker] = useState(false);
  const [hoverAddApp, setHoverAddApp] = useState(false);

  // AI Agent (Claude / Codex / Gemini / Antigravity) state — NO mock prompts
  const [selectedAiProvider, setSelectedAiProvider] = useState('Bedo');
  const [jobsToday, setJobsToday] = useState(0);
  const [roboMood, setRoboMood] = useState('normal');
  const [roboReaction, setRoboReaction] = useState(null);
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== 'hidden');
  const appMountedAtRef = useRef(Date.now());
  const roboReactionRef = useRef(null);
  const roboReactionTimerRef = useRef(null);
  const roboReactionKeyRef = useRef(0);
  const previousMediaRef = useRef(null);
  const previousTabRef = useRef(activeTab);
  const previousTimerRunningRef = useRef(timerRunning);
  const previousTimerSecondsRef = useRef(timerSeconds);
  const previousBatteryChargingRef = useRef(batteryCharging);
  const previousBatteryLowRef = useRef(batteryPercent <= 20);
  const previousClipboardIdRef = useRef(null);
  const [codexHistory, setCodexHistory] = useState([]);
  const [claudeHistory, setClaudeHistory] = useState([]);
  const [geminiHistory, setGeminiHistory] = useState([]);
  const [antigravityHistory, setAntigravityHistory] = useState([]);
  const [agentActivity, setAgentActivity] = useState([]);
  const [agentIntegration, setAgentIntegration] = useState({ codexConnected: false, antigravityConnected: false, antigravityIdePath: '' });
  const [selectedAgentJobId, setSelectedAgentJobId] = useState(null);
  const [copiedAgentJobId, setCopiedAgentJobId] = useState(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [agentNowTick, setAgentNowTick] = useState(() => Date.now());
  const [pendingApproval, setPendingApproval] = useState(null);
  const [activeHookTask, setActiveHookTask] = useState(null);

  // Robo Ask state
  const [roboQuestion, setRoboQuestion] = useState('');
  const [roboReply, setRoboReply] = useState(null);
  const [roboReplyProvider, setRoboReplyProvider] = useState(null);
  const [roboLoading, setRoboLoading] = useState(false);

  // Bedo (JARVIS Headless Bridge) live state
  const [bedoStatus, setBedoStatus] = useState({
    running: false,
    ready: false,
    jarvisState: 'INITIALISING',
    muted: false,
    paused: true,
    webcamActive: false,
  });
  const [bedoWebcamFrame, setBedoWebcamFrame] = useState(null);
  const [bedoUserTranscript, setBedoUserTranscript] = useState('');
  const [bedoMicLevel, setBedoMicLevel] = useState(0);
  const [bedoThinkingHint, setBedoThinkingHint] = useState('');
  const bedoPausedMediaRef = useRef(false);
  const lastBedoWakeAtRef = useRef(0);
  const currentMediaRef = useRef({ hasSession: false, isPlaying: false });

  const pauseMediaForBedo = useCallback(() => {
    if (islandSettingsRef.current?.bedoPauseMedia === false) return;
    if (currentMediaRef.current?.hasSession && currentMediaRef.current?.isPlaying && !bedoPausedMediaRef.current) {
      bedoPausedMediaRef.current = true;
      window.twocode?.mediaControl?.('playPause');
    }
  }, []);

  const resumeMediaAfterBedo = useCallback(() => {
    if (bedoPausedMediaRef.current) {
      bedoPausedMediaRef.current = false;
      if (currentMediaRef.current?.hasSession && !currentMediaRef.current?.isPlaying) {
        window.twocode?.mediaControl?.('playPause');
      }
    }
  }, []);

  useEffect(() => {
    if (bedoStatus?.paused || bedoStatus?.jarvisState !== 'THINKING') return undefined;
    const t1 = setTimeout(() => {
      setBedoThinkingHint((prev) => prev || 'Hâlâ araştırıyorum...');
    }, 3500);
    const t2 = setTimeout(() => {
      setBedoThinkingHint('Biraz uzun sürdü, hâlâ kontrol ediyorum...');
    }, 8500);
    const t3 = setTimeout(() => {
      setBedoThinkingHint('');
      setRoboMood('listening');
      setRoboReply('Yanıt gecikti, tekrar deneyebilirsiniz.');
      setBedoStatus((prev) => ({ ...prev, jarvisState: 'LISTENING' }));
    }, 18000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [bedoStatus?.paused, bedoStatus?.jarvisState]);

  useEffect(() => {
    const api = window.twocode;
    if (!api?.bedoStart) return;

    (api.getSettings ? api.getSettings() : Promise.resolve(null)).then((saved) => {
      if (saved?.bedoAutoStart === false) return;
      api.bedoStart({
        startPaused: true,
        enableWake: saved?.bedoEnableWake !== false,
        enableClap: false,
      }).then((res) => {
        if (res?.status) setBedoStatus(res.status);
      }).catch(() => {});
    }).catch(() => {});

    let prevPaused = true;
    const unsubStatus = api.onBedoStatus?.((status) => {
      if (!status) return;
      const nowPaused = Boolean(status.paused);
      if (prevPaused && !nowPaused && islandModeRef.current !== 'expanded') {
        lastBedoWakeAtRef.current = Date.now();
        islandModeRef.current = 'bedo-live';
        setIslandMode('bedo-live');
        window.twocode?.setIslandMode?.('bedo-live');
      }
      prevPaused = nowPaused;
      if (nowPaused) {
        setRoboLoading(false);
        setBedoThinkingHint('');
      }
      setBedoStatus(status);
    });
    const unsubEvent = api.onBedoEvent?.((ev) => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'wake') {
        lastBedoWakeAtRef.current = Date.now();
        if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current);
        if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
        pauseMediaForBedo();
        suppressHoverCollapseUntilRef.current = Date.now() + 9000;
        suppressHoverExpandUntilRef.current = Date.now() + 9000;
        setShowMenu(false);
        setNotificationHistoryOpen(false);
        setIslandOverlay(null);
        islandModeRef.current = 'bedo-live';
        setIslandMode('bedo-live');
        window.twocode?.setIslandMode?.('bedo-live');
        setSelectedAiProvider('Bedo');
        setRoboMood('listening');
        setBedoThinkingHint('');
        triggerRoboReaction('happy', 5, 1600);
        playRoboSound('curious', islandSettings.soundEffects !== false);
      } else if (ev.type === 'sleep') {
        resumeMediaAfterBedo();
        setRoboLoading(false);
        setBedoThinkingHint('');
        setIslandMode(resolvedCollapsedModeRef.current || 'idle');
      } else if (ev.type === 'island_action') {
        const act = String(ev.action || '').trim().toLowerCase();
        const val = String(ev.value || '').trim();
        if (act === 'media_play') {
          bedoPausedMediaRef.current = false;
          if (!currentMediaRef.current?.hasSession || !currentMediaRef.current?.isPlaying) {
            window.twocode?.mediaControl?.('playPause');
          }
        } else if (act === 'media_pause') {
          bedoPausedMediaRef.current = false;
          if (currentMediaRef.current?.hasSession && currentMediaRef.current?.isPlaying) {
            window.twocode?.mediaControl?.('playPause');
          }
        } else if (act === 'media_next') {
          window.twocode?.mediaControl?.('next');
        } else if (act === 'media_prev') {
          window.twocode?.mediaControl?.('prev');
        } else if (act === 'open_tab' && val) {
          setShowMenu(false);
          setIslandOverlay(null);
          setIslandMode(val);
        } else if (act === 'focus_start') {
          setTimerRunning(true);
        } else if (act === 'focus_pause') {
          setTimerRunning(false);
        } else if (act === 'focus_reset') {
          setTimerRunning(false);
          setTimerSeconds(focusMinutes * 60);
        } else if (act === 'note_add' && val) {
          setNotesList((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) {
              return [{ id: `note_${Date.now()}`, color: '#38BDF8', text: val, attachments: [] }];
            }
            const first = prev[0];
            const sep = first.text && !first.text.endsWith('\n') ? '\n' : '';
            return prev.map((item, idx) => (idx === 0 ? { ...item, text: `${item.text || ''}${sep}${val}` } : item));
          });
        }
      } else if (ev.type === 'thinking_progress') {
        const hintText = String(ev.text || '').trim();
        if (hintText) setBedoThinkingHint(hintText);
      } else if (ev.type === 'state') {
        if (ev.state !== 'THINKING') {
          setBedoThinkingHint('');
        }
        if (ev.state === 'SPEAKING') {
          setRoboMood('speaking');
          triggerRoboReaction('speaking', 4, 2400);
          setRoboLoading(false);
        } else if (ev.state === 'THINKING') {
          setRoboMood('thinking');
          triggerRoboReaction('thinking', 4, 2600);
        } else if (ev.state === 'ERROR') {
          setRoboMood('sad');
          triggerRoboReaction('error', 5, 2000);
          setRoboLoading(false);
        } else if (ev.state === 'LISTENING') {
          setRoboMood('listening');
          setRoboLoading(false);
        }
      } else if (ev.type === 'sfx') {
        triggerRoboReaction('happy', 4, 1500);
        playRoboSound('happy', islandSettings.soundEffects !== false);
      } else if (ev.type === 'user_transcript') {
        const cleanUser = String(ev.text || '').trim();
        if (cleanUser) {
          setBedoUserTranscript(cleanUser);
        }
      } else if (ev.type === 'assistant_transcript') {
        const cleanAssistant = String(ev.text || '').trim();
        if (cleanAssistant) {
          setRoboReply(cleanAssistant);
          setRoboReplyProvider('Bedo');
          setRoboLoading(false);
        }
      } else if (ev.type === 'log') {
        if (ev.role === 'user') {
          const cleanUser = String(ev.text || '').replace(/^Siz:\s*/i, '').trim();
          if (cleanUser) {
            setBedoUserTranscript(cleanUser);
            setRoboReply(null);
            setRoboLoading(true);
            setRoboMood('curious');
          }
        } else if (ev.role === 'assistant') {
          const clean = String(ev.text || '').replace(/^Bedo:\s*/i, '').trim();
          if (clean) {
            setRoboReply(clean);
            setRoboReplyProvider('Bedo');
          }
          setRoboLoading(false);
        } else if (ev.role === 'error') {
          setRoboReply(String(ev.text || ''));
          setRoboReplyProvider('Bedo');
          setRoboLoading(false);
        }
      } else if (ev.type === 'webcam_frame' && ev.jpeg_b64) {
        setBedoWebcamFrame(`data:image/jpeg;base64,${ev.jpeg_b64}`);
      } else if (ev.type === 'webcam_state' && !ev.active) {
        setBedoWebcamFrame(null);
      } else if (ev.type === 'mic_level') {
        setBedoMicLevel(Number(ev.level) || 0);
      }
    });

    return () => {
      unsubStatus?.();
      unsubEvent?.();
    };
  }, []);

  // Siri modu: Ada kapalıyken veya Bedo görünümü dışındayken otomatik uyku moduna geç
  useEffect(() => {
    const inBedoView = islandMode === 'bedo-live' || (islandMode === 'expanded' && activeTab === 'robo');
    const isTransientToast = islandMode === 'notif-toast' || islandMode === 'hud' || islandMode === 'battery';
    if (!inBedoView && !isTransientToast && bedoStatus.running && !bedoStatus.paused) {
      if (Date.now() - lastBedoWakeAtRef.current < 1500) return;
      window.twocode?.bedoSetPaused?.(true);
    }
  }, [islandMode, activeTab, bedoStatus.running, bedoStatus.paused]);

  // Siri otomatik kapanma: bedo-live modunda 9 sn sessizlik olursa (kamera kapalıyken) adayı kapat
  useEffect(() => {
    if (islandMode !== 'bedo-live') return undefined;
    if (bedoStatus.paused || bedoStatus.webcamActive) return undefined;
    if (bedoStatus.jarvisState === 'SPEAKING' || bedoStatus.jarvisState === 'THINKING') return undefined;
    if (bedoMicLevel > 0.24) return undefined;

    const timer = setTimeout(() => {
      window.twocode?.bedoSetPaused?.(true);
      resumeMediaAfterBedo();
      setIslandMode(resolvedCollapsedModeRef.current || 'idle');
    }, 9000);
    return () => clearTimeout(timer);
  }, [
    islandMode,
    bedoStatus.paused,
    bedoStatus.webcamActive,
    bedoStatus.jarvisState,
    bedoMicLevel,
    bedoUserTranscript,
    roboReply,
  ]);

  // G-Helper live status (performance_mode & gpu_mode)
  const [systemMicMuted, setSystemMicMuted] = useState(false);

  useEffect(() => {
    if (!bedoStatus.running) return;
    window.twocode?.bedoSetSystemMicMuted?.(systemMicMuted);
  }, [systemMicMuted, bedoStatus.running]);

  const [ghelperStatus, setGhelperStatus] = useState({
    performanceMode: 0,
    performanceName: 'Dengeli',
    gpuMode: 0,
    gpuName: 'Standart',
    gpuAuto: false,
  });

  useEffect(() => {
    let mounted = true;
    if (window.twocode?.getGHelperStatus) {
      window.twocode.getGHelperStatus().then((status) => {
        if (mounted && status) {
          setGhelperStatus((prev) => ({ ...prev, ...status }));
        }
      });
    }

    const unsub = window.twocode?.onGHelperStatusUpdate?.((status) => {
      if (mounted && status) {
        setGhelperStatus((prev) => ({ ...prev, ...status }));
      }
    });

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, []);

  const triggerRoboReaction = useCallback((name, priority = 2, duration = 1250) => {
    if (!name || document.visibilityState === 'hidden') return;
    const current = roboReactionRef.current;
    if (current && current.priority > priority && current.expiresAt > Date.now()) return;
    if (roboReactionTimerRef.current) clearTimeout(roboReactionTimerRef.current);
    const next = { name, priority, key: ++roboReactionKeyRef.current, expiresAt: Date.now() + duration };
    roboReactionRef.current = next;
    setRoboReaction(next);
    roboReactionTimerRef.current = setTimeout(() => {
      if (roboReactionRef.current?.key !== next.key) return;
      roboReactionRef.current = null;
      setRoboReaction(null);
      roboReactionTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      setDocumentVisible(visible);
      if (!visible) {
        if (roboReactionTimerRef.current) clearTimeout(roboReactionTimerRef.current);
        roboReactionTimerRef.current = null;
        roboReactionRef.current = null;
        setRoboReaction(null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (roboReactionTimerRef.current) clearTimeout(roboReactionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    previousTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (timerRunning && !previousTimerRunningRef.current) {
      triggerRoboReaction('focus-start', 2, 1100);
    }
    if (
      !timerRunning && previousTimerRunningRef.current &&
      previousTimerSecondsRef.current <= 1 && timerSeconds === focusMinutes * 60
    ) {
      triggerRoboReaction('focus-complete', 3, 1650);
    }
    previousTimerRunningRef.current = timerRunning;
    previousTimerSecondsRef.current = timerSeconds;
  }, [timerRunning, timerSeconds, focusMinutes, triggerRoboReaction]);

  useEffect(() => {
    const isStartup = Date.now() - appMountedAtRef.current < 5000;
    if (batteryCharging && !previousBatteryChargingRef.current && !isStartup) {
      triggerRoboReaction('charging', 4, 1450);
    }
    const isLow = batteryPercent <= 20 && !batteryCharging;
    if (isLow && !previousBatteryLowRef.current && !isStartup) {
      triggerRoboReaction('battery-low', 4, 1450);
    }
    previousBatteryChargingRef.current = batteryCharging;
    previousBatteryLowRef.current = isLow;
  }, [batteryCharging, batteryPercent, triggerRoboReaction]);

  // MODES tab state
  const [selectedModeName, setSelectedModeName] = useState(() => readModePreferences().selectedModeName);
  const [modeToggles, setModeToggles] = useState(() => readModePreferences().modeToggles);

  useEffect(() => {
    try { localStorage.setItem('twocode-mode-preferences', JSON.stringify({ selectedModeName, modeToggles })); } catch { }
  }, [selectedModeName, modeToggles]);

  // TRAY tab & Global Drag-Drop state
  const morphShellRef = useRef(null);

  const refreshRadioStates = async () => {
    const states = await window.twocode?.getRadioStates?.();
    if (states) {
      setNetworkInfo((current) => ({ ...current, ...states }));
      if (states.error) setRadioError(states.error);
    }
  };

  const lastNetworkRefreshRef = useRef(0);
  useEffect(() => {
    if (islandMode !== 'expanded') return undefined;
    let mounted = true;
    const refresh = async () => {
      lastNetworkRefreshRef.current = Date.now();
      try {
        const [network, radios] = await Promise.all([
          window.twocode?.getNetworkInfo?.(),
          window.twocode?.getRadioStates?.(),
        ]);
        if (!mounted) return;
        setNetworkInfo((current) => ({ ...current, ...(network || {}), ...(radios || {}) }));
      } catch { }
    };
    let initialTimer = null;
    if (Date.now() - lastNetworkRefreshRef.current > 12000) {
      initialTimer = setTimeout(refresh, 280);
    }
    const timer = setInterval(refresh, 12000);
    return () => {
      mounted = false;
      if (initialTimer) clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [islandMode]);

  const toggleRadio = async (kind) => {
    if (radioBusy) return;
    setRadioBusy(kind);
    setRadioError('');
    playRoboSound('tap', islandSettings.soundEffects !== false);
    try {
      const result = await window.twocode?.toggleRadio?.(kind);
      if (!result?.success) {
        setRadioError(result?.error || 'Ayar değiştirilemedi.');
      } else {
        const key = kind === 'Wifi' ? 'wifiState' : 'bluetoothState';
        setNetworkInfo((current) => ({ ...current, [key]: result.state }));
      }
    } catch (err) {
      setRadioError(err?.message || 'Ayar değiştirilemedi.');
    } finally {
      setRadioBusy('');
    }
  };

  const scanWifiNetworks = async () => {
    setRadioPanel('wifi');
    setRadioScanBusy(true);
    setRadioError('');
    try {
      const result = await window.twocode?.scanWifiNetworks?.();
      if (result?.success) {
        setWifiNetworks(result.networks || []);
        if (result.connectedSsid) {
          setNetworkInfo((current) => ({ ...current, wifi: result.connectedSsid }));
        }
      } else {
        setWifiNetworks([]);
        setRadioError(result?.error || 'Wi-Fi ağları taranamadı.');
      }
    } catch (err) {
      setWifiNetworks([]);
      setRadioError(err?.message || 'Wi-Fi ağları taranamadı.');
    } finally {
      setRadioScanBusy(false);
    }
  };

  const scanBluetoothDevices = async () => {
    setRadioPanel('bluetooth');
    setRadioScanBusy(true);
    setRadioError('');
    try {
      const result = await window.twocode?.scanBluetoothDevices?.();
      if (result?.success) setBluetoothDevices(result.devices || []);
      else {
        setBluetoothDevices([]);
        setRadioError(result?.error || 'Bluetooth aygıtları bulunamadı.');
      }
    } catch (err) {
      setBluetoothDevices([]);
      setRadioError(err?.message || 'Bluetooth aygıtları bulunamadı.');
    } finally {
      setRadioScanBusy(false);
    }
  };

  const pairBluetoothDevice = async (device) => {
    if (radioBusy) return;
    setRadioBusy(device.id);
    setRadioError('');
    try {
      const result = await window.twocode?.pairBluetoothDevice?.(device.id);
      if (!result?.success) setRadioError(result?.error || `“${device.name}” eşleştirilemedi.`);
      else {
        setRadioError('');
        scanBluetoothDevices();
      }
    } catch (err) {
      setRadioError(err?.message || 'Bluetooth eşleştirme başarısız oldu.');
    } finally {
      setRadioBusy('');
    }
  };

  // CLIPS tab state
  const [clips, setClips] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [clipsFilter, setClipsFilter] = useState('all');
  const [clipPreview, setClipPreview] = useState(null);

  const handleCopyClip = async (clip) => {
    if (!clip) return;
    const ok = await window.twocode?.copyClip?.(clip);
    if (!ok && clip.text) {
      window.twocode?.copyText?.(clip.text);
    }
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId((curr) => (curr === clip.id ? null : curr)), 1100);
  };

  // NOTE tab state (multi-note glassmorphism pockets persisted in localStorage)
  const NOTE_DOT_COLORS = ['#38BDF8', '#FBBF24', '#34D399', '#FB7185', '#A78BFA'];
  const [notesList, setNotesList] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('twocode_notes_v2') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
      const legacy = localStorage.getItem('twocode_note') || '';
      return [{ id: 'note_1', color: '#38BDF8', text: legacy, attachments: [] }];
    } catch {
      return [{ id: 'note_1', color: '#38BDF8', text: '', attachments: [] }];
    }
  });
  const [activeNoteIndex, setActiveNoteIndex] = useState(0);
  const [noteRecording, setNoteRecording] = useState(false);
  const [noteTranscribing, setNoteTranscribing] = useState(false);
  const [noteStatusHint, setNoteStatusHint] = useState('');
  const [noteSummaryOpen, setNoteSummaryOpen] = useState(false);
  const [noteCopied, setNoteCopied] = useState(false);
  const [noteAttCopiedId, setNoteAttCopiedId] = useState(null);
  const [notePreviewAtt, setNotePreviewAtt] = useState(null);
  const [noteDragOver, setNoteDragOver] = useState(false);
  const noteFileInputRef = useRef(null);
  const noteTextareaRef = useRef(null);
  const noteAudioRef = useRef(null);

  const showNoteHint = (msg) => {
    setNoteStatusHint(msg);
    setTimeout(() => setNoteStatusHint((curr) => (curr === msg ? '' : curr)), 2400);
  };

  useEffect(() => {
    try {
      localStorage.setItem('twocode_notes_v2', JSON.stringify(notesList));
    } catch {
      try {
        const compact = notesList.map((n) => ({
          ...n,
          attachments: (n.attachments || []).map((a) => ({ ...a, thumb: a.path ? '' : a.thumb })),
        }));
        localStorage.setItem('twocode_notes_v2', JSON.stringify(compact));
      } catch { }
    }
  }, [notesList]);

  useEffect(() => {
    if (activeNoteIndex >= notesList.length) {
      setActiveNoteIndex(Math.max(0, notesList.length - 1));
    }
  }, [activeNoteIndex, notesList.length]);

  const activeNote = notesList[activeNoteIndex] || notesList[0];

  const updateActiveNote = (updater) => {
    setNotesList((prev) => prev.map((item, idx) => (idx === activeNoteIndex ? updater(item) : item)));
  };

  const addNotePocket = () => {
    const nextColor = NOTE_DOT_COLORS[notesList.length % NOTE_DOT_COLORS.length];
    const newIndex = notesList.length;
    setNotesList((prev) => [...prev, { id: `note_${Date.now()}`, color: nextColor, text: '', attachments: [] }]);
    setActiveNoteIndex(newIndex);
    setNoteSummaryOpen(false);
    setNotePreviewAtt(null);
    setTimeout(() => noteTextareaRef.current?.focus(), 40);
  };

  const deleteActiveNotePocket = () => {
    setNotePreviewAtt(null);
    if (notesList.length <= 1) {
      updateActiveNote((n) => ({ ...n, text: '', attachments: [] }));
      setNoteSummaryOpen(false);
      return;
    }
    setNotesList((prev) => prev.filter((_, idx) => idx !== activeNoteIndex));
    setActiveNoteIndex((idx) => Math.max(0, idx - 1));
    setNoteSummaryOpen(false);
  };

  const buildImageThumbnail = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

  const handleNoteFiles = (fileList) => {
    const files = Array.from(fileList || []).slice(0, 4);
    if (!files.length) return;
    files.forEach(async (file) => {
      const filePath = window.twocode?.getPathForFile?.(file) || file.path || '';
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
      const thumb = isImage ? await buildImageThumbnail(file) : '';
      updateActiveNote((n) => ({
        ...n,
        attachments: [
          ...(n.attachments || []),
          { id: `att_${Date.now()}_${Math.random()}`, name: file.name, path: filePath, isImage, thumb },
        ].slice(-4),
      }));
    });
  };

  const removeNoteAttachment = (attId) => {
    if (notePreviewAtt?.id === attId) setNotePreviewAtt(null);
    updateActiveNote((n) => ({
      ...n,
      attachments: (n.attachments || []).filter((a) => a.id !== attId),
    }));
  };

  const copyNoteAttachment = async (att) => {
    const ok = await window.twocode?.copyNoteAttachment?.({
      isImage: Boolean(att.isImage),
      path: att.path || '',
      thumb: att.thumb || '',
      name: att.name || '',
    });
    if (ok) {
      setNoteAttCopiedId(att.id);
      setTimeout(() => setNoteAttCopiedId((curr) => (curr === att.id ? null : curr)), 1200);
    }
  };

  const encodePcmChunksToWavBase64 = (chunks, inputSampleRate) => {
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const targetRate = 16000;
    const ratio = inputSampleRate / targetRate;
    const outLen = Math.max(1, Math.floor(merged.length / ratio));
    const buffer = new ArrayBuffer(44 + outLen * 2);
    const view = new DataView(buffer);
    const writeStr = (pos, str) => {
      for (let i = 0; i < str.length; i += 1) view.setUint8(pos + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + outLen * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, outLen * 2, true);
    for (let i = 0; i < outLen; i += 1) {
      const sample = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] || 0));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const toggleNoteVoice = async () => {
    if (noteRecording && noteAudioRef.current) {
      const session = noteAudioRef.current;
      noteAudioRef.current = null;
      setNoteRecording(false);
      try { session.proc.disconnect(); session.source.disconnect(); } catch { }
      try { session.stream.getTracks().forEach((t) => t.stop()); } catch { }
      try { await session.ctx.close(); } catch { }
      session.flushChunk(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const sampleRate = ctx.sampleRate || 48000;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const targetNoteId = activeNote?.id;

      let speechChunks = [];
      let speechMs = 0;
      let silenceMs = 0;
      let hasSpeech = false;
      const pendingQueue = [];
      let draining = false;

      const drainQueue = async () => {
        if (draining) return;
        draining = true;
        setNoteTranscribing(true);
        try {
          while (pendingQueue.length > 0) {
            const wavBase64 = pendingQueue.shift();
            const res = await window.twocode?.transcribeAudio?.({ wavBase64, lang: 'tr-TR' });
            if (res?.ok && res.text) {
              setNoteSummaryOpen(false);
              setNotesList((prev) => prev.map((item) => {
                if (item.id !== targetNoteId) return item;
                const sep = item.text && !item.text.endsWith('\n') && !item.text.endsWith(' ') ? ' ' : '';
                return { ...item, text: `${item.text || ''}${sep}${res.text}` };
              }));
            }
          }
        } catch {
          showNoteHint('Ses yazıya dökülemedi');
        } finally {
          draining = false;
          setNoteTranscribing(false);
        }
      };

      const flushChunk = (force = false) => {
        if (!hasSpeech || speechChunks.length === 0) {
          speechChunks = [];
          speechMs = 0;
          silenceMs = 0;
          hasSpeech = false;
          return;
        }
        if (!force && speechMs < 280) return;
        const wavBase64 = encodePcmChunksToWavBase64(speechChunks, sampleRate);
        speechChunks = [];
        speechMs = 0;
        silenceMs = 0;
        hasSpeech = false;
        pendingQueue.push(wavBase64);
        drainQueue();
      };

      proc.onaudioprocess = (ev) => {
        const data = ev.inputBuffer.getChannelData(0);
        const frameMs = (data.length / sampleRate) * 1000;
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          sumSq += data[i] * data[i];
        }
        const rms = Math.sqrt(sumSq / data.length);
        if (rms > 0.012) {
          hasSpeech = true;
          silenceMs = 0;
          speechChunks.push(new Float32Array(data));
          speechMs += frameMs;
          if (speechMs >= 1800) {
            flushChunk(true);
          }
        } else if (hasSpeech) {
          speechChunks.push(new Float32Array(data));
          silenceMs += frameMs;
          if (silenceMs >= 450) {
            flushChunk(false);
          }
        }
      };

      source.connect(proc);
      proc.connect(ctx.destination);
      noteAudioRef.current = { stream, ctx, proc, source, flushChunk };
      setNoteRecording(true);
    } catch {
      showNoteHint('Mikrofon izni alınamadı');
      setNoteRecording(false);
    }
  };

  const noteSummaryLines = useMemo(() => {
    const raw = String(activeNote?.text || '').trim();
    if (!raw) return [];
    return raw
      .split(/\n+/)
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [activeNote?.text]);

  // Agenda event data is owned here; its calendar UI is isolated in AgendaCalendar.
  const [agendaItems, setAgendaItems] = useState([]);

  // Real Google Data (Gmail & Calendar - Zero mock, Firebase Spark / Local-First optimized)
  const [googleData, setGoogleData] = useState(null);
  const [mailCategory, setMailCategory] = useState('primary');
  const [mailCounts, setMailCounts] = useState({
    primary: 0,
    updates: 0,
    promotions: 0,
  });

  // User's custom apps synced from TwoCode Settings — EMPTY by default (no mock GHelper/YouTube)
  const [shortcuts, setShortcuts] = useState([]);
  const [allAppsPage, setAllAppsPage] = useState(0);
  const [allAppsDir, setAllAppsDir] = useState(1);
  const [draggingShortcutId, setDraggingShortcutId] = useState(null);
  const shortcutDragRef = useRef({ id: null, startX: 0, startY: 0, moved: false });
  const suppressShortcutClickRef = useRef(false);
  const [islandSettings, setIslandSettings] = useState({
    language: 'English',
    eyeColorHex: '#ffffff',
    islandOpenMode: 'On hover',
    leftOfRobo: 'Nothing',
    rightOfRobo: 'Nothing',
    roboEyesVisible: true,
    lyricsEnabled: true,
    soundEffects: true,
    notifSound: 'Ding',
    googleConnected: false,
    googleEmail: '',
    bedoEnableWake: true,
    bedoPauseMedia: true,
    bedoAutoStart: true,
    showAppsInDock: true,
    closeIslandOnAppOpen: false,
  });
  const islandSettingsRef = useRef(islandSettings);
  islandSettingsRef.current = islandSettings;
  const langCode = normalizeLanguage(islandSettings.language);
  const t = useMemo(() => createTranslator(langCode), [langCode]);
  const locale = getLocale(langCode);

  // Volume state for the `•••` popup slider and bottom dock button
  const [volumePercent, setVolumePercent] = useState(68);
  const [isMuted, setIsMuted] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const volumeBarRef = useRef(null);

  // App-Aware Context & Live Activities (Steam / Downloads)
  const [appContext, setAppContext] = useState({ app: '', category: 'desktop' });
  const [liveActivity, setLiveActivity] = useState(null);
  const [focusGuardPrompt, setFocusGuardPrompt] = useState(null);
  const [showIslandWelcome, setShowIslandWelcome] = useState(false);
  const focusGuardCooldownRef = useRef({});
  const focusGuardLastAppRef = useRef('');

  const recordFocusGuardStat = (field) => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const raw = JSON.parse(localStorage.getItem('twocode_focus_guard_stats') || '{}');
      const current = raw.date === todayKey ? raw : { date: todayKey, turnedBack: 0, openedAnyway: 0 };
      const next = {
        date: todayKey,
        turnedBack: Number(current.turnedBack || 0) + (field === 'turnedBack' ? 1 : 0),
        openedAnyway: Number(current.openedAnyway || 0) + (field === 'openedAnyway' ? 1 : 0),
      };
      localStorage.setItem('twocode_focus_guard_stats', JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!focusGuardPrompt || focusGuardPrompt.secondsLeft <= 0) return;
    const tId = setTimeout(() => {
      setFocusGuardPrompt((prev) =>
        prev ? { ...prev, secondsLeft: Math.max(0, prev.secondsLeft - 1) } : null
      );
    }, 1000);
    return () => clearTimeout(tId);
  }, [focusGuardPrompt]);

  const batteryTimerRef = useRef(null);
  const hudTimerRef = useRef(null);
  const hudVisibleTimerRef = useRef(null);
  const notifTimerRef = useRef(null);
  const notifRemainingMsRef = useRef(0);
  const notifTimerStartedAtRef = useRef(0);
  const notifPrevModeRef = useRef('idle');
  const isShowingNotifToastRef = useRef(false);
  const hoverExpandTimerRef = useRef(null);
  const deferredCollapseTimerRef = useRef(null);
  const isNotchHoveredRef = useRef(false);
  const suppressHoverExpandUntilRef = useRef(0);
  const suppressHoverCollapseUntilRef = useRef(0);
  const suppressGHelperHudUntilRef = useRef(0);
  const suppressMicHudUntilRef = useRef(0);

  // Live Windows System HUD (Volume & Screen Brightness) and Windows Notification Toast state
  const [hudOverlay, setHudOverlay] = useState({
    type: 'volume',
    value: 68,
    muted: false,
    ghelper: null,
  });
  const [isSystemHudVisible, setIsSystemHudVisible] = useState(false);
  const [toastBanner, setToastBanner] = useState({
    app: 'Windows',
    appId: '',
    logo: '',
    title: '',
    body: '',
  });
  useEffect(() => {
    try { localStorage.setItem('twocode-notification-history', JSON.stringify(notificationHistory.slice(0, 100))); } catch { }
  }, [notificationHistory]);
  const openNotification = (item) => {
    const hadUnread = notificationHistory.some((entry) => entry.id === item?.id && !entry.isRead);
    setNotificationHistory((items) => items.map((entry) => entry.id === item?.id ? { ...entry, isRead: true } : entry));
    if (hadUnread) {
      triggerRoboReaction('notif-read', 3, 950);
    }
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
    suppressHoverExpandUntilRef.current = Date.now() + 700;
    if (notifTimerRef.current) {
      clearTimeout(notifTimerRef.current);
      notifTimerRef.current = null;
    }
    notifRemainingMsRef.current = 0;
    isShowingNotifToastRef.current = false;
    setNotificationHistoryOpen(false);
    setIslandMode((mode) => (mode === 'notif-toast' || mode === 'expanded') ? resolvedCollapsedModeRef.current : mode);
    if (item?.targetUrl || item?.appId) {
      window.twocode?.openNotificationTarget?.({ url: item.targetUrl || '', appId: item.appId || '' });
    }
  };
  const notifLogoAccent = useDominantColor(toastBanner.logo);
  useEffect(() => {
    if (!toastBanner.id || !notifLogoAccent.isLiveCover) return;
    const logoAccent = { rgb: notifLogoAccent.rgb, hex: notifLogoAccent.hex, isLiveCover: true };
    setNotificationHistory((items) => items.map((item) => (
      item.id === toastBanner.id && !item.logoAccent?.isLiveCover
        ? { ...item, logoAccent }
        : item
    )));
  }, [toastBanner.id, notifLogoAccent.rgb, notifLogoAccent.hex, notifLogoAccent.isLiveCover]);
  const notifBrand = useMemo(
    () => resolveNotifBrand(toastBanner, notifLogoAccent),
    [toastBanner, notifLogoAccent]
  );
  const notifPresentation = useMemo(
    () => resolveNotificationPresentation(toastBanner),
    [toastBanner]
  );

  const dynamicNotifToastWidth = useMemo(() => {
    const title = String(notifPresentation.title || '').trim();
    const rawSub = String(notifPresentation.subtitle || '').trim();
    const subtitle =
      rawSub && rawSub !== title && rawSub !== notifPresentation.app ? rawSub : '';

    let titleWidth = title.length * 8.4;
    let subWidth = subtitle.length * 6.8;

    if (typeof document !== 'undefined') {
      try {
        const canvas = (window.__twocodeMeasureCanvas ||= document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const uiFont =
            getComputedStyle(document.documentElement).getPropertyValue('--font-family-ui').trim() ||
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
          ctx.font = `600 14.5px ${uiFont}`;
          titleWidth = ctx.measureText(title).width;
          if (subtitle) {
            ctx.font = `450 12.5px ${uiFont}`;
            subWidth = ctx.measureText(subtitle).width;
          }
        }
      } catch {
        // Fallback to character-based estimate above.
      }
    }

    const contentWidth = Math.max(titleWidth, subWidth);
    return Math.round(Math.min(460, Math.max(210, contentWidth + 118)));
  }, [notifPresentation.title, notifPresentation.subtitle, notifPresentation.app]);

  const dynamicNotifToastHeight = useMemo(() => {
    const title = String(notifPresentation.title || '').trim();
    const rawSub = String(notifPresentation.subtitle || '').trim();
    const hasSub = Boolean(rawSub && rawSub !== title && rawSub !== notifPresentation.app);
    return hasSub ? 60 : 50;
  }, [notifPresentation.title, notifPresentation.subtitle, notifPresentation.app]);

  const dynamicHudSize = useMemo(() => {
    if (hudOverlay.type === 'phone-upload' && hudOverlay.file) {
      return {
        width: hudOverlay.phase === 'receiving' ? 228 : 246,
        height: 38,
      };
    }
    if (hudOverlay.type === 'ghelper' && hudOverlay.ghelper) {
      if (hudOverlay.ghelper.category === 'aura') {
        const valLen = String(hudOverlay.ghelper.valueText || '').trim().length;
        return {
          width: Math.round(Math.min(346, Math.max(290, 210 + valLen * 7.5))),
          height: 38,
        };
      }
      const labelLen = String(hudOverlay.ghelper.label || '').trim().length;
      const valLen = String(hudOverlay.ghelper.valueText || '').trim().length;
      const hasDots = hudOverlay.ghelper.category === 'backlight' && typeof hudOverlay.ghelper.level === 'number';
      const extra = (hasDots ? 28 : 0) + (hudOverlay.ghelper.category === 'mic' ? 12 : 0);
      const w = Math.round(Math.min(340, Math.max(200, 96 + labelLen * 6.8 + valLen * 8.2 + extra)));
      return { width: w, height: 38 };
    }
    // Volume or Brightness HUD: compact & balanced
    return { width: 278, height: 36 };
  }, [hudOverlay]);

  // Active media comes strictly from live Windows SMTC without triggering 4Hz App re-renders
  const currentMedia = useMemo(() => {
    if (liveMedia && liveMedia.hasSession && liveMedia.title) {
      return {
        ...liveMedia,
        isLive: true,
        position: liveMedia.position || 0,
        thumbnail: liveMedia.thumbnail || '',
        lyrics: liveMedia.lyrics || [],
      };
    }
    return {
      hasSession: false,
      isLive: false,
      title: t('music.nothingPlaying'),
      artist: t('music.playPrompt'),
      album: '',
      isPlaying: false,
      position: 0,
      duration: 0,
      thumbnail: '',
      lyrics: [],
    };
  }, [liveMedia, t]);

  const musicAccent = useDominantColor(currentMedia.thumbnail);
  currentMediaRef.current = currentMedia;

  useEffect(() => {
    if (!bedoStatus?.running) return;
    window.twocode?.bedoSyncIslandState?.({
      mode: islandMode,
      media: {
        hasSession: Boolean(currentMedia.hasSession),
        isPlaying: Boolean(currentMedia.isPlaying),
        title: String(currentMedia.title || ''),
        artist: String(currentMedia.artist || ''),
      },
      focus: {
        minutes: focusMinutes,
        running: Boolean(timerRunning),
      },
    });
  }, [
    bedoStatus?.running,
    islandMode,
    currentMedia.hasSession,
    currentMedia.isPlaying,
    currentMedia.title,
    currentMedia.artist,
    focusMinutes,
    timerRunning,
  ]);

  // When nothing is playing, clock is crisp white (#ffffff) as in media_1794022256939_a2c228a1.jpg;
  // when a live cover is active, clock adapts to cover color unless user picked a fixed color
  const effectiveClockColor =
    userPickedClockColor
      ? clockColor
      : musicAccent.isLiveCover && islandSettings.islandMusicColour !== false
        ? musicAccent.hex
        : '#ffffff';

  // Compute active lyric index without re-rendering App on every sub-second tick:
  // App only updates when the active lyric line index actually changes.
  const computeLyricIndex = useCallback((list, pos) => {
    if (!list || list.length === 0) return -1;
    if (list[0]?.time && pos < (list[0].time - 0.5)) return -2; // intro
    let idx = 0;
    for (let i = 0; i < list.length; i++) {
      if (pos >= list[i].time) idx = i;
      else break;
    }
    return idx;
  }, []);

  const [activeLyricIndex, setActiveLyricIndex] = useState(() =>
    computeLyricIndex(liveMedia?.lyrics, liveMedia?.position || 0)
  );
  const activeLyricIndexRef = useRef(activeLyricIndex);
  activeLyricIndexRef.current = activeLyricIndex;
  const lyricSyncRef = useRef({ pos: liveMedia?.position || 0, at: Date.now() });

  useEffect(() => {
    const pos = liveMedia?.position || 0;
    lyricSyncRef.current = { pos, at: Date.now() };
    const nextIdx = computeLyricIndex(liveMedia?.lyrics, pos);
    if (nextIdx !== activeLyricIndexRef.current) {
      setActiveLyricIndex(nextIdx);
    }
  }, [liveMedia?.position, liveMedia?.title, liveMedia?.lyrics, computeLyricIndex]);

  useEffect(() => {
    const list = currentMedia.lyrics || [];
    const lyricsSurfaceVisible =
      islandMode === 'music-bar' || (islandMode === 'expanded' && activeTab === 'music');
    if (islandSettings.lyricsEnabled === false || list.length === 0 || !currentMedia.isPlaying || !lyricsSurfaceVisible) {
      return undefined;
    }

    let targetTime = null;
    if (activeLyricIndex === -2) {
      targetTime = Math.max(0, (list[0]?.time ?? 0) - 0.5);
    } else if (activeLyricIndex >= 0 && activeLyricIndex + 1 < list.length) {
      targetTime = list[activeLyricIndex + 1].time;
    }

    if (targetTime === null || !Number.isFinite(targetTime)) {
      return undefined;
    }

    const elapsed = Math.max(0, (Date.now() - lyricSyncRef.current.at) / 1000);
    const estPos = lyricSyncRef.current.pos + elapsed;
    const delayMs = Math.max(16, Math.round((targetTime - estPos) * 1000));

    const timer = setTimeout(() => {
      const nowElapsed = Math.max(0, (Date.now() - lyricSyncRef.current.at) / 1000);
      const nowPos = lyricSyncRef.current.pos + nowElapsed;
      const nextIdx = computeLyricIndex(list, nowPos);
      if (nextIdx !== activeLyricIndexRef.current) {
        setActiveLyricIndex(nextIdx);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    currentMedia.lyrics,
    currentMedia.isPlaying,
    islandSettings.lyricsEnabled,
    islandMode,
    activeTab,
    activeLyricIndex,
    liveMedia?.position,
    computeLyricIndex,
  ]);

  // Synced lyrics & karaoke line progress calculation with accurate intro & break handling
  const { hasSyncedLyrics, primaryLine, secondaryLine } = useMemo(() => {
    const list = currentMedia.lyrics || [];
    if (islandSettings.lyricsEnabled !== false && list.length > 0) {
      if (activeLyricIndex === -2) {
        return {
          hasSyncedLyrics: true,
          primaryLine: currentMedia.title,
          secondaryLine: list[0]?.text || '',
        };
      }
      const idx = Math.max(0, activeLyricIndex);
      const currItem = list[idx];
      const rawText = (currItem?.text || '').trim();
      const nextRawText = (list[idx + 1]?.text || '').trim();

      return {
        hasSyncedLyrics: true,
        primaryLine: rawText || '♪ ♪ ♪',
        secondaryLine: nextRawText || '',
      };
    }
    return {
      hasSyncedLyrics: false,
      primaryLine: currentMedia.title || t('music.nothingPlaying'),
      secondaryLine: currentMedia.artist || '',
    };
  }, [currentMedia.lyrics, currentMedia.title, currentMedia.artist, islandSettings.lyricsEnabled, activeLyricIndex]);

  // Dynamic width for the compact music/karaoke notch taking into account cover art + lyric + soundwave + inline download orb
  const dynamicMusicBarWidth = useMemo(() => {
    const text = primaryLine || currentMedia.title || '';
    const charLen = Math.min(38, Math.max(8, text.length));
    // A compact cap keeps the media notch from covering neighboring dock tabs.
    const baseWidth = Math.round(Math.min(322, Math.max(222, charLen * 5.2 + 170)));
    return liveActivity?.active ? baseWidth + 48 : baseWidth;
  }, [primaryLine, currentMedia.title, liveActivity?.active]);

  // Determine which collapsed state to use when mouse leaves
  // IMPORTANT: Only show music-bar when media is actively playing (`currentMedia.isPlaying`).
  // When paused or stopped, return to Robo's glowing eyes (`idle`).
  const resolvedCollapsedMode = useMemo(() => {
    // Fullscreen Game Mode keeps Robo visible even when a browser video has an SMTC session.
    if (gameModeActive) return 'idle';
    const isActivelyPlaying = Boolean(currentMedia.hasSession && currentMedia.isPlaying);
    if (isMiniProgressBar && isActivelyPlaying) {
      return 'mini-progress';
    }
    if (timerRunning) {
      return isActivelyPlaying ? 'focus-bar-media' : 'focus-bar';
    }
    if (isActivelyPlaying) {
      return 'music-bar';
    }
    return 'idle';
  }, [
    isMiniProgressBar,
    gameModeActive,
    timerRunning,
    currentMedia.hasSession,
    currentMedia.isPlaying,
  ]);

  const hasLeftRestingSlot = Boolean(islandSettings.leftOfRobo && islandSettings.leftOfRobo !== 'Nothing');
  const hasRightRestingSlot = Boolean(islandSettings.rightOfRobo && islandSettings.rightOfRobo !== 'Nothing');
  const hasRestingSlots = hasLeftRestingSlot || hasRightRestingSlot;

  const collapsedBaseWidth = useMemo(() => {
    if (resolvedCollapsedMode === 'music-bar') return dynamicMusicBarWidth + 18;
    if (resolvedCollapsedMode === 'mini-progress') return 268;
    if (resolvedCollapsedMode === 'focus-bar') return 126;
    if (resolvedCollapsedMode === 'focus-bar-media') return 120;
    if (liveActivity?.active) return 200;
    if (hasRestingSlots) {
      return 132 + (hasLeftRestingSlot ? 46 : 0) + (hasRightRestingSlot ? 46 : 0);
    }
    return islandSettings.roboEyesVisible === false ? 96 : 146;
  }, [resolvedCollapsedMode, dynamicMusicBarWidth, liveActivity?.active, hasRestingSlots, hasLeftRestingSlot, hasRightRestingSlot, islandSettings.roboEyesVisible]);

  // Sync window shape & 60fps animation with Electron main process whenever islandMode or dynamic widths change
  useEffect(() => {
    if (islandMode === 'music-bar') {
      window.twocode?.setIslandMode('music-bar', dynamicMusicBarWidth);
    } else if (islandMode === 'notif-toast') {
      window.twocode?.setIslandMode('notif-toast', dynamicNotifToastWidth);
    } else if (islandMode === 'hud') {
      window.twocode?.setIslandMode('hud', dynamicHudSize.width);
    } else if (islandMode === 'battery') {
      window.twocode?.setIslandMode('battery', 366);
    } else if (islandMode === 'bedo-live') {
      window.twocode?.setIslandMode('bedo-live');
    } else if (islandMode === 'idle' && (liveActivity?.active || hasRestingSlots)) {
      window.twocode?.setIslandMode('idle-live');
    } else {
      window.twocode?.setIslandMode(islandMode);
    }
  }, [islandMode, dynamicMusicBarWidth, dynamicNotifToastWidth, dynamicHudSize.width, liveActivity?.active, hasRestingSlots]);

  // Keep collapsed notch updated if media starts/pauses/stops while collapsed
  useEffect(() => {
    const curr = islandModeRef.current;
    if (
      curr !== 'expanded' &&
      curr !== 'bedo-live' &&
      curr !== 'battery' &&
      curr !== 'hud' &&
      curr !== 'notif-toast'
    ) {
      setIslandMode(resolvedCollapsedMode);
    }
  }, [resolvedCollapsedMode]);

  // Startup wave sound
  useEffect(() => {
    const t = setTimeout(() => {
      playRoboSound('wave', true);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // Listen for App-Aware Context & Live Activities (Steam / Downloads)
  useEffect(() => {
    const cleanups = [];
    if (window.twocode?.onAppContext) {
      cleanups.push(window.twocode.onAppContext((ctx) => {
        if (!ctx) return;
        setAppContext(ctx);

        const cfg = islandSettingsRef.current;
        if (!cfg?.focusGuardEnabled) {
          focusGuardLastAppRef.current = ctx.app || '';
          return;
        }
        if (cfg.focusGuardOnlyDuringFocus && !timerRunningRef.current) return;

        const rawApp = String(ctx.app || '').trim();
        const lowerApp = rawApp.toLowerCase();
        if (!lowerApp || lowerApp === focusGuardLastAppRef.current.toLowerCase()) return;
        focusGuardLastAppRef.current = rawApp;
        if (lowerApp.includes('twocode') || lowerApp.includes('bedo')) return;

        const selectedApps = Array.isArray(cfg.focusGuardApps) ? cfg.focusGuardApps : [];
        let matchedLabel = '';
        let matchedKey = '';
        for (const site of selectedApps) {
          const sLower = String(site || '').toLowerCase();
          if (!sLower) continue;
          const hit = sLower === 'x'
            ? /(\bx\b|twitter)/i.test(rawApp)
            : lowerApp.includes(sLower);
          if (hit) {
            matchedLabel = site;
            matchedKey = sLower;
            break;
          }
        }
        if (!matchedKey && cfg.focusGuardCustom) {
          const customTerms = String(cfg.focusGuardCustom)
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length >= 2);
          for (const term of customTerms) {
            if (lowerApp.includes(term.toLowerCase())) {
              matchedLabel = term;
              matchedKey = term.toLowerCase();
              break;
            }
          }
        }
        if (!matchedKey) return;

        const until = focusGuardCooldownRef.current[matchedKey] || 0;
        if (Date.now() < until) return;

        const waitSec = Number(cfg.focusGuardWaitSec) || 5;
        suppressHoverCollapseUntilRef.current = Date.now() + (waitSec + 4) * 1000;
        setFocusGuardPrompt({
          appLabel: matchedLabel,
          matchedKey,
          secondsLeft: waitSec,
          totalSec: waitSec,
        });
        setIslandMode('expanded');
      }));
    }
    if (window.twocode?.onLiveActivity) {
      cleanups.push(window.twocode.onLiveActivity((act) => {
        if (!act || !act.active) {
          setLiveActivity((prev) => (prev && act?.kind && prev.kind !== act.kind ? prev : null));
        } else {
          setLiveActivity(act);
        }
      }));
    }
    return () => cleanups.forEach((fn) => fn && fn());
  }, []);

  const resolvedCollapsedModeRef = useRef(resolvedCollapsedMode);
  useEffect(() => {
    resolvedCollapsedModeRef.current = resolvedCollapsedMode;
  }, [resolvedCollapsedMode]);

  const hasShown20AlertRef = useRef(false);

  // Keep the battery banner's lifetime tied to its visible state so every
  // entry path (battery API or the manual preview) dismisses consistently.
  useEffect(() => {
    if (islandMode !== 'battery') return undefined;
    batteryTimerRef.current = setTimeout(() => {
      setIslandMode((current) =>
        current === 'battery' ? resolvedCollapsedModeRef.current : current
      );
    }, 4800);
    return () => {
      clearTimeout(batteryTimerRef.current);
      batteryTimerRef.current = null;
    };
  }, [islandMode]);

  // Read real Windows battery percentage and alert only at exactly 20%.
  useEffect(() => {
    let batteryObj = null;
    let wasCharging = null;

    const triggerBatteryAlert = (pct) => {
      setBatteryPercent(pct);
      setBatteryCharging(false);
      setBatteryAlertKind('low');
      setIslandMode((current) => {
        if (current === 'expanded') return current;
        return 'battery';
      });
      playRoboSound('surprised', islandSettings.soundEffects !== false);
    };

    const triggerChargingAlert = () => {
      setBatteryCharging(true);
      setBatteryAlertKind('charging');
      setIslandMode((current) => (current === 'expanded' ? current : 'battery'));
      playRoboSound('happy', islandSettings.soundEffects !== false);
    };

    const handleBatteryChange = () => {
      if (!batteryObj) return;
      const isStartup = Date.now() - appMountedAtRef.current < 5000;
      const nextPct = Math.round(batteryObj.level * 100);
      setBatteryPercent(nextPct);

      const nextCharging = Boolean(batteryObj.charging);
      if (wasCharging !== null && wasCharging !== nextCharging) {
        suppressMicHudUntilRef.current = Date.now() + 4500;
      }

      if (nextCharging) {
        setBatteryCharging(true);
        if (wasCharging === false && !isStartup) triggerChargingAlert();
        wasCharging = true;
        hasShown20AlertRef.current = false;
        return;
      }
      setBatteryCharging(false);
      wasCharging = false;

      if (nextPct > 20) {
        hasShown20AlertRef.current = false;
        return;
      }

      if (nextPct === 20 && !batteryObj.charging && !hasShown20AlertRef.current && !isStartup) {
        hasShown20AlertRef.current = true;
        triggerBatteryAlert(nextPct);
      }
    };

    if (navigator.getBattery) {
      navigator
        .getBattery()
        .then((bat) => {
          batteryObj = bat;
          wasCharging = Boolean(bat.charging);
          previousBatteryChargingRef.current = wasCharging;
          setBatteryCharging(wasCharging);
          const pct = Math.round(bat.level * 100);
          if (pct > 0 && pct <= 100) {
            setBatteryPercent(pct);
            previousBatteryLowRef.current = pct <= 20 && !wasCharging;
          }
          bat.addEventListener('levelchange', handleBatteryChange);
          bat.addEventListener('chargingchange', handleBatteryChange);
        })
        .catch(() => { });
    }
    return () => {
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', handleBatteryChange);
        batteryObj.removeEventListener('chargingchange', handleBatteryChange);
      }
      if (batteryTimerRef.current) clearTimeout(batteryTimerRef.current);
    };
  }, []);

  // Synchronize clock when expanded only if minute/hour/date changed to avoid redundant re-render
  useEffect(() => {
    if (islandMode === 'expanded') {
      setNow((prev) => {
        const d = new Date();
        if (
          d.getMinutes() === prev.getMinutes() &&
          d.getHours() === prev.getHours() &&
          d.getDate() === prev.getDate()
        ) {
          return prev;
        }
        return d;
      });
    }
  }, [islandMode]);

  // Clock & Focus timer: Ticks every 1s when expanded or timer is actively counting down,
  // but `now` only updates state when the displayed minute changes (60x fewer App re-renders).
  useEffect(() => {
    const isHighFrequencyNeeded = islandMode === 'expanded' || timerRunning;
    const intervalMs = isHighFrequencyNeeded ? 1000 : 30000;
    const timer = setInterval(() => {
      setNow((prev) => {
        const d = new Date();
        if (
          d.getMinutes() === prev.getMinutes() &&
          d.getHours() === prev.getHours() &&
          d.getDate() === prev.getDate()
        ) {
          return prev;
        }
        return d;
      });
      if (timerRunning) {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            playNotifSound(islandSettings.notifSound || 'Ding', islandSettings.soundEffects !== false);
            playRoboSound('happy', islandSettings.soundEffects !== false);
            setRoboMood('happy');
            return focusMinutes * 60;
          }
          return prev - 1;
        });
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [islandMode, timerRunning, focusMinutes, islandSettings.notifSound, islandSettings.soundEffects]);

  // Connect to Electron IPC bridges
  useEffect(() => {
    if (!window.twocode) return;

    const showIslandNotification = (notif) => {
      if (!notif || (!notif.title && !notif.body)) return;
      if (islandSettings.doNotDisturb || islandSettings.windowsNotifications === false) return;
      const isGHelperFeedback = /^(ghelper|g-helper)$/i.test(`${notif.app || ''}`) || /(?:^|[\s_-])g-?helper(?:$|[\s_-])/i.test(`${notif.appId || ''}`);
      if (timerRunningRef.current && !islandSettingsRef.current?.notifDuringFocus && !isGHelperFeedback) return;
      if (!notif.isAgentActivity && !isGHelperFeedback && modeToggles.onlyClaude && !/claude|anthropic/i.test(`${notif.app || ''} ${notif.appId || ''}`)) return;
      const hideNotifText = islandSettingsRef.current?.notifShowText === 'Hide';
      const notifId = notif.id || `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const notification = {
        id: notifId,
        app: notif.app || 'Windows',
        appId: notif.appId || '',
        accentHex: notif.accentHex || '',
        accentRgb: notif.accentRgb || '',
        accentSecondaryHex: notif.accentSecondaryHex || '',
        accentSecondaryRgb: notif.accentSecondaryRgb || '',
        logo: notif.logo || notif.appLogoUri || '',
        profileImage: notif.profileImage || notif.avatar || '',
        sender: notif.sender || '',
        notificationKind: notif.notificationKind || '',
        callKind: notif.callKind || '',
        title: hideNotifText ? (notif.app || 'Yeni bildirim') : (notif.title || notif.app || 'Notification'),
        body: hideNotifText ? '' : (notif.body || ''),
        targetUrl: notif.targetUrl || '',
        isAgentActivity: Boolean(notif.isAgentActivity),
      };

      setToastBanner(notification);
      if (shouldPersistNotification(notification)) {
        setNotificationHistory((items) => [{ ...notification, timestamp: Date.now(), isRead: false }, ...items.filter((item) => item.id !== notifId)].slice(0, 100));
      }
      if (!notification.logo) {
        resolveCachedAppLogo(notification.app, notification.appId, notification.title).then((dataUri) => {
          if (!dataUri) return;
          setToastBanner((curr) => (curr && curr.id === notifId && !curr.logo ? { ...curr, logo: dataUri } : curr));
          setNotificationHistory((items) =>
            items.map((item) => (item.id === notifId && !item.logo ? { ...item, logo: dataUri } : item))
          );
        });
      }
      playNotifSound(islandSettings.notifSound || 'Ding', islandSettings.soundEffects !== false);
      setRoboMood('surprised');
      triggerRoboReaction('notification', 4, 1450);
      setTimeout(() => setRoboMood('normal'), 2600);

      const stayMs = Math.max(3000, (Number(islandSettings.notifDurationSec) || 5) * 1000);
      isShowingNotifToastRef.current = true;
      setIslandMode((curr) => {
        const prevMode =
          curr === 'notif-toast' || curr === 'hud' || curr === 'battery'
            ? (notifPrevModeRef.current || resolvedCollapsedModeRef.current)
            : curr;
        if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
        notifPrevModeRef.current = prevMode;
        notifRemainingMsRef.current = stayMs;
        notifTimerStartedAtRef.current = Date.now();
        notifTimerRef.current = setTimeout(() => {
          isShowingNotifToastRef.current = false;
          notifRemainingMsRef.current = 0;
          notifTimerRef.current = null;
          setIslandMode(prevMode);
        }, stayMs);
        return 'notif-toast';
      });
    };

    const syncSystemMicMuted = () => {
      window.twocode?.getSystemMicMuted?.().then((mutedState) => {
        if (typeof mutedState === 'boolean') setSystemMicMuted(mutedState);
      }).catch(() => {});
    };
    syncSystemMicMuted();
    window.addEventListener('focus', syncSystemMicMuted);

    window.twocode.getSettings?.().then((saved) => {
      if (saved && typeof saved === 'object') {
        setShortcuts(Array.isArray(saved.apps) ? saved.apps : []);
        setIslandSettings((prev) => ({ ...prev, ...saved }));
        if (saved.language) {
          try { localStorage.setItem('twocode_lang', normalizeLanguage(saved.language)); } catch {}
        }
        if (saved.onboardingCompleted === false) {
          setShowIslandWelcome(true);
          suppressHoverCollapseUntilRef.current = Date.now() + 600000;
          setIslandMode('expanded');
        }
      }
    });

    const unsubSettings = window.twocode.onSettingsUpdated?.((updated) => {
      if (updated && typeof updated === 'object') {
        if (Array.isArray(updated.apps)) {
          setShortcuts(updated.apps);
        }
        setIslandSettings((prev) => ({ ...prev, ...updated }));
        if (updated.language) {
          try { localStorage.setItem('twocode_lang', normalizeLanguage(updated.language)); } catch {}
        }
        if (updated.onboardingCompleted === true) {
          setShowIslandWelcome(false);
          suppressHoverCollapseUntilRef.current = 0;
        }
      }
    });

    const unsubEmotion = window.twocode.onIslandEmotion?.((emotion) => {
      if (emotion) {
        setRoboMood(emotion);
        playRoboSound(emotion, islandSettingsRef.current?.soundEffects !== false);
        setTimeout(() => setRoboMood('normal'), 3200);
      }
    });

    const unsubShortcutAction = window.twocode.onIslandShortcutAction?.((payload) => {
      if (!payload || typeof payload !== 'object') return;
      setShowMenu(false);
      setNotificationHistoryOpen(false);
      setIslandOverlay(null);
      if (payload.action === 'bedo') {
        pauseMediaForBedo();
        setSelectedAiProvider('Bedo');
        setActiveTab('robo');
        setIslandMode('expanded');
        window.twocode?.bedoSetPaused?.(false);
      } else if (payload.action === 'tab' && payload.tab) {
        setActiveTab(payload.tab);
        setIslandMode('expanded');
      }
    });

    const unsubBuddy = window.twocode.onBedoBuddyCaptured?.(async (payload) => {
      if (!payload?.imageDataUrl) return;
      setShowMenu(false);
      setNotificationHistoryOpen(false);
      setIslandOverlay(null);
      setSelectedAiProvider('Bedo');
      setActiveTab('robo');
      setIslandMode('expanded');
      setBedoUserTranscript('Ekrandan seçilen bölge');
      setRoboReply(null);
      setRoboLoading(true);
      setRoboMood('thinking');
      try {
        const res = await window.twocode?.askRoboVision?.({ imageDataUrl: payload.imageDataUrl });
        setRoboLoading(false);
        if (res?.ok && res?.text) {
          setRoboMood('happy');
          triggerRoboReaction('success', 3, 1450);
          playRoboSound('happy', islandSettingsRef.current?.soundEffects !== false);
          setRoboReply(res.text);
        } else {
          setRoboMood('sad');
          playRoboSound('sad', islandSettingsRef.current?.soundEffects !== false);
          setRoboReply(res?.error || 'Ekran bölgesi analiz edilemedi.');
        }
      } catch (err) {
        setRoboLoading(false);
        setRoboMood('sad');
        setRoboReply(err?.message || 'Ekran analizi başarısız oldu.');
      }
    });

    window.twocode.getAiHistory?.().then((hist) => {
      if (hist) {
        setCodexHistory(Array.isArray(hist.codexJobs) ? hist.codexJobs : []);
        setClaudeHistory(Array.isArray(hist.claudeJobs) ? hist.claudeJobs : []);
        setGeminiHistory(Array.isArray(hist.geminiJobs) ? hist.geminiJobs : []);
        setAntigravityHistory(Array.isArray(hist.antigravityJobs) ? hist.antigravityJobs : []);
        if (typeof hist.jobsToday === 'number') {
          setJobsToday(hist.jobsToday);
        }
      }
    });

    window.twocode.getAgentIntegrationStatus?.().then((status) => {
      if (status) setAgentIntegration(status);
    });

    const unsubAiHist = window.twocode.onAiHistoryUpdate?.((hist) => {
      if (!hist) return;
      setCodexHistory(Array.isArray(hist.codexJobs) ? hist.codexJobs : []);
      setClaudeHistory(Array.isArray(hist.claudeJobs) ? hist.claudeJobs : []);
      setGeminiHistory(Array.isArray(hist.geminiJobs) ? hist.geminiJobs : []);
      setAntigravityHistory(Array.isArray(hist.antigravityJobs) ? hist.antigravityJobs : []);
      if (typeof hist.jobsToday === 'number') {
        setJobsToday(hist.jobsToday);
      }
    });

    // Mail is paused; keep its Google data wiring here for a later reactivation.
    // window.twocode.getGoogleData?.().then((g) => {
    //   if (g) {
    //     setGoogleData(g);
    //     if (g.mailCounts) setMailCounts({ ...g.mailCounts });
    //   }
    // });
    // const unsubGoogle = window.twocode.onGoogleDataUpdate?.((g) => {
    //   if (!g) return;
    //   setGoogleData(g);
    //   if (g.mailCounts) setMailCounts({ ...g.mailCounts });
    // });

    window.twocode.getAgendaEvents?.().then((events) => {
      if (Array.isArray(events)) setAgendaItems(events);
    });
    const unsubAgenda = window.twocode.onAgendaEventsUpdate?.((events) => {
      if (Array.isArray(events)) setAgendaItems(events);
    });

    window.twocode.getMediaStatus?.().then((m) => {
      if (m) setLiveMedia(m);
    });

    const unsubHover = window.twocode.onNotchHoverChange?.((hovering) => {
      if (gameModeActive) return;
      if (isShowingNotifToastRef.current) return;
      if (islandModeRef.current === 'bedo-live') return;
      const collapseNow = () => {
        setShowMenu(false);
        setNotificationHistoryOpen(false);
        setShowMusicServicePicker(false);
        setIsDraggingRuler(false);
        setIsDraggingVolume(false);
        if (!pendingApproval) {
          setIslandMode(resolvedCollapsedModeRef.current);
        }
      };

      if (hovering) {
        isNotchHoveredRef.current = true;
        if (deferredCollapseTimerRef.current) {
          clearTimeout(deferredCollapseTimerRef.current);
          deferredCollapseTimerRef.current = null;
        }
        if (Date.now() < suppressHoverExpandUntilRef.current) return;
        if (!isMiniProgressBar) {
          setIslandMode('expanded');
        }
      } else {
        isNotchHoveredRef.current = false;
        const remainingSuppressMs = suppressHoverCollapseUntilRef.current - Date.now();
        if (remainingSuppressMs > 0) {
          if (deferredCollapseTimerRef.current) clearTimeout(deferredCollapseTimerRef.current);
          deferredCollapseTimerRef.current = setTimeout(() => {
            deferredCollapseTimerRef.current = null;
            if (!isNotchHoveredRef.current && Date.now() >= suppressHoverCollapseUntilRef.current) {
              collapseNow();
            }
          }, remainingSuppressMs + 30);
          return;
        }
        collapseNow();
      }
    });

    const handleWindowDragOver = (e) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        setIslandMode('expanded');
        setActiveTab('drop');
      }
    };
    const handleWindowDrop = (e) => {
      if (e.dataTransfer?.files?.length) {
        e.preventDefault();
      }
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    const handleGameModeChange = (active) => {
      const nextActive = Boolean(active);
      setGameModeActive(nextActive);
      if (nextActive) {
        setIslandMode('idle');
        setShowMenu(false);
        setNotificationHistoryOpen(false);
        setShowMusicServicePicker(false);
      } else {
        setIslandMode((curr) =>
          curr === 'expanded' || curr === 'notif-toast' || curr === 'hud' || curr === 'battery'
            ? curr
            : resolvedCollapsedModeRef.current
        );
      }
    };
    const unsubGameMode = window.twocode.onGameModeChange?.(handleGameModeChange);
    window.twocode.isGameModeActive?.().then((active) => {
      setGameModeActive(Boolean(active));
      if (active) handleGameModeChange(true);
    }).catch(() => { });

    const unsubMedia = window.twocode.onMediaUpdate((data) => {
      const nextMedia = data || { hasSession: false, isPlaying: false };
      const previousMedia = previousMediaRef.current;
      if (previousMedia) {
        if (nextMedia.isPlaying && !previousMedia.isPlaying) {
          triggerRoboReaction('media-start', 2);
        } else if (!nextMedia.isPlaying && previousMedia.isPlaying) {
          triggerRoboReaction('media-pause', 2);
        } else if (
          nextMedia.isPlaying && previousMedia.isPlaying &&
          nextMedia.title && nextMedia.title !== previousMedia.title
        ) {
          triggerRoboReaction('media-change', 2);
        }
      }
      previousMediaRef.current = nextMedia;
      if (data && data.hasSession) {
        setShowMusicServicePicker(false);
      }
      setLiveMedia(nextMedia);
    });

    const unsubClip = window.twocode.onClipboardUpdate((list) => {
      if (Array.isArray(list)) {
        previousClipboardIdRef.current = list[0]?.id ?? null;
        setClips(list);
      }
    });

    const unsubAgent = window.twocode.onAgentEvent((ev) => {
      const newEntry = {
        id: ev.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        agent: ev.agent || selectedAiProvider,
        title: ev.title || ev.detail || ev.command || 'Agent activity',
        detail: ev.detail || '',
        command: ev.command || '',
        file: ev.file || '',
        timestamp: ev.timestamp || Date.now(),
        time: new Date(ev.timestamp || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        type: ev.type || 'active',
      };
      setActiveHookTask(ev.type === 'thinking' || ev.type === 'working' || ev.type === 'approval' ? newEntry : null);
      setAgentActivity((items) => [newEntry, ...items.filter((item) => item.id !== newEntry.id)].slice(0, 20));

      const agentId = (ev.agent || '').toLowerCase();
      if (ev.type === 'done' && agentId.includes('claude')) setClaudeHistory((prev) => [newEntry, ...prev].slice(0, 15));
      else if (ev.type === 'done' && agentId.includes('antigravity')) setAntigravityHistory((prev) => [newEntry, ...prev].slice(0, 15));
      else if (ev.type === 'done' && agentId.includes('gemini')) setGeminiHistory((prev) => [newEntry, ...prev].slice(0, 15));
      else if (ev.type === 'done') setCodexHistory((prev) => [newEntry, ...prev].slice(0, 15));

      if (ev.type === 'approval') {
        setPendingApproval(ev);
        setRoboMood('curious');
        triggerRoboReaction('agent-approval', 3, 1500);
        setIslandMode('expanded');
        setActiveTab('code');
        playRoboSound('curious', true);
      } else {
        if (ev.type === 'done') setJobsToday((j) => j + 1);
      }
      if (ev.type === 'done') {
        setRoboMood('happy');
        triggerRoboReaction('success', 3, 1450);
      }
    });

    const unsubHud = window.twocode.onSystemHud?.((hud) => {
      if (!hud) return;
      if (hud.isInit || hud.type === 'init-audio') {
        if (typeof hud.value === 'number' && hud.value >= 0) setVolumePercent(hud.value);
        if (typeof hud.muted === 'boolean') setIsMuted(hud.muted);
        return;
      }
      if (hud.type === 'volume') {
        if (typeof hud.value === 'number') setVolumePercent(hud.value);
        if (typeof hud.muted === 'boolean') setIsMuted(hud.muted);
      }
      if (hud.type === 'ghelper') {
        if (hud.ghelper?.category === 'fnlock') {
          return;
        }
        if (hud.ghelper?.category === 'mic') {
          setSystemMicMuted(Boolean(hud.ghelper.isMuted));
          if (Date.now() < suppressMicHudUntilRef.current) {
            return;
          }
        }
        if (hud.ghelper?.category === 'mode' && typeof hud.ghelper.modeIndex === 'number') {
          setGhelperStatus((prev) => ({
            ...prev,
            performanceMode: hud.ghelper.modeIndex,
            performanceName: hud.ghelper.valueText || prev.performanceName,
          }));
        }
        if (Date.now() < suppressGHelperHudUntilRef.current) {
          return;
        }
      }
      const isPhoneUpload = hud.type === 'phone-upload';
      const hudDuration = isPhoneUpload ? (hud.phase === 'receiving' ? 8000 : 3600) : 2100;
      setHudOverlay({
        type: isPhoneUpload
          ? 'phone-upload'
          : hud.type === 'brightness'
            ? 'brightness'
            : hud.type === 'ghelper'
              ? 'ghelper'
              : 'volume',
        value: typeof hud.value === 'number' ? hud.value : 0,
        muted: Boolean(hud.muted),
        ghelper: hud.ghelper || null,
        phase: hud.phase || 'done',
        file: hud.file || null,
        seq: Date.now(),
      });
      setIsSystemHudVisible(true);
      if (hudVisibleTimerRef.current) clearTimeout(hudVisibleTimerRef.current);
      hudVisibleTimerRef.current = setTimeout(() => setIsSystemHudVisible(false), hudDuration);
      setIslandMode((curr) => {
        if (curr === 'expanded') return curr;
        if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
        hudTimerRef.current = setTimeout(() => {
          setIslandMode((c) => (c === 'hud' ? resolvedCollapsedModeRef.current : c));
        }, hudDuration);
        return 'hud';
      });
    });

    const unsubWinNotif = window.twocode.onWindowsNotification?.(showIslandNotification);

    return () => {
      if (deferredCollapseTimerRef.current) clearTimeout(deferredCollapseTimerRef.current);
      if (unsubSettings) unsubSettings();
      if (unsubEmotion) unsubEmotion();
      if (unsubShortcutAction) unsubShortcutAction();
      if (unsubBuddy) unsubBuddy();
      if (unsubAiHist) unsubAiHist();
      if (unsubHover) unsubHover();
      if (unsubGameMode) unsubGameMode();
      if (unsubMedia) unsubMedia();
      if (unsubClip) unsubClip();
      window.removeEventListener('focus', syncSystemMicMuted);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      if (unsubAgent) unsubAgent();
      if (unsubHud) unsubHud();
      if (unsubWinNotif) unsubWinNotif();
      // if (unsubGoogle) unsubGoogle(); // Mail is paused.
      if (unsubAgenda) unsubAgenda();
    };
  }, [
    selectedAiProvider,
    triggerRoboReaction,
    pendingApproval,
    resolvedCollapsedMode,
    gameModeActive,
    isMiniProgressBar,
    islandSettings.notifSound,
    islandSettings.soundEffects,
    islandSettings.doNotDisturb,
    islandSettings.windowsNotifications,
    islandSettings.notifDurationSec,
    selectedModeName,
    modeToggles.onlyClaude,
  ]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (notificationHistoryOpen) setNotificationHistoryOpen(false);
        if (showMenu) {
          setShowMenu(false);
          setQuitConfirming(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const handleOutsidePointer = (event) => {
      if (!notificationHistoryOpen) return;
      if (notificationHistoryPanelRef.current?.contains(event.target)) return;
      if (notificationHistoryTriggerRef.current?.contains(event.target)) return;
      setNotificationHistoryOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [showMenu, notificationHistoryOpen]);

  // Format helpers
  const formatTimeHHMM = (d) => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const formatClockDisplay = (d) => {
    const hour = d.getHours();
    const use24Hour =
      islandSettings.clockFormat === '24-hour · 18:30'
        ? true
        : islandSettings.clockFormat === '12-hour · 6:30 PM'
        ? false
        : clock24Hour;
    const displayHour = use24Hour ? hour : hour % 12 || 12;
    const time = `${String(displayHour).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${clockShowSeconds ? `:${String(d.getSeconds()).padStart(2, '0')}` : ''}`;
    return { time, suffix: use24Hour ? '' : hour < 12 ? 'AM' : 'PM' };
  };

  const renderRestingSlot = (slotKey) => {
    if (!slotKey || slotKey === 'Nothing') return null;
    if (slotKey === 'Time') {
      const { time, suffix } = formatClockDisplay(now);
      return (
        <span className="idle-slot-badge is-time">
          {time}{suffix ? ` ${suffix}` : ''}
        </span>
      );
    }
    if (slotKey === 'Battery') {
      return (
        <span className={`idle-slot-badge is-battery ${batteryPercent <= 20 && !batteryCharging ? 'is-low' : ''} ${batteryCharging ? 'is-charging' : ''}`}>
          {batteryCharging ? '⚡' : ''}{batteryPercent}%
        </span>
      );
    }
    if (slotKey === 'Wi-Fi') {
      return (
        <span className={`idle-slot-badge is-icon ${networkInfo.wifiConnected ? 'is-on' : 'is-off'}`} title={networkInfo.wifi || 'Wi-Fi'}>
          <Wifi size={11} strokeWidth={2.4} />
        </span>
      );
    }
    if (slotKey === 'Bluetooth') {
      return (
        <span className={`idle-slot-badge is-icon ${networkInfo.bluetoothState === 'On' ? 'is-on' : 'is-off'}`} title="Bluetooth">
          <Bluetooth size={11} strokeWidth={2.4} />
        </span>
      );
    }
    return null;
  };

  const renderDateTop = (d, compact = false) => {
    const wd = d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').toUpperCase();
    const mo = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase();
    return (
      <span className={`topbar-date ${compact ? 'is-compact' : ''}`}>
        <span className="topbar-date-weekday">{wd}</span>
        <span className="topbar-date-day clock-number-text">{d.getDate()}</span>
        <span className="topbar-date-month">{mo}</span>
      </span>
    );
  };

  const formatHMS = (totalSec) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatTimerBig = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  const doneAtTimeStr = useMemo(() => {
    const target = new Date(now.getTime() + timerSeconds * 1000);
    return formatTimeHHMM(target);
  }, [now, timerSeconds]);

  const showBatteryPopup = () => {
    setBatteryAlertKind('low');
    setIslandMode('battery');
    playRoboSound('surprised', islandSettings.soundEffects !== false);
  };

  // Right-click on the notch toggles the thin progress bar (`mini-progress`)
  const handleNotchContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    playRoboSound('tap', islandSettings.soundEffects !== false);
    if (islandMode === 'mini-progress' || isMiniProgressBar) {
      setIsMiniProgressBar(false);
      setIslandMode(currentMedia.hasSession && currentMedia.isPlaying ? 'music-bar' : 'idle');
    } else {
      setIsMiniProgressBar(true);
      setShowMenu(false);
      setIslandMode('mini-progress');
    }
  };

  // Media transport controls
  const handlePlayPause = (e) => {
    if (e) e.stopPropagation();
    playRoboSound('tap', islandSettings.soundEffects !== false);
    if (!currentMedia.hasSession) {
      setShowMusicServicePicker((prev) => !prev);
      return;
    }
    window.twocode?.mediaControl('playpause');
  };

  const handleLaunchMusicService = (e, service) => {
    if (e) e.stopPropagation();
    playRoboSound('tap', islandSettings.soundEffects !== false);
    setShowMusicServicePicker(false);
    window.twocode?.launchMusicService?.(service);
  };

  const handleOpenMediaSource = async (e) => {
    if (e) e.stopPropagation();
    if (!currentMedia.hasSession) return;
    playRoboSound('tap', islandSettings.soundEffects !== false);
    const result = await window.twocode?.focusMediaSource?.({
      sourceApp: currentMedia.sourceApp || '',
      title: currentMedia.title || '',
      artist: currentMedia.artist || '',
    });
    if (islandMode === 'expanded' && !result?.alreadyActive) {
      setShowMenu(false);
      setNotificationHistoryOpen(false);
      setIslandMode(resolvedCollapsedMode);
    }
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    if (!currentMedia.hasSession) return;
    suppressHoverCollapseUntilRef.current = Date.now() + 1500;
    playRoboSound('tap', islandSettings.soundEffects !== false);
    window.twocode?.mediaControl('next');
  };

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    if (!currentMedia.hasSession) return;
    suppressHoverCollapseUntilRef.current = Date.now() + 1500;
    playRoboSound('tap', islandSettings.soundEffects !== false);
    window.twocode?.mediaControl('prev');
  };

  const updateRulerMinutes = (clientX) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const mins = Math.max(1, Math.min(60, Math.round(ratio * 60)));
    setFocusMinutes(mins);
    setTimerRunning(false);
    setTimerSeconds(mins * 60);
  };

  const updateVolumeFromMouse = (clientX) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const pct = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    if (pct > volumePercent) {
      window.twocode?.adjustVolume('up');
    } else if (pct < volumePercent) {
      window.twocode?.adjustVolume('down');
    }
    setVolumePercent(pct);
    setIsMuted(pct === 0);
  };

  const handleApprovalDecision = async (approved) => {
    if (!pendingApproval) return;
    const id = pendingApproval.id;
    await window.twocode?.resolveAgentApproval(id, approved);
    if (approved) {
      setJobsToday((j) => j + 1);
      setRoboMood('happy');
      playRoboSound('happy', islandSettings.soundEffects !== false);
    } else {
      setRoboMood('normal');
      playRoboSound('sad', islandSettings.soundEffects !== false);
    }
    setPendingApproval(null);
  };

  const submitRoboPrompt = async (promptText, explicitMode) => {
    if (roboLoading) return;
    let q = (promptText ?? roboQuestion).trim();
    if (!q) {
      if (explicitMode && lastClipboardText) {
        q = lastClipboardText;
      } else {
        return;
      }
    }
    setRoboLoading(true);
    setRoboMood('curious');
    triggerRoboReaction('thinking', 3, 1800);
    playRoboSound('curious', islandSettings.soundEffects !== false);
    const timeStr = formatTimeHHMM(new Date());
    const entryId = 'job_' + Date.now();
    const entry = {
      id: entryId,
      agent: selectedAiProvider,
      title: q.length > 55 ? q.slice(0, 52) + '...' : q,
      detail: q,
      time: timeStr,
      timestamp: Date.now(),
      type: 'thinking',
      status: 'working',
    };
    setAgentActivity((items) => [entry, ...items.filter((item) => item.id !== entryId)].slice(0, 20));
    if (selectedAiProvider === 'Claude') {
      setClaudeHistory((prev) => [entry, ...prev]);
    } else if (selectedAiProvider === 'Antigravity') {
      setAntigravityHistory((prev) => [entry, ...prev]);
    } else {
      setCodexHistory((prev) => [entry, ...prev]);
    }
    if (selectedAiProvider === 'Bedo') {
      setBedoUserTranscript(q);
      setRoboReply(null);
      setRoboLoading(true);
      if (bedoStatus.paused) {
        await window.twocode?.bedoSetPaused?.(false);
      }
      const res = await window.twocode?.bedoSendText?.(q);
      setRoboQuestion('');
      if (!res?.ok) {
        setRoboLoading(false);
        setRoboMood('sad');
        setRoboReply('Bedo şu anda hazır değil. Lütfen birkaç saniye sonra tekrar deneyin.');
        setRoboReplyProvider('Bedo');
      }
      return;
    }
    try {
      const res = await window.twocode?.askRobo?.({
        question: q,
        provider: selectedAiProvider,
        mode: explicitMode,
      });
      if (!res) throw new Error('AI servisine ulaşılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.');
      if (res.error) throw new Error(res.error);
      setRoboLoading(false);
      setRoboMood('happy');
      triggerRoboReaction('success', 3, 1450);
      playRoboSound('happy', islandSettings.soundEffects !== false);
      setJobsToday((j) => j + 1);
      setRoboReply(res?.text || 'Cevap hazırlandı.');
      setRoboReplyProvider(res?.provider || selectedAiProvider);
      setAgentActivity((items) =>
        items.map((item) =>
          item.id === entryId
            ? { ...item, type: 'done', status: 'done', detail: res?.text || item.detail }
            : item
        )
      );
      setRoboQuestion('');
    } catch (err) {
      setRoboLoading(false);
      setRoboMood('sad');
      triggerRoboReaction('error', 3, 1450);
      playRoboSound('sad', islandSettings.soundEffects !== false);
      setRoboReply(err?.message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
      setRoboReplyProvider(selectedAiProvider);
      setAgentActivity((items) =>
        items.map((item) =>
          item.id === entryId
            ? { ...item, type: 'error', status: 'error', detail: err?.message || item.detail }
            : item
        )
      );
    }
  };

  const handleSelectMode = (name) => {
    setSelectedModeName(name);
    playRoboSound('tap', islandSettings.soundEffects !== false);
    const preset = MODE_PRESETS[name] || MODE_PRESETS.Work;
    setModeToggles({
      blockSocial: preset.blockSocial,
      onlyClaude: preset.onlyClaude,
      keepMusic: preset.keepMusic,
    });
    if (name === 'Serbest') {
      const notificationSettings = { doNotDisturb: false, windowsNotifications: true };
      setIslandSettings((current) => ({ ...current, ...notificationSettings }));
      window.twocode?.saveSettings?.(notificationSettings);
    }
  };

  const handleVolumeClick = () => {
    setIsMuted((m) => !m);
    window.twocode?.adjustVolume('mute');
  };

  const handleVolumeWheel = (e) => {
    if (e.deltaY < 0) {
      setVolumePercent((v) => Math.min(100, v + 4));
      window.twocode?.adjustVolume('up');
    } else {
      setVolumePercent((v) => Math.max(0, v - 4));
      window.twocode?.adjustVolume('down');
    }
  };

  const handleAddShortcut = () => {
    window.twocode?.openSettingsWindow?.('apps');
  };

  // Agents, Mail and Clips are temporarily disabled; keep their entries for later.
  const navItems = [
    { id: 'home', label: t('dock.home'), icon: Home },
    { id: 'music', label: t('dock.music'), icon: Music },
    { id: 'drop', label: t('dock.drop'), icon: UploadCloud },
    // { id: 'code', label: t('dock.agents'), icon: Terminal, badge: pendingApproval ? '!' : null },
    { id: 'robo', label: 'Bedo', icon: RoboDockIcon },
    { id: 'timer', label: t('dock.focus'), icon: Timer },
    { id: 'sleep', label: t('dock.modes'), icon: Moon },
    // { id: 'clips', label: t('dock.clips'), icon: Copy },
    { id: 'notes', label: t('dock.notes'), icon: FileText },
    { id: 'cal', label: t('dock.agenda'), icon: Calendar },
    { id: 'perf', label: t('dock.perf'), icon: Activity },
    // { id: 'inbox', label: t('dock.mail'), icon: Mail },
  ];

  useEffect(() => {
    if (activeTab !== 'code') return;
    window.twocode?.getAgentIntegrationStatus?.().then((status) => {
      if (status) setAgentIntegration(status);
    });
  }, [activeTab]);

  const activeRecentJobs = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const pushUnique = (item) => {
      if (!item || !item.title) return;
      const key = `${(item.agent || '').toLowerCase()}::${String(item.title).trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        ...item,
        type: item.type || (item.status === 'working' ? 'thinking' : item.status === 'error' ? 'error' : 'done'),
      });
    };
    agentActivity.forEach(pushUnique);
    const historyItems = [
      ...antigravityHistory,
      ...codexHistory,
      ...claudeHistory,
      ...geminiHistory,
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || String(b.time || '').localeCompare(String(a.time || '')));
    historyItems.forEach(pushUnique);
    return merged;
  }, [agentActivity, antigravityHistory, codexHistory, claudeHistory, geminiHistory]);

  const selectedAgentJob = useMemo(
    () => activeRecentJobs.find((job) => job.id === selectedAgentJobId) || null,
    [activeRecentJobs, selectedAgentJobId]
  );

  const activeThinkingCount = useMemo(
    () => activeRecentJobs.filter((job) => job.type === 'thinking').length,
    [activeRecentJobs]
  );

  useEffect(() => {
    if (activeTab !== 'code' || activeThinkingCount === 0) return undefined;
    setAgentNowTick(Date.now());
    const id = setInterval(() => setAgentNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTab, activeThinkingCount]);

  const filteredAgentJobs = useMemo(() => {
    if (agentFilter === 'all') return activeRecentJobs;
    return activeRecentJobs.filter((job) => (job.agent || '').toLowerCase().includes(agentFilter));
  }, [activeRecentJobs, agentFilter]);

  const agentBreakdown = useMemo(() => {
    const buckets = [
      { key: 'antigravity', label: 'Antigravity', color: '#49daca', count: 0 },
      { key: 'codex', label: 'Codex', color: '#6198ff', count: 0 },
      { key: 'claude', label: 'Claude', color: '#ff9f68', count: 0 },
      { key: 'gemini', label: 'Gemini', color: '#a88bff', count: 0 },
    ];
    for (const job of activeRecentJobs) {
      const name = (job.agent || '').toLowerCase();
      const match = buckets.find((b) => name.includes(b.key));
      if (match) match.count += 1;
    }
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    return { total, items: buckets.filter((b) => b.count > 0) };
  }, [activeRecentJobs]);

  // Robo's eyes & props reflect the most relevant live device/app state (never random).
  const topEyeMood = timerRunning || activeTab === 'timer'
    ? 'focus-arc'
    : currentMedia.hasSession && currentMedia.isPlaying
      ? 'music'
      : islandSettings.doNotDisturb
        ? 'dnd-sleep'
        : activeHookTask
          ? 'thinking'
          : bedoStatus.paused
            ? 'sleepy'
            : roboMood;

  const currentLayoutId = HOME_LAYOUTS[homeLayoutIndex]?.id || 'clock';
  const clockDisplay = formatClockDisplay(now);
  const activeModeOption = MODE_OPTIONS.find((mode) => mode.id === selectedModeName) || MODE_OPTIONS[0];
  const ActiveModeIcon = activeModeOption.icon;
  const allNotificationsEnabled = islandSettings.windowsNotifications !== false && !islandSettings.doNotDisturb;
  const activeModeSummary = selectedModeName === 'Serbest'
    ? modeToggles.onlyClaude ? t('modes.summaryOnlyClaude') : allNotificationsEnabled ? t('modes.summaryAllOpen') : t('modes.summaryAllOff')
    : [modeToggles.onlyClaude ? t('modes.summaryClaudePriority') : '', modeToggles.blockSocial ? t('modes.summarySocialBlocked') : ''].filter(Boolean).join(' · ') || t('modes.summaryFree');
  const unreadNotificationCount = notificationHistory.filter((item) => !item.isRead).length;
  const pendingAgendaCount = agendaItems.filter((item) => !item?.completed).length;
  const currentMailFolder = MAIL_FOLDERS.find((folder) => folder.id === mailCategory) || MAIL_FOLDERS[0];
  const CurrentMailFolderIcon = currentMailFolder.icon;
  const mailIsConnected = Boolean(googleData?.connected || islandSettings.googleConnected);
  const latestMailItems = Array.isArray(googleData?.latestMails) ? googleData.latestMails : [];
  const visibleMailItems = latestMailItems.filter((item) => {
    const category = String(item.category || item.label || '').toLowerCase();
    const categoryMatches = mailCategory === 'primary'
      ? !category || /primary|inbox|birincil|öncelikli/.test(category)
      : mailCategory === 'updates'
        ? /updates|güncellemeler/.test(category)
        : /promotions|tanıtımlar|promosyon/.test(category);
    return categoryMatches;
  });
  const openNotificationHistory = () => {
    setShowMenu(false);
    if (unreadNotificationCount > 0) {
      triggerRoboReaction('notif-read', 3, 950);
    }
    setNotificationHistory((items) => items.map((item) => ({ ...item, isRead: true })));
    setNotificationHistoryOpen((open) => !open);
  };
  const handleAddAgendaEvent = (event) => {
    if (!event?.title || !event?.time) return;
    window.twocode?.addAgendaEvent?.(event);
  };
  const handleDeleteAgendaEvent = (eventId) => {
    setAgendaItems((items) => items.filter((event) => String(event.id) !== String(eventId)));
    window.twocode?.deleteAgendaEvent?.(eventId);
  };
  const handleToggleAgendaEvent = (eventId) => {
    setAgendaItems((items) =>
      items.map((event) =>
        String(event.id) === String(eventId) ? { ...event, completed: !event.completed } : event
      )
    );
    window.twocode?.toggleAgendaEvent?.(eventId);
  };

  return (
    <LanguageProvider language={islandSettings.language}>
    <div
      className="notch-stage"
      style={{ '--clock-number-font': CLOCK_FONT_FAMILIES[clockFontIndex] || CLOCK_FONT_FAMILIES[3] }}
      onContextMenu={handleNotchContextMenu}
      onMouseMove={(e) => {
        if (isDraggingRuler && activeTab === 'timer') {
          updateRulerMinutes(e.clientX);
        }
        if (isDraggingVolume && showMenu) {
          updateVolumeFromMouse(e.clientX);
        }
      }}
      onMouseUp={() => {
        setIsDraggingRuler(false);
        setIsDraggingVolume(false);
      }}
    >
      <div
        ref={morphShellRef}
        className={`notch-morph-shell state-${islandMode} mode-${activeTab} ${liveActivity?.active ? 'has-live-activity' : ''} ${hasRestingSlots ? 'has-resting-slots' : ''} ${islandSettings.islandStyle === 'Floating' ? 'style-floating' : 'style-attached'} ${islandSettings.islandSize === 'Compact' ? 'size-compact' : islandSettings.islandSize === 'Large' ? 'size-large' : 'size-normal'} ${Number(islandSettings.islandSeeThrough || 0) > 0 ? 'is-see-through' : ''} ${batteryAlertKind === 'charging' ? 'is-charging' : ''} ${activeTab === 'home' && isCustomizingClock ? 'customizing-clock' : ''
          } ${activeTab === 'robo' && !bedoStatus.paused && (roboLoading || bedoStatus.jarvisState === 'THINKING') ? 'is-bedo-thinking' : ''
          } ${musicAccent.hasColor ? 'has-cover-color' : ''} ${islandMode === 'hud' && hudOverlay.ghelper?.category === 'aura'
            ? `has-aura-hud effect-${hudOverlay.ghelper.effectType || 'static'}`
            : ''
          }`}
        style={{
          '--island-scale': islandSettings.islandSize === 'Compact' ? 0.92 : islandSettings.islandSize === 'Large' ? 1.06 : 1,
          '--island-bg-opacity': Math.max(0.32, 1 - (Math.min(60, Math.max(0, Number(islandSettings.islandSeeThrough || 0))) / 100) * 0.95).toFixed(2),
          '--music-accent-rgb': musicAccent.rgb,
          '--music-accent-hex': musicAccent.hex,
          '--notif-accent-rgb': notifBrand.rgb,
          '--notif-accent-hex': notifBrand.hex,
          '--notif-accent-secondary-rgb': notifBrand.secondaryRgb || notifBrand.rgb,
          '--notif-accent-secondary-hex': notifBrand.secondaryHex || notifBrand.hex,
          '--robo-eye-color': islandSettings.eyeColorHex || '#ffffff',
          '--robo-body-hex': ({
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
          }[islandSettings.bodyColor || 'Cloud'] || '#f4f4f5'),
          '--robo-body-rgb': ({
            Cloud: '255, 255, 255',
            Mint: '110, 231, 183',
            Sky: '125, 211, 252',
            Rose: '249, 168, 212',
            Classic: '148, 163, 184',
            Night: '82, 82, 91',
            Blue: '59, 130, 246',
            Purple: '139, 92, 246',
            Pink: '236, 72, 153',
            Gold: '245, 158, 11',
          }[islandSettings.bodyColor || 'Cloud'] || '255, 255, 255'),
          '--dynamic-music-w': `${dynamicMusicBarWidth}px`,
          '--dynamic-notif-w': `${dynamicNotifToastWidth}px`,
          '--dynamic-notif-h': `${dynamicNotifToastHeight}px`,
          '--dynamic-hud-w': `${dynamicHudSize.width}px`,
          '--dynamic-hud-h': `${dynamicHudSize.height}px`,
          '--collapsed-base-w': `${collapsedBaseWidth}px`,
          ...(hudOverlay.ghelper?.color ? {
            '--ghelper-aura-color': hudOverlay.ghelper.color,
            '--ghelper-aura-color2': hudOverlay.ghelper.color2 || hudOverlay.ghelper.color,
            '--ghelper-aura-gradient': hudOverlay.ghelper.gradient || `linear-gradient(135deg, ${hudOverlay.ghelper.color}, ${hudOverlay.ghelper.color2 || hudOverlay.ghelper.color})`,
          } : {}),
          ...(hudOverlay.ghelper?.category === 'mode' ? {
            '--hud-mode-color': (GHELPER_PERF_MODES[typeof hudOverlay.ghelper.modeIndex === 'number' ? hudOverlay.ghelper.modeIndex : ghelperStatus.performanceMode] || GHELPER_PERF_MODES[0]).color,
          } : {}),
          ...(hudOverlay.ghelper?.category === 'gpu' ? {
            '--hud-mode-color': (GHELPER_GPU_MODES[typeof hudOverlay.ghelper.gpuIndex === 'number' ? hudOverlay.ghelper.gpuIndex : ghelperStatus.gpuMode] || GHELPER_GPU_MODES[0]).color,
          } : {}),
        }}
        onMouseEnter={() => {
          window.twocode?.setIgnoreMouseEvents?.(false);
          if (gameModeActive || isShowingNotifToastRef.current) return;
          if (islandMode === 'bedo-live') return;
          if (islandSettings.islandOpenMode === 'On click') return;
          if (Date.now() < suppressHoverExpandUntilRef.current) return;
          if (hoverExpandTimerRef.current) {
            clearTimeout(hoverExpandTimerRef.current);
            hoverExpandTimerRef.current = null;
          }
          if (islandMode !== 'expanded' && !isMiniProgressBar) {
            setIslandMode('expanded');
          }
        }}
        onMouseLeave={(e) => {
          if (window.twocode?.onNotchHoverChange) return;
          if (Date.now() < suppressHoverCollapseUntilRef.current) return;
          if (e.clientX === 0 && e.clientY === 0) return;
          const rect = morphShellRef.current?.getBoundingClientRect();
          if (
            rect &&
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          ) {
            return;
          }
          if (hoverExpandTimerRef.current) {
            clearTimeout(hoverExpandTimerRef.current);
            hoverExpandTimerRef.current = null;
          }
          if (gameModeActive) return;
          if (islandMode === 'expanded') {
            setShowMenu(false);
            setNotificationHistoryOpen(false);
            setIslandMode(resolvedCollapsedMode);
          }
        }}
        onClick={() => {
          if (hoverExpandTimerRef.current) {
            clearTimeout(hoverExpandTimerRef.current);
            hoverExpandTimerRef.current = null;
          }
          if (isMiniProgressBar) {
            setIsMiniProgressBar(false);
            setIslandMode('expanded');
          } else if (islandMode !== 'expanded') {
            if (islandMode === 'hud' && hudOverlay.type === 'phone-upload') {
              setActiveTab('drop');
            }
            setIslandMode('expanded');
          }
        }}
        onDragEnter={(e) => {
          if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault();
            if (hoverExpandTimerRef.current) {
              clearTimeout(hoverExpandTimerRef.current);
              hoverExpandTimerRef.current = null;
            }
            if (islandMode !== 'expanded') setIslandMode('expanded');
            if (activeTab !== 'drop') setActiveTab('drop');
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault();
            if (islandMode !== 'expanded') setIslandMode('expanded');
            if (activeTab !== 'drop') setActiveTab('drop');
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer?.files?.length) {
            e.preventDefault();
            const paths = window.twocode?.getDroppedFilePaths?.(e.dataTransfer.files) || [];
            if (paths.length) {
              window.twocode?.addDropFiles?.(paths);
            }
            setIslandMode('expanded');
            setActiveTab('drop');
          }
        }}
      >
        {/* ============================================================
            COLLAPSED LAYER 1: IDLE MINI-NOTCH (Robo's glowing eyes + Live Activity / Mic)
            ============================================================ */}
        <div className={`morph-layer layer-idle ${islandMode === 'idle' ? 'is-visible' : ''}`}>
          {liveActivity?.active ? (
            <IdleLiveActivityPill liveActivity={liveActivity} />
          ) : (
            <div className={`idle-resting-row ${hasRestingSlots ? 'has-slots' : ''}`}>
              {renderRestingSlot(islandSettings.leftOfRobo)}
              {islandSettings.roboEyesVisible !== false ? (
                <div className="idle-eyes-center">
                  <RoboEyes
                    mood={topEyeMood}
                    reaction={roboReaction}
                    active={documentVisible && islandMode === 'idle'}
                    trackCursor={false}
                    blinkingEnabled={islandSettings.blinkingEnabled !== false}
                    outfit={islandSettings.outfit || 'Best'}
                    seasonalOutfits={Boolean(islandSettings.seasonalOutfits)}
                    size="normal"
                    onPoke={() => {
                      pauseMediaForBedo();
                      suppressHoverCollapseUntilRef.current = Date.now() + 6000;
                      setIslandMode('bedo-live');
                      setSelectedAiProvider('Bedo');
                      if (bedoStatus.paused) {
                        window.twocode?.bedoSetPaused?.(false);
                      }
                    }}
                    batteryPercent={batteryPercent}
                    batteryCharging={batteryCharging}
                    unreadNotificationCount={unreadNotificationCount}
                    pendingAgendaCount={pendingAgendaCount}
                  />
                </div>
              ) : !hasRestingSlots ? (
                <span className="idle-minimal-bar" />
              ) : null}
              {renderRestingSlot(islandSettings.rightOfRobo)}
            </div>
          )}
        </div>

        {/* ============================================================
            COLLAPSED LAYER 1B: THIN PROGRESS BAR NOTCH (Right-click mode)
            Matches screenshot media_1794017471677_b790137d.png
            ============================================================ */}
        <div
          className={`morph-layer layer-mini-progress ${islandMode === 'mini-progress' ? 'is-visible' : ''
            }`}
          title={t('island.miniProgressTitle')}
        >
          <MiniProgressBar liveMedia={liveMedia} active={islandMode === 'mini-progress'} />
        </div>

        {/* ============================================================
            COLLAPSED LAYER 2: BATTERY ALERT NOTCH (Charging & Low Battery)
            ============================================================ */}
        <div
          className={`morph-layer layer-battery ${islandMode === 'battery' ? 'is-visible' : ''} ${batteryAlertKind === 'charging' ? 'is-charging' : 'is-low'}`}
          onClick={() => setIslandMode(resolvedCollapsedModeRef.current)}
        >
          {islandMode === 'battery' && (
            <>
              <div className="battery-alert-left">
                <div className="battery-icon-badge">
                  {batteryAlertKind === 'charging' ? (
                    <div className="battery-charging-graphic">
                      <svg className="battery-capsule-svg" width="32" height="18" viewBox="0 0 32 18" fill="none">
                        <rect x="1" y="1" width="26" height="16" rx="4.5" stroke="#30D158" strokeWidth="2" />
                        <rect x="3.5" y="3.5" width={Math.max(3.5, (21 * Math.min(100, Math.max(0, batteryPercent))) / 100)} height="11" rx="2.5" fill="#30D158" className="battery-fill-rect" />
                        <path d="M29 6.5V11.5" stroke="#30D158" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </div>
                  ) : (
                    <div className="battery-low-graphic">
                      <svg className="battery-capsule-svg" width="32" height="18" viewBox="0 0 32 18" fill="none">
                        <rect x="1" y="1" width="26" height="16" rx="4.5" stroke="#FF453A" strokeWidth="2" />
                        <rect x="3.5" y="3.5" width={Math.max(3.5, (21 * Math.min(25, Math.max(0, batteryPercent))) / 100)} height="11" rx="2.5" fill="#FF453A" className="battery-low-fill-rect" />
                        <path d="M29 6.5V11.5" stroke="#FF453A" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                      <div className="battery-warning-mark">!</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="battery-alert-center">
                <div className="battery-alert-headline">
                  <strong>
                    {batteryAlertKind === 'charging' ? t('battery.charging') : t('battery.low')}
                  </strong>
                  <span className="battery-alert-pct-pill">
                    {langCode === 'tr' ? `%${batteryPercent}` : `${batteryPercent}%`}
                  </span>
                </div>
                <span className="battery-alert-sub">
                  {batteryAlertKind === 'charging' ? t('battery.powerConnected') : t('battery.plugCharger')}
                </span>
              </div>

              <div className="battery-alert-right">
                <div className="battery-mini-bar-wrap">
                  <div className="battery-mini-bar-track">
                    <div
                      className="battery-mini-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(5, batteryPercent))}%` }}
                    >
                      {batteryAlertKind === 'charging' && <div className="battery-bar-shimmer" />}
                    </div>
                  </div>
                  <span className="battery-mini-bar-label">
                    {batteryAlertKind === 'charging' ? t('battery.chargingPill') : t('battery.criticalPill')}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============================================================
            COLLAPSED LAYER 2B: SYSTEM VOLUME / BRIGHTNESS HUD NOTCH
            ============================================================ */}
        <div className={`morph-layer layer-hud ${hudOverlay.type === 'ghelper' ? 'is-ghelper' : ''} ${hudOverlay.type === 'phone-upload' ? `is-phone-upload phase-${hudOverlay.phase || 'done'}` : ''} ${hudOverlay.ghelper?.category === 'aura' ? `is-aura effect-${hudOverlay.ghelper.effectType || 'static'}` : ''} ${islandMode === 'hud' || (islandMode === 'expanded' && isSystemHudVisible) ? 'is-visible' : ''}`}>
          {hudOverlay.type === 'phone-upload' && hudOverlay.file ? (
            (() => {
              const f = hudOverlay.file;
              const isReceiving = hudOverlay.phase === 'receiving';
              const ext = String(f.ext || '').toLowerCase();
              const isDoc = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.xlsx', '.csv', '.pptx'].includes(ext);
              const sizeNum = Number(f.size) || 0;
              const sizeLabel = sizeNum <= 0
                ? ''
                : sizeNum < 1024
                  ? `${sizeNum} B`
                  : sizeNum < 1024 * 1024
                    ? `${(sizeNum / 1024).toFixed(0)} KB`
                    : `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
              const titleText = isReceiving
                ? t('hud.transferring')
                : f.isImage
                  ? t('hud.imageReceived')
                  : isDoc
                    ? t('hud.docReceived')
                    : t('hud.fileReceived');

              return (
                <div key={`${hudOverlay.seq || 0}-${hudOverlay.phase || 'done'}`} className={`hud-phone-upload-wrap ${isReceiving ? 'is-receiving' : 'is-done'}`}>
                  <div className="hud-phone-shimmer" aria-hidden="true" />
                  <div className="hud-phone-icon-orb">
                    <span className="hud-phone-orb-ring" aria-hidden="true" />
                    <span className="hud-phone-orb-core">
                      {f.isImage ? (
                        <ImageIcon size={14} strokeWidth={2.2} />
                      ) : isDoc ? (
                        <FileText size={14} strokeWidth={2.2} />
                      ) : (
                        <FileIcon size={14} strokeWidth={2.2} />
                      )}
                    </span>
                  </div>
                  <div className="hud-phone-label-row">
                    <span className="hud-phone-title">{titleText}</span>
                    {!isReceiving && sizeLabel && (
                      <span className="hud-phone-size">{sizeLabel}</span>
                    )}
                  </div>
                  <div className="hud-phone-badge" aria-hidden="true">
                    {isReceiving ? (
                      <div className="hud-phone-wave">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      <svg className="hud-phone-check-svg" viewBox="0 0 24 24" fill="none">
                        <path
                          className="hud-phone-check-path"
                          d="M5.5 12.5L10 17L18.5 7.5"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })()
          ) : hudOverlay.type === 'ghelper' && hudOverlay.ghelper ? (
            hudOverlay.ghelper.category === 'aura' ? (
              <div className={`hud-aura-clean effect-${hudOverlay.ghelper.effectType || 'static'}`}>
                {/* 1. Frameless Mode-Reactive Keyboard Icon */}
                <div
                  className="hud-aura-icon-box"
                  style={{
                    '--glow-color': hudOverlay.ghelper.color || '#00e5ff',
                    '--glow-color2': hudOverlay.ghelper.color2 || hudOverlay.ghelper.color || '#ff007f',
                  }}
                >
                  <Keyboard size={18} strokeWidth={2.2} className="hud-aura-icon" />
                </div>

                {/* 2. Clean Glassmorphism Typography */}
                <div className="hud-aura-text-row">
                  <span className="hud-aura-label">AURA</span>
                  <span className="hud-aura-val">{hudOverlay.ghelper.valueText || t('hud.kb.staticFallback')}</span>
                </div>

                {/* 3. Frosted Glass Spectrum Pill */}
                <div
                  className={`hud-aura-pill effect-${hudOverlay.ghelper.effectType || 'static'}`}
                  style={{
                    '--pill-color': hudOverlay.ghelper.color || '#00e5ff',
                    '--pill-color2': hudOverlay.ghelper.color2 || hudOverlay.ghelper.color || '#ff007f',
                    '--pill-gradient': hudOverlay.ghelper.gradient || `linear-gradient(90deg, ${hudOverlay.ghelper.color || '#00e5ff'}, ${hudOverlay.ghelper.color2 || hudOverlay.ghelper.color || '#ff007f'})`,
                  }}
                >
                  <div className="hud-aura-pill-flow" />
                  <div className="hud-aura-pill-sheen" />
                </div>
              </div>
            ) : (
              <div
                className={`hud-ghelper-wrap cat-${hudOverlay.ghelper.category} ${hudOverlay.ghelper.category === 'mode'
                  ? `perf-mode-${typeof hudOverlay.ghelper.modeIndex === 'number' ? hudOverlay.ghelper.modeIndex : ghelperStatus.performanceMode}`
                  : hudOverlay.ghelper.category === 'gpu'
                    ? `gpu-mode-${typeof hudOverlay.ghelper.gpuIndex === 'number' ? hudOverlay.ghelper.gpuIndex : ghelperStatus.gpuMode}`
                    : ''
                  } ${hudOverlay.ghelper.category === 'backlight' && hudOverlay.ghelper.level === 0 ? 'is-off' : ''}`}
                style={{
                  ...(hudOverlay.ghelper.category === 'mode' ? {
                    '--mode-perf-color': (GHELPER_PERF_MODES[typeof hudOverlay.ghelper.modeIndex === 'number' ? hudOverlay.ghelper.modeIndex : ghelperStatus.performanceMode] || GHELPER_PERF_MODES[0]).color,
                  } : {}),
                  ...(hudOverlay.ghelper.category === 'gpu' ? {
                    '--mode-gpu-color': (GHELPER_GPU_MODES[typeof hudOverlay.ghelper.gpuIndex === 'number' ? hudOverlay.ghelper.gpuIndex : ghelperStatus.gpuMode] || GHELPER_GPU_MODES[0]).color,
                  } : {}),
                }}
              >
                <div
                  className={`hud-notch-icon is-ghelper-icon ${hudOverlay.ghelper.category === 'mic' && hudOverlay.ghelper.isMuted ? 'is-mic-muted' : ''}`}
                >
                  {hudOverlay.ghelper.icon === 'backlight' ? (
                    <Sunrise size={18} strokeWidth={2.4} />
                  ) : hudOverlay.ghelper.icon === 'mic-mute' ? (
                    <MicOff size={18} strokeWidth={2.4} />
                  ) : hudOverlay.ghelper.icon === 'mic' ? (
                    <Mic size={18} strokeWidth={2.4} />
                  ) : hudOverlay.ghelper.category === 'mode' || hudOverlay.ghelper.icon === 'mode' ? (
                    (() => {
                      const mIdx = typeof hudOverlay.ghelper.modeIndex === 'number' ? hudOverlay.ghelper.modeIndex : ghelperStatus.performanceMode;
                      const ModeIcon = (GHELPER_PERF_MODES[mIdx] || GHELPER_PERF_MODES[0]).icon;
                      return <ModeIcon size={18} strokeWidth={2.4} />;
                    })()
                  ) : hudOverlay.ghelper.category === 'gpu' || hudOverlay.ghelper.icon === 'gpu' ? (
                    (() => {
                      const gIdx = typeof hudOverlay.ghelper.gpuIndex === 'number' ? hudOverlay.ghelper.gpuIndex : ghelperStatus.gpuMode;
                      const GpuIcon = (GHELPER_GPU_MODES[gIdx] || GHELPER_GPU_MODES[0]).icon;
                      return <GpuIcon size={18} strokeWidth={2.4} />;
                    })()
                  ) : hudOverlay.ghelper.icon === 'touchpad' ? (
                    <TouchpadIcon size={18} strokeWidth={2.4} />
                  ) : hudOverlay.ghelper.icon === 'lock' ? (
                    <Lock size={18} strokeWidth={2.4} />
                  ) : (
                    <Palette size={18} strokeWidth={2.4} />
                  )}
                </div>
                <div className="hud-ghelper-info">
                  <span className="hud-ghelper-label">{hudOverlay.ghelper.label}</span>
                  <div className="hud-ghelper-val-row">
                    {/* Backlight Level Dots */}
                    {hudOverlay.ghelper.category === 'backlight' && typeof hudOverlay.ghelper.level === 'number' && (
                      <div className="hud-level-dots">
                        {[1, 2, 3].map((step) => (
                          <span
                            key={step}
                            className={`hud-level-dot ${hudOverlay.ghelper.level >= step ? 'is-active' : ''}`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Mic Pulsing State Dot */}
                    {hudOverlay.ghelper.category === 'mic' && (
                      <span className={`hud-mic-state-dot ${hudOverlay.ghelper.isMuted ? 'is-muted' : 'is-live'}`} />
                    )}

                    <span className={`hud-ghelper-val cat-${hudOverlay.ghelper.category}`}>
                      {hudOverlay.ghelper.valueText}
                    </span>
                  </div>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="hud-notch-icon">
                {hudOverlay.type === 'brightness' ? (
                  <Sun size={17} strokeWidth={2.2} />
                ) : hudOverlay.muted || hudOverlay.value === 0 ? (
                  <VolumeX size={17} strokeWidth={2.2} />
                ) : (
                  <Volume2 size={17} strokeWidth={2.2} />
                )}
              </div>
              <span className="hud-notch-label">{hudOverlay.type === 'brightness' ? t('hud.brightness') : t('hud.volume')}</span>
              <div className="hud-notch-track">
                <div
                  className={`hud-notch-fill ${hudOverlay.type === 'brightness' ? 'is-brightness' : ''}`}
                  style={{
                    width: `${hudOverlay.muted ? 0 : Math.min(100, Math.max(0, hudOverlay.value))}%`,
                  }}
                />
              </div>
              <span className="hud-notch-val">
                {hudOverlay.muted ? 'Sessiz' : `${Math.round(hudOverlay.value)}%`}
              </span>
            </>
          )}
        </div>

        {/* ============================================================
            COLLAPSED LAYER 2C: WINDOWS SYSTEM NOTIFICATION BANNER NOTCH
            Sleek, modern, uncluttered Dynamic Island notification
            ============================================================ */}
        <div className={`morph-layer layer-bedo-live ${islandMode === 'bedo-live' ? 'is-visible' : ''}`}>
          <BedoIslandOverlay
            status={bedoStatus}
            micLevel={bedoMicLevel}
            roboMood={roboMood}
            roboReaction={roboReaction}
            outfit={islandSettings.outfit || 'Crown'}
            seasonalOutfits={Boolean(islandSettings.seasonalOutfits)}
            blinkingEnabled={islandSettings.blinkingEnabled !== false}
            userTranscript={bedoUserTranscript}
            reply={roboReply}
            thinkingHint={bedoThinkingHint}
            webcamActive={bedoStatus.webcamActive}
            webcamFrame={bedoWebcamFrame}
            active={documentVisible && islandMode === 'bedo-live'}
            onToggleMute={() => window.twocode?.bedoSetMuted?.(!bedoStatus.muted)}
            onToggleWebcam={() => window.twocode?.bedoSetWebcam?.(!bedoStatus.webcamActive)}
            onOpenMain={() => {
              setShowMenu(false);
              setNotificationHistoryOpen(false);
              setIslandOverlay(null);
              setActiveTab('robo');
              setSelectedAiProvider('Bedo');
              setIslandMode('expanded');
            }}
            onClose={() => {
              window.twocode?.bedoSetPaused?.(true);
              resumeMediaAfterBedo();
              setIslandMode(resolvedCollapsedMode);
            }}
          />
        </div>

        <div
          className={`morph-layer layer-notif-toast ${islandMode === 'notif-toast' ? 'is-visible' : ''} ${notifPresentation.kind === 'audio' || notifPresentation.kind === 'video' ? 'is-call-notification' : ''}`}
          role="button"
          tabIndex={0}
          title={t('topbar.openApp')}
          style={{ '--notif-stay-ms': `${notifRemainingMsRef.current || 4500}ms` }}
          onMouseEnter={() => {
            if (!isShowingNotifToastRef.current || !notifTimerRef.current) return;
            clearTimeout(notifTimerRef.current);
            notifTimerRef.current = null;
            notifRemainingMsRef.current = Math.max(
              0,
              notifRemainingMsRef.current - (Date.now() - notifTimerStartedAtRef.current)
            );
          }}
          onMouseLeave={() => {
            if (!isShowingNotifToastRef.current || notifTimerRef.current) return;
            const remainingMs = Math.max(900, notifRemainingMsRef.current);
            const prevMode = notifPrevModeRef.current;
            notifTimerStartedAtRef.current = Date.now();
            notifTimerRef.current = setTimeout(() => {
              isShowingNotifToastRef.current = false;
              notifRemainingMsRef.current = 0;
              notifTimerRef.current = null;
              setIslandMode(prevMode);
            }, remainingMs);
          }}
          onClick={(event) => {
            event.stopPropagation();
            openNotification(toastBanner);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              openNotification(toastBanner);
            }
          }}
        >
          <NotifToastContent
            avatarNode={
              <NotificationAvatar
                banner={toastBanner}
                brand={notifBrand.brand}
                presentation={notifPresentation}
              />
            }
            presentation={notifPresentation}
          />
        </div>

        {/* ============================================================
            COLLAPSED LAYER 3: COMPACT MUSIC / KARAOKE BAR NOTCH
            Matches screenshots media_1794017581469_4fb13cc8.png & media_1794019642044_7536817b.png
            ============================================================ */}
        <div
          className={`morph-layer layer-music-bar ${islandMode === 'music-bar' ? 'is-visible' : ''
            } ${hasSyncedLyrics ? 'is-karaoke-mode' : ''}`}
        >
          <div
            className="compact-left"
            onClick={(e) => {
              if (currentMedia.hasSession) handleOpenMediaSource(e);
            }}
            title={currentMedia.hasSession ? t('home.openMediaSource') : undefined}
            style={currentMedia.hasSession ? { cursor: 'pointer' } : undefined}
          >
            {currentMedia.thumbnail ? (
              <img
                src={currentMedia.thumbnail}
                alt=""
                className="compact-album-thumb"
              />
            ) : (
              <div className="compact-album-placeholder">
                <Music size={12} />
              </div>
            )}
          </div>
          <div className="compact-center">
            <span
              key={hasSyncedLyrics ? `compact-${activeLyricIndex}` : 'compact-static'}
              className={`compact-lyric ${hasSyncedLyrics ? 'karaoke-fill' : ''}`}
            >
              {primaryLine}
            </span>
          </div>
          <div className="compact-right">
            <div className={`soundwave ${currentMedia.isPlaying ? 'playing' : 'paused'}`}>
              <span />
              <span />
              <span />
              <span />
            </div>
            <InlineDownloadOrb liveActivity={liveActivity} />
          </div>
        </div>

        {/* ============================================================
            COLLAPSED LAYER 3B: FOCUS RUNNING BAR NOTCH
            Matches screenshot media_1794019559611_7bcce858.png
            ============================================================ */}
        <div
          className={`morph-layer layer-focus-bar ${islandMode === 'focus-bar' || islandMode === 'focus-bar-media' ? 'is-visible' : ''
            }`}
        >
          <div className="focus-notch-ring-wrap">
            <svg width="22" height="22" viewBox="0 0 22 22">
              <circle
                cx="11"
                cy="11"
                r="8.5"
                fill="none"
                stroke="#b085f5"
                strokeWidth="2.8"
              />
            </svg>
          </div>
          <span className="focus-notch-countdown">
            {formatTimerBig(timerSeconds)}
          </span>
        </div>

        {/* ============================================================
            EXPANDED LAYER 4: FULL DYNAMIC ISLAND
            ============================================================ */}
        <div
          className={`morph-layer layer-expanded ${islandMode === 'expanded' ? 'is-visible' : ''
            }`}
        >
          {shouldRenderExpanded && (
            <>
          {/* TOP STATUS BAR */}
          <header className="island-topbar">
            <div className="topbar-left">
              {islandOverlay === 'all-apps' ? (
                <button
                  type="button"
                  className="topbar-apps-back-title"
                  onClick={() => setIslandOverlay(null)}
                >
                  Apps
                </button>
              ) : islandOverlay === 'mirror' ? (
                <button
                  type="button"
                  className="topbar-apps-back-title"
                  onClick={() => setIslandOverlay(null)}
                >
                  ← Mirror
                </button>
              ) : (
                <>
                  {activeTab === 'home' && !islandOverlay && (
                    <div
                      className="topbar-sys-icons"
                      title="Control Center (Wi-Fi & Bluetooth)"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        if (!showControlCenter) {
                          window.twocode?.getNetworkInfo?.().then((info) => {
                            if (info) setNetworkInfo(info);
                          });
                          refreshRadioStates();
                        }
                        setShowControlCenter((s) => !s);
                      }}
                    >
                      <button
                        type="button"
                        className="topbar-icon-btn"
                        title="Wi-Fi"
                      >
                        <Wifi size={13} strokeWidth={2.4} color={networkInfo.wifiConnected ? '#55e6a5' : networkInfo.wifiState === 'On' ? '#f4f4f5' : '#777780'} />
                      </button>
                      <button
                        type="button"
                        className="topbar-icon-btn"
                        title="Bluetooth"
                      >
                        <Bluetooth size={13} strokeWidth={2.4} color={networkInfo.bluetoothState === 'On' ? '#8dbbff' : '#777780'} />
                      </button>
                    </div>
                  )}
                  {renderDateTop(now)}
                </>
              )}
            </div>

            {/* ============================================================
                CONTROL CENTER POPOVER (Exact replica of screenshot media_1794051605526_7a537730.png)
                ============================================================ */}
            {showControlCenter && (
              <div
                className="twocode-control-center-popover"
                onClick={(e) => e.stopPropagation()}
                onMouseLeave={() => setShowControlCenter(false)}
              >
                <div className="cc-tiles-grid">
                  <div
                    className="cc-tile cc-wifi-tile"
                    role="button"
                    tabIndex={0}
                    aria-pressed={networkInfo.wifiState === 'On'}
                    aria-busy={radioBusy === 'Wifi'}
                    onClick={() => toggleRadio('Wifi')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleRadio('Wifi');
                      }
                    }}
                  >
                    <div className={`cc-tile-icon-circle ${networkInfo.wifiConnected ? 'connected' : networkInfo.wifiState === 'On' ? 'blue' : 'off'}`}>
                      <Wifi size={18} strokeWidth={2.4} color="#ffffff" />
                    </div>
                    <strong className="cc-tile-title">Wi-Fi</strong>
                    <span className="cc-tile-sub">{radioBusy === 'Wifi' ? t('cc.changing') : networkInfo.wifiConnected ? t('cc.connectedWithName', { name: networkInfo.wifi || 'Wi-Fi' }) : networkInfo.wifiState === 'Off' ? t('cc.wifiOff') : networkInfo.wifiState === 'On' ? t('cc.wifiNotConnected') : t('cc.fetchingStatus')}</span>
                  </div>

                  <div
                    className="cc-tile cc-bt-tile"
                    role="button"
                    tabIndex={0}
                    aria-pressed={networkInfo.bluetoothState === 'On'}
                    aria-busy={radioBusy === 'Bluetooth'}
                    onClick={() => toggleRadio('Bluetooth')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleRadio('Bluetooth');
                      }
                    }}
                  >
                    <div className={`cc-tile-icon-circle ${networkInfo.bluetoothState === 'On' ? 'blue' : networkInfo.bluetoothState === 'Off' ? 'off' : 'pending'}`}>
                      <Bluetooth size={18} strokeWidth={2.4} color="#ffffff" />
                    </div>
                    <strong className="cc-tile-title">Bluetooth</strong>
                    <span className="cc-tile-sub">{radioBusy === 'Bluetooth' ? t('cc.changing') : networkInfo.bluetoothState === 'On' ? t('common.on') : networkInfo.bluetoothState === 'Off' ? t('common.off') : t('cc.fetchingStatus')}</span>
                  </div>
                </div>

                {radioError && <div className="cc-radio-error" role="status">{radioError}</div>}

                {radioPanel && (
                  <section className="cc-nearby-panel" aria-live="polite">
                    <div className="cc-nearby-heading">
                      <strong>{radioPanel === 'wifi' ? t('cc.nearbyWifi') : t('cc.nearbyBt')}</strong>
                      <div>
                        <button
                          type="button"
                          className="cc-nearby-icon-button"
                          aria-label={t('cc.rescan')}
                          disabled={radioScanBusy}
                          onClick={radioPanel === 'wifi' ? scanWifiNetworks : scanBluetoothDevices}
                        ><RotateCw size={13} className={radioScanBusy ? 'is-spinning' : ''} /></button>
                        <button type="button" className="cc-nearby-icon-button" aria-label={t('cc.closeList')} onClick={() => setRadioPanel('')}><X size={14} /></button>
                      </div>
                    </div>
                    {radioScanBusy ? (
                      <div className="cc-nearby-empty">{t('cc.searchingDevices')}</div>
                    ) : radioPanel === 'wifi' ? (
                      wifiNetworks.length ? wifiNetworks.map((network) => (
                        <div className="cc-nearby-item" key={`${network.ssid}-${network.profileName || ''}`}>
                          <Wifi size={15} />
                          <span className="cc-nearby-name">
                            <strong>{network.ssid}</strong>
                            <small>{network.connected ? t('cc.connected') : t('cc.signalInfo', { signal: network.signal, sec: network.secured ? t('cc.secured') : t('cc.openNetwork') })}</small>
                          </span>
                          {network.connected && <Check size={15} className="cc-nearby-check" />}
                        </div>
                      )) : <div className="cc-nearby-empty">{t('cc.noNetworksFound')}</div>
                    ) : bluetoothDevices.length ? bluetoothDevices.map((device) => (
                      <div className="cc-nearby-item" key={device.id}>
                        <Bluetooth size={15} />
                        <span className="cc-nearby-name"><strong>{device.name}</strong><small>{device.paired ? t('cc.paired') : t('cc.nearby')}</small></span>
                        {!device.paired && <button type="button" className="cc-nearby-action" disabled={Boolean(radioBusy)} onClick={() => pairBluetoothDevice(device)}>{radioBusy === device.id ? '…' : t('cc.pair')}</button>}
                      </div>
                    )) : <div className="cc-nearby-empty">{t('cc.noDevicesFound')}</div>}
                  </section>
                )}

                <div className="cc-list-rows">
                  <button
                    type="button"
                    className="cc-list-row"
                    onClick={scanWifiNetworks}
                  >
                    <div className="cc-row-left">
                      <Wifi size={14} strokeWidth={2.2} />
                      <span>{t('cc.scanWifi')}</span>
                    </div>
                    <ChevronRight size={14} strokeWidth={2.2} className="cc-row-chev" />
                  </button>

                  <button
                    type="button"
                    className="cc-list-row"
                    onClick={scanBluetoothDevices}
                  >
                    <div className="cc-row-left">
                      <Bluetooth size={14} strokeWidth={2.2} />
                      <span>{t('cc.scanNearbyDevices')}</span>
                    </div>
                    <ChevronRight size={14} strokeWidth={2.2} className="cc-row-chev" />
                  </button>
                </div>
              </div>
            )}

            <div className="topbar-center">
              {(islandOverlay || roboReaction ||
                (activeTab !== 'code' && activeTab !== 'robo')) && (
                  <RoboEyes
                    mood={topEyeMood}
                    reaction={roboReaction}
                    active={documentVisible && (islandMode === 'expanded' || Boolean(roboReaction))}
                    blinkingEnabled={islandSettings.blinkingEnabled !== false}
                    outfit={islandSettings.outfit || 'Best'}
                    seasonalOutfits={Boolean(islandSettings.seasonalOutfits)}
                    batteryPercent={batteryPercent}
                    batteryCharging={batteryCharging}
                    unreadNotificationCount={unreadNotificationCount}
                    pendingAgendaCount={pendingAgendaCount}
                    onPoke={(m) => {
                      setRoboMood(m);
                      playRoboSound(m, islandSettings.soundEffects !== false);
                    }}
                  />
                )}
            </div>

            <div className="topbar-right">
              {activeTab === 'home' && !islandOverlay && (
                <>
                  {(ghelperStatus.ghelperInstalled !== false) && (
                  <div className="topbar-ghelper-group" role="group" aria-label={t('topbar.ghelperGroup')}>
                    {(() => {
                      const perfMeta = GHELPER_PERF_MODES[ghelperStatus.performanceMode] || GHELPER_PERF_MODES[0];
                      const PerfIcon = perfMeta.icon;
                      return (
                        <button
                          type="button"
                          className={`topbar-ghelper-btn perf-mode-${ghelperStatus.performanceMode}`}
                          style={{ '--gh-color': perfMeta.color }}
                          aria-label={t('topbar.ghelperPerf', { name: t(`ghelper.perf.${ghelperStatus.performanceMode in GHELPER_PERF_MODES ? ghelperStatus.performanceMode : 0}`) })}
                          data-no-tooltip="true"
                          onClick={(event) => {
                            event.stopPropagation();
                            suppressGHelperHudUntilRef.current = Date.now() + 6000;
                            playRoboSound('tap', islandSettings.soundEffects !== false);
                            window.twocode?.openGHelper?.();
                          }}
                        >
                          <PerfIcon size={15} strokeWidth={2.2} />
                        </button>
                      );
                    })()}
                    {(() => {
                      const gpuMeta = GHELPER_GPU_MODES[ghelperStatus.gpuMode] || GHELPER_GPU_MODES[0];
                      const GpuIcon = gpuMeta.icon;
                      return (
                        <button
                          type="button"
                          className={`topbar-ghelper-btn gpu-mode-${ghelperStatus.gpuMode}`}
                          style={{ '--gh-color': gpuMeta.color }}
                          aria-label={t('topbar.ghelperGpu', { name: t(`ghelper.gpu.${ghelperStatus.gpuMode in GHELPER_GPU_MODES ? ghelperStatus.gpuMode : 0}`) })}
                          data-no-tooltip="true"
                          onClick={(event) => {
                            event.stopPropagation();
                            suppressGHelperHudUntilRef.current = Date.now() + 6000;
                            playRoboSound('tap', islandSettings.soundEffects !== false);
                            window.twocode?.openGHelper?.();
                          }}
                        >
                          <GpuIcon size={15} strokeWidth={2.2} />
                        </button>
                      );
                    })()}
                  </div>
                  )}
                  <button
                    type="button"
                    className="topbar-mode-btn"
                    style={{ '--mode-color': activeModeOption.color }}
                    onClick={(event) => { event.stopPropagation(); setActiveTab('sleep'); setNotificationHistoryOpen(false); setShowMenu(false); }}
                    aria-label={t('topbar.openMode', { name: t(`mode.${selectedModeName === 'Serbest' ? 'Free' : selectedModeName}`) })}
                    title={`${t(`mode.${selectedModeName === 'Serbest' ? 'Free' : selectedModeName}`)} · ${activeModeSummary}`}
                  >
                    <ActiveModeIcon size={16} strokeWidth={2.2} />
                  </button>
                  <button
                    ref={notificationHistoryTriggerRef}
                    type="button"
                    className={`topbar-notifications-btn ${notificationHistoryOpen ? 'is-open' : ''} ${unreadNotificationCount ? 'has-unread' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      playRoboSound('tap', islandSettings.soundEffects !== false);
                      openNotificationHistory();
                    }}
                    aria-label={unreadNotificationCount ? t('notif.historyUnreadAria', { count: unreadNotificationCount }) : t('notif.historyAria')}
                    aria-expanded={notificationHistoryOpen}
                    aria-controls="notification-history-panel"
                    title={t('notif.historyAria')}
                  >
                    <Bell size={16} strokeWidth={2} />
                    {unreadNotificationCount > 0 && <span className="notification-count-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
                  </button>
                </>
              )}
              <button
                type="button"
                className={`topbar-dots-btn ${showMenu ? 'is-open' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  playRoboSound('tap', islandSettings.soundEffects !== false);
                  setShowMenu((s) => !s);
                  setNotificationHistoryOpen(false);
                  setQuitConfirming(false);
                }}
                title={t('common.menu')}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* ============================================================
                EXACT TWOCODE `•••` POPOVER MENU
                Spans down to bottom navbar area; robust backdrop dismiss
                ============================================================ */}
            {showMenu && (
              <>
                <div
                  className="twocode-popover-backdrop"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setQuitConfirming(false);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowMenu(false);
                    setQuitConfirming(false);
                  }}
                />
                <div
                  className="twocode-dots-popover"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* Volume Slider Bar */}
                  <div
                    ref={volumeBarRef}
                    className="popover-volume-slider"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsDraggingVolume(true);
                      updateVolumeFromMouse(e.clientX);
                    }}
                  >
                    <div
                      className="popover-volume-fill"
                      style={{ width: `${isMuted ? 0 : volumePercent}%` }}
                    />
                    <div className="popover-volume-icon">
                      {isMuted || volumePercent === 0 ? (
                        <VolumeX size={16} strokeWidth={2.3} />
                      ) : (
                        <Volume2 size={16} strokeWidth={2.3} />
                      )}
                    </div>
                  </div>

                  {/* 3x2 Action Tiles Grid */}
                  <div className="popover-tiles-grid">
                    <button
                      type="button"
                      className="popover-tile-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        setIslandOverlay('all-apps');
                        setShowMenu(false);
                      }}
                    >
                      <LayoutGrid size={17} strokeWidth={2} />
                      <span>{t('menu.allApps')}</span>
                    </button>

                    <button
                      type="button"
                      className="popover-tile-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        setIslandOverlay('customize-carousel');
                        setShowMenu(false);
                      }}
                    >
                      <Pencil size={17} strokeWidth={2} />
                      <span>{t('menu.customize')}</span>
                    </button>

                    <button
                      type="button"
                      className="popover-tile-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        window.twocode?.openSettingsWindow?.('home');
                        setShowMenu(false);
                      }}
                    >
                      <Settings size={17} strokeWidth={2} />
                      <span>{t('menu.settings')}</span>
                    </button>

                    <button
                      type="button"
                      className="popover-tile-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        window.twocode?.openSettingsWindow?.('news');
                        setShowMenu(false);
                      }}
                    >
                      <RotateCw size={17} strokeWidth={2} />
                      <span>{t('menu.updates')}</span>
                    </button>

                    <button
                      type="button"
                      className="popover-tile-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRoboSound('tap', islandSettings.soundEffects !== false);
                        setShowMenu(false);
                        setIslandMode(resolvedCollapsedMode);
                      }}
                    >
                      <ChevronUp size={18} strokeWidth={2.2} />
                      <span>{t('menu.foldIn')}</span>
                    </button>

                    <button
                      type="button"
                      className={`popover-tile-btn quit-tile ${quitConfirming ? 'is-confirming' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!quitConfirming) {
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                          setQuitConfirming(true);
                        } else {
                          window.twocode?.quitApp();
                        }
                      }}
                    >
                      <Power size={17} strokeWidth={2} color="#ef4444" />
                      <span style={{ color: '#ef4444' }}>{quitConfirming ? t('menu.sure') : t('menu.quit')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </header>

          {notificationHistoryOpen && (
            <section
              ref={notificationHistoryPanelRef}
              id="notification-history-panel"
              className={`notification-history-panel ${notificationHistory.length === 0 ? 'is-empty' : ''}`}
              aria-label={t('notif.historyAria')}
              style={(() => {
                const newest = notificationHistory[0];
                if (!newest) {
                  return { '--notif-panel-rgb': '255, 255, 255', '--notif-panel-hex': '#e2e8f0' };
                }
                const accent = resolveNotifBrand(newest, newest?.logoAccent);
                return { '--notif-panel-rgb': accent.rgb, '--notif-panel-hex': accent.hex };
              })()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="notif-panel-ambient-glow" aria-hidden="true" />

              <header className="notification-history-header">
                <div className="notification-history-heading">
                  <span className="notification-history-icon"><Bell size={13} strokeWidth={2.2} /></span>
                  <strong className="notification-history-title">{t('notif.title')}</strong>
                  {notificationHistory.length > 0 && (
                    <span className="notif-history-badge">
                      {unreadNotificationCount > 0 ? t('notif.newCount', { count: unreadNotificationCount }) : `${notificationHistory.length}`}
                    </span>
                  )}
                </div>
                <div className="notification-history-actions">
                  {notificationHistory.length > 0 && (
                    <button
                      className="notification-history-clear"
                      type="button"
                      onClick={() => setNotificationHistory([])}
                      title={t('notif.clearAllTitle')}
                    >
                      {t('common.clear')}
                    </button>
                  )}
                  <button
                    className="notification-history-close"
                    type="button"
                    aria-label={t('common.close')}
                    title={t('common.close')}
                    onClick={() => setNotificationHistoryOpen(false)}
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </div>
              </header>

              <div className="notification-history-list" onScroll={hideNotifPreview}>
                {notificationHistory.length ? notificationHistory.map((item, index) => {
                  const accent = resolveNotifBrand(item, item.logoAccent);
                  const cardPresentation = resolveNotificationPresentation(item);
                  const primaryTitle = String(
                    cardPresentation.title || item.title || item.app || t('notif.systemFallback')
                  ).trim();
                  const rawSub = String(cardPresentation.subtitle || item.body || '').trim();
                  const hasBody = Boolean(
                    rawSub &&
                    rawSub !== primaryTitle &&
                    rawSub !== item.app
                  );
                  return (
                    <div
                      className={`notif-card ${item.isRead ? 'is-read' : 'is-unread'}`}
                      key={item.id}
                      style={{
                        '--notif-accent-rgb': accent.rgb,
                        '--notif-accent-hex': accent.hex,
                        '--card-delay': `${Math.min(index * 35, 240)}ms`,
                      }}
                    >
                      <button
                        type="button"
                        className="notif-card-main"
                        onMouseEnter={(event) => scheduleNotifPreview(event, item, primaryTitle, hasBody ? rawSub : '', accent)}
                        onMouseLeave={hideNotifPreview}
                        onClick={(event) => {
                          event.stopPropagation();
                          hideNotifPreview();
                          openNotification(item);
                        }}
                        aria-label={t('notif.openAppNotifAria', { app: item.app || t('notif.appFallback') })}
                      >
                        <div className="notif-card-avatar">
                          <NotificationAvatar
                            banner={item}
                            brand={accent.brand}
                            presentation={cardPresentation}
                          />
                        </div>

                        <div className="notif-card-content">
                          <div className="notif-card-top-row">
                            <span className="notif-card-title">
                              <NotificationText text={primaryTitle} />
                            </span>
                            <span className="notif-card-time">{formatNotifTime(item.timestamp, langCode)}</span>
                          </div>
                          {hasBody && (
                            <div className="notif-card-message-row">
                              <span className="notif-card-body">
                                <NotificationText text={rawSub} />
                              </span>
                            </div>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        className="notif-card-delete"
                        aria-label={t('notif.deleteNotifAria')}
                        title={t('notif.deleteNotifAria')}
                        onClick={(e) => {
                          e.stopPropagation();
                          hideNotifPreview();
                          setNotificationHistory((items) => items.filter((entry) => entry.id !== item.id));
                        }}
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  );
                }) : (
                  <div className="notification-history-empty">
                    <div className="notification-empty-icon">
                      <Bell size={20} strokeWidth={2} />
                    </div>
                    <strong className="notification-empty-title">{t('notif.emptyTitle')}</strong>
                    <span className="notification-empty-desc">{t('notif.emptyDesc')}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ============================================================
              OVERLAY 0: FILE DRAG-DROP 3-CARD TARGETS (Matches media_1794049683895_d176ec76.jpg)
              ============================================================ */}
          {focusGuardPrompt ? (
            <div className="focus-guard-island-overlay">
              <div className="focus-guard-breath-ring">
                <span>{focusGuardPrompt.secondsLeft > 0 ? focusGuardPrompt.secondsLeft : '✓'}</span>
              </div>
              <div className="focus-guard-copy">
                <strong>
                  {langCode === 'tr'
                    ? `${focusGuardPrompt.appLabel} açılıyor — bir an dur`
                    : `Opening ${focusGuardPrompt.appLabel} — pause for a moment`}
                </strong>
                <span>
                  {focusGuardPrompt.secondsLeft > 0
                    ? langCode === 'tr'
                      ? `Derin bir nefes al (${focusGuardPrompt.secondsLeft} sn)...`
                      : `Take a deep breath (${focusGuardPrompt.secondsLeft}s)...`
                    : langCode === 'tr'
                    ? 'Odakta kalmak ister misin?'
                    : 'Do you want to stay focused?'}
                </span>
              </div>
              <div className="focus-guard-actions">
                <button
                  type="button"
                  className="focus-guard-btn primary"
                  onClick={() => {
                    recordFocusGuardStat('turnedBack');
                    setFocusGuardPrompt(null);
                    setIslandMode(resolvedCollapsedMode);
                  }}
                >
                  {langCode === 'tr' ? 'Geri dön' : 'Turn back'}
                </button>
                <button
                  type="button"
                  className="focus-guard-btn ghost"
                  disabled={focusGuardPrompt.secondsLeft > 0}
                  onClick={() => {
                    const leaveMin = Number(islandSettingsRef.current?.focusGuardLeaveMin) || 5;
                    focusGuardCooldownRef.current[focusGuardPrompt.matchedKey] = Date.now() + leaveMin * 60 * 1000;
                    recordFocusGuardStat('openedAnyway');
                    setFocusGuardPrompt(null);
                    setIslandMode(resolvedCollapsedMode);
                  }}
                >
                  {langCode === 'tr'
                    ? `Yine de aç (${Number(islandSettingsRef.current?.focusGuardLeaveMin) || 5} dk)`
                    : `Open anyway (${Number(islandSettingsRef.current?.focusGuardLeaveMin) || 5}m)`}
                </button>
              </div>
            </div>
          ) : showIslandWelcome ? (
            <div className="island-welcome-screen">
              <div className="island-welcome-glow" aria-hidden="true" />
              <div className="island-welcome-top">
                <div className="island-welcome-avatar">
                  <RoboEyes
                    mood="happy"
                    reaction="happy"
                    active={documentVisible}
                    trackCursor={true}
                    blinkingEnabled={true}
                    outfit={islandSettings.outfit || 'Best'}
                    seasonalOutfits={false}
                    size="normal"
                  />
                </div>
                <div className="island-welcome-copy">
                  <span className="island-welcome-badge">
                    {langCode === 'tr' ? 'BEDO’YA HOŞ GELDİN' : 'WELCOME TO BEDO'}
                  </span>
                  <h3>
                    {langCode === 'tr'
                      ? 'Dinamik Adan Hazır'
                      : 'Your Dynamic Island Is Ready'}
                  </h3>
                  <p>
                    {langCode === 'tr'
                      ? 'Yapay zeka asistanın, odak sayacın, akıllı bildirimlerin ve kısayolların tek yerde.'
                      : 'Your AI companion, focus timer, smart notifications, and app shortcuts in one place.'}
                  </p>
                </div>
                <div className="island-welcome-lang">
                  {['Turkish', 'English'].map((lng) => (
                    <button
                      key={lng}
                      type="button"
                      className={islandSettings.language === lng ? 'active' : ''}
                      onClick={() => {
                        setIslandSettings((prev) => ({ ...prev, language: lng }));
                        window.twocode?.saveSettings?.({ language: lng });
                      }}
                    >
                      {lng === 'Turkish' ? 'TR' : 'EN'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="island-welcome-pills">
                <div className="island-welcome-pill" style={{ animationDelay: '0.06s' }}>
                  <strong>Ctrl+Alt+T</strong>
                  <span>{langCode === 'tr' ? 'Adayı Aç / Kapat' : 'Toggle Island'}</span>
                </div>
                <div className="island-welcome-pill" style={{ animationDelay: '0.14s' }}>
                  <strong>Ctrl+Alt+Space</strong>
                  <span>{langCode === 'tr' ? 'Bedo ile Konuş' : 'Talk to Bedo'}</span>
                </div>
                <div className="island-welcome-pill" style={{ animationDelay: '0.22s' }}>
                  <strong>{langCode === 'tr' ? 'Akıllı Odak' : 'Smart Focus'}</strong>
                  <span>{langCode === 'tr' ? 'Sayaç & Koruma' : 'Timer & Guard'}</span>
                </div>
              </div>

              <div className="island-welcome-actions">
                <button
                  type="button"
                  className="island-welcome-btn primary"
                  onClick={() => {
                    playRoboSound('happy', islandSettingsRef.current?.soundEffects !== false);
                    suppressHoverCollapseUntilRef.current = 0;
                    setShowIslandWelcome(false);
                    window.twocode?.saveSettings?.({ onboardingCompleted: true });
                    setIslandMode(resolvedCollapsedMode);
                  }}
                >
                  {langCode === 'tr' ? 'Hadi Başlayalım' : 'Get Started'}
                </button>
                <button
                  type="button"
                  className="island-welcome-btn ghost"
                  onClick={() => {
                    suppressHoverCollapseUntilRef.current = 0;
                    setShowIslandWelcome(false);
                    window.twocode?.saveSettings?.({ onboardingCompleted: true });
                    window.twocode?.openSettingsWindow?.('home');
                    setIslandMode(resolvedCollapsedMode);
                  }}
                >
                  {langCode === 'tr' ? 'Ayarları Aç' : 'Open Settings'}
                </button>
              </div>
            </div>
          ) : islandOverlay === 'all-apps' ? (() => {
            const builtInApps = [
              { id: 'music', label: t('allApps.music'), icon: Music, action: () => { setActiveTab('music'); setIslandOverlay(null); } },
              { id: 'drop', label: t('allApps.drop'), icon: UploadCloud, action: () => { setActiveTab('drop'); setIslandOverlay(null); } },
              { id: 'robo', label: 'Bedo', isRoboEyes: true, action: () => { setActiveTab('robo'); setSelectedAiProvider('Bedo'); setIslandOverlay(null); if (bedoStatus.paused) window.twocode?.bedoSetPaused?.(false); } },
              { id: 'timer', label: t('allApps.focus'), icon: Timer, action: () => { setActiveTab('timer'); setIslandOverlay(null); } },
              // { id: 'clips', label: t('allApps.clipboard'), icon: Copy, action: () => { setActiveTab('clips'); setIslandOverlay(null); } },
              { id: 'notes', label: t('allApps.note'), icon: FileText, action: () => { setActiveTab('notes'); setIslandOverlay(null); } },
              { id: 'cal', label: t('allApps.calendar'), icon: Calendar, action: () => { setActiveTab('cal'); setIslandOverlay(null); } },
              { id: 'mirror', label: t('allApps.mirror'), icon: Video, action: () => { setIslandOverlay('mirror'); } },
              { id: 'settings', label: t('allApps.settings'), icon: Settings, action: () => { window.twocode?.openSettingsWindow?.('home'); setIslandOverlay(null); } },
            ];
            const shortcutItems = shortcuts.map((sc) => ({
              id: `sc-${sc.id}`,
              label: sc.name,
              shortcut: sc,
              action: () => {
                triggerRoboReaction('app-open', 2, 1050);
                window.twocode?.openApp(sc);
                setIslandOverlay(null);
              },
            }));
            const allItems = [...builtInApps, ...shortcutItems];
            const perPage = 12;
            const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
            const safePage = Math.min(allAppsPage, totalPages - 1);
            const pageItems = allItems.slice(safePage * perPage, (safePage + 1) * perPage);
            const goPage = (nextPage) => {
              const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
              if (clamped === safePage) return;
              setAllAppsDir(clamped > safePage ? 1 : -1);
              setAllAppsPage(clamped);
            };
            return (
              <div className="all-apps-overlay-view is-paginated" onClick={() => setShowMenu(false)}>
                {totalPages > 1 && (
                  <button
                    type="button"
                    className="all-apps-nav-btn is-prev"
                    disabled={safePage === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      goPage(safePage - 1);
                    }}
                    aria-label="Önceki sayfa"
                  >
                    <ChevronLeft size={15} strokeWidth={2.2} />
                  </button>
                )}

                <div className="all-apps-stage">
                  <AnimatePresence mode="wait" custom={allAppsDir}>
                    <motion.div
                      key={`all-apps-page-${safePage}`}
                      className="all-apps-grid"
                      custom={allAppsDir}
                      initial={{ opacity: 0, x: allAppsDir * 32 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -allAppsDir * 32 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {pageItems.map((appItem) => {
                        const AppIcon = appItem.icon;
                        return (
                          <button
                            key={appItem.id}
                            type="button"
                            className="all-apps-cell"
                            onClick={() => {
                              playRoboSound('tap', islandSettings.soundEffects !== false);
                              appItem.action();
                            }}
                          >
                            <div className="all-apps-squircle">
                              {appItem.isRoboEyes ? (
                                <div className="mini-squircle-eyes">
                                  <i />
                                  <i />
                                </div>
                              ) : appItem.shortcut ? (
                                <RealAppIcon sc={appItem.shortcut} size={22} />
                              ) : (
                                <AppIcon size={18} strokeWidth={1.9} />
                              )}
                            </div>
                            <span className="all-apps-label">{appItem.label}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {totalPages > 1 && (
                  <button
                    type="button"
                    className="all-apps-nav-btn is-next"
                    disabled={safePage >= totalPages - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      goPage(safePage + 1);
                    }}
                    aria-label="Sonraki sayfa"
                  >
                    <ChevronRight size={15} strokeWidth={2.2} />
                  </button>
                )}

                {totalPages > 1 && (
                  <div className="all-apps-page-dots" aria-hidden="true">
                    {Array.from({ length: totalPages }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`all-apps-page-dot ${idx === safePage ? 'is-active' : ''}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })() : islandOverlay === 'mirror' ? (
            <MirrorOverlay onClose={() => setIslandOverlay(null)} />
          ) : (
            <>
              {/* MAIN TAB CONTENT AREA */}
              <main className="island-body" onClick={() => setShowMenu(false)}>
                {/* ============================================================
                    OVERLAY 2: CUSTOMIZE 4-LAYOUT CAROUSEL
                    Matches screenshot media_1794017528945_3ce66107.png
                    ============================================================ */}
                {islandOverlay === 'customize-carousel' ? (
                  <div className="customize-carousel-view">
                    <div className="carousel-track-stage">
                      {/* Left Neighbour Preview Card */}
                      <div
                        className="carousel-side-card left"
                        onClick={() => {
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                          setHomeLayoutIndex((i) => (i + 3) % 4);
                        }}
                      >
                        <div className="mini-bento-preview">
                          <div className="mb-box">
                            <small>{t('carousel.focus')}</small>
                            <strong className="clock-number-text">25:00</strong>
                          </div>
                          <div className="mb-box">
                            <small>{t('carousel.robo')}</small>
                            <strong>{t('carousel.askRobo')}</strong>
                          </div>
                          <div className="mb-box">
                            <small>{t('carousel.note')}</small>
                            <strong>{t('carousel.note')}</strong>
                          </div>
                          <div className="mb-box">
                            <small>{t('carousel.agenda')}</small>
                            <strong>{t('carousel.nothingPlanned')}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Active Center Preview Card with White Border */}
                      <div
                        className="carousel-center-card"
                        onClick={() => setIslandOverlay(null)}
                      >
                        <div className="cc-topbar">
                          {renderDateTop(now, true)}
                          <div className="cc-eyes">
                            <i />
                            <i />
                          </div>
                        </div>

                        {currentLayoutId === 'clock' && (
                          <>
                            <div className="cc-big-clock" style={{ color: effectiveClockColor, '--clock-glass-color': effectiveClockColor }}>
                              {formatTimeHHMM(now)}
                            </div>
                            <div className="cc-cards-row">
                              <div className="cc-mini-card">
                                <span className="cc-grey-sq" />
                                <div>
                                  <strong>{t('carousel.connect')}</strong>
                                  <small>{t('carousel.inSettings')}</small>
                                </div>
                              </div>
                              <div className="cc-mini-card">
                                {currentMedia.thumbnail ? (
                                  <img src={currentMedia.thumbnail} alt="" className="cc-thumb" />
                                ) : (
                                  <div className="cc-thumb-empty" />
                                )}
                                <div className="truncate">
                                  <strong>{currentMedia.title || t('carousel.music')}</strong>
                                  <small>{currentMedia.artist || t('carousel.ready')}</small>
                                </div>
                              </div>
                              <div className="cc-mini-card">
                                <div>
                                  <strong className="clock-number-text">25:00</strong>
                                  <small>{t('carousel.focusReady')}</small>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {currentLayoutId === 'grid' && (
                          <div className="cc-grid-preview">
                            <div className="mb-box">
                              <small>{t('dock.music')}</small>
                              <strong>{currentMedia.title || t('carousel.ready')}</strong>
                            </div>
                            <div className="mb-box">
                              <small>{t('carousel.focus')}</small>
                              <strong className="clock-number-text">25:00</strong>
                            </div>
                            <div className="mb-box">
                              <small>{t('carousel.robo')}</small>
                              <strong>{t('carousel.askRobo')}</strong>
                            </div>
                            <div className="mb-box">
                              <small>{t('carousel.agenda')}</small>
                              <strong>{t('carousel.nothingPlanned')}</strong>
                            </div>
                          </div>
                        )}

                        {currentLayoutId === 'dial' && (
                          <div className="cc-dial-preview">
                            <div className="cc-dial-art" />
                            <div className="cc-dial-ring">
                              <small>CLAUDE</small>
                              <strong>{t('carousel.connect')}</strong>
                              <span>{t('carousel.inSettings')}</span>
                            </div>
                          </div>
                        )}

                        {currentLayoutId === 'minimal' && (
                          <div className="cc-minimal-preview">
                            <div className="cc-big-clock" style={{ color: clockColor }}>
                              {formatTimeHHMM(now)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Neighbour Preview Card */}
                      <div
                        className="carousel-side-card right"
                        onClick={() => {
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                          setHomeLayoutIndex((i) => (i + 1) % 4);
                        }}
                      >
                        <div className="cc-dial-preview">
                          <div className="cc-dial-art" />
                          <div className="cc-dial-ring">
                            <small>CLAUDE</small>
                            <strong>{t('carousel.connect')}</strong>
                            <span>{t('carousel.inSettings')}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="carousel-footer-bar">
                      <strong className="carousel-layout-name">
                        {t(`layout.${HOME_LAYOUTS[homeLayoutIndex].id}`)}
                      </strong>
                      <span className="carousel-layout-counter">
                        {homeLayoutIndex + 1} / {HOME_LAYOUTS.length}
                      </span>
                      <button
                        type="button"
                        className="carousel-font-apps-btn"
                        onClick={() => {
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                          setIslandOverlay(null);
                          setActiveTab('home');
                          setIsCustomizingClock(true);
                        }}
                      >
                        {t('carousel.fontAndApps')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={activeTab} className="tab-stage-enter">
                    {/* ============================================================
                        1. HOME TAB (Supports Clock / Grid / Dial / Minimal + Clock Customizer)
                        ============================================================ */}
                    {activeTab === 'home' && (
                      <div className={`home-view ${isCustomizingClock ? 'is-clock-customizing' : ''}`}>
                        <HeroClock
                          timeStr={clockDisplay.time}
                          suffix={clockDisplay.suffix}
                          fontIndex={clockFontIndex}
                          color={effectiveClockColor}
                          scale={clockScale}
                          onClick={() => {
                            if (isCustomizingClock) setShowClockAdvanced(false);
                            setIsCustomizingClock((value) => !value);
                          }}
                        />

                        {isCustomizingClock ? (
                          <div className="clock-customizer-panel">
                            <div className="customizer-row-top">
                              <div className="clock-font-pills">
                                {[
                                  { idx: 0, cls: 'font-serif-bold' },
                                  { idx: 1, cls: 'font-condensed' },
                                  { idx: 2, cls: 'font-editorial' },
                                  { idx: 3, cls: 'font-mono-dot' },
                                  { idx: 4, cls: 'font-script' },
                                ].map((f) => (
                                  <button
                                    key={f.idx}
                                    type="button"
                                    className={`font-preview-pill ${f.cls} ${clockFontIndex === f.idx ? 'is-selected' : ''
                                      }`}
                                    style={{ fontFamily: CLOCK_FONT_FAMILIES[f.idx] }}
                                    onClick={() => setClockFontIndex(f.idx)}
                                  >
                                    12
                                  </button>
                                ))}
                              </div>

                              <div className="clock-size-control">
                                <input
                                  type="range"
                                  min="0.78"
                                  max="1.12"
                                  step="0.01"
                                  value={clockScale}
                                  onChange={(e) => setClockScale(parseFloat(e.target.value))}
                                  className="clock-size-slider"
                                  aria-label={t('customizer.clockSize')}
                                />
                                <button type="button" className="clock-size-value" title={t('customizer.resetSize')} onClick={() => setClockScale(1)}>
                                  {Math.round(clockScale * 100)}%
                                </button>
                              </div>
                            </div>

                            <div className="customizer-row-bottom">
                              <div className="clock-color-swatches">
                                {CLOCK_COLORS.map((hex) => (
                                  <button
                                    key={hex}
                                    type="button"
                                    className={`color-swatch-circle ${userPickedClockColor && clockColor === hex
                                      ? 'is-selected'
                                      : ''
                                      }`}
                                    style={{ background: hex }}
                                    aria-label={t('customizer.clockColor', { hex })}
                                    aria-pressed={userPickedClockColor && clockColor === hex}
                                    onClick={() => {
                                      setClockColor(hex);
                                      setUserPickedClockColor(true);
                                    }}
                                  />
                                ))}
                                <button
                                  type="button"
                                  className={`color-swatch-circle rainbow-wheel ${!userPickedClockColor ? 'is-selected' : ''
                                    }`}
                                  onClick={() => {
                                    setUserPickedClockColor(false);
                                    setClockColor('#7ea6d8');
                                  }}
                                  title={t('customizer.coverAdaptive')}
                                  aria-label={t('customizer.coverAdaptive')}
                                />
                                <label className={`color-swatch-custom ${userPickedClockColor && !CLOCK_COLORS.includes(clockColor) ? 'is-selected' : ''}`} title={t('customizer.pickCustomColor')}>
                                  <input
                                    type="color"
                                    value={clockColor}
                                    aria-label={t('customizer.pickCustomColorAria')}
                                    onChange={(event) => {
                                      setClockColor(event.target.value);
                                      setUserPickedClockColor(true);
                                    }}
                                  />
                                  <span>＋</span>
                                </label>
                              </div>

                              <div className="customizer-actions">
                                <button
                                  type="button"
                                  className={`customizer-advanced-btn ${showClockAdvanced ? 'is-open' : ''}`}
                                  aria-expanded={showClockAdvanced}
                                  onClick={() => setShowClockAdvanced((value) => !value)}
                                  title={t('customizer.detailsTitle')}
                                >
                                  <Settings size={14} />
                                  <span>{t('customizer.details')}</span>
                                </button>
                                <button
                                  type="button"
                                  className="customizer-add-app-btn"
                                  onClick={() => handleAddShortcut()}
                                  title={t('customizer.addApp')}
                                  aria-label={t('customizer.addApp')}
                                >
                                  <Plus size={17} />
                                </button>
                                <button
                                  type="button"
                                  className="customizer-done-btn"
                                  onClick={() => {
                                    setShowClockAdvanced(false);
                                    setIsCustomizingClock(false);
                                  }}
                                >
                                  {t('customizer.done')}
                                </button>
                              </div>
                            </div>

                            {showClockAdvanced && (
                              <div className="clock-advanced-options">
                                <span>{t('customizer.clockFormat')}</span>
                                <div className="clock-time-options" aria-label={t('customizer.clockFormat')}>
                                  <button
                                    type="button"
                                    className={clock24Hour ? 'is-selected' : ''}
                                    aria-pressed={clock24Hour}
                                    onClick={() => setClock24Hour(true)}
                                  >{t('customizer.24h')}</button>
                                  <button
                                    type="button"
                                    className={!clock24Hour ? 'is-selected' : ''}
                                    aria-pressed={!clock24Hour}
                                    onClick={() => setClock24Hour(false)}
                                  >{t('customizer.12h')}</button>
                                  <button
                                    type="button"
                                    className={clockShowSeconds ? 'is-selected' : ''}
                                    aria-pressed={clockShowSeconds}
                                    onClick={() => setClockShowSeconds((value) => !value)}
                                  >{t('customizer.seconds')}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <HomeLiveAndContextStrip
                              liveActivity={liveActivity}
                              appContext={appContext}
                              onOpenMirror={() => setIslandOverlay('mirror')}
                            />
                            <div className="home-cards-row">
                              {/* Left Card: Bedo Live Liquid Glass Quick Card */}
                              <div
                                className={`home-card jobs-card bedo-home-card ${bedoStatus.paused ? 'is-sleeping' : `tone-${bedoStatus.jarvisState === 'SPEAKING' ? 'speaking' : bedoStatus.jarvisState === 'THINKING' ? 'thinking' : 'listening'}`}`}
                                onClick={() => {
                                  if (bedoStatus.paused) {
                                    lastBedoWakeAtRef.current = Date.now();
                                    window.twocode?.bedoSetPaused?.(false);
                                    setRoboMood('listening');
                                    triggerRoboReaction('happy', 5, 1100);
                                    playRoboSound('curious', islandSettings.soundEffects !== false);
                                  } else {
                                    playRoboSound('tap', islandSettings.soundEffects !== false);
                                  }
                                  setSelectedAiProvider('Bedo');
                                  setActiveTab('robo');
                                }}
                                title="Bedo"
                              >
                                <div className="bedo-home-orb" aria-hidden="true">
                                  <RoboEyes
                                    mood={bedoStatus.paused ? 'sleepy' : roboMood}
                                    reaction={roboReaction}
                                    micLevel={bedoMicLevel}
                                    showMouth={true}
                                    size="mini"
                                    trackCursor={false}
                                    blinkingEnabled={islandSettings.blinkingEnabled !== false}
                                    outfit={islandSettings.outfit || 'Best'}
                                    seasonalOutfits={Boolean(islandSettings.seasonalOutfits)}
                                    active={documentVisible && islandMode === 'expanded' && activeTab === 'home'}
                                  />
                                </div>
                                <div className="home-card-meta">
                                  <strong className="bedo-home-name">Bedo</strong>
                                  <span className="home-card-sub bedo-home-status">
                                    {bedoStatus.paused
                                      ? 'Uyku Modu'
                                      : bedoStatus.jarvisState === 'SPEAKING'
                                        ? 'Konuşuyor'
                                        : bedoStatus.jarvisState === 'THINKING'
                                          ? 'Düşünüyor'
                                          : 'Dinliyor'}
                                  </span>
                                </div>
                                <span className="bedo-home-chevron" aria-hidden="true">
                                  <ChevronRight size={14} strokeWidth={2.1} />
                                </span>
                              </div>

                              {/* Middle Card: Live Windows Media with crimson placeholder & ambient color */}
                              <div
                                className={`home-card media-mini-card ${musicAccent.hasColor ? 'tinted-media-card' : ''
                                  } ${!currentMedia.hasSession ? 'is-nothing-playing' : ''} ${!currentMedia.hasSession && showMusicServicePicker
                                    ? 'service-picker-open'
                                    : ''
                                  }`}
                                onClick={() => {
                                  if (!currentMedia.hasSession) {
                                    playRoboSound('tap', islandSettings.soundEffects !== false);
                                    setShowMusicServicePicker((p) => !p);
                                  } else {
                                    setActiveTab('music');
                                  }
                                }}
                                title={
                                  !currentMedia.hasSession
                                    ? t('home.startMusicHint')
                                    : t('home.openMusicView')
                                }
                              >
                                {!currentMedia.hasSession && showMusicServicePicker ? (
                                  <div
                                    className="music-service-picker-row"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="music-service-logo-btn spotify-btn"
                                      onClick={(e) => handleLaunchMusicService(e, 'spotify')}
                                      title={t('home.openSpotify')}
                                    >
                                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="11" fill="#1ED760" />
                                        <path
                                          d="M16.9 10.6C13.9 8.8 8.9 8.6 6.1 9.5C5.6 9.6 5.1 9.4 5 8.9C4.9 8.4 5.1 7.9 5.6 7.8C8.9 6.8 14.4 7 17.9 9.1C18.3 9.3 18.5 9.9 18.2 10.3C18 10.7 17.4 10.9 16.9 10.6ZM16.8 13.5C16.6 13.9 16.1 14 15.7 13.7C13.2 12.2 9.4 11.7 6.5 12.6C6.1 12.7 5.6 12.5 5.5 12.1C5.4 11.7 5.6 11.2 6 11.1C9.4 10.1 13.6 10.6 16.5 12.4C16.9 12.6 17 13.1 16.8 13.5ZM15.5 16.3C15.3 16.6 14.9 16.7 14.6 16.5C12.4 15.2 9.7 14.9 6.6 15.6C6.3 15.7 5.9 15.5 5.8 15.1C5.7 14.8 5.9 14.4 6.3 14.3C9.8 13.5 12.8 13.8 15.3 15.3C15.6 15.5 15.7 16 15.5 16.3Z"
                                          fill="#000000"
                                        />
                                      </svg>
                                      <span>Spotify</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="music-service-logo-btn ytmusic-btn"
                                      onClick={(e) => handleLaunchMusicService(e, 'ytmusic')}
                                      title={t('home.openYtMusic')}
                                    >
                                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="11" fill="#FF0033" />
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="6.2"
                                          stroke="#FFFFFF"
                                          strokeWidth="1.4"
                                        />
                                        <polygon points="10.4,9.3 15.2,12 10.4,14.7" fill="#FFFFFF" />
                                      </svg>
                                      <span>YT Music</span>
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    {currentMedia.thumbnail ? (
                                      <img
                                        src={currentMedia.thumbnail}
                                        alt=""
                                        className="mini-card-cover"
                                        onClick={currentMedia.hasSession ? handleOpenMediaSource : undefined}
                                        title={currentMedia.hasSession ? t('home.openMediaSource') : undefined}
                                        style={currentMedia.hasSession ? { cursor: 'pointer' } : undefined}
                                      />
                                    ) : (
                                      <div
                                        className="mini-card-cover crimson-placeholder-cover"
                                        onClick={currentMedia.hasSession ? handleOpenMediaSource : undefined}
                                        title={currentMedia.hasSession ? t('home.openMediaSource') : undefined}
                                        style={currentMedia.hasSession ? { cursor: 'pointer' } : undefined}
                                      />
                                    )}
                                    <div className="home-card-meta truncate">
                                      <strong className="home-card-title">
                                        {currentMedia.title}
                                      </strong>
                                      {currentMedia.hasSession && currentMedia.artist && (
                                        <span className="home-card-sub">
                                          {currentMedia.artist}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className={`circle-white-btn ${!currentMedia.hasSession ? 'nothing-play-btn' : ''
                                        }`}
                                      onClick={handlePlayPause}
                                      aria-label="Play or Pause"
                                    >
                                      {currentMedia.isPlaying ? (
                                        <Pause size={13} fill="#ffffff" color="#ffffff" strokeWidth={2.2} />
                                      ) : (
                                        <Play
                                          size={13}
                                          fill="#ffffff"
                                          color="#ffffff"
                                          strokeWidth={2.2}
                                          style={{ marginLeft: 1 }}
                                        />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Right Card: Focus Timer */}
                              <div
                                className="home-card focus-mini-card"
                                onClick={() => setActiveTab('timer')}
                                title={t('home.openFocusTimer')}
                              >
                                <div className="home-card-meta">
                                  <strong className="home-card-big mono">
                                    {formatTimerBig(timerSeconds)}
                                  </strong>
                                  <span className="home-card-sub">
                                    {timerRunning ? t('home.focusRunning') : t('home.focusReady')}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="circle-white-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playRoboSound('tap', islandSettings.soundEffects !== false);
                                    setTimerRunning((r) => !r);
                                  }}
                                  aria-label={t('home.startOrPauseFocus')}
                                >
                                  {timerRunning ? (
                                    <Pause size={14} fill="#ffffff" color="#ffffff" strokeWidth={2.2} />
                                  ) : (
                                    <Play
                                      size={14}
                                      fill="#ffffff"
                                      color="#ffffff"
                                      strokeWidth={2.2}
                                      style={{ marginLeft: 1 }}
                                    />
                                  )}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {activeTab === 'drop' && <DropShareTab />}

                    {/* ============================================================
                        2. CODEX / CLAUDE TAB
                        ============================================================ */}
                    {activeTab === 'code' && (
                      <div className="codex-view">
                        <div className="codex-left-col">
                          <div
                            className="codex-giant-eyes"
                            onClick={() => playRoboSound('happy', islandSettings.soundEffects !== false)}
                            title="Robo"
                          >
                            <span className="giant-eye" />
                            <span className="giant-eye" />
                          </div>
                          {activeThinkingCount > 0 && (
                            <span className="codex-active-badge">
                              <i />
                              {t('agents.activeCount', { count: activeThinkingCount })}
                            </span>
                          )}
                          <div className="codex-jobs-counter">{jobsToday}</div>
                          <div className="codex-jobs-label">
                            <i className="codex-white-sq" />
                            <span>{t('agents.jobsToday')}</span>
                          </div>
                          {agentBreakdown.total > 0 && (
                            <div
                              className="codex-breakdown-bar"
                              title={agentBreakdown.items.map((b) => `${b.label}: ${b.count}`).join(' · ')}
                            >
                              {agentBreakdown.items.map((b) => (
                                <span
                                  key={b.key}
                                  style={{
                                    width: `${(b.count / agentBreakdown.total) * 100}%`,
                                    background: b.color,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="codex-right-col">
                          <div className="codex-header-row">
                            <h3 className="codex-title" title={t('agents.titleTooltip')}>{t('agents.title')}</h3>
                            <div className="codex-header-actions">
                              {pendingApproval ? (
                                <div className="approval-inline-btns">
                                  <button type="button" className="btn-allow-sm" onClick={() => handleApprovalDecision(true)}>{t('agents.allow')}</button>
                                  <button type="button" className="btn-deny-sm" onClick={() => handleApprovalDecision(false)}>{t('agents.deny')}</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="codex-bridge-pill"
                                  onClick={() => window.twocode?.openSettingsWindow?.('agents')}
                                  title={t('agents.bridgeTooltip')}
                                >
                                  <span className={`bridge-dot ${agentIntegration.codexConnected ? 'is-on' : ''}`} />
                                  <span>Codex</span>
                                  <span className={`bridge-dot ${agentIntegration.antigravityConnected ? 'is-on' : ''}`} />
                                  <span>Antigravity</span>
                                </button>
                              )}
                            </div>
                          </div>
                          {pendingApproval && (pendingApproval.command || pendingApproval.file || pendingApproval.title) && (
                            <div className="codex-approval-banner">
                              <strong>{t('agents.wantsApproval', { agent: pendingApproval.agent || 'Agent' })}</strong>
                              <span>{pendingApproval.command || pendingApproval.file || pendingApproval.title}</span>
                            </div>
                          )}
                          <div className="codex-recently-card">
                            <div className="recently-heading-row">
                              <span className="recently-heading">{t('agents.activityHeading')}</span>
                              {selectedAgentJob ? (
                                <button
                                  type="button"
                                  className="recently-back-btn"
                                  onClick={() => setSelectedAgentJobId(null)}
                                >
                                  {t('agents.backToList')}
                                </button>
                              ) : agentBreakdown.items.length > 1 ? (
                                <div className="codex-filter-pills">
                                  <button
                                    type="button"
                                    className={`codex-filter-pill ${agentFilter === 'all' ? 'is-active' : ''}`}
                                    onClick={() => setAgentFilter('all')}
                                  >
                                    {t('agents.all')}
                                  </button>
                                  {agentBreakdown.items.map((b) => (
                                    <button
                                      key={b.key}
                                      type="button"
                                      className={`codex-filter-pill ${agentFilter === b.key ? 'is-active' : ''}`}
                                      onClick={() => setAgentFilter(b.key)}
                                    >
                                      {b.label === 'Antigravity' ? 'AGY' : b.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {selectedAgentJob ? (
                              <div className="recently-detail-box">
                                <div className="recently-detail-meta">
                                  <span>{selectedAgentJob.agent || 'Agent'}</span>
                                  <span>{selectedAgentJob.time}</span>
                                </div>
                                <p className="recently-detail-text">
                                  {selectedAgentJob.detail || selectedAgentJob.title}
                                </p>
                                {(selectedAgentJob.command || selectedAgentJob.file) && (
                                  <div className="recently-detail-context">
                                    <code>{selectedAgentJob.command || selectedAgentJob.file}</code>
                                  </div>
                                )}
                                <div className="recently-detail-actions">
                                  <button
                                    type="button"
                                    className="recently-action-btn"
                                    onClick={() => {
                                      const text = selectedAgentJob.detail || selectedAgentJob.title || '';
                                      navigator.clipboard?.writeText(text);
                                      setCopiedAgentJobId(selectedAgentJob.id);
                                      setTimeout(() => setCopiedAgentJobId(null), 1400);
                                    }}
                                    >
                                      {copiedAgentJobId === selectedAgentJob.id ? t('agents.copied') : t('agents.copy')}
                                    </button>
                                    <button
                                      type="button"
                                      className="recently-action-btn"
                                      onClick={() => window.twocode?.focusAgentWindow?.({
                                        agent: selectedAgentJob.agent,
                                        file: selectedAgentJob.file,
                                        title: selectedAgentJob.title,
                                      })}
                                    >
                                      {t('agents.goToWindow')}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="recently-list">
                                  {filteredAgentJobs.length === 0 ? (
                                    <div className="recently-row">
                                      <span className="recently-prompt-text" style={{ opacity: 0.5 }}>
                                        {agentIntegration.codexConnected || agentIntegration.antigravityConnected
                                          ? t('agents.emptyConnected')
                                          : t('agents.emptyDisconnected')}
                                      </span>
                                    </div>
                                  ) : (
                                    filteredAgentJobs.slice(0, 4).map((job) => {
                                      const elapsedSec = job.type === 'thinking' && job.timestamp
                                        ? Math.max(0, Math.floor((agentNowTick - job.timestamp) / 1000))
                                        : null;
                                      return (
                                        <button
                                          key={job.id}
                                          type="button"
                                          className="recently-row recently-row-btn"
                                          onClick={() => setSelectedAgentJobId(job.id)}
                                          title={t('agents.viewDetail')}
                                        >
                                          <span className={`recently-check-circle ${job.type === 'thinking' ? 'is-agent-thinking' : job.type === 'error' ? 'is-agent-error' : job.type === 'interrupted' ? 'is-agent-interrupted' : ''}`}>
                                            {job.type === 'thinking' ? <i /> : job.type === 'error' ? <span>!</span> : <Check size={11} strokeWidth={3.2} color="#000000" />}
                                          </span>
                                          <span className="recently-prompt-wrap">
                                            <span className="recently-prompt-text">{job.title}</span>
                                            {(job.command || job.file) && (
                                              <span className="recently-sub-meta">{job.command || job.file}</span>
                                            )}
                                          </span>
                                          <span className="recently-time">
                                            {job.agent} · {job.type === 'thinking' ? `${t('agents.thinking')}${elapsedSec !== null ? ` · ${elapsedSec}s` : ''}` : job.type === 'error' ? t('agents.error') : job.type === 'interrupted' ? t('agents.interrupted') : job.time}
                                          </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============================================================
                        3. MUSIC TAB (Live Cover Art + Karaoke Lyrics + Dynamic Color)
                        ============================================================ */}
                    {activeTab === 'music' && (
                      <MusicTabView
                        currentMedia={currentMedia}
                        active={islandMode === 'expanded' && activeTab === 'music'}
                        hasSyncedLyrics={hasSyncedLyrics}
                        activeLyricIndex={activeLyricIndex}
                        primaryLine={primaryLine}
                        secondaryLine={secondaryLine}
                        showMusicServicePicker={showMusicServicePicker}
                        setShowMusicServicePicker={setShowMusicServicePicker}
                        showPlayOnPopover={showPlayOnPopover}
                        setShowPlayOnPopover={setShowPlayOnPopover}
                        onOpenMediaSource={handleOpenMediaSource}
                        onLaunchMusicService={handleLaunchMusicService}
                        onPrev={handlePrev}
                        onPlayPause={handlePlayPause}
                        onNext={handleNext}
                        onSeek={(sec) => window.twocode?.mediaControl?.('seek', sec)}
                        onInteractionStart={() => {
                          suppressHoverCollapseUntilRef.current = Date.now() + 2000;
                        }}
                        soundEffectsEnabled={islandSettings.soundEffects !== false}
                        t={t}
                      />
                    )}

                    {/* ============================================================
                        4. ROBO TAB
                        ============================================================ */}
                    {activeTab === 'robo' && (
                      <BedoStage
                        status={bedoStatus}
                        systemMicMuted={systemMicMuted}
                        webcamFrame={bedoWebcamFrame}
                        micLevel={bedoMicLevel}
                        roboMood={roboMood}
                        roboReaction={roboReaction}
                        outfit={islandSettings.outfit || 'Crown'}
                        seasonalOutfits={Boolean(islandSettings.seasonalOutfits)}
                        blinkingEnabled={islandSettings.blinkingEnabled !== false}
                        documentVisible={documentVisible}
                        userTranscript={bedoUserTranscript}
                        reply={roboReply}
                        loading={roboLoading && !bedoStatus.paused}
                        question={roboQuestion}
                        onQuestionChange={setRoboQuestion}
                        onSubmit={() => submitRoboPrompt()}
                        onToggleMute={() => window.twocode?.bedoSetMuted?.(!bedoStatus.muted)}
                        onTogglePause={() => window.twocode?.bedoSetPaused?.(!bedoStatus.paused)}
                        onToggleWebcam={() => window.twocode?.bedoSetWebcam?.(!bedoStatus.webcamActive)}
                        onStartBuddy={() => window.twocode?.startBedoBuddy?.()}
                        onCopyReply={() => {
                          if (roboReply) window.twocode?.copyText(roboReply);
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                        }}
                        onClearReply={() => {
                          setRoboReply(null);
                          setBedoUserTranscript('');
                        }}
                        onPokeEyes={() => {
                          triggerRoboReaction('happy', 3, 1200);
                          playRoboSound('happy', islandSettings.soundEffects !== false);
                        }}
                      />
                    )}

                    {/* ============================================================
                        5. FOCUS TAB
                        ============================================================ */}
                    {activeTab === 'timer' && (
                      <div className="focus-tab-view">
                        <div className="focus-top-row">
                          <div className="focus-time-col">
                            <HeroClock
                              timeStr={formatTimerBig(timerSeconds)}
                              fontIndex={clockFontIndex}
                              color="#ffffff"
                              size="focus"
                            />
                            <span className="focus-done-at">{t('focus.doneAt', { time: doneAtTimeStr })}</span>
                          </div>

                          {timerRunning ? (
                            <div className="focus-running-actions">
                              <button
                                type="button"
                                className="focus-secondary-btn"
                                onClick={() => {
                                  playRoboSound('tap', islandSettings.soundEffects !== false);
                                  setFocusMinutes((m) => Math.min(60, m + 5));
                                  setTimerSeconds((s) => s + 5 * 60);
                                }}
                              >
                                {t('focus.add5Min')}
                              </button>
                              <button
                                type="button"
                                className="focus-secondary-btn"
                                onClick={() => {
                                  playRoboSound('tap', islandSettings.soundEffects !== false);
                                  setTimerRunning(false);
                                  setTimerSeconds(focusMinutes * 60);
                                }}
                              >
                                {t('focus.stop')}
                              </button>
                              <button
                                type="button"
                                className="focus-start-btn"
                                onClick={() => {
                                  playRoboSound('tap', islandSettings.soundEffects !== false);
                                  setTimerRunning(false);
                                }}
                              >
                                {t('focus.pause')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="focus-start-btn"
                              onClick={() => {
                                playRoboSound('focused', islandSettings.soundEffects !== false);
                                setTimerRunning(true);
                              }}
                            >
                              {t('focus.start')}
                            </button>
                          )}
                        </div>

                        <div
                          ref={rulerRef}
                          className="focus-ruler-container"
                          onMouseDown={(e) => {
                            setIsDraggingRuler(true);
                            updateRulerMinutes(e.clientX);
                          }}
                        >
                          <div className="focus-ruler-ticks">
                            {Array.from({ length: 61 }, (_, m) => {
                              const isMajor = m % 10 === 0;
                              const isSelected = m === focusMinutes;
                              return (
                                <div
                                  key={m}
                                  className={`ruler-tick-wrap ${isMajor ? 'major' : 'minor'} ${isSelected ? 'selected' : ''
                                    }`}
                                >
                                  <span className="ruler-tick-line" />
                                </div>
                              );
                            })}
                          </div>
                          <div className="focus-ruler-labels">
                            {[0, 10, 20, 30, 40, 50, 60].map((num) => (
                              <span key={num}>{num}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============================================================
                        6. MODES TAB
                        ============================================================ */}
                    {activeTab === 'sleep' && (
                      <div className="modes-tab-view">
                        <div className="modes-sidebar">
                          {MODE_OPTIONS.map((m) => {
                            const MIcon = m.icon;
                            const active = selectedModeName === m.id;
                            const modeLabel = t(`mode.${m.id === 'Serbest' ? 'Free' : m.id}`);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={`mode-side-btn ${active ? 'is-active' : ''}`}
                                style={{ '--mode-color': m.color }}
                                onClick={() => handleSelectMode(m.id)}
                              >
                                <MIcon size={15} strokeWidth={2} />
                                <span>{modeLabel}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="modes-main-panel">
                          <div className="modes-profile-header">
                            <div className="mode-profile-icon"><ActiveModeIcon size={17} strokeWidth={2.1} /></div>
                            <div className="mode-profile-copy">
                              <strong>{t(`mode.${selectedModeName === 'Serbest' ? 'Free' : selectedModeName}`)}</strong>
                              <span>{activeModeSummary}</span>
                            </div>
                            <span className="mode-active-indicator"><i /> {t('modes.active')}</span>
                          </div>

                          <div className="modes-toggles-list">
                            <div className="mode-toggle-row">
                              <div className="mode-toggle-left">
                                <Shield size={14} className="mode-row-icon" />
                                <span>{t('modes.blockSocial')}</span>
                              </div>
                              <button
                                type="button"
                                className={`ios-switch ${modeToggles.blockSocial ? 'on' : 'off'}`}
                                onClick={() =>
                                  setModeToggles((t) => ({ ...t, blockSocial: !t.blockSocial }))
                                }
                              >
                                <span className="ios-switch-thumb" />
                              </button>
                            </div>

                            <div className="mode-toggle-row">
                              <div className="mode-toggle-left">
                                <Bell size={14} className="mode-row-icon" />
                                <span>{t('modes.onlyClaude')}</span>
                              </div>
                              <button
                                type="button"
                                className={`ios-switch ${modeToggles.onlyClaude ? 'on' : 'off'}`}
                                onClick={() =>
                                  setModeToggles((t) => ({ ...t, onlyClaude: !t.onlyClaude }))
                                }
                              >
                                <span className="ios-switch-thumb" />
                              </button>
                            </div>

                            <div className="mode-toggle-row">
                              <div className="mode-toggle-left">
                                <Music size={14} className="mode-row-icon" />
                                <span>{t('modes.keepMusic')}</span>
                              </div>
                              <button
                                type="button"
                                className={`ios-switch ${modeToggles.keepMusic ? 'on' : 'off'}`}
                                onClick={() =>
                                  setModeToggles((t) => ({ ...t, keepMusic: !t.keepMusic }))
                                }
                              >
                                <span className="ios-switch-thumb" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ============================================================
                        8. CLIPS TAB (Minimal Glassmorphism + Image & Text Clips)
                        ============================================================ */}
                    {activeTab === 'clips' && (
                      <div className="clips-glass-stage">
                        {clipPreview ? (
                          <div className="note-glass-card">
                            <div className="note-glass-lightbox">
                              <img
                                src={clipPreview.thumb}
                                alt={t('clips.copiedImageAlt')}
                                className="note-lightbox-img"
                              />
                              <div className="note-lightbox-bar">
                                <span className="note-lightbox-name">
                                  {clipPreview.dims || t('clips.image')} · {clipPreview.time}
                                </span>
                                <div className="note-lightbox-btns">
                                  <button
                                    type="button"
                                    className="note-glass-orb"
                                    onClick={() => handleCopyClip(clipPreview)}
                                    title={t('clips.copyImage')}
                                    aria-label={t('clips.copyImage')}
                                  >
                                    {copiedId === clipPreview.id ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="note-glass-orb"
                                    onClick={() => setClipPreview(null)}
                                    title={t('common.close')}
                                    aria-label={t('clips.closePreview')}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="clips-glass-topbar">
                              <div className="clips-glass-filters">
                                <button
                                  type="button"
                                  className={`clips-filter-pill ${clipsFilter === 'all' ? 'is-active' : ''}`}
                                  onClick={() => setClipsFilter('all')}
                                >
                                  {t('clips.all')}
                                </button>
                                <button
                                  type="button"
                                  className={`note-glass-orb ${clipsFilter === 'image' ? 'is-active' : ''}`}
                                  onClick={() => setClipsFilter('image')}
                                  title={t('clips.images')}
                                  aria-label={t('clips.images')}
                                >
                                  <span className="clips-apple-emoji"><NotificationText text="🖼️" /></span>
                                </button>
                                <button
                                  type="button"
                                  className={`note-glass-orb ${clipsFilter === 'text' ? 'is-active' : ''}`}
                                  onClick={() => setClipsFilter('text')}
                                  title={t('clips.texts')}
                                  aria-label={t('clips.texts')}
                                >
                                  <span className="clips-apple-emoji"><NotificationText text="📝" /></span>
                                </button>
                              </div>

                              {clips.length > 0 && (
                                <button
                                  type="button"
                                  className="note-glass-orb is-danger"
                                  onClick={() => {
                                    setClips([]);
                                    setClipPreview(null);
                                    window.twocode?.clearClips?.();
                                  }}
                                  title={t('common.clear')}
                                  aria-label={t('clips.clearClipboard')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>

                            {(() => {
                              const visibleClips = clips.filter((c) => {
                                const kind = c.kind || 'text';
                                return clipsFilter === 'all' || kind === clipsFilter;
                              });
                              if (visibleClips.length === 0) {
                                return (
                                  <div className="clips-glass-empty">
                                    <span className="clips-empty-emoji"><NotificationText text="📋" /></span>
                                    <span>{t('clips.empty')}</span>
                                  </div>
                                );
                              }
                              return (
                                <div className="clips-glass-list">
                                  {visibleClips.map((c) => {
                                    const isImage = c.kind === 'image' && c.thumb;
                                    const isCopied = copiedId === c.id;
                                    if (isImage) {
                                      return (
                                        <div
                                          key={c.id}
                                          className={`clips-glass-card is-image ${isCopied ? 'is-copied' : ''}`}
                                        >
                                          <button
                                            type="button"
                                            className="clips-image-open"
                                            onClick={() => setClipPreview(c)}
                                            title={t('clips.enlarge')}
                                          >
                                            <img src={c.thumb} alt="" className="clips-glass-thumb" />
                                            <div className="clips-image-meta">
                                              <span className="clips-image-dims">{c.dims || t('clips.image')}</span>
                                              <span className="clips-glass-time">{c.time}</span>
                                            </div>
                                          </button>
                                          <button
                                            type="button"
                                            className="note-glass-orb"
                                            onClick={() => handleCopyClip(c)}
                                            title={t('clips.copyImage')}
                                            aria-label={t('clips.copyImage')}
                                          >
                                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                          </button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        className={`clips-glass-card ${isCopied ? 'is-copied' : ''}`}
                                        onClick={() => handleCopyClip(c)}
                                      >
                                        <span className="clips-glass-text">{c.text}</span>
                                        <span className={`clips-glass-time ${isCopied ? 'is-copied' : ''}`}>
                                          {isCopied ? <Check size={12} /> : c.time}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    )}

                    {/* ============================================================
                        9. NOTE TAB (Minimal Glassmorphism Pockets)
                        ============================================================ */}
                    {activeTab === 'notes' && (
                      <div
                        className={`note-glass-stage ${noteDragOver ? 'is-drag-over' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setNoteDragOver(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setNoteDragOver(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setNoteDragOver(false);
                          if (e.dataTransfer?.files?.length) {
                            handleNoteFiles(e.dataTransfer.files);
                          }
                        }}
                      >
                        <input
                          ref={noteFileInputRef}
                          type="file"
                          multiple
                          className="note-hidden-file-input"
                          onChange={(e) => {
                            handleNoteFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />

                        <div className="note-glass-topbar">
                          <div className="note-glass-dots">
                            {notesList.map((n, idx) => (
                              <button
                                key={n.id}
                                type="button"
                                className={`note-color-dot ${idx === activeNoteIndex ? 'is-active' : ''}`}
                                style={{ '--dot-color': n.color }}
                                onClick={() => {
                                  setActiveNoteIndex(idx);
                                  setNoteSummaryOpen(false);
                                  setNotePreviewAtt(null);
                                  setTimeout(() => noteTextareaRef.current?.focus(), 30);
                                }}
                                aria-label={`Not ${idx + 1}`}
                              />
                            ))}
                            <button
                              type="button"
                              className="note-glass-orb"
                              onClick={addNotePocket}
                              title={t('notes.newNote')}
                              aria-label={t('notes.newNote')}
                            >
                              <Plus size={13} />
                            </button>
                            {noteStatusHint && (
                              <span className="note-status-pill">{noteStatusHint}</span>
                            )}
                          </div>

                          <div className="note-glass-actions">
                            <button
                              type="button"
                              className={`note-glass-orb ${noteRecording ? 'is-recording' : ''} ${noteTranscribing ? 'is-transcribing' : ''}`}
                              onClick={toggleNoteVoice}
                              title={noteRecording ? t('notes.stopRecording') : noteTranscribing ? t('notes.transcribing') : t('notes.voiceNote')}
                              aria-label={t('notes.voiceNote')}
                            >
                              {noteRecording ? (
                                <span className="note-voice-waves" aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </span>
                              ) : noteTranscribing ? (
                                <RotateCw size={12} className="note-spin-icon" />
                              ) : (
                                <Mic size={13} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="note-glass-orb"
                              onClick={() => noteFileInputRef.current?.click()}
                              title={t('notes.attachFile')}
                              aria-label={t('notes.attachFile')}
                            >
                              <Paperclip size={13} />
                            </button>
                            <button
                              type="button"
                              className={`note-glass-orb ${noteSummaryOpen ? 'is-active' : ''}`}
                              onClick={() => setNoteSummaryOpen((v) => !v)}
                              title={t('notes.summarize')}
                              aria-label={t('notes.summarize')}
                            >
                              <AlignLeft size={13} />
                            </button>
                            <button
                              type="button"
                              className="note-glass-orb"
                              onClick={() => {
                                if (!activeNote?.text) return;
                                if (window.twocode?.copyText) {
                                  window.twocode.copyText(activeNote.text);
                                } else {
                                  navigator.clipboard?.writeText?.(activeNote.text).catch(() => {});
                                }
                                setNoteCopied(true);
                                setTimeout(() => setNoteCopied(false), 1200);
                              }}
                              title={t('notes.copy')}
                              aria-label={t('notes.copy')}
                            >
                              {noteCopied ? <Check size={13} /> : <Copy size={12} />}
                            </button>
                            {(activeNote?.text || (activeNote?.attachments?.length || 0) > 0 || notesList.length > 1) && (
                              <button
                                type="button"
                                className="note-glass-orb is-danger"
                                onClick={deleteActiveNotePocket}
                                title={t('common.delete')}
                                aria-label={t('notes.deleteNote')}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="note-glass-card">
                          {notePreviewAtt ? (
                            <div className="note-glass-lightbox">
                              <img
                                src={notePreviewAtt.thumb}
                                alt={notePreviewAtt.name}
                                className="note-lightbox-img"
                              />
                              <div className="note-lightbox-bar">
                                <span className="note-lightbox-name">{notePreviewAtt.name}</span>
                                <div className="note-lightbox-btns">
                                  <button
                                    type="button"
                                    className="note-glass-orb"
                                    onClick={() => copyNoteAttachment(notePreviewAtt)}
                                    title={t('clips.copyImage')}
                                    aria-label={t('clips.copyImage')}
                                  >
                                    {noteAttCopiedId === notePreviewAtt.id ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="note-glass-orb"
                                    onClick={() => window.twocode?.openNoteAttachment?.({ path: notePreviewAtt.path || '', thumb: notePreviewAtt.thumb || '' })}
                                    title={t('notes.openExternal')}
                                    aria-label={t('notes.openExternal')}
                                  >
                                    <ExternalLink size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="note-glass-orb"
                                    onClick={() => setNotePreviewAtt(null)}
                                    title={t('common.close')}
                                    aria-label={t('clips.closePreview')}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : noteSummaryOpen ? (
                            <div className="note-glass-summary">
                              {noteSummaryLines.length > 0 ? (
                                noteSummaryLines.map((line, i) => (
                                  <div key={i} className="note-summary-line">
                                    <span className="note-summary-bullet" style={{ background: activeNote?.color || '#38BDF8' }} />
                                    <span><NotificationText text={line} /></span>
                                  </div>
                                ))
                              ) : (
                                <span className="note-glass-empty">{t('notes.noTextToSummarize')}</span>
                              )}
                            </div>
                          ) : (
                            <textarea
                              ref={noteTextareaRef}
                              className="note-glass-textarea"
                              placeholder={t('notes.placeholder')}
                              value={activeNote?.text || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateActiveNote((n) => ({ ...n, text: val }));
                              }}
                              aria-label={t('notes.contentAria')}
                            />
                          )}

                          {!notePreviewAtt && (activeNote?.attachments?.length || 0) > 0 && (
                            <div className="note-glass-attachments">
                              {activeNote.attachments.map((att) => (
                                <div key={att.id} className="note-att-chip">
                                  <button
                                    type="button"
                                    className="note-att-open"
                                    onClick={() => {
                                      if (att.isImage && att.thumb) {
                                        setNotePreviewAtt(att);
                                      } else {
                                        window.twocode?.openNoteAttachment?.({ path: att.path || '', thumb: att.thumb || '' });
                                      }
                                    }}
                                    title={att.isImage ? t('clips.enlarge') : t('notes.open')}
                                  >
                                    {att.thumb ? (
                                      <img src={att.thumb} alt="" className="note-att-thumb" />
                                    ) : (
                                      <span className="note-att-emoji">
                                        <NotificationText text={att.isImage ? '🖼️' : '📄'} />
                                      </span>
                                    )}
                                    <span className="note-att-name">{att.name}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="note-att-action"
                                    onClick={() => copyNoteAttachment(att)}
                                    title={att.isImage ? t('clips.copyImage') : t('notes.copyPath')}
                                    aria-label={t('notes.copyAttachment')}
                                  >
                                    {noteAttCopiedId === att.id ? <Check size={10} /> : <Copy size={10} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="note-att-remove"
                                    onClick={() => removeNoteAttachment(att.id)}
                                    aria-label={t('notes.removeAttachment')}
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ============================================================
                        10. AGENDA TAB
                        ============================================================ */}
                    {activeTab === 'cal' && (
                      <AgendaCalendar
                        events={agendaItems}
                        onAddEvent={handleAddAgendaEvent}
                        onDeleteEvent={handleDeleteAgendaEvent}
                        onToggleEvent={handleToggleAgendaEvent}
                      />
                    )}
                    {activeTab === 'perf' && islandMode === 'expanded' && <PerfMonitorTab />}
                    {/* ============================================================
                        11. MAIL TAB
                        ============================================================ */}
                    {activeTab === 'inbox' && (
                      <div className="mail-workspace">
                        <section className="mail-main-panel">
                          <header className="mail-main-header">
                            <nav className="mail-folder-list" aria-label={t('mail.categoriesAria')}>
                              {MAIL_FOLDERS.map((folder) => {
                                const FolderIcon = folder.icon;
                                const count = Number(mailCounts[folder.countKey]) || 0;
                                return (
                                  <button key={folder.id} type="button" className={`mail-folder-btn ${mailCategory === folder.id ? 'active' : ''}`} onClick={() => setMailCategory(folder.id)} aria-current={mailCategory === folder.id ? 'page' : undefined}>
                                    <FolderIcon size={15} strokeWidth={1.9} />
                                    <span>{t(`mail.${folder.id}`)}</span>
                                    {count > 0 && <small>{count > 99 ? '99+' : count}</small>}
                                  </button>
                                );
                              })}
                            </nav>
                            <div className="mail-header-actions">
                              <span className={`mail-connection-state ${mailIsConnected ? 'connected' : ''}`} title={mailIsConnected ? t('mail.gmailConnected') : t('mail.gmailNotConnected')} aria-label={mailIsConnected ? t('mail.gmailConnected') : t('mail.gmailNotConnected')}><i /></span>
                              <button type="button" className="mail-open-gmail" title={t('mail.openGmail')} aria-label={t('mail.openGmail')} onClick={() => window.twocode?.openExternal(currentMailFolder.url)}><ExternalLink size={15} /></button>
                              <button type="button" className="mail-compose-btn" title={t('mail.compose')} aria-label={t('mail.compose')} onClick={() => window.twocode?.openExternal('https://mail.google.com/mail/u/0/#compose')}><Plus size={17} /></button>
                            </div>
                          </header>

                          <div className="mail-message-list">
                            {visibleMailItems.length > 0 ? visibleMailItems.map((item, index) => {
                              const sender = item.from || item.sender || t('mail.unknownSender');
                              const mailId = String(item.id || '');
                              const hasThreadId = Boolean(mailId && !/^(m_|mail_count_bump|row_)/i.test(mailId));
                              const messageUrl = hasThreadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(mailId)}` : currentMailFolder.url;
                              return (
                                <button key={mailId || `${sender}-${item.subject}-${index}`} type="button" className="mail-message-row" aria-label={`${sender}: ${item.subject || t('mail.noSubject')}`} onClick={() => window.twocode?.openExternal(messageUrl)}>
                                  <span className="mail-sender-avatar">
                                    {(item.senderPhoto || item.profileImage) ? <img src={item.senderPhoto || item.profileImage} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : sender.trim().charAt(0).toLocaleUpperCase(locale)}
                                  </span>
                                  <span className="mail-message-copy">
                                    <span className="mail-message-topline"><strong>{sender}</strong><time className="clock-number-text">{item.time || t('common.today')}</time></span>
                                    <span className="mail-message-subject">{item.subject || t('mail.noSubject')}</span>
                                    <small>{item.snippet || ' '}</small>
                                  </span>
                                  <ExternalLink className="mail-message-open-icon" size={13} />
                                </button>
                              );
                            }) : (
                              <div className="mail-empty-state">
                                <span className="mail-empty-icon"><CurrentMailFolderIcon size={18} /></span>
                                <strong>{!mailIsConnected ? t('mail.connectGmail') : mailCategory !== 'primary' ? t('mail.noMessagesInFolder') : t('mail.inboxEmpty')}</strong>
                                {!mailIsConnected ? <button type="button" onClick={() => window.twocode?.openSettingsWindow?.('connections')} aria-label={t('mail.connectGmail')}><ExternalLink size={14} /></button> : mailCategory !== 'primary' ? <button type="button" onClick={() => window.twocode?.openExternal(currentMailFolder.url)} aria-label={t('mail.viewInGmail')}><ExternalLink size={14} /></button> : null}
                              </div>
                            )}
                          </div>
                        </section>
                      </div>
                    )}
                  </div>
                )}
              </main>

              {/* BOTTOM NAVIGATION DOCK */}
              <footer className="island-dock">
                {islandSettings.showAppsInDock !== false && (
                <div className={`dock-shortcuts-pill ${draggingShortcutId ? 'is-reordering' : ''}`}>
                  {shortcuts.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      draggable={false}
                      data-shortcut-id={sc.id}
                      className={`shortcut-brand-btn ${draggingShortcutId === sc.id ? 'is-dragging' : ''}`}
                      title={draggingShortcutId ? undefined : sc.name}
                      style={{ WebkitUserDrag: 'none', userSelect: 'none', touchAction: 'none' }}
                      onDragStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || shortcuts.length < 2) return;
                        e.preventDefault();
                        const dragState = { id: sc.id, startX: e.clientX, startY: e.clientY, moved: false };
                        shortcutDragRef.current = dragState;
                        const onMove = (moveEv) => {
                          if (!dragState.moved) {
                            if (Math.hypot(moveEv.clientX - dragState.startX, moveEv.clientY - dragState.startY) < 5) {
                              return;
                            }
                            dragState.moved = true;
                            setDraggingShortcutId(dragState.id);
                          }
                          const els = document.elementsFromPoint(moveEv.clientX, moveEv.clientY);
                          const targetBtn = els
                            .map((el) => (el instanceof HTMLElement ? el.closest('[data-shortcut-id]') : null))
                            .find(Boolean);
                          const targetId = targetBtn?.dataset?.shortcutId;
                          if (targetId && targetId !== String(dragState.id)) {
                            setShortcuts((prev) => {
                              const fromIdx = prev.findIndex((item) => String(item.id) === String(dragState.id));
                              const toIdx = prev.findIndex((item) => String(item.id) === String(targetId));
                              if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
                              const next = [...prev];
                              const [movedItem] = next.splice(fromIdx, 1);
                              next.splice(toIdx, 0, movedItem);
                              return next;
                            });
                          }
                        };
                        const onUp = () => {
                          window.removeEventListener('pointermove', onMove);
                          window.removeEventListener('pointerup', onUp);
                          window.removeEventListener('pointercancel', onUp);
                          setDraggingShortcutId(null);
                          if (dragState.moved) {
                            suppressShortcutClickRef.current = true;
                            setTimeout(() => { suppressShortcutClickRef.current = false; }, 120);
                            setShortcuts((latest) => {
                              window.twocode?.saveSettings?.({ apps: latest });
                              return latest;
                            });
                          }
                          shortcutDragRef.current.id = null;
                        };
                        window.addEventListener('pointermove', onMove);
                        window.addEventListener('pointerup', onUp);
                        window.addEventListener('pointercancel', onUp);
                      }}
                      onClick={() => {
                        if (suppressShortcutClickRef.current) return;
                        triggerRoboReaction('app-open', 2, 1050);
                        window.twocode?.openApp(sc);
                        if (islandSettings.closeIslandOnAppOpen) {
                          setShowMenu(false);
                          setNotificationHistoryOpen(false);
                          setIslandMode(resolvedCollapsedMode);
                        }
                      }}
                    >
                      <span style={{ pointerEvents: 'none', display: 'inline-flex', WebkitUserDrag: 'none' }}>
                        <RealAppIcon sc={sc} size={15} />
                      </span>
                    </button>
                  ))}
                  <div
                    className="shortcut-plus-wrap"
                    onMouseEnter={() => setHoverAddApp(true)}
                    onMouseLeave={() => setHoverAddApp(false)}
                  >
                    {hoverAddApp && (
                      <div className="dock-add-tooltip">{t('dock.addAppTooltip')}</div>
                    )}
                    <button
                      type="button"
                      className="shortcut-plus-btn"
                      onClick={handleAddShortcut}
                    >
                      <Plus size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
                )}

                <nav className="dock-tabs" ref={dockTabsRef} aria-label={t('dock.modesAria')}>
                  <div
                    className={`dock-liquid-bubble ${dockBubble.visible ? 'is-visible' : ''}`}
                    style={{
                      width: `${dockBubble.width}px`,
                      transform: `translate3d(${dockBubble.left}px, 0, 0)`,
                    }}
                    aria-hidden="true"
                  />
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id && !islandOverlay;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`dock-tab-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => {
                          playRoboSound('tap', islandSettings.soundEffects !== false);
                          setIslandOverlay(null);
                          setActiveTab(item.id);
                          if (item.id === 'robo' && bedoStatus.paused) {
                            window.twocode?.bedoSetPaused?.(false);
                          }
                        }}
                        title={item.label}
                      >
                        <Icon size={14} strokeWidth={2} />
                        {isActive && <span className="dock-tab-label">{item.label}</span>}
                        {item.badge && <span className="dock-tab-badge">{item.badge}</span>}
                      </button>
                    );
                  })}
                </nav>

                <button
                  type="button"
                  className="dock-volume-btn"
                  onClick={handleVolumeClick}
                  onWheel={handleVolumeWheel}
                  title={t('dock.volumeTitle')}
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </footer>
            </>
          )}
            </>
          )}
        </div>
      </div>

      {/* Detached Top-Bezel Circular Media Droplet when Focus Timer + Media are both active */}
      <div
        className={`detached-media-droplet ${islandMode === 'focus-bar-media' ? 'is-visible' : ''
          }`}
        style={{ left: 418, width: 48, height: 26 }}
        onClick={() => {
          setActiveTab('music');
          setIslandMode('expanded');
        }}
      >
        {currentMedia.thumbnail ? (
          <img src={currentMedia.thumbnail} alt="" className="droplet-cover-img" />
        ) : (
          <Music size={14} />
        )}
      </div>

      {/* Modern Sleek Global Tooltip */}
      <div
        className={`modern-tooltip-portal is-${tooltipState.placement} ${tooltipState.visible ? 'is-visible' : 'is-hidden'
          }`}
        style={{
          left: Math.max(70, Math.min(window.innerWidth - 70, tooltipState.x)),
          top: tooltipState.y,
        }}
        aria-hidden="true"
      >
        <div className="modern-tooltip-bubble">
          {renderTooltipContent(tooltipState.text)}
        </div>
      </div>

      {/* Notification History Full-Message Hover Preview */}
      <div
        className={`notif-history-preview-portal is-${notifPreview.placement} ${notifPreview.visible ? 'is-visible' : 'is-hidden'}`}
        style={{
          left: notifPreview.x,
          top: notifPreview.y,
          width: notifPreview.width,
          maxHeight: notifPreview.maxHeight,
          '--notif-accent-rgb': notifPreview.accentRgb,
          '--notif-accent-hex': notifPreview.accentHex,
        }}
        aria-hidden="true"
      >
        <div className="notif-history-preview-card">
          <div className="notif-history-preview-header">
            <span className="notif-history-preview-title">
              <NotificationText text={notifPreview.title} />
            </span>
            {notifPreview.time && (
              <span className="notif-history-preview-time">{notifPreview.time}</span>
            )}
          </div>
          {notifPreview.body && (
            <div className="notif-history-preview-body">
              <NotificationText text={notifPreview.body} />
            </div>
          )}
        </div>
      </div>
    </div>
    </LanguageProvider>
  );
}
