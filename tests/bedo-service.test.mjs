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
