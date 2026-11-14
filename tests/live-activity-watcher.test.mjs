import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseSizeToBytes,
  extractDownloadMetaFromUiaText,
} = require('../electron/live-activity-watcher.cjs');

test('parseSizeToBytes handles decimal commas and units', () => {
  assert.equal(parseSizeToBytes('1,4', 'GB'), Math.round(1.4 * 1024 ** 3));
  assert.equal(parseSizeToBytes('323.2', 'MB'), Math.round(323.2 * 1024 ** 2));
  assert.equal(parseSizeToBytes('512', 'KB'), 512 * 1024);
  assert.equal(parseSizeToBytes('0', 'GB'), null);
  assert.equal(parseSizeToBytes('abc', 'GB'), null);
});

test('extractDownloadMetaFromUiaText parses Turkish Chromium download popup text', () => {
  const fileSize = 338899763; // ~323.2 MB
  const meta = extractDownloadMetaFromUiaText('0,3/1,4 GB • 5 saat içinde açılacak...', fileSize);
  assert.ok(meta);
  assert.equal(meta.totalBytes, Math.round(1.4 * 1024 ** 3));
});

test('extractDownloadMetaFromUiaText parses mixed units and percentage fallback', () => {
  const fileSize = 338899763;
  const mixed = extractDownloadMetaFromUiaText('323 MB / 1.4 GB', fileSize);
  assert.ok(mixed);
  assert.equal(mixed.totalBytes, Math.round(1.4 * 1024 ** 3));

  const pctOnly = extractDownloadMetaFromUiaText('İndiriliyor %25 kaldı', fileSize);
  assert.ok(pctOnly);
  assert.equal(pctOnly.totalBytes, fileSize * 4);
});

test('extractDownloadMetaFromUiaText rejects mismatched sizes', () => {
  const fileSize = 900 * 1024 ** 2;
  assert.equal(extractDownloadMetaFromUiaText('10/50 MB', fileSize), null);
});
