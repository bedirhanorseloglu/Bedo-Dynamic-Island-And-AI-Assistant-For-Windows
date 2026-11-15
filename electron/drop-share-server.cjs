const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function getMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function sanitizeFilename(rawName) {
  const base = path.basename(String(rawName || '').trim() || 'upload.bin');
  const cleaned = base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  const safe = cleaned || `upload_${Date.now()}.bin`;
  return safe.length > 140 ? safe.slice(0, 140) : safe;
}

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!Array.isArray(addrs)) continue;
    const isVirtual = /vethernet|wsl|hyper-v|vmware|virtualbox|loopback|docker/i.test(name);
    for (const addr of addrs) {
      if (!addr || addr.family !== 'IPv4' || addr.internal) continue;
      let score = 0;
      if (!isVirtual) score += 100;
      if (/wi-fi|wlan|wireless|ethernet/i.test(name)) score += 30;
      if (addr.address.startsWith('192.168.')) score += 20;
      else if (addr.address.startsWith('10.')) score += 15;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address)) score += 10;
      candidates.push({ address: addr.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || '127.0.0.1';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderMobileHtml(token, initialFiles = []) {
  const safeInitial = initialFiles.map(({ id, name, size, ext, isImage, source, addedAt }) => ({
    id,
    name,
    size,
    ext,
    isImage,
    source,
    addedAt,
  }));

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover" />
  <title>TwoCode Drop</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    @keyframes fadeSlide {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.25); }
    }
    @keyframes roboBlink {
      0%, 92%, 100% { transform: scaleY(1); }
      96% { transform: scaleY(0.08); }
    }
    @keyframes roboFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }
    @keyframes orbDrift {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(14px, -18px, 0) scale(1.06); }
    }
    body {
      margin: 0;
      min-height: 100dvh;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
      background:
        radial-gradient(62% 45% at 15% 8%, rgba(56, 189, 248, 0.24), transparent 65%),
        radial-gradient(58% 42% at 88% 18%, rgba(73, 218, 202, 0.22), transparent 62%),
        radial-gradient(65% 50% at 50% 96%, rgba(129, 140, 248, 0.18), transparent 65%),
        #05070c;
      color: #f4f7fb;
      padding: 20px 16px 44px;
      overflow-x: hidden;
    }
    .wrap { max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 15px; position: relative; }
    .hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px;
      border-radius: 24px;
      background: linear-gradient(145deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.07) 100%);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.2);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.32),
        inset 0 -1px 0 rgba(255,255,255,0.06),
        0 12px 32px rgba(0,0,0,0.38);
      animation: fadeSlide 0.3s ease both;
    }
    .hdr-left { display: flex; align-items: center; gap: 11px; }
    .robo-eyes {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px;
      border-radius: 999px;
      background: linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));
      border: 1px solid rgba(255,255,255,0.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
      animation: roboFloat 3.2s ease-in-out infinite;
    }
    .robo-eye {
      width: 7px; height: 14px; border-radius: 99px; background: #ffffff;
      box-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 18px rgba(73,218,202,0.45);
      animation: roboBlink 4.6s ease-in-out infinite;
      transition: height 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }
    .robo-eyes.is-happy .robo-eye {
      height: 6px; background: #49daca;
      box-shadow: 0 0 12px rgba(73,218,202,0.9);
    }
    .hdr-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #49daca; box-shadow: 0 0 10px rgba(73, 218, 202, 0.8); animation: pulseDot 2s ease-in-out infinite; }
    .count-pill {
      font-size: 11.5px; font-weight: 700; padding: 5px 11px; border-radius: 999px;
      background: linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.24);
      color: rgba(255,255,255,0.88);
    }
    .list { display: flex; flex-direction: column; gap: 12px; }
    .file-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 48%, rgba(255, 255, 255, 0.065) 100%);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -1px 0 rgba(255, 255, 255, 0.06),
        0 14px 34px rgba(0, 0, 0, 0.42);
      border-radius: 22px;
      overflow: hidden;
      animation: fadeSlide 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .preview-wrap {
      width: 100%; max-height: 280px; overflow: hidden;
      background: rgba(0,0,0,0.28);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; justify-content: center;
    }
    .preview-wrap img { width: 100%; max-height: 280px; object-fit: contain; display: block; }
    .file-body { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 15px; }
    .meta { min-width: 0; flex: 1; }
    .name { font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; }
    .sub { font-size: 12px; color: rgba(255,255,255,0.56); margin-top: 3px; }
    .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .btn {
      text-decoration: none; font-size: 12.5px; font-weight: 700;
      padding: 8px 14px; border-radius: 999px;
      transition: transform 0.14s ease, opacity 0.14s ease, background 0.16s ease;
    }
    .btn:active { transform: scale(0.95); }
    .btn-ghost {
      background: linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06));
      border: 1px solid rgba(255,255,255,0.2);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.26);
      color: #ffffff;
    }
    .btn-primary {
      background: linear-gradient(160deg, rgba(255,255,255,0.96), rgba(226,236,248,0.88));
      border: 1px solid rgba(255,255,255,0.65);
      box-shadow: inset 0 1px 0 #ffffff, 0 4px 14px rgba(255,255,255,0.16);
      color: #06090f;
    }
    .upload-card {
      background: linear-gradient(145deg, rgba(73, 218, 202, 0.16) 0%, rgba(255, 255, 255, 0.04) 55%, rgba(56, 189, 248, 0.12) 100%);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(126, 234, 224, 0.34);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        inset 0 -1px 0 rgba(255, 255, 255, 0.08),
        0 14px 34px rgba(0, 0, 0, 0.36);
      border-radius: 22px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      display: block;
      transition: background 0.18s ease, border-color 0.18s ease, transform 0.14s ease;
      animation: fadeSlide 0.35s ease both;
    }
    .upload-card:active {
      transform: scale(0.985);
      background: linear-gradient(145deg, rgba(73, 218, 202, 0.24), rgba(56, 189, 248, 0.16));
      border-color: rgba(126, 234, 224, 0.6);
    }
    .upload-label { font-size: 14.5px; font-weight: 700; color: #a7f3eb; letter-spacing: -0.01em; }
    .status { font-size: 12px; color: rgba(255,255,255,0.68); margin-top: 5px; min-height: 16px; }
    .empty {
      text-align: center; padding: 36px 16px; color: rgba(255,255,255,0.55);
      font-size: 13.5px;
      background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025));
      backdrop-filter: blur(24px) saturate(160%);
      -webkit-backdrop-filter: blur(24px) saturate(160%);
      border-radius: 22px;
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="hdr-left">
        <div id="roboEyes" class="robo-eyes" aria-hidden="true">
          <span class="robo-eye"></span>
          <span class="robo-eye"></span>
        </div>
        <div class="hdr-title">TwoCode Drop</div>
      </div>
      <span id="countPill" class="count-pill">${safeInitial.length} dosya</span>
    </div>

    <div id="list" class="list"></div>

    <label class="upload-card">
      <input id="fileInput" type="file" multiple hidden />
      <div class="upload-label">+ PC'ye Gönder</div>
      <div id="status" class="status"></div>
    </label>
  </div>
  <script>
    const TOKEN = ${JSON.stringify(token)};
    const INITIAL_FILES = ${JSON.stringify(safeInitial).replace(/</g, '\\u003c')};
    const listEl = document.getElementById('list');
    const countEl = document.getElementById('countPill');
    const statusEl = document.getElementById('status');
    const inputEl = document.getElementById('fileInput');
    let lastSignature = '';

    function fmt(b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }

    function esc(s) {
      return String(s || '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }

    function canPreviewInline(ext) {
      return ['.pdf', '.txt', '.md', '.json', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.mp3'].includes((ext || '').toLowerCase());
    }

    function renderFiles(items) {
      const sig = items.map((f) => f.id + ':' + f.size).join('|');
      if (sig === lastSignature) return;
      lastSignature = sig;
      countEl.textContent = items.length + ' dosya';
      if (!items.length) {
        listEl.innerHTML = '<div class="empty">Henüz dosya yok</div>';
        return;
      }
      listEl.innerHTML = items.map((f, idx) => {
        const inlineUrl = '/s/' + TOKEN + '/f/' + encodeURIComponent(f.id) + '?inline=1';
        const dlUrl = '/s/' + TOKEN + '/f/' + encodeURIComponent(f.id);
        const preview = f.isImage
          ? '<a class="preview-wrap" href="' + inlineUrl + '" target="_blank"><img src="' + inlineUrl + '" alt="" loading="lazy" /></a>'
          : '';
        const viewBtn = canPreviewInline(f.ext)
          ? '<a class="btn btn-ghost" href="' + inlineUrl + '" target="_blank">Aç</a>'
          : '';
        return '<div class="file-card" style="animation-delay:' + Math.min(idx * 45, 220) + 'ms">' +
          preview +
          '<div class="file-body">' +
            '<div class="meta"><div class="name">' + esc(f.name) + '</div><div class="sub">' + fmt(f.size) + '</div></div>' +
            '<div class="actions">' + viewBtn + '<a class="btn btn-primary" href="' + dlUrl + '">İndir</a></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function refresh() {
      try {
        const res = await fetch('/s/' + TOKEN + '/list');
        if (!res.ok) return;
        const data = await res.json();
        renderFiles(data.files || []);
      } catch {}
    }

    inputEl.addEventListener('change', async () => {
      const files = Array.from(inputEl.files || []);
      if (!files.length) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusEl.textContent = 'Gönderiliyor (' + (i + 1) + '/' + files.length + ')';
        try {
          const res = await fetch('/s/' + TOKEN + '/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Filename': encodeURIComponent(file.name),
            },
            body: file,
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          statusEl.textContent = 'Gönderildi ✓';
          const eyes = document.getElementById('roboEyes');
          if (eyes) {
            eyes.classList.add('is-happy');
            setTimeout(() => eyes.classList.remove('is-happy'), 1200);
          }
        } catch (err) {
          statusEl.textContent = 'Hata: ' + (err.message || 'Yüklenemedi');
        }
      }
      inputEl.value = '';
      refresh();
    });

    renderFiles(INITIAL_FILES);
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
}

class DropShareServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.uploadDir = options.uploadDir || path.join(os.tmpdir(), 'twocode-drop');
    this.preferredPort = options.port ?? 4343;
    this.maxFiles = options.maxFiles || 20;
    this.maxUploadBytes = options.maxUploadBytes || 200 * 1024 * 1024;
    this.token = crypto.randomBytes(3).toString('hex');
    this.files = [];
    this.server = null;
    this.port = 0;
  }

  getFiles() {
    return this.files.filter((item) => fs.existsSync(item.path));
  }

  addFile(filePath, source = 'pc') {
    if (!filePath || typeof filePath !== 'string') return null;
    const resolved = path.resolve(filePath);
    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;

    const existing = this.files.find((f) => f.path === resolved);
    if (existing) {
      existing.size = stat.size;
      existing.addedAt = Date.now();
      this.emit('change', this.getFiles());
      return existing;
    }

    const ext = path.extname(resolved).toLowerCase();
    const entry = {
      id: crypto.randomBytes(4).toString('hex'),
      name: path.basename(resolved),
      path: resolved,
      size: stat.size,
      ext,
      mime: getMimeType(resolved),
      isImage: IMAGE_EXTS.has(ext),
      addedAt: Date.now(),
      source,
    };

    this.files = [entry, ...this.files].slice(0, this.maxFiles);
    this.emit('change', this.getFiles());
    return entry;
  }

  addFiles(paths = [], source = 'pc') {
    const added = [];
    for (const p of paths) {
      const item = this.addFile(p, source);
      if (item) added.push(item);
    }
    return added;
  }

  removeFile(id) {
    const prevLen = this.files.length;
    this.files = this.files.filter((f) => f.id !== id);
    if (this.files.length !== prevLen) {
      this.emit('change', this.getFiles());
      return true;
    }
    return false;
  }

  clearFiles() {
    this.files = [];
    this.emit('change', []);
  }

  getStatus() {
    const running = Boolean(this.server && this.server.listening);
    const lanIp = detectLanIp();
    return {
      running,
      lanIp,
      port: this.port,
      token: this.token,
      url: running ? `http://${lanIp}:${this.port}/s/${this.token}` : '',
    };
  }

  _uniqueUploadPath(safeName) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    const ext = path.extname(safeName);
    const stem = ext ? safeName.slice(0, -ext.length) : safeName;
    let candidate = path.join(this.uploadDir, safeName);
    let idx = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(this.uploadDir, `${stem}-${idx}${ext}`);
      idx += 1;
    }
    return candidate;
  }

  _handleRequest(req, res) {
    const reqUrl = String(req.url || '/').split('?')[0];
    const prefix = `/s/${this.token}`;

    if (reqUrl !== prefix && !reqUrl.startsWith(`${prefix}/`)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Forbidden' }));
    }

    const subPath = reqUrl.slice(prefix.length) || '/';

    if (req.method === 'GET' && subPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderMobileHtml(this.token, this.getFiles()));
    }

    if (req.method === 'GET' && subPath === '/list') {
      const list = this.getFiles().map(({ id, name, size, ext, isImage, source, addedAt }) => ({
        id,
        name,
        size,
        ext,
        isImage,
        source,
        addedAt,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, files: list }));
    }

    if (req.method === 'GET' && subPath.startsWith('/f/')) {
      const fileId = decodeURIComponent(subPath.slice(3));
      const item = this.getFiles().find((f) => f.id === fileId);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      }
      const stat = fs.statSync(item.path);
      const encodedName = encodeURIComponent(item.name).replace(/'/g, '%27');
      const isInline = /[?&]inline=1(?:&|$)/.test(String(req.url || ''));
      const disposition = isInline ? 'inline' : 'attachment';
      res.writeHead(200, {
        'Content-Type': item.mime || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
      });
      const stream = fs.createReadStream(item.path);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return stream.pipe(res);
    }

    if (req.method === 'POST' && subPath === '/upload') {
      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength > this.maxUploadBytes) {
        res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
        return res.end(JSON.stringify({ ok: false, error: 'File too large' }), () => {
          try { req.destroy(); } catch {}
        });
      }
      let rawHeaderName = req.headers['x-filename'] || 'upload.bin';
      try {
        rawHeaderName = decodeURIComponent(String(rawHeaderName));
      } catch {}
      const safeName = sanitizeFilename(rawHeaderName);
      const destPath = this._uniqueUploadPath(safeName);
      this.emit('phone-upload-start', {
        name: safeName,
        size: contentLength > 0 ? contentLength : 0,
        ext: path.extname(safeName).toLowerCase(),
      });
      const out = fs.createWriteStream(destPath);
      let received = 0;
      let aborted = false;

      const unlinkAsyncSafe = () => {
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
      };

      const failAndCleanup = (code, msg) => {
        if (aborted) return;
        aborted = true;
        out.once('close', unlinkAsyncSafe);
        out.destroy();
        if (!res.headersSent) {
          res.writeHead(code, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify({ ok: false, error: msg }), () => {
            try { req.destroy(); } catch {}
          });
        }
      };

      req.on('data', (chunk) => {
        if (aborted) return;
        received += chunk.length;
        if (received > this.maxUploadBytes) {
          req.pause();
          failAndCleanup(413, 'File too large');
          return;
        }
        out.write(chunk);
      });

      req.on('end', () => {
        if (aborted) return;
        out.end(() => {
          const entry = this.addFile(destPath, 'phone');
          if (entry) {
            this.emit('phone-upload', entry);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: entry }));
        });
      });

      req.on('error', () => failAndCleanup(400, 'Upload aborted'));
      out.on('error', () => failAndCleanup(500, 'Write failed'));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }

  async start() {
    if (this.server && this.server.listening) {
      return this.getStatus();
    }
    const tryListen = (portToTry) =>
      new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => this._handleRequest(req, res));
        srv.once('error', (err) => {
          reject(err);
        });
        srv.listen(portToTry, '0.0.0.0', () => {
          this.server = srv;
          const addr = srv.address();
          this.port = typeof addr === 'object' && addr ? addr.port : portToTry;
          resolve(this.getStatus());
        });
      });

    try {
      return await tryListen(this.preferredPort);
    } catch {
      return await tryListen(0);
    }
  }

  async stop() {
    if (!this.server) return this.getStatus();
    const srv = this.server;
    this.server = null;
    this.port = 0;
    return new Promise((resolve) => {
      try {
        srv.closeAllConnections?.();
        srv.close(() => resolve(this.getStatus()));
      } catch {
        resolve(this.getStatus());
      }
    });
  }
}

module.exports = {
  DropShareServer,
  detectLanIp,
  sanitizeFilename,
  formatBytes,
  getMimeType,
};
