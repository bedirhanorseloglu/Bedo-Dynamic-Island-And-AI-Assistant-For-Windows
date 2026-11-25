import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeBatteryChargeEta } = require('../electron/battery-eta.cjs');

test('computes realistic CC-CV adjusted ETA below 80% SoC', () => {
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
  assert.equal(result.percent, 6);
  assert.equal(result.chargeRateW, 81.4);
  assert.equal(result.linearMinutes, 51);
  // CC-CV taper above 80% should make ETA longer than linear (~60 min vs 51 min)
  assert.ok(result.minutes > result.linearMinutes);
  assert.ok(result.minutes >= 58 && result.minutes <= 63);
});

test('computes mild residual taper when already above 80% SoC', () => {
  const result = computeBatteryChargeEta([
    {
      instanceName: 'ACPI\\PNP0C0A\\0_0',
      charging: true,
      chargeRateMw: 20000,
      remainingCapacityMwh: 64000,
      fullChargedCapacityMwh: 72000,
      percent: 89,
    },
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.linearMinutes, 24);
  assert.ok(result.minutes >= 24 && result.minutes <= 32);
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
  // Missing 24000 mWh at 30000 mW -> 48 min linear, 64 min with CC-CV taper (28.8 + 35.52)
  assert.equal(result.linearMinutes, 48);
  assert.equal(result.minutes, 64);
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

test('returns unavailable when AC is connected with 80% charge limit (0 mW rate)', () => {
  const result = computeBatteryChargeEta({
    instanceName: 'BAT0',
    charging: true,
    chargeRateMw: 0,
    remainingCapacityMwh: 58572,
    fullChargedCapacityMwh: 73215,
    percent: 80,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.minutes, null);
  assert.equal(result.percent, 80);
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
    chargeRateMw: 100, // 0.1 W noise
    remainingCapacityMwh: 30000,
    fullChargedCapacityMwh: 60000,
  });
  assert.equal(noiseRate.status, 'unavailable');
});

test('returns unavailable when discharging or empty input', () => {
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
});

test('rejects absurdly long ETA (>12 hours)', () => {
  const result = computeBatteryChargeEta({
    charging: true,
    chargeRateMw: 1000, // 1 W on a 70 Wh battery -> ~70 hours
    remainingCapacityMwh: 10000,
    fullChargedCapacityMwh: 70000,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.minutes, null);
});
