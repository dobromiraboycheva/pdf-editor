# Building & Releasing PDF Editor

PDF Editor ships as:

- **Web / PWA** — installable from any browser, no build step (fastest path).
- **macOS** — universal `.dmg` + `.app` (Intel + Apple Silicon).
- **Windows** — `.msi` + `.exe` (NSIS).
- **Linux** — `.AppImage` + `.deb`.
- **Android** — `.apk`.

Native builds happen in **GitHub Actions** (`.github/workflows/release.yml`). Rust is
not required on the maintainer's machine — tag a release and CI produces every installer.

---

## 1. Web / PWA (no native toolchain needed)

```bash
npm install          # first time — pulls in vite-plugin-pwa
npm run build        # outputs dist/ with a service worker + manifest
npm run preview      # serve the production build locally
```

Deploy `dist/` to any static host (GitHub Pages, Netlify, Vercel, …). Users can then
**install it as a PWA**:

- **Chrome / Edge (desktop + Android):** click the install icon in the address bar, or
  menu → "Install app".
- **iOS Safari:** Share → "Add to Home Screen".

The service worker is registered only in the browser — it is disabled inside the Tauri
shell (see `src/lib/pwa/registerPwa.ts`, gated on `isTauri()`).

---

## 2. Release via CI (recommended)

All desktop + Android installers are produced by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers `.github/workflows/release.yml`, which:

- Builds macOS (universal), Windows, and Linux via `tauri-apps/tauri-action`.
- Builds the Android `.apk` in a dedicated job.
- Creates a **draft** GitHub Release and attaches all artifacts.

You can also run it manually from the Actions tab (`workflow_dispatch`).

After the run, review the draft release, then publish it. The in-app **Download page**
(`/download`) links users to `https://github.com/YOUR_REPO/releases` — replace
`YOUR_REPO` with your actual `owner/repo` slug in `src/pages/DownloadPage.tsx`.

---

## 3. Local desktop builds (optional — requires Rust)

Only needed if you want to build installers on your own machine.

Prerequisites:

- **Rust** (stable): https://rustup.rs
- **Node 20+**
- **macOS builds:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows builds:** Visual Studio Build Tools + WebView2 (bundled on Win 11)
- **Linux builds:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev`

```bash
npm install
npm run tauri:build                                   # current platform
npm run tauri build -- --target universal-apple-darwin # macOS universal (on a Mac)
```

Output lands in `src-tauri/target/**/release/bundle/`.

---

## 4. Local Android builds (optional — requires Rust + Android SDK)

Prerequisites:

- **Rust** with Android targets:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```
- **JDK 17**
- **Android Studio** (SDK + NDK). Set `ANDROID_HOME` / `ANDROID_SDK_ROOT` and
  `NDK_HOME` (e.g. `$ANDROID_SDK_ROOT/ndk/26.1.10909125`).

```bash
npm install
npx tauri android init          # one-time — scaffolds src-tauri/gen/android (git-ignored)
npx tauri android build --apk   # release APK
```

The APK lands under `src-tauri/gen/android/app/build/outputs/apk/`.

> The Android package name comes from the `identifier` in `src-tauri/tauri.conf.json`
> (`com.dobromira.pdfeditor`). It must be valid reverse-DNS — do not use a `.local` suffix.

---

## 5. iOS builds (optional — requires macOS + Xcode)

Not wired into CI, but supported by Tauri 2:

```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
npx tauri ios init
npx tauri ios build
```

Requires an Apple Developer account for device installs / App Store.

---

## Signing & secrets

### macOS (optional — unsigned builds work)

Set these repo secrets to produce a signed + notarized `.dmg`. Omit them for an
unsigned build (users right-click → Open the first time):

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | base64-encoded `.p12` Developer ID cert |
| `APPLE_CERTIFICATE_PASSWORD` | password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple ID email (for notarization) |
| `APPLE_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | 10-char team ID |

### Android (optional — debug key works for testing)

Without a keystore, the CI APK is signed with the debug key (installable, but not
upgrade-safe and not Play-Store eligible). For a proper release key, generate a keystore:

```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then add these secrets and wire them into `src-tauri/gen/android/keystore.properties`
(or the Gradle signing config) in the workflow:

| Secret | Purpose |
| --- | --- |
| `ANDROID_KEYSTORE` | base64-encoded `.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (e.g. `upload`) |
| `ANDROID_KEY_PASSWORD` | key password |

### Windows

Left unsigned by default — SmartScreen warns for new publishers regardless of an OV
cert. Add Azure Trusted Signing or SSL.com when ready.

---

## Bundle configuration reference

`src-tauri/tauri.conf.json`:

- `productName`: `"PDF Editor"`
- `identifier`: `com.dobromira.pdfeditor` (reverse-DNS — also the Android package name)
- `bundle.targets`: `["app", "dmg", "msi", "nsis", "appimage", "deb"]`
- Icons: generated in CI via `npx @tauri-apps/cli icon src-tauri/icons/icon.png`
