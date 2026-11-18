function normalizeLanguage(lang) {
  const s = String(lang || '').trim().toLowerCase();
  if (s === 'tr' || s === 'tr-tr' || s === 'türkçe' || s === 'turkce' || s === 'turkish') {
    return 'tr';
  }
  return 'en';
}

function getLocale(lang) {
  return normalizeLanguage(lang) === 'tr' ? 'tr-TR' : 'en-US';
}

const DICTS = {
  tr: {
    trayOpenIsland: 'Adayı Aç\tAlt+Ctrl+T',
    trayTuckIsland: 'Adayı Gizle / Göster\tAlt+Ctrl+H',
    traySettings: 'Ayarlar',
    traySetup: 'Bedo Kurulumu...',
    trayStartWithWindows: 'Windows ile Başlat',
    traySafeGraphics: 'Güvenli grafikler (siyah kutuyu düzeltir)',
    trayGraphicsCard: 'Ekran kartı',
    trayGpuDefault: 'Varsayılan',
    trayGpuDiscrete: 'Harici GPU (NVIDIA / AMD)',
    trayGpuIntegrated: 'Dahili GPU',
    trayRestart: 'Yeniden Başlat',
    trayQuit: 'Bedo’dan Çık',

    dropPickTitle: 'Dosya Seç — TwoCode Drop',
    dropSaveAllTitle: 'Toplu İndir — Hedef Klasör Seç',
    dropHtmlLang: 'tr',
    dropHtmlCount: '{count} dosya',
    dropHtmlSendToPc: "+ PC'ye Gönder",
    dropHtmlEmpty: 'Henüz dosya yok',

    wifiNotConnected: 'Bağlı değil',
    wifiScanPermissionError: 'Windows bu uygulamanın Wi-Fi ağ taramasına erişmesine izin vermedi. WLAN hizmetini ve uygulama izinlerini kontrol edin.',
    wifiScanServiceError: 'Wi-Fi ağları taranamadı. Kablosuz ağ hizmetinin çalıştığını kontrol edip yeniden deneyin.',
    wifiScanFailed: 'Wi-Fi ağ taraması başarısız oldu.',
    btScanFailed: 'Bluetooth cihaz taraması başarısız oldu.',
    btInvalidDevice: 'Geçersiz Bluetooth cihazı.',
    btPairFailed: 'Bluetooth eşleştirme başarısız oldu.',

    nowLabel: 'Şimdi',
    todayLabel: 'Bugün',
    googleSignInTitle: 'Google ile Giriş Yap - TwoCode',
    googleConnectedNotifTitle: 'Google Hesabı Bağlandı',
    googleConnectedNotifBody: 'Google hesabı başarıyla bağlandı. Mail ve Ajanda senkronize edildi.',
    testNotifDefaultBody: 'Bildirim içeriği başarıyla görüntülendi',
    agentTestTitle: '{agent} bağlantı testi',

    speechNotDetected: 'Konuşma algılanamadı.',
    speechTranscribeFailed: 'Ses yazıya dökülemedi.',
    speechWorkerClosed: 'Ses çalışanı kapandı.',
    speechEmptyAudio: 'Ses verisi boş.',
    speechGeminiPrompt: 'Bu ses kaydını Türkçe (veya konuşulan dilde) doğru noktalama ile yazıya dök. Sadece dökülen metni döndür, tırnak veya ek açıklama yazma.',

    roboSystemPrompt: 'Sen TwoCode Robo\'sun; masaüstünde çalışan hızlı, yardımsever, akıllı ve arkadaş canlısı bir yapay zeka asistanısın. Türkçe konuş, kısa, net ve doğrudan cevaplar ver.',
    roboUserQuestionPrefix: 'Kullanıcı sorusu',
    roboUnsupportedProvider: 'Bu sağlayıcı Robo sohbetinde desteklenmiyor. Claude, Codex veya Gemini seçin.',
    roboProviderDisabled: '{provider} bağlantısı Ayarlar > Ajanlar bölümünde kapalı.',
    roboMissingApiKey: '{provider} için API anahtarı bulunamadı. {setup}',
    roboSetupClaude: 'Ayarlar > Ajanlar bölümüne Claude API anahtarınızı ekleyin.',
    roboSetupCodex: 'Ayarlar > Ajanlar bölümüne OpenAI API anahtarınızı ekleyin. Codex uygulama oturumu API erişimi sağlamaz.',
    roboSetupGemini: 'Ayarlar > Ajanlar bölümüne Gemini API anahtarınızı ekleyin.',
    roboEmptyReply: '{provider} boş yanıt verdi. Tekrar deneyin.',
    roboTimeout: '{provider} hızlı model denemeleri 36 saniye içinde yanıt vermedi. İnternet/proxy bağlantınızı kontrol edip yeniden deneyin.',
    roboBusy: '{provider} şu anda yoğun. Otomatik yedek modeller de yanıt vermedi; birkaç dakika sonra yeniden deneyin.',
    roboBadApiKey: 'API anahtarı reddedildi. Sağlayıcı hesabındaki anahtarı kontrol edin.',
    roboRequestFailed: 'API isteği başarısız oldu ({message}).',
    roboGeminiParseError: 'Gemini yanıtı çözümlenemedi (HTTP {status}).',
    roboGeminiRejected: 'Gemini API isteği reddedildi.',
    roboSafetyBlocked: 'İstek güvenlik filtresine takıldı ({reason}).',
    roboPromptEmpty: 'Lütfen bir soru veya metin girin.',
  },
  en: {
    trayOpenIsland: 'Open the island\tAlt+Ctrl+T',
    trayTuckIsland: 'Tuck the island away / back\tAlt+Ctrl+H',
    traySettings: 'Settings',
    traySetup: 'Set up Bedo...',
    trayStartWithWindows: 'Start with Windows',
    traySafeGraphics: 'Safe graphics (fixes a black box)',
    trayGraphicsCard: 'Graphics card',
    trayGpuDefault: 'Default',
    trayGpuDiscrete: 'Discrete GPU (NVIDIA / AMD)',
    trayGpuIntegrated: 'Integrated GPU',
    trayRestart: 'Restart',
    trayQuit: 'Quit Bedo',

    dropPickTitle: 'Select Files — TwoCode Drop',
    dropSaveAllTitle: 'Save All — Select Destination Folder',
    dropHtmlLang: 'en',
    dropHtmlCount: '{count} files',
    dropHtmlSendToPc: '+ Send to PC',
    dropHtmlEmpty: 'No files yet',

    wifiNotConnected: 'Not connected',
    wifiScanPermissionError: 'Windows denied Wi-Fi scan permission for this app. Check the WLAN service and app permissions.',
    wifiScanServiceError: 'Could not scan Wi-Fi networks. Verify the wireless service is running and try again.',
    wifiScanFailed: 'Wi-Fi network scan failed.',
    btScanFailed: 'Bluetooth device scan failed.',
    btInvalidDevice: 'Invalid Bluetooth device.',
    btPairFailed: 'Bluetooth pairing failed.',

    nowLabel: 'Now',
    todayLabel: 'Today',
    googleSignInTitle: 'Sign in with Google - TwoCode',
    googleConnectedNotifTitle: 'Google Account Connected',
    googleConnectedNotifBody: 'Google account connected successfully. Mail and Agenda synced.',
    testNotifDefaultBody: 'Notification preview displayed successfully',
    agentTestTitle: '{agent} connection test',

    speechNotDetected: 'No speech detected.',
    speechTranscribeFailed: 'Could not transcribe audio.',
    speechWorkerClosed: 'Audio worker closed.',
    speechEmptyAudio: 'Audio data is empty.',
    speechGeminiPrompt: 'Transcribe this audio recording in the spoken language with proper punctuation. Return only the transcribed text without quotes or extra commentary.',

    roboSystemPrompt: 'You are TwoCode Robo, a fast, helpful, smart, and friendly desktop AI assistant. Respond in English with concise, clear, and direct answers.',
    roboUserQuestionPrefix: 'User question',
    roboUnsupportedProvider: 'This provider is not supported in Robo chat. Choose Claude, Codex, or Gemini.',
    roboProviderDisabled: '{provider} connection is disabled in Settings > Agents.',
    roboMissingApiKey: 'No API key found for {provider}. {setup}',
    roboSetupClaude: 'Add your Claude API key in Settings > Agents.',
    roboSetupCodex: 'Add your OpenAI API key in Settings > Agents. Codex app session does not provide API access.',
    roboSetupGemini: 'Add your Gemini API key in Settings > Agents.',
    roboEmptyReply: '{provider} returned an empty response. Please try again.',
    roboTimeout: '{provider} fast models did not respond within 36 seconds. Check your internet/proxy connection and try again.',
    roboBusy: '{provider} is currently busy and fallback models did not respond. Please try again in a few minutes.',
    roboBadApiKey: 'API key was rejected. Check the key in your provider account.',
    roboRequestFailed: 'API request failed ({message}).',
    roboGeminiParseError: 'Could not parse Gemini response (HTTP {status}).',
    roboGeminiRejected: 'Gemini API request was rejected.',
    roboSafetyBlocked: 'Request blocked by safety filter ({reason}).',
    roboPromptEmpty: 'Please enter a question or text.',
  },
};

function t(lang, key, vars) {
  const code = normalizeLanguage(lang);
  const dict = DICTS[code] || DICTS.en;
  let text = dict[key] ?? DICTS.en[key] ?? key;
  if (vars && typeof text === 'string') {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v ?? ''));
    }
  }
  return text;
}

module.exports = {
  normalizeLanguage,
  getLocale,
  t,
};
