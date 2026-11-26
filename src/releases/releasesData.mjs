/**
 * Single source of truth for Bedo "What's New" release showcases.
 * Keep copy ultra-concise (Apple style: 2-5 word title, 1 short sentence).
 *
 * Supported visual presets:
 * - 'island-only-banners'
 * - 'chat-studio'
 * - 'ambient-hud'
 * - 'game-turbo'
 * - 'agent-bridge'
 */
export const RELEASES = [
  {
    version: '1.0.12',
    date: '2026-11-26',
    headline: { tr: 'Daha sade, daha akıllı.', en: 'Cleaner, smarter, calmer.' },
    highlights: [
      {
        id: 'island-only-banners',
        preset: 'island-only-banners',
        title: {
          tr: 'Sadece Ada’da Bildirim',
          en: 'Island-Only Alerts',
        },
        subtitle: {
          tr: 'Windows bildirim başlıklarını tek dokunuşla gizleyin; çakışma olmasın.',
          en: 'Hide duplicate Windows notification banners in one tap.',
        },
        action: {
          type: 'navigate',
          tab: 'notifications',
          label: { tr: 'Ayarla', en: 'Configure' },
        },
      },
      {
        id: 'chat-studio',
        preset: 'chat-studio',
        title: {
          tr: 'Sohbet Stüdyosu ve Hafıza',
          en: 'Chat Studio & Memory',
        },
        subtitle: {
          tr: 'Çoklu oturum, canlı web araştırması ve sizi hatırlayan hafıza.',
          en: 'Multi-session threads, live web research, and lasting memory.',
        },
        action: {
          type: 'navigate',
          tab: 'bedochat',
          label: { tr: 'Aç', en: 'Open' },
        },
      },
      {
        id: 'ambient-hud',
        preset: 'ambient-hud',
        title: {
          tr: 'Canlı Pil Süresi ve Uyumlu HUD',
          en: 'Live Battery ETA & Ambient HUD',
        },
        subtitle: {
          tr: 'Kalan kullanım tahmini ve çalan müziğin rengine bürünen ses çubuğu.',
          en: 'Remaining battery estimate and music-tinted volume HUD.',
        },
        action: {
          type: 'navigate',
          tab: 'island',
          label: { tr: 'İncele', en: 'View' },
        },
      },
    ],
  },
  {
    version: '1.0.11',
    date: '2026-11-25',
    headline: { tr: 'Performans ve denge.', en: 'Performance and balance.' },
    highlights: [
      {
        id: 'game-turbo',
        preset: 'game-turbo',
        title: {
          tr: 'Akıllı Oyun Modu',
          en: 'Smart Game Mode',
        },
        subtitle: {
          tr: 'Tam ekranda sıfır FPS kaybı, çıkınca anında dönüş.',
          en: 'Zero FPS drop in fullscreen, instant restore on exit.',
        },
        action: {
          type: 'navigate',
          tab: 'gameopt',
          label: { tr: 'İncele', en: 'View' },
        },
      },
      {
        id: 'agent-bridge',
        preset: 'agent-bridge',
        title: {
          tr: 'Canlı Ajan Köprüsü',
          en: 'Live Agent Bridge',
        },
        subtitle: {
          tr: 'Claude, Codex ve Antigravity durumları doğrudan Ada’da.',
          en: 'Claude, Codex, and Antigravity status right in the Island.',
        },
        action: {
          type: 'navigate',
          tab: 'connections',
          label: { tr: 'Bağla', en: 'Connect' },
        },
      },
    ],
  },
];

export function getReleaseByVersion(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  if (!normalized) return null;
  return RELEASES.find((entry) => entry.version === normalized) || null;
}

export function getLatestRelease() {
  return RELEASES[0] || null;
}
