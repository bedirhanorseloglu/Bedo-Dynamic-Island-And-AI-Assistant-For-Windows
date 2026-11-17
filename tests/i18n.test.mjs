import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import en from '../src/i18n/en.js';
import tr from '../src/i18n/tr.js';
import {
  normalizeLanguage,
  languageLabel,
  getLocale,
  createTranslator,
} from '../src/i18n/index.js';

const require = createRequire(import.meta.url);
const electronI18n = require('../electron/i18n.cjs');
const { DropShareServer } = require('../electron/drop-share-server.cjs');

test('normalizeLanguage maps Turkish and English variants cleanly', () => {
  assert.equal(normalizeLanguage('Türkçe'), 'tr');
  assert.equal(normalizeLanguage('tr-TR'), 'tr');
  assert.equal(normalizeLanguage('Turkish'), 'tr');
  assert.equal(normalizeLanguage('English'), 'en');
  assert.equal(normalizeLanguage('Nederlands'), 'en');
  assert.equal(normalizeLanguage(undefined), 'en');
});

test('languageLabel and getLocale return expected display labels and BCP-47 locales', () => {
  assert.equal(languageLabel('tr'), 'Türkçe');
  assert.equal(languageLabel('en'), 'English');
  assert.equal(getLocale('Türkçe'), 'tr-TR');
  assert.equal(getLocale('English'), 'en-US');
});

test('createTranslator translates and interpolates variables for both languages', () => {
  const tTr = createTranslator('Türkçe');
  const tEn = createTranslator('English');

  assert.equal(tTr('focus.doneAt', { time: '14:30' }), 'Bitiş: 14:30');
  assert.equal(tEn('focus.doneAt', { time: '14:30' }), 'Done at 14:30');
  assert.equal(tTr('settings.nav.general'), 'Genel');
  assert.equal(tEn('settings.nav.general'), 'General');
});

test('en and tr dictionaries have matching key sets', () => {
  const enKeys = Object.keys(en).sort();
  const trKeys = Object.keys(tr).sort();
  assert.deepEqual(enKeys, trKeys);
});

test('electron/i18n.cjs translates tray, dialog, and Robo strings in both languages', () => {
  assert.equal(electronI18n.t('Türkçe', 'traySettings'), 'Ayarlar');
  assert.equal(electronI18n.t('English', 'traySettings'), 'Settings');
  assert.equal(electronI18n.t('tr', 'agentTestTitle', { agent: 'Codex' }), 'Codex bağlantı testi');
  assert.equal(electronI18n.t('en', 'agentTestTitle', { agent: 'Codex' }), 'Codex connection test');
});

test('DropShareServer serves localized HTML for Turkish and English', async () => {
  const srvTr = new DropShareServer({ port: 0, language: 'Türkçe' });
  const statusTr = await srvTr.start();
  try {
    const res = await fetch(statusTr.url);
    const html = await res.text();
    assert.match(html, /<html lang="tr">/);
    assert.match(html, /PC'ye Gönder/);
  } finally {
    await srvTr.stop();
  }

  const srvEn = new DropShareServer({ port: 0, language: 'English' });
  const statusEn = await srvEn.start();
  try {
    const res = await fetch(statusEn.url);
    const html = await res.text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /\+ Send to PC/);
  } finally {
    await srvEn.stop();
  }
});
