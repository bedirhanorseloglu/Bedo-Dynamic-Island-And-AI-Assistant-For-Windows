import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseSizeToBytes,
  extractDownloadMetaFromUiaText,
  lookupChromiumDownloadMeta,
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

test('extractDownloadMetaFromUiaText parses short Turkish time hints and bare percentages', () => {
  const fileSize = 42 * 1024 ** 2;
  const meta = extractDownloadMetaFromUiaText('42% • 5 sn', fileSize);
  assert.ok(meta);
  assert.equal(meta.totalBytes, Math.round(fileSize / 0.42));

  const bare = extractDownloadMetaFromUiaText('%42', fileSize);
  assert.ok(bare);
  assert.equal(bare.totalBytes, Math.round(fileSize / 0.42));
});

test('lookupChromiumDownloadMeta reads active state=0 download from WAL History even with stale received_bytes=0', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-live-test-'));
  const profileDir = path.join(tmpRoot, 'Google', 'Chrome', 'User Data', 'Default');
  fs.mkdirSync(profileDir, { recursive: true });
  const histPath = path.join(profileDir, 'History');

  // Initialize WAL-mode History DB and leave an uncommitted/WAL active download row
  execFileSync('python', [
    '-c',
    `
import sqlite3
conn = sqlite3.connect(r'${histPath}')
conn.execute('PRAGMA journal_mode=WAL;')
conn.execute('CREATE TABLE downloads (id INTEGER PRIMARY KEY, current_path TEXT, target_path TEXT, total_bytes INTEGER, received_bytes INTEGER, state INTEGER, start_time INTEGER)')
conn.execute("INSERT INTO downloads VALUES (1, 'C:\\\\Downloads\\\\Unconfirmed 123.crdownload', 'C:\\\\Downloads\\\\MyGameInstaller.exe', 100000000, 0, 0, 13300000000000000)")
conn.commit()
conn.close()
`,
  ]);

  // Keep a second WAL writer open with a newer row in -wal
  const writer = spawn('python', [
    '-c',
    `
import sqlite3, time
conn = sqlite3.connect(r'${histPath}')
conn.execute("INSERT INTO downloads VALUES (2, 'C:\\\\Downloads\\\\Unconfirmed 999.crdownload', 'C:\\\\Downloads\\\\RealFile.zip', 200000000, 0, 0, 13400000000000000)")
conn.commit()
print('READY', flush=True)
time.sleep(5)
conn.close()
`,
  ]);

  await new Promise((resolve, reject) => {
    writer.stdout.on('data', (d) => {
      if (String(d).includes('READY')) resolve();
    });
    writer.on('error', reject);
  });

  const prevLocal = process.env.LOCALAPPDATA;
  const prevApp = process.env.APPDATA;
  process.env.LOCALAPPDATA = tmpRoot;
  process.env.APPDATA = tmpRoot;

  try {
    const meta = await new Promise((resolve) => {
      lookupChromiumDownloadMeta('Unconfirmed 999.crdownload', 'Unconfirmed 999', 80_000_000, resolve);
    });
    assert.ok(meta);
    assert.equal(meta.totalBytes, 200_000_000);
    assert.equal(meta.title, 'RealFile.zip');
  } finally {
    process.env.LOCALAPPDATA = prevLocal;
    process.env.APPDATA = prevApp;
    await new Promise((resolve) => {
      writer.once('exit', resolve);
      writer.kill();
    });
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
});
