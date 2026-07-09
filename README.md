# PDF Editor

**Private, local-first PDF tools.** Merge, split, compress, edit, convert, OCR, sign, protect and more — 32 tools that run entirely in your browser. Your files never leave your device.

🌐 **Live web app:** https://pdfeditor-app.vercel.app
📦 **Desktop installers:** [Releases](https://github.com/dobromiraboycheva/pdf-editor/releases)

Created by **Dobromira Boycheva**.

---

## Why

Unlike iLovePDF, Smallpdf and most online PDF tools, **nothing is uploaded to a server.**
Every operation happens client-side (in the browser or in the desktop app's WebView),
so your documents stay on your machine. That makes it faster, private, and usable offline.

## Features (32 tools)

**Organize** — Merge · Split · Rotate · Extract Pages · Crop · Organize · PDF↔JPG · HTML→PDF · PDF↔Markdown · Word/Excel/PowerPoint↔PDF · Scan (camera)

**Optimize** — Compress · Repair · OCR (English + Bulgarian) · PDF/A

**Edit** — Full editor (text, shapes, freehand, images, highlight, signature, region select) · Watermark · Page Numbers · Sign · PDF Forms · AI Summarize · Translate

**Security** — Protect (AES password) · Unlock · Redact · Compare

Plus: **dark mode**, **English + Bulgarian** UI, and **PWA install** on any device.

## Tech stack

- **React 18 + Vite 5 + TypeScript** (strict)
- **Tailwind CSS** + shadcn/ui components
- **pdf-lib** + **pdf.js** for PDF manipulation & rendering
- **Konva** for the annotation canvas
- **Tauri 2** for native desktop/mobile packaging
- **i18next** for localization
- **tesseract.js** (OCR), **mammoth** (DOCX), **docx** (PDF→Word), **JSZip**, **@cantoo/pdf-lib** (encryption)

## Develop

```bash
npm install
npm run dev        # http://localhost:1420
npm run build      # production web build → dist/
npm run typecheck  # tsc --noEmit
```

## Deploy

See [DEPLOY.md](./DEPLOY.md) for web (Vercel/Netlify), macOS `.dmg`, and Windows `.msi`/`.exe`.
See [BUILD.md](./BUILD.md) for native build prerequisites (Rust, Android SDK, signing).

**Quick native build (all platforms via CI):**
```bash
git tag v0.1.0 && git push origin --tags
```
GitHub Actions builds macOS + Windows + Linux + Android installers and attaches them to a release.

## Privacy

- No backend. No analytics. No account.
- Files are processed in memory and never transmitted.
- AI features (Summarize/Translate) are optional and use a key/provider you choose;
  the free translation provider (MyMemory) and the local extractive summarizer need no key.

## Security

See [SECURITY.md](./SECURITY.md) for the security model and how to report vulnerabilities.

## License

MIT © 2026 Dobromira Boycheva
