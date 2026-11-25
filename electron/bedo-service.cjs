const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function findSystemPythonExe() {
  const pathEnv = process.env.PATH || process.env.Path || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir.trim(), 'python.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function resolveBedoPaths(customProjectDir) {
  const candidateDirs = [
    customProjectDir,
    process.env.BEDO_PROJECT_DIR,
    process.resourcesPath ? path.join(process.resourcesPath, 'bedo-runtime') : '',
    path.join(__dirname, 'bedo-runtime'),
    path.resolve(__dirname, '..', '..', 'JARVIS'),
  ].filter(Boolean);

  const hasBridge = (dir) =>
    fs.existsSync(path.join(dir, 'bedo_bridge.py')) ||
    fs.existsSync(path.join(dir, 'bedo_bridge.pyc'));

  const projectDir =
    candidateDirs.find((d) => hasBridge(d)) ||
    candidateDirs[0];

  const candidatePythons = [
    path.join(projectDir, 'venv', 'Scripts', 'python.exe'),
    path.join(__dirname, 'bedo-runtime', 'venv', 'Scripts', 'python.exe'),
    path.resolve(__dirname, '..', '..', 'JARVIS', 'venv', 'Scripts', 'python.exe'),
    process.env.BEDO_BOOTSTRAP_PYTHON || '',
  ].filter(Boolean);

  const pythonExe =
    candidatePythons.find((p) => fs.existsSync(p)) ||
    findSystemPythonExe();

  const bridgePy = path.join(projectDir, 'bedo_bridge.py');
  const bridgePyc = path.join(projectDir, 'bedo_bridge.pyc');
  const bridgeScript = fs.existsSync(bridgePy) ? bridgePy : bridgePyc;
  return {
    projectDir,
    pythonExe,
    bridgeScript,
    available: Boolean(pythonExe && fs.existsSync(pythonExe) && fs.existsSync(bridgeScript)),
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
    this._systemMicMuted = false;
    this._lastStartOpts = null;
    this._restartCount = 0;
    this._restartTimer = null;
    this._state = {
      running: false,
      ready: false,
      jarvisState: 'INITIALISING',
      muted: false,
      speakerVolume: 1,
      speakerMuted: false,
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
    if (opts.openaiApiKey) {
      env.BEDO_OPENAI_API_KEY = String(opts.openaiApiKey).trim();
    }
    if (opts.anthropicApiKey) {
      env.BEDO_ANTHROPIC_API_KEY = String(opts.anthropicApiKey).trim();
    }
    if (opts.voice) {
      env.BEDO_VOICE = String(opts.voice).trim();
    }
    if (opts.speakerVolume !== undefined && Number.isFinite(Number(opts.speakerVolume))) {
      const clampedVol = Math.max(0, Math.min(1, Number(opts.speakerVolume)));
      this._state.speakerVolume = clampedVol;
      env.BEDO_SPEAKER_VOLUME = String(clampedVol);
    } else {
      env.BEDO_SPEAKER_VOLUME = String(this._state.speakerVolume ?? 1);
    }
    if (opts.speakerMuted !== undefined) {
      this._state.speakerMuted = Boolean(opts.speakerMuted);
    }
    env.BEDO_SPEAKER_MUTED = this._state.speakerMuted ? '1' : '0';

    this._stopping = false;
    this._lastStartOpts = { ...opts };
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
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
      if (!wasStopping && this._lastStartOpts && this._restartCount < 5) {
        this._restartCount += 1;
        this._restartTimer = setTimeout(() => {
          this._restartTimer = null;
          if (!this._proc && !this._stopping) {
            this.start({ ...this._lastStartOpts, startPaused: true });
          }
        }, 1500);
      }
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
        this._restartCount = 0;
        this._state.ready = true;
        this._state.paused = Boolean(msg.paused);
        this._state.wakeEnabled = msg.wake_enabled !== false;
        if (this._systemMicMuted) {
          this.sendCommand({ cmd: 'set_system_mic_muted', muted: true });
        }
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
      case 'speaker_state':
        if (Number.isFinite(Number(msg.volume))) {
          this._state.speakerVolume = Math.max(0, Math.min(1, Number(msg.volume)));
        }
        this._state.speakerMuted = Boolean(msg.muted);
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

  setSpeakerVolume(volume) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(Number(volume)) ? Number(volume) : 1));
    this._state.speakerVolume = clamped;
    this.emit('status', this.getStatus());
    return this.sendCommand({ cmd: 'set_speaker_volume', volume: clamped });
  }

  setSpeakerMuted(muted) {
    this._state.speakerMuted = Boolean(muted);
    this.emit('status', this.getStatus());
    return this.sendCommand({ cmd: 'set_speaker_muted', muted: this._state.speakerMuted });
  }

  setSystemMicMuted(muted) {
    this._systemMicMuted = Boolean(muted);
    return this.sendCommand({ cmd: 'set_system_mic_muted', muted: this._systemMicMuted });
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

  setProviderKeys(keys = {}) {
    return this.sendCommand({
      cmd: 'set_provider_keys',
      gemini_api_key: String(keys.geminiApiKey || '').trim(),
      openai_api_key: String(keys.openaiApiKey || '').trim(),
      anthropic_api_key: String(keys.anthropicApiKey || '').trim(),
    });
  }

  ping() {
    return this.sendCommand({ cmd: 'ping' });
  }

  stop() {
    this._stopping = true;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (!this._proc) return Promise.resolve(true);
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
