const matchesGHelper = (value) => /^(?:g-?helper)$/i.test(String(value || '').trim());

const isSystemOrPowerSource = (notification) => {
  const app = String(notification?.app || '').trim();
  const appId = String(notification?.appId || '').trim();
  const source = `${app} ${appId}`;
  if (/güç\s*&?\s*pil|power\s*&?\s*battery|windows\.systemtoast\.power/i.test(source)) {
    return true;
  }
  const genericOrSystemApp = /^(?:windows|system|sistem|ayarlar|settings|notification|unknown|app)?$/i.test(app);
  const systemAppId = !appId || /windows\.systemtoast|immersivecontrolpanel|windows\.system/i.test(appId);
  return genericOrSystemApp || systemAppId;
};

export function isEnergySaverNotification(notification) {
  if (!notification || !isSystemOrPowerSource(notification)) return false;
  const text = `${notification.title || ''} ${notification.body || ''}`;
  return /enerji\s*tasarrufu|pil\s*tasarrufu|energy\s*saver|battery\s*saver/i.test(text);
}

export function isWindowsPowerNotification(notification) {
  if (!notification || !isSystemOrPowerSource(notification)) return false;
  if (isEnergySaverNotification(notification)) return true;

  const source = `${notification.app || ''} ${notification.appId || ''}`;
  if (/güç\s*&?\s*pil|power\s*&?\s*battery|windows\.systemtoast\.power/i.test(source)) {
    return true;
  }

  const text = `${notification.title || ''} ${notification.body || ''}`;
  return /düşük\s*pil|piliniz\s*azalıyor|kritik\s*pil|low\s*battery|battery\s*is\s*(?:running\s*)?low|critical\s*battery|very\s*low\s*battery/i.test(text);
}

export function shouldSuppressPowerNotificationToast(
  notification,
  { islandMode, suppressUntil = 0, now = Date.now(), batteryPercent = 100, batteryCharging = false, hasShown20Alert = false } = {}
) {
  if (!isWindowsPowerNotification(notification)) return false;
  if (islandMode === 'battery') return true;
  if (now < suppressUntil) return true;
  if (!batteryCharging && batteryPercent <= 21 && !hasShown20Alert) return true;
  return false;
}

export function shouldPersistNotification(notification) {
  if (!notification || notification.isAgentActivity) return false;

  const appId = String(notification.appId || '');
  if (/^twocode-agent-/i.test(appId)) return false;
  if (matchesGHelper(notification.app) || matchesGHelper(appId)) return false;
  if (isEnergySaverNotification(notification)) return false;

  return true;
}
