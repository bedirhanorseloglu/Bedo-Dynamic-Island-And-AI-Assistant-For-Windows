const https = require('https');

const KICK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const TR_CHAR_MAP = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

function transliterateToAscii(value) {
  return String(value || '').replace(/[çğıİöşü]/gi, (ch) => {
    const lower = ch.toLowerCase();
    return TR_CHAR_MAP[lower] || TR_CHAR_MAP[ch] || ch;
  });
}

function buildSlugVariants(rawName) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return [];

  const variants = [];
  const add = (slug) => {
    const clean = String(slug || '')
      .toLowerCase()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    if (clean && !variants.includes(clean)) {
      variants.push(clean);
    }
  };

  const ascii = transliterateToAscii(trimmed);
  for (const base of [trimmed.toLowerCase(), ascii.toLowerCase()]) {
    add(base.replace(/\s+/g, ''));
    if (/\s/.test(base)) {
      add(base.replace(/\s+/g, '-'));
      add(base.replace(/\s+/g, '_'));
    }
    add(base.replace(/[^a-z0-9_-]/g, ''));
  }

  return variants;
}

function extractKickStreamerCandidates(title = '', artist = '', album = '') {
  const titleStr = String(title || '').trim();
  const artistStr = String(artist || '').trim();
  const albumStr = String(album || '').trim();

  const rawNames = [];
  let isKick = false;

  const pushRaw = (val) => {
    const s = String(val || '').trim();
    if (s && !/^kick(?:\.com)?$/i.test(s) && !rawNames.includes(s)) {
      rawNames.push(s);
    }
  };

  // Standard Kick page title: "<Streamer> Live Stream - Watch Live on KICK"
  let m = titleStr.match(/^(.+?)\s+Live\s+Stream\s*[-–—|]\s*Watch\s+Live\s+on\s+KICK\b/i);
  if (m) {
    isKick = true;
    pushRaw(m[1]);
  }

  // Alternate Kick title: "<Streamer> - Watch Live on KICK"
  if (!m) {
    m = titleStr.match(/^(.+?)\s*[-–—|]\s*Watch\s+Live\s+on\s+KICK\b/i);
    if (m) {
      isKick = true;
      pushRaw(m[1]);
    }
  }

  // Generic "<...> - KICK" or "<...> | KICK"
  if (!m) {
    m = titleStr.match(/^(.+?)\s*[-–—|]\s*KICK\b/i);
    if (m) {
      isKick = true;
      const beforeKick = m[1].trim();
      const parts = beforeKick.split(/\s+[-–—|]\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        pushRaw(parts[parts.length - 1]);
        pushRaw(parts[0]);
      } else {
        pushRaw(beforeKick);
      }
    }
  }

  if (/\bkick(?:\.com)?\b/i.test(artistStr) || /\bkick(?:\.com)?\b/i.test(albumStr)) {
    isKick = true;
    if (artistStr && !/\bkick(?:\.com)?\b/i.test(artistStr)) {
      pushRaw(artistStr);
    }
    if (!rawNames.length && titleStr) {
      pushRaw(titleStr);
    }
  } else if (isKick && artistStr) {
    pushRaw(artistStr);
  }

  if (!isKick) {
    return { isKick: false, candidates: [] };
  }

  const candidates = [];
  for (const name of rawNames) {
    for (const slug of buildSlugVariants(name)) {
      if (!candidates.includes(slug)) {
        candidates.push(slug);
      }
    }
  }

  return { isKick: true, candidates };
}

function isKickStream(title = '', artist = '', album = '') {
  return extractKickStreamerCandidates(title, artist, album).isKick;
}

function fetchKickChannel(slug, { timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    if (!slug) return resolve(null);
    const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': KICK_USER_AGENT,
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 512 * 1024) {
            req.destroy();
            resolve(null);
          }
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function fetchImageAsDataUri(imageUrl, { timeoutMs = 4000, maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return resolve('');
    const req = https.get(
      imageUrl,
      {
        headers: {
          'User-Agent': KICK_USER_AGENT,
          Accept: 'image/*,*/*;q=0.8',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve('');
        }
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            return resolve('');
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (!chunks.length) return resolve('');
          const mime = (res.headers['content-type'] || 'image/webp').split(';')[0].trim();
          const buf = Buffer.concat(chunks);
          resolve(`data:${mime};base64,${buf.toString('base64')}`);
        });
      }
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
  });
}

function pickKickChannelImageUrl(channelData) {
  if (!channelData || typeof channelData !== 'object') return '';
  return (
    channelData.user?.profile_pic ||
    channelData.livestream?.thumbnail?.url ||
    channelData.banner_image?.url ||
    channelData.offline_banner_image?.src ||
    ''
  );
}

async function fetchKickStreamerCover(title = '', artist = '', album = '', deps = {}) {
  const { isKick, candidates } = extractKickStreamerCandidates(title, artist, album);
  if (!isKick || candidates.length === 0) return '';

  const getChannel = deps.fetchKickChannel || fetchKickChannel;
  const getImageDataUri = deps.fetchImageAsDataUri || fetchImageAsDataUri;

  for (const slug of candidates) {
    const channelData = await getChannel(slug);
    const imageUrl = pickKickChannelImageUrl(channelData);
    if (!imageUrl) continue;

    const dataUri = await getImageDataUri(imageUrl);
    return dataUri || imageUrl;
  }

  return '';
}

module.exports = {
  extractKickStreamerCandidates,
  isKickStream,
  pickKickChannelImageUrl,
  fetchKickChannel,
  fetchImageAsDataUri,
  fetchKickStreamerCover,
};
