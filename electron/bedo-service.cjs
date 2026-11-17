const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveBedoPaths(customProjectDir) {
  const projectDir =
    customProjectDir ||
    process.env.BEDO_PROJECT_DIR ||
    path.resolve(__dirname, '..', '..', 'JARVIS');
  const pythonExe = path.join(projectDir, 'venv', 'Scripts', 'python.exe');
  const bridgeScript = path.join(projectDir, 'bedo_bridge.py');
  return {
    projectDir,
    pythonExe,
    bridgeScript,
    available: fs.existsSync(pythonExe) && fs.existsSync(bridgeScript),
  };
}

class BedoService extends EventEmitter {
  constructor(options = {}) {
    super();
    this._spawn = options.spawnFn || spawn;
    this._customProjectDir = options.projectDir || null;
    this._proc = null;
    this._stdoutBuffer = '';
    this._stopping = false;
    this._state = {
      running: false,
      ready: false,
      jarvisState: 'INITIALISING',
      muted: false,
      paused: false,
      webcamActive: false,
      wakeEnabled: true,
      lastError: null,
    };
  }

  getStatus() {
    const paths = resolveBedoPaths(this._customProjectDir);
    return {
      ...this._state,
      available: paths.available,
      projectDir: paths.projectDir,
    };
  }

  start(opts = {}) {
    if (this._proc) {
      return { ok: true, alreadyRunning: true, status: this.getStatus() };
    }

    const paths = resolveBedoPaths(this._customProjectDir);
    if (!paths.available) {
      const err = `Bedo bridge bulunamadı: ${paths.bridgeScript}`;
      this._state.lastError = err;
      this.emit('status', this.getStatus());
      return { ok: false, error: err, status: this.getStatus() };
    }

    const args = ['-u', paths.bridgeScript];
    if (opts.dryRun) args.push('--dry-run');
    if (opts.startPaused) args.push('--start-paused');
    if (opts.enableWake === false) args.push('--no-wake');
    if (opts.enableClap === true) args.push('--enable-clap');

    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    };
    if (opts.apiKey) {
      env.BEDO_GEMINI_API_KEY = String(opts.apiKey).trim();
    }
    if (opts.voice) {
      env.BEDO_VOICE = String(opts.voice).trim();
    }

    this._stopping = false;
    this._stdoutBuffer = '';
    this._state = {
      ...this._state,
      running: true,
      ready: false,
      paused: Boolean(opts.startPaused),
      wakeEnabled: opts.enableWake !== false,
      lastError: null,
    };

    const proc = this._spawn(paths.pythonExe, args, {
      cwd: paths.projectDir,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._proc = proc;

    proc.stdout.on('data', (chunk) => this._handleStdoutChunk(chunk));
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.emit('stderr', text);
      }
    });
    proc.on('error', (err) => {
      this._state.lastError = err.message;
      this._state.running = false;
      this._state.ready = false;
      this._proc = null;
      this.emit('status', this.getStatus());
      this.emit('error', err);
    });
    proc.on('exit', (code, signal) => {
      const wasStopping = this._stopping;
      this._proc = null;
      this._state.running = false;
      this._state.ready = false;
      this._state.webcamActive = false;
      if (!wasStopping && code !== 0 && code !== null) {
        this._state.lastError = `Bedo süreci beklenmedik şekilde kapandı (kod: ${code})`;
      }
      this.emit('status', this.getStatus());
      this.emit('exit', { code, signal, graceful: wasStopping });
    });

    this.emit('status', this.getStatus());
    return { ok: true, status: this.getStatus() };
  }

  _handleStdoutChunk(chunk) {
    this._stdoutBuffer += chunk.toString('utf8');
    let idx;
    while ((idx = this._stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this._stdoutBuffer.slice(0, idx).trim();
      this._stdoutBuffer = this._stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        this._applyEvent(msg);
      } catch (err) {
        this.emit('parse-error', { line, error: err.message });
      }
    }
  }

  _applyEvent(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready':
        this._state.ready = true;
        this._state.paused = Boolean(msg.paused);
        this._state.wakeEnabled = msg.wake_enabled !== false;
        this.emit('status', this.getStatus());
        break;
      case 'state':
        this._state.jarvisState = msg.state || 'INITIALISING';
        this.emit('status', this.getStatus());
        break;
      case 'mute_state':
        this._state.muted = Boolean(msg.muted);
        this.emit('status', this.getStatus());
        break;
      case 'pause_state':
        this._state.paused = Boolean(msg.paused);
        this.emit('status', this.getStatus());
        break;
      case 'webcam_state':
        this._state.webcamActive = Boolean(msg.active);
        this.emit('status', this.getStatus());
        break;
      default:
        break;
    }
    this.emit('event', msg);
  }

  sendCommand(payload) {
    if (!this._proc || !this._proc.stdin || this._proc.stdin.destroyed) {
      return false;
    }
    try {
      this._proc.stdin.write(JSON.stringify(payload) + '\n', 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  sendText(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    return this.sendCommand({ cmd: 'text_command', text: clean });
  }

  setMuted(muted) {
    return this.sendCommand({ cmd: 'set_muted', muted: Boolean(muted) });
  }

  setPaused(paused) {
    return this.sendCommand({ cmd: 'set_paused', paused: Boolean(paused) });
  }

  setWebcam(active) {
    return this.sendCommand({ cmd: 'set_webcam', active: Boolean(active) });
  }

  syncIslandState(state) {
    return this.sendCommand({ cmd: 'island_state', state: state || {} });
  }

  setApiKey(apiKey) {
    const clean = String(apiKey || '').trim();
    if (!clean) return false;
    return this.sendCommand({ cmd: 'set_api_key', api_key: clean });
  }

  ping() {
    return this.sendCommand({ cmd: 'ping' });
  }

  stop() {
    if (!this._proc) return Promise.resolve(true);
    this._stopping = true;
    const proc = this._proc;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {}
        finish();
      }, 1500);

      proc.once('exit', () => {
        clearTimeout(timer);
        finish();
      });

      const sent = this.sendCommand({ cmd: 'shutdown' });
      if (!sent) {
        clearTimeout(timer);
        try {
          proc.kill();
        } catch {}
        finish();
      }
    });
  }
}

module.exports = { BedoService, resolveBedoPaths };
