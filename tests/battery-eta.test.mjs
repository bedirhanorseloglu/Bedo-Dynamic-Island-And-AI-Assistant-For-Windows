import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeBatteryChargeEta, readGHelperChargeLimit } = require('../electron/battery-eta.cjs');

test('computes exact sensor-based ETA to 100% without arbitrary multipliers', () => {
  const result = computeBatteryChargeEta({
    instanceName: 'ACPI\\PNP0C0A\\0_0',
    charging: true,
    chargeRateMw: 81448,
    remainingCapacityMwh: 4393,
    fullChargedCapacityMwh: 73215,
    percent: 6,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'wmi');
  assert.equal(result.targetPercent, 100);
  assert.equal(result.percent, 6);
  assert.equal(result.chargeRateW, 81.4);
  // (73215 - 4393) / 81448 * 60 = 50.70 -> 51 min
  assert.equal(result.minutes, 51);
});

test('computes exact ETA to an active 80% charge limit', () => {
  const result = computeBatteryChargeEta(
    {
      instanceName: 'ACPI\\PNP0C0A\\0_0',
      charging: true,
      chargeRateMw: 81400,
      remainingCapacityMwh: 27090, // 37% of 73215
      fullChargedCapacityMwh: 73215,
      percent: 37,
    },
    { targetPercent: 80 }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.targetPercent, 80);
  assert.equal(result.chargeRateW, 81.4);
  // (73215 * 0.80 - 27090) / 81400 * 60 = 23.21 -> 23 min
  assert.equal(result.minutes, 23);
});

test('returns limit-reached when battery is at or above active 80% limit', () => {
  const result = computeBatteryChargeEta(
    {
      instanceName: 'BAT0',
      charging: true,
      chargeRateMw: 0,
      remainingCapacityMwh: 58572,
      fullChargedCapacityMwh: 73215,
      percent: 80,
    },
    { targetPercent: 80 }
  );

  assert.equal(result.status, 'limit-reached');
  assert.equal(result.targetPercent, 80);
  assert.equal(result.minutes, 0);
  assert.equal(result.percent, 80);
});

test('aggregates dual-battery systems (e.g. ThinkPad internal + external)', () => {
  const result = computeBatteryChargeEta([
    {
      instanceName: 'BAT0',
      charging: true,
      chargeRateMw: 30000,
      remainingCapacityMwh: 12000,
      fullChargedCapacityMwh: 24000,
      percent: 50,
    },
    {
      instanceName: 'BAT1',
      charging: false,
      chargeRateMw: 0,
      remainingCapacityMwh: 12000,
      fullChargedCapacityMwh: 24000,
      percent: 50,
    },
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.percent, 50);
  assert.equal(result.chargeRateW, 30);
  // Missing 24000 mWh at 30000 mW -> 48 min exact
  assert.equal(result.minutes, 48);
});

test('returns full when battery is at 100%', () => {
  const result = computeBatteryChargeEta({
    instanceName: 'BAT0',
    charging: true,
    chargeRateMw: 0,
    remainingCapacityMwh: 73215,
    fullChargedCapacityMwh: 73215,
    percent: 100,
  });

  assert.equal(result.status, 'full');
  assert.equal(result.minutes, 0);
  assert.equal(result.percent, 100);
});

test('filters ACPI unknown sentinel values (0xFFFFFFFF, 0x80000000) and garbage rates', () => {
  const unknownRate = computeBatteryChargeEta({
    charging: true,
    chargeRateMw: 0xffffffff,
    remainingCapacityMwh: 30000,
    fullChargedCapacityMwh: 60000,
  });
  assert.equal(unknownRate.status, 'unavailable');
  assert.equal(unknownRate.minutes, null);

  const unknownCap = computeBatteryChargeEta({
    charging: true,
    chargeRateMw: 45000,
    remainingCapacityMwh: 30000,
    fullChargedCapacityMwh: 0xffffffff,
  });
  assert.equal(unknownCap.status, 'unavailable');
  assert.equal(unknownCap.minutes, null);

  const noiseRate = computeBatteryChargeEta({
    charging: true,
    chargeRateMw: 100,
    remainingCapacityMwh: 30000,
    fullChargedCapacityMwh: 60000,
  });
  assert.equal(noiseRate.status, 'unavailable');
});

test('returns unavailable when discharging, empty, or absurdly long (>12h)', () => {
  assert.equal(computeBatteryChargeEta([]).status, 'unavailable');
  assert.equal(
    computeBatteryChargeEta({
      charging: false,
      chargeRateMw: 45000,
      remainingCapacityMwh: 30000,
      fullChargedCapacityMwh: 60000,
    }).status,
    'unavailable'
  );
  assert.equal(
    computeBatteryChargeEta({
      charging: true,
      chargeRateMw: 1000,
      remainingCapacityMwh: 10000,
      fullChargedCapacityMwh: 70000,
    }).status,
    'unavailable'
  );
});

test('readGHelperChargeLimit reads charge_limit and respects charge_full override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bedo-ghelper-test-'));
  const gDir = path.join(tmpDir, 'GHelper');
  fs.mkdirSync(gDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(gDir, 'config.json'), JSON.stringify({ charge_limit: 80, charge_full: 0 }));
    assert.equal(readGHelperChargeLimit(tmpDir), 80);

    fs.writeFileSync(path.join(gDir, 'config.json'), JSON.stringify({ charge_limit: 80, charge_full: 1 }));
    assert.equal(readGHelperChargeLimit(tmpDir), 100);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
