const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

function bumpPatch(ver) {
  const parts = String(ver || '1.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join('.');
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const currentVersion = pkg.version;
  const suggested = bumpPatch(currentVersion);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\nBedo Otomatik Guncelleme Yayin Araci`);
    console.log(`Mevcut surum: v${currentVersion}`);
    const inputVer = await ask(rl, `Yeni surum numarasi [${suggested}]: `);
    const nextVersion = inputVer || suggested;

    if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
      console.error('Gecersiz surum formati. Ornek: 1.0.4');
      process.exit(1);
    }

    const confirm = await ask(
      rl,
      `\nBedo v${nextVersion} TUM KULLANICILAR icin otomatik guncelleme olarak yayinlansin mi? (E/H): `
    );
    if (!/^e(vet)?|y(es)?$/i.test(confirm)) {
      console.log('Yayin iptal edildi.');
      process.exit(0);
    }

    // 1. Update package.json version & clean old release files so only 1 latest .exe exists
    pkg.version = nextVersion;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    const releaseDir = path.join(ROOT, 'release');
    fs.rmSync(releaseDir, { recursive: true, force: true });
    fs.mkdirSync(releaseDir, { recursive: true });

    // 2. Build frontend + protected release stage
    run('npm run build');
    run('node scripts/prepare-release.cjs');

    // 3. Build single latest Bedo Setup <version>.exe + latest.yml (publishes to GitHub if GH_TOKEN is set)
    const hasToken = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    if (hasToken) {
      console.log('\nGH_TOKEN bulundu -> GitHub Release otomatik yukleniyor...');
      run('npx electron-builder --win nsis --publish always');
    } else {
      console.log('\nGH_TOKEN tanimli degil -> Tek guncel Setup.exe + latest.yml uretiliyor...');
      run('npx electron-builder --win nsis --publish never');
    }

    // Remove intermediate unpacked/debug artifacts so release/ stays clean with the single .exe (+ latest.yml)
    for (const extra of ['win-unpacked', 'squirrel-windows', 'builder-debug.yml']) {
      fs.rmSync(path.join(releaseDir, extra), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(releaseDir)) {
      if (entry.endsWith('.blockmap') || entry.endsWith('.zip')) {
        fs.rmSync(path.join(releaseDir, entry), { force: true });
      }
    }

    if (!hasToken) {
      console.log(
        `\nHazir! release/ klasorunde yalnizca guncel surum var:\n` +
        `  1) release/Bedo-Setup-${nextVersion}.exe\n` +
        `  2) release/latest.yml\n` +
        `GitHub v${nextVersion} Release'ine yukleyip Publish ettiginde tum kullanicilar otomatik guncellenir.`
      );
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
