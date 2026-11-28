import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BedoService, resolveBedoPaths } = require('../electron/bedo-service.cjs');

test('resolveBedoPaths locates JARVIS venv and bedo_bridge.py', () => {
  const paths = resolveBedoPaths();
  assert.equal(paths.available, true, `Expected Bedo bridge at ${paths.bridgeScript}`);
});

test('BedoService spawns dry-run bridge, exchanges JSONL events, and stops gracefully', async () => {
  const service = new BedoService();
  const events = [];
  service.on('event', (ev) => events.push(ev));

  const startRes = service.start({ dryRun: true });
  assert.equal(startRes.ok, true);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ready/pong')), 5000);
    service.on('event', (ev) => {
      if (ev.type === 'ready') {
        service.ping();
        service.setMuted(true);
      }
      if (ev.type === 'mute_state' && ev.muted === true) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  assert.equal(service.getStatus().ready, true);
  assert.equal(service.getStatus().muted, true);
  assert.ok(events.some((e) => e.type === 'pong'));

  await service.stop();
  assert.equal(service.getStatus().running, false);
});

test('BedoService buffers commands sent immediately on lazy start before ready arrives', async () => {
  const service = new BedoService();
  assert.equal(service.getStatus().paused, true);

  const startRes = service.start({ dryRun: true, startPaused: true });
  assert.equal(startRes.ok, true);
  // Immediately queue command BEFORE Python has emitted 'ready'
  assert.equal(service.setMuted(true), true);
  assert.equal(service.ping(), true);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for buffered commands to flush')), 5000);
    let gotMute = false;
    let gotPong = false;
    service.on('event', (ev) => {
      if (ev.type === 'mute_state' && ev.muted === true) gotMute = true;
      if (ev.type === 'pong') gotPong = true;
      if (gotMute && gotPong) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await service.stop();
  assert.equal(service.getStatus().running, false);
  assert.equal(service.getStatus().paused, true);
});

test('bedo_bridge.py --start-paused defers main/vosk/mem0 imports until wake or unpause', async () => {
  const service = new BedoService();
  const startRes = service.start({
    apiKey: 'AIza_test_dummy_key_not_connected',
    startPaused: true,
    enableWake: false,
  });
  assert.equal(startRes.ok, true);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for paused bridge ready')), 6000);
    service.on('event', (ev) => {
      if (ev.type === 'ready') {
        assert.equal(ev.paused, true);
        service.ping();
      }
      if (ev.type === 'pong') {
        assert.equal(ev.paused, true);
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await service.stop();
  assert.equal(service.getStatus().running, false);
});
