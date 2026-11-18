import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractKickStreamerCandidates,
  isKickStream,
  pickKickChannelImageUrl,
  fetchKickStreamerCover,
} = require('../electron/kick-cover.cjs');

test('extractKickStreamerCandidates parses standard Kick live stream title', () => {
  const res = extractKickStreamerCandidates('Eray Live Stream - Watch Live on KICK', '');
  assert.equal(res.isKick, true);
  assert.deepEqual(res.candidates, ['eray']);
});

test('extractKickStreamerCandidates handles multi-word and Turkish streamer names', () => {
  const res = extractKickStreamerCandidates('Pinti Panda Live Stream - Watch Live on KICK', '');
  assert.equal(res.isKick, true);
  assert.ok(res.candidates.includes('pintipanda'));
  assert.ok(res.candidates.includes('pinti-panda'));
  assert.ok(res.candidates.includes('pinti_panda'));

  const trRes = extractKickStreamerCandidates('Çağrı - Watch Live on KICK', '');
  assert.equal(trRes.isKick, true);
  assert.ok(trRes.candidates.includes('cagri'));
});

test('extractKickStreamerCandidates detects Kick via artist/album metadata', () => {
  const res = extractKickStreamerCandidates('GTA VI RUN!', 'Elraenn', 'kick.com');
  assert.equal(res.isKick, true);
  assert.deepEqual(res.candidates, ['elraenn']);
});

test('isKickStream returns false for regular music tracks', () => {
  assert.equal(isKickStream('Blinding Lights', 'The Weeknd', 'After Hours'), false);
});

test('pickKickChannelImageUrl prefers user.profile_pic and falls back to stream/banner images', () => {
  assert.equal(
    pickKickChannelImageUrl({
      user: { profile_pic: 'https://files.kick.com/profile.webp' },
      livestream: { thumbnail: { url: 'https://stream.kick.com/thumb.jpg' } },
    }),
    'https://files.kick.com/profile.webp'
  );

  assert.equal(
    pickKickChannelImageUrl({
      user: {},
      livestream: { thumbnail: { url: 'https://stream.kick.com/thumb.jpg' } },
    }),
    'https://stream.kick.com/thumb.jpg'
  );
});

test('fetchKickStreamerCover resolves data URI from first matching candidate', async () => {
  const triedSlugs = [];
  const result = await fetchKickStreamerCover(
    'Pinti Panda Live Stream - Watch Live on KICK',
    '',
    '',
    {
      fetchKickChannel: async (slug) => {
        triedSlugs.push(slug);
        if (slug === 'pintipanda') {
          return { user: { profile_pic: 'https://files.kick.com/pintipanda.webp' } };
        }
        return null;
      },
      fetchImageAsDataUri: async (url) => {
        assert.equal(url, 'https://files.kick.com/pintipanda.webp');
        return 'data:image/webp;base64,AAAA';
      },
    }
  );

  assert.deepEqual(triedSlugs, ['pintipanda']);
  assert.equal(result, 'data:image/webp;base64,AAAA');
});
