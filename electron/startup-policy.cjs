const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUN_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

const LEGACY_STARTUP_NAMES = new Set([
  'nl.twocode.assistent',
  'electron.app.twocode',
  'twocode',
  'electron.app.bedo',
  'com.bedo.assistant',
  'bedo',
]);

function extractExecutableFromCommand(commandLine) {
  const raw = String(commandLine || '').trim();
  if (!raw) return '';
  if (raw.startsWith('"')) {
    const endQuote = raw.indexOf('"', 1);
    if (endQuote > 1) return raw.slice(1, endQuote);
  }
  const exeMatch = raw.match(/^([^"]+?\.exe)(?:\s|$)/i);
  return exeMatch ? exeMatch[1].trim() : raw.split(/\s+/)[0] || '';
}

function parseRegQueryRunOutput(stdout) {
  const entries = [];
  if (!stdout) return entries;
  const lines = String(stdout).split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s{2,}(.+?)\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.+)$/);
    if (match) {
      entries.push({
        name: match[1].trim(),
        command: match[2].trim(),
      });
    }
  }
  return entries;
}

function computeStaleRunValueNames(entries, { isPackaged = false, execPath = '', appPath = '', fileExists = fs.existsSync } = {}) {
  const toRemove = [];
  const normExec = execPath ? path.normalize(execPath).toLowerCase() : '';
  const normAppPath = appPath ? path.normalize(appPath).toLowerCase() : '';

  for (const entry of entries || []) {
    const nameLower = String(entry.name || '').toLowerCase();
    const cmdLower = String(entry.command || '').toLowerCase();
    const targetExe = extractExecutableFromCommand(entry.command);
    const normTargetExe = targetExe ? path.normalize(targetExe).toLowerCase() : '';

    // 1. Dev Electron startup entry (`electron.app.Electron` pointing into node_modules/electron or appPath)
    // Raw dev Electron must never persist in Windows Startup alongside or instead of packaged builds.
    const isDevElectronEntry =
      nameLower === 'electron.app.electron' &&
      (cmdLower.includes('node_modules\\electron\\dist\\electron.exe') ||
        (normAppPath && cmdLower.includes(normAppPath)));

    if (isDevElectronEntry) {
      toRemove.push(entry.name);
      continue;
    }

    // 2. Known legacy/current Bedo or TwoCode entries whose target .exe no longer exists on disk
    // or duplicates a different executable when running packaged.
    if (LEGACY_STARTUP_NAMES.has(nameLower)) {
      if (!targetExe || !fileExists(targetExe)) {
        toRemove.push(entry.name);
        continue;
      }
      if (isPackaged && normExec && normTargetExe !== normExec) {
        toRemove.push(entry.name);
      }
    }
  }

  return toRemove;
}

function cleanupStaleWindowsRunEntries({
  isPackaged = false,
  execPath = process.execPath,
  appPath = '',
  execReg = (args) => execFileSync('reg.exe', args, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
  fileExists = fs.existsSync,
} = {}) {
  if (process.platform !== 'win32') return [];
  let stdout = '';
  try {
    stdout = execReg(['query', RUN_REG_KEY]);
  } catch {
    return [];
  }
  const entries = parseRegQueryRunOutput(stdout);
  const staleNames = computeStaleRunValueNames(entries, { isPackaged, execPath, appPath, fileExists });
  const removed = [];
  for (const valueName of staleNames) {
    try {
      execReg(['delete', RUN_REG_KEY, '/v', valueName, '/f']);
      removed.push(valueName);
    } catch {}
  }
  return removed;
}

function syncWindowsStartup({
  app,
  enabled,
  platform = process.platform,
  cleanupFn = cleanupStaleWindowsRunEntries,
} = {}) {
  if (!app) return false;
  try {
    const isPackaged = Boolean(app.isPackaged);
    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : '';

    if (platform === 'win32') {
      cleanupFn({
        isPackaged,
        execPath: process.execPath,
        appPath,
      });

      // Never register raw `node_modules/electron/dist/electron.exe` in Windows Startup during dev runs.
      if (!isPackaged) {
        return false;
      }

      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        enabled: Boolean(enabled),
        path: process.execPath,
        args: [],
      });
      return true;
    }

    if (!isPackaged) return false;
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), enabled: Boolean(enabled) });
    return true;
  } catch (error) {
    console.warn('Could not update Windows startup setting:', error?.message || error);
    return false;
  }
}

module.exports = {
  RUN_REG_KEY,
  extractExecutableFromCommand,
  parseRegQueryRunOutput,
  computeStaleRunValueNames,
  cleanupStaleWindowsRunEntries,
  syncWindowsStartup,
};
