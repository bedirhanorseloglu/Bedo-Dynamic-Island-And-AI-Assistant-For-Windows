import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GHelperBridgeClient, resolveGHelperToast } = require('../electron/ghelper-service.cjs');

test('Key: 124 + 3x Mikrofon Dizisi log lines dispatches only once with authoritative state', () => {
  const toasts = [];
  const client = new GHelperBridgeClient({
    onToast: (t) => toasts.push(t),
  });

  // Even though currentMicMuted starts false, if G-Helper logs False (unmuted),
  // Key: 124 must NOT optimistically flash Susturuldu first.
  client.handleLogLine('15.11.2026 14:56:06: Key: 124');
  client.handleLogLine('15.11.2026 14:56:06: Mikrofon Dizisi (Realtek(R) Audio):False');
  client.handleLogLine('15.11.2026 14:56:06: Mikrofon Dizisi (Realtek(R) Audio):False');
  client.handleLogLine('15.11.2026 14:56:06: Mikrofon Dizisi (Realtek(R) Audio):False');

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].category, 'mic');
  assert.equal(toasts[0].isMuted, false);
  assert.equal(toasts[0].valueText, 'Ses Açık');
});

test('Rapid alternating mic toggles dispatch each state change in order without dropping or duplicating', () => {
  const toasts = [];
  const client = new GHelperBridgeClient({
    onToast: (t) => toasts.push(t),
  });

  const sequence = ['True', 'False', 'True', 'False'];
  for (const state of sequence) {
    client.handleLogLine('15.11.2026 14:56:11: Key: 124');
    client.handleLogLine(`15.11.2026 14:56:11: Mikrofon Dizisi (Realtek(R) Audio):${state}`);
    client.handleLogLine(`15.11.2026 14:56:11: Mikrofon Dizisi (Realtek(R) Audio):${state}`);
    client.handleLogLine(`15.11.2026 14:56:11: Mikrofon Dizisi (Realtek(R) Audio):${state}`);
  }

  assert.deepEqual(
    toasts.map((t) => t.isMuted),
    [true, false, true, false],
  );
});

test('Delayed OSD trigger cannot overwrite newer log mic state', () => {
  const toasts = [];
  const client = new GHelperBridgeClient({
    onToast: (t) => toasts.push(t),
  });

  const t0 = Date.now();
  client.handleLogLine('15.11.2026 14:56:11: Mikrofon Dizisi (Realtek(R) Audio):True');
  client.handleLogLine('15.11.2026 14:56:11: Mikrofon Dizisi (Realtek(R) Audio):False');

  // Late OSD trigger from the first press arrives with stale micMuted: true
  const accepted = client.dispatchMicToast(true, {
    now: t0 + 120,
    isFromOsd: true,
    eventAt: t0 - 10,
  });

  assert.equal(accepted, false);
  assert.deepEqual(
    toasts.map((t) => t.isMuted),
    [false, true].reverse(),
  );
});

test('OSD trigger works as fallback when no mic log line was emitted', () => {
  const toasts = [];
  const client = new GHelperBridgeClient({
    onToast: (t) => toasts.push(t),
  });

  const accepted = client.dispatchMicToast(true, {
    now: Date.now(),
    isFromOsd: true,
    eventAt: Date.now(),
  });

  assert.equal(accepted, true);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].isMuted, true);
});

test('resolveGHelperToast normalizes mic and micMute to category mic with isMuted', () => {
  const muted = resolveGHelperToast('Mikrofon Susturuldu');
  assert.equal(muted.category, 'mic');
  assert.equal(muted.isMuted, true);
  assert.equal(muted.icon, 'mic-mute');

  const unmuted = resolveGHelperToast('Microphone Unmuted');
  assert.equal(unmuted.category, 'mic');
  assert.equal(unmuted.isMuted, false);
  assert.equal(unmuted.icon, 'mic');
});
