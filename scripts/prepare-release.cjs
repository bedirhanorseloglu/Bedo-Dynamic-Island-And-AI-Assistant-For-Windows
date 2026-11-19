const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_SRC = path.join(ROOT, 'electron');
const STAGE_ROOT = path.join(ROOT, 'build', 'release-stage');
const STAGE_ELECTRON = path.join(STAGE_ROOT, 'electron');
const STAGE_RUNTIME = path.join(STAGE_ROOT, 'bedo-runtime');

const EXCLUDED_RUNTIME_DIRS = new Set(['venv', '__pycache__', '.git']);
const EXCLUDED_RUNTIME_REL = new Set([
  'config/api_keys.json',
  'memory/memory.json',
  'memory/phone_book.json',
  'OKU_BENI.txt',
  'pyrightconfig.json',
  '.gitignore',
  'make_shortcut.py',
]);

function copyFilteredRuntime(srcDir, dstDir, relBase = '') {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_RUNTIME_DIRS.has(entry.name)) continue;
      copyFilteredRuntime(srcPath, dstPath, rel);
    } else {
      if (EXCLUDED_RUNTIME_REL.has(rel)) continue;
      if (/\.bat$/i.test(entry.name)) continue;
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function stripPySources(dir) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += stripPySources(full);
    } else if (entry.name.endsWith('.py')) {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  return removed;
}

function main() {
  console.log('[prepare-release] Cleaning staging directory...');
  fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(STAGE_ELECTRON, { recursive: true });

  // 1. Minify Electron CJS files & copy required .ps1 / .psm1 / .json assets
  let minifiedCount = 0;
  for (const entry of fs.readdirSync(ELECTRON_SRC, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const name = entry.name;
    if (/\.log$/i.test(name) || /^test-.*\.cjs$/i.test(name)) continue;
    const srcPath = path.join(ELECTRON_SRC, name);
    const dstPath = path.join(STAGE_ELECTRON, name);
    if (/\.(cjs|js)$/i.test(name)) {
      const code = fs.readFileSync(srcPath, 'utf8');
      const result = esbuild.transformSync(code, {
        loader: 'js',
        minify: true,
        legalComments: 'none',
        target: 'node20',
      });
      fs.writeFileSync(dstPath, result.code, 'utf8');
      minifiedCount += 1;
    } else if (/\.(ps1|psm1|json)$/i.test(name)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
  console.log(`[prepare-release] Minified ${minifiedCount} Electron JS/CJS files.`);

  // 2. Stage bedo-runtime without secrets/dev files & compile .py -> .pyc (legacy layout)
  const runtimeSrc = path.join(ELECTRON_SRC, 'bedo-runtime');
  copyFilteredRuntime(runtimeSrc, STAGE_RUNTIME);

  console.log('[prepare-release] Compiling Python runtime to .pyc bytecode...');
  execFileSync(
    'python',
    [
      '-c',
      'import compileall, sys; ok = compileall.compile_dir(sys.argv[1], force=True, legacy=True, optimize=1, quiet=1); sys.exit(0 if ok else 1)',
      STAGE_RUNTIME,
    ],
    { stdio: 'inherit' }
  );

  const removedPy = stripPySources(STAGE_RUNTIME);
  console.log(`[prepare-release] Compiled & stripped ${removedPy} .py source files.`);
}

main();
