# Bedo Modular Architecture Rule

When adding new features, UI surfaces, or backend capabilities to this repository, **always write modular code**:

1. **Separate modules over monolithic edits:**
   - Do not append large blocks of feature logic, state machines, UI subtrees, or CSS into monolithic files (`src/App.jsx`, `src/SettingsApp.jsx`, `electron/main.cjs`, `src/styles.css`, `src/settings.css`).
   - Extract new features into focused, single-responsibility modules:
     - Frontend UI & animations: `src/components/<feature>/...` with co-located styles (`<feature>.css`)
     - Pure domain data / state logic: `src/<domain>/...` (importable and testable in Node unit tests without Electron/DOM)
     - Electron main-process services: `electron/<service>.cjs` with dependency-injectable boundaries
2. **Thin integration hooks:**
   - Host files (`App.jsx`, `SettingsApp.jsx`, `main.cjs`, `preload.cjs`) should only import and wire the module via minimal props, IPC handlers, or callbacks.
3. **Testability:**
   - Add focused unit tests in `tests/<feature>.test.mjs` verifying pure logic and edge cases independently.

---

# Bedo Release & "What's New" Automation Rule

Whenever the user asks to **prepare, cut, or publish a new release** (e.g. *"release çıkar"*, *"yeni sürüm hazırla"*, *"güncelleme yayınla"*):

1. **Inspect changes automatically:**
   - Check `package.json` for the current version, determine the next semver version, and inspect `git log` / `git diff` since the previous release.
2. **Generate the "What's New" showcase automatically (`src/releases/releasesData.mjs`):**
   - Prepend a new release entry for the target version at the top of `RELEASES` in `src/releases/releasesData.mjs` without asking the user to write release notes manually.
   - Keep copy **ultra-concise and Apple-style** in both `tr` and `en` (max 3 highlights; 2–5 word title + 1 short sentence per highlight).
   - Pair each highlight with the best matching visual `preset` in `src/components/whats-new/WhatsNewVisualStage.jsx` (or add a clean new modular scene preset if a major new capability calls for its own animation).
3. **Design & Brand Guardrails (Strict):**
   - **Never** use `Sparkles` icons, `✨` emojis, or cliché AI decoration anywhere (UI, release cards, or GitHub Release notes).
   - **Never** add persistent promo/release banners to the expanded Dynamic Island home screen.
   - Always render **the user's personalized Bedo** (`outfit`, `bodyColor`, `eyeColorHex`, `seasonalOutfits` via `resolveRoboAppearance(settings)` in `src/roboAppearance.mjs` and `<BedoLogoMark appearance={settings} />` in `src/components/BedoLogoMark.jsx`) rather than a hardcoded static Bedo; only fall back to the default (`outfit: 'None'`, `bodyColor: 'Night'`, `eyeColorName: 'White'`, `eyeColorHex: '#ffffff'`) when the user has not customized those fields.
4. **GitHub Release Notes (Bilingual + Visual):**
   - Always write GitHub Release notes in **both Turkish and English** (`Türkçe` & `English` sections), concise and Apple-style, with **zero** sparkles (`✨`).
   - Whenever possible, generate and attach a clean monochrome/Apple-style showcase animation (`.gif`) or screenshot directly into the GitHub Release markdown description.
5. **Verify & Build:**
   - Bump `version` in `package.json`, run `tests/release-state.test.mjs` (and relevant unit tests), and run the release build pipeline (`npm run build` -> `node scripts/prepare-release.cjs` -> `electron-builder --win nsis`).
