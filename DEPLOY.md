# Deploying PDF Editor

Three ways to ship, from easiest to most involved.

## 1. Web app — free, live in ~2 minutes

The app is a static site (`dist/`). Any static host works. Two free options:

### Vercel (recommended)
```bash
npm install -g vercel
vercel            # first run: log in + link project
vercel --prod     # deploy to production
```
`vercel.json` is already configured (Vite framework, SPA rewrites).

### Netlify (drag & drop, no CLI)
```bash
npm run build
```
Then drag the `dist/` folder onto https://app.netlify.com/drop — done.
Or connect the git repo; `netlify.toml` is already configured.

**PWA bonus:** once hosted over HTTPS, users can "Install" the app straight from
Chrome/Edge (install icon in the address bar) on Windows, Mac, Android, iOS —
no native build needed.

---

## 2. macOS installer (.dmg)

Requires **Rust + Xcode Command Line Tools** on a Mac.

```bash
# One-time setup:
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Build a universal .dmg (Intel + Apple Silicon):
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install
npm run tauri build -- --target universal-apple-darwin
```

Output: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/PDF Editor_0.1.0_universal.dmg`

**Unsigned note:** without an Apple Developer ID ($99/yr), macOS shows
"unidentified developer". Users right-click the app → **Open** → **Open** to bypass once.

---

## 3. Windows installer (.msi / .exe)

**Cannot be built from macOS** — Windows installers need WebView2 + the Windows
toolchain. Two options:

### Option A — build on a Windows machine
```powershell
# One-time: install Rust (https://rustup.rs) + "Desktop development with C++"
#           workload from Visual Studio Build Tools.
npm install
npm run tauri build
```
Output: `src-tauri\target\release\bundle\msi\PDF Editor_0.1.0_x64_en-US.msi`
and `...\bundle\nsis\PDF Editor_0.1.0_x64-setup.exe`

### Option B — GitHub Actions (no Windows machine needed) ✅ recommended
`.github/workflows/release.yml` builds **macOS + Windows + Linux** installers
automatically on a version tag:
```bash
git add -A
git commit -m "Release v0.1.0"
git tag v0.1.0
git push origin main --tags
```
Then open the repo's **Actions** tab → the workflow builds all installers and
attaches them to a **draft GitHub Release**. Publish it and share the download links.

**Unsigned note:** Windows SmartScreen shows "unknown publisher". Users click
**More info → Run anyway**. To remove the warning, add an OV code-signing cert
or Azure Trusted Signing later (see BUILD.md).

---

## Quickest path to "installable on Windows + Mac"

1. Push the repo to GitHub.
2. `git tag v0.1.0 && git push origin --tags`
3. Wait for the Actions run (~10-15 min).
4. Download `.dmg` (Mac) and `.msi`/`.exe` (Windows) from the draft Release.

No Rust, no Windows machine, no Mac signing needed for a first internal build.
