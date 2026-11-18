const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const PYTHON_EMBED_URL = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

let inFlightBootstrap = null;
let bootstrapStatus = { state: 'idle', detail: '', pythonExe: '' };

function getBootstrapPaths(userDataDir) {
  const baseDir = path.join(userDataDir, 'python-runtime');
  const pythonDir = path.join(baseDir, 'python');
  const pythonExe = path.join(pythonDir, 'python.exe');
  const markerFile = path.join(baseDir, '.ready-v1.json');
  return { baseDir, pythonDir, pythonExe, markerFile };
}

function downloadFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFile(res.headers.location, destPath, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Download timeout'));
    });
  });
}

function runHidden(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 8, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function findExistingVenvPython() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bedo-runtime', 'venv', 'Scripts', 'python.exe') : '',
    path.join(__dirname, 'bedo-runtime', 'venv', 'Scripts', 'python.exe'),
    path.resolve(__dirname, '..', '..', 'JARVIS', 'venv', 'Scripts', 'python.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function resolveRequirementsPath() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bedo-runtime', 'requirements.txt') : '',
    path.join(__dirname, 'bedo-runtime', 'requirements.txt'),
    path.resolve(__dirname, '..', '..', 'JARVIS', 'requirements.txt'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function getAvailablePythonExe(userDataDir) {
  const venvPy = findExistingVenvPython();
  if (venvPy) return venvPy;
  if (userDataDir) {
    const { pythonExe, markerFile } = getBootstrapPaths(userDataDir);
    if (fs.existsSync(markerFile) && fs.existsSync(pythonExe)) {
      return pythonExe;
    }
  }
  if (process.env.BEDO_BOOTSTRAP_PYTHON && fs.existsSync(process.env.BEDO_BOOTSTRAP_PYTHON)) {
    return process.env.BEDO_BOOTSTRAP_PYTHON;
  }
  return '';
}

async function ensurePythonRuntimeBackground(userDataDir, onStatus) {
  const existingVenv = findExistingVenvPython();
  if (existingVenv) {
    bootstrapStatus = { state: 'ready', detail: 'venv', pythonExe: existingVenv };
    onStatus?.(bootstrapStatus);
    return bootstrapStatus;
  }

  const { baseDir, pythonDir, pythonExe, markerFile } = getBootstrapPaths(userDataDir);
  if (fs.existsSync(markerFile) && fs.existsSync(pythonExe)) {
    process.env.BEDO_BOOTSTRAP_PYTHON = pythonExe;
    bootstrapStatus = { state: 'ready', detail: 'bootstrapped', pythonExe };
    onStatus?.(bootstrapStatus);
    return bootstrapStatus;
  }

  if (inFlightBootstrap) return inFlightBootstrap;

  inFlightBootstrap = (async () => {
    const zipPath = path.join(baseDir, 'python-embed.zip');
    const getPipPath = path.join(baseDir, 'get-pip.py');
    try {
      fs.mkdirSync(baseDir, { recursive: true });

      if (!fs.existsSync(pythonExe)) {
        bootstrapStatus = { state: 'downloading-python', detail: 'Downloading Python 3.11 runtime', pythonExe: '' };
        onStatus?.(bootstrapStatus);
        await downloadFile(PYTHON_EMBED_URL, zipPath);

        fs.mkdirSync(pythonDir, { recursive: true });
        await runHidden('powershell.exe', [
          '-WindowStyle', 'Hidden',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${pythonDir.replace(/'/g, "''")}' -Force`,
        ], { timeout: 60000 });
        try { fs.unlinkSync(zipPath); } catch {}

        const pthPath = path.join(pythonDir, 'python311._pth');
        if (fs.existsSync(pthPath)) {
          let pth = fs.readFileSync(pthPath, 'utf8');
          pth = pth.replace(/^#\s*import site/m, 'import site');
          if (!/^import site/m.test(pth)) pth += '\nimport site\n';
          fs.writeFileSync(pthPath, pth, 'utf8');
        }
      }

      bootstrapStatus = { state: 'installing-deps', detail: 'Installing pip & dependencies', pythonExe };
      onStatus?.(bootstrapStatus);

      await downloadFile(GET_PIP_URL, getPipPath);
      await runHidden(pythonExe, [getPipPath, '--no-warn-script-location'], { timeout: 180000 });
      try { fs.unlinkSync(getPipPath); } catch {}

      await runHidden(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', 'SpeechRecognition'], { timeout: 180000 });

      const reqPath = resolveRequirementsPath();
      if (reqPath) {
        await runHidden(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', '-r', reqPath], { timeout: 600000 });
      }

      fs.writeFileSync(markerFile, JSON.stringify({ version: 1, pythonExe, installedAt: new Date().toISOString() }, null, 2), 'utf8');
      process.env.BEDO_BOOTSTRAP_PYTHON = pythonExe;
      bootstrapStatus = { state: 'ready', detail: 'bootstrapped', pythonExe };
      onStatus?.(bootstrapStatus);
      return bootstrapStatus;
    } catch (err) {
      bootstrapStatus = { state: 'error', detail: err?.message || 'Bootstrap failed', pythonExe: '' };
      onStatus?.(bootstrapStatus);
      return bootstrapStatus;
    } finally {
      inFlightBootstrap = null;
    }
  })();

  return inFlightBootstrap;
}

function getPythonBootstrapStatus() {
  return bootstrapStatus;
}

module.exports = {
  ensurePythonRuntimeBackground,
  getAvailablePythonExe,
  getPythonBootstrapStatus,
};
