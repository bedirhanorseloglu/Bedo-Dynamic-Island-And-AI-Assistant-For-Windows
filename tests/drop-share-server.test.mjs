import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DropShareServer,
  sanitizeFilename,
  formatBytes,
} = require('../electron/drop-share-server.cjs');

test('sanitizeFilename strips path traversal and illegal Windows characters', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\secret<file>:name?.txt'), 'secret_file__name_.txt');
  assert.ok(sanitizeFilename('...').startsWith('upload_'));
});

test('formatBytes formats human-readable sizes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

test('DropShareServer manages shelf, enforces token, and serves downloads + uploads', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twocode-drop-test-'));
  const sampleFile = path.join(tmpDir, 'hello.txt');
  fs.writeFileSync(sampleFile, 'Merhaba TwoCode Drop!', 'utf8');

  const uploadDir = path.join(tmpDir, 'uploads');
  const srv = new DropShareServer({ port: 0, uploadDir, maxUploadBytes: 1024 });

  try {
    assert.equal(srv.addFile(path.join(tmpDir, 'missing.txt')), null);
    assert.equal(srv.addFile(tmpDir), null);

    const added = srv.addFile(sampleFile);
    assert.ok(added);
    assert.equal(added.name, 'hello.txt');
    assert.equal(srv.getFiles().length, 1);

    const status = await srv.start();
    assert.equal(status.running, true);
    assert.ok(status.port > 0);

    const baseLocal = `http://127.0.0.1:${status.port}`;

    // Unauthorized request without token -> 403
    const forbidden = await fetch(`${baseLocal}/s/wrongtoken/list`);
    assert.equal(forbidden.status, 403);

    // Valid list request
    const listRes = await fetch(`${baseLocal}/s/${status.token}/list`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.files.length, 1);
    assert.equal(listJson.files[0].name, 'hello.txt');

    // Mobile HTML directly embeds initial files
    const htmlRes = await fetch(`${baseLocal}/s/${status.token}`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('hello.txt'));

    // Download file (attachment) & inline preview
    const dlRes = await fetch(`${baseLocal}/s/${status.token}/f/${added.id}`);
    assert.equal(dlRes.status, 200);
    assert.ok(dlRes.headers.get('content-disposition')?.startsWith('attachment;'));
    assert.equal(await dlRes.text(), 'Merhaba TwoCode Drop!');

    const inlineRes = await fetch(`${baseLocal}/s/${status.token}/f/${added.id}?inline=1`);
    assert.equal(inlineRes.status, 200);
    assert.ok(inlineRes.headers.get('content-disposition')?.startsWith('inline;'));

    // Upload file from phone
    let changedCount = 0;
    const uploadStartEvents = [];
    const uploadDoneEvents = [];
    srv.on('change', () => { changedCount += 1; });
    srv.on('phone-upload-start', (meta) => { uploadStartEvents.push(meta); });
    srv.on('phone-upload', (file) => { uploadDoneEvents.push(file); });

    const upRes = await fetch(`${baseLocal}/s/${status.token}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent('../photo test.png'),
      },
      body: Buffer.from('PNGDATA'),
    });
    assert.equal(upRes.status, 200);
    const upJson = await upRes.json();
    assert.equal(upJson.ok, true);
    assert.equal(upJson.file.name, 'photo test.png');
    assert.equal(upJson.file.source, 'phone');
    assert.ok(changedCount >= 1);
    assert.equal(uploadStartEvents.length, 1);
    assert.equal(uploadStartEvents[0].name, 'photo test.png');
    assert.equal(uploadDoneEvents.length, 1);
    assert.equal(uploadDoneEvents[0].name, 'photo test.png');
    assert.equal(uploadDoneEvents[0].source, 'phone');
    assert.equal(srv.getFiles().length, 2);

    // Oversized upload -> 413 and no leftover file
    const bigRes = await fetch(`${baseLocal}/s/${status.token}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': 'too-big.bin',
      },
      body: Buffer.alloc(2048, 65),
    });
    assert.equal(bigRes.status, 413);
    assert.equal(fs.existsSync(path.join(uploadDir, 'too-big.bin')), false);

    // Remove & clear
    assert.equal(srv.removeFile(added.id), true);
    assert.equal(srv.getFiles().length, 1);
    srv.clearFiles();
    assert.equal(srv.getFiles().length, 0);
  } finally {
    await srv.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
