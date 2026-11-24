import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldPersistNotification,
  shouldSuppressPowerNotificationToast,
} from '../src/notification-history-policy.mjs';

test('GHelper feedback is not retained in notification history', () => {
  assert.equal(shouldPersistNotification({ app: 'GHelper', appId: 'ghelper' }), false);
});

test('agent activity is not retained in notification history', () => {
  assert.equal(shouldPersistNotification({ app: 'Codex', isAgentActivity: true }), false);
  assert.equal(shouldPersistNotification({ appId: 'twocode-agent-codex' }), false);
});

test('Windows energy saver notifications are not retained in notification history', () => {
  assert.equal(
    shouldPersistNotification({
      app: 'Windows',
      appId: '',
      title: 'Enerji tasarrufu açık',
      body: 'Windows güç tüketimini azaltmaya yardımcı...',
    }),
    false
  );
  assert.equal(
    shouldPersistNotification({
      app: 'Güç & Pil',
      appId: 'Windows.SystemToast.Power',
      title: 'Energy saver is on',
      body: 'Windows is helping reduce power consumption.',
    }),
    false
  );
  assert.equal(
    shouldPersistNotification({
      app: 'Settings',
      appId: 'windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel',
      title: 'Battery saver is on',
    }),
    false
  );
});

test('ordinary Windows notifications remain in notification history', () => {
  assert.equal(shouldPersistNotification({ app: 'WhatsApp', appId: 'whatsapp' }), true);
  assert.equal(
    shouldPersistNotification({
      app: 'WhatsApp',
      appId: 'whatsapp',
      title: 'Ahmet',
      body: 'Enerji tasarrufu açık mı?',
    }),
    true
  );
});

test('power/energy saver toast is suppressed when low battery alert is active or imminent', () => {
  const energySaver = {
    app: 'Windows',
    title: 'Enerji tasarrufu açık',
    body: 'Windows güç tüketimini azaltmaya yardımcı...',
  };
  const lowBatteryToast = {
    app: 'Güç & Pil',
    appId: 'Windows.SystemToast.Power',
    title: 'Düşük pil',
  };

  assert.equal(
    shouldSuppressPowerNotificationToast(energySaver, { islandMode: 'battery' }),
    true
  );
  assert.equal(
    shouldSuppressPowerNotificationToast(lowBatteryToast, {
      islandMode: 'idle',
      suppressUntil: 2000,
      now: 1500,
    }),
    true
  );
  assert.equal(
    shouldSuppressPowerNotificationToast(energySaver, {
      islandMode: 'idle',
      batteryPercent: 20,
      batteryCharging: false,
      hasShown20Alert: false,
    }),
    true
  );
  assert.equal(
    shouldSuppressPowerNotificationToast(energySaver, {
      islandMode: 'idle',
      suppressUntil: 1000,
      now: 2000,
      batteryPercent: 80,
      batteryCharging: false,
    }),
    false
  );
  assert.equal(
    shouldSuppressPowerNotificationToast(
      { app: 'WhatsApp', appId: 'whatsapp', title: 'Selam' },
      { islandMode: 'battery', batteryPercent: 20, batteryCharging: false }
    ),
    false
  );
});
