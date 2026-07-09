# Security Policy

## Our security model

PDF Editor is a **client-side, local-first** application. Its architecture is the
first line of defense:

- **No backend.** There is no server that stores, processes, or transmits your files.
  Every PDF operation runs in your browser (or the desktop app's WebView).
- **Files never leave your device.** They are read into memory, processed, and the
  result is offered as a download. Nothing is uploaded.
- **No analytics, no tracking, no accounts.**
- **Optional AI features** (Summarize / Translate) only send data to a provider you
  explicitly choose, using an API key you provide, directly from your browser. The
  free translation provider (MyMemory) and the local extractive summarizer need no key.
  The default paths involve no third party.

## Supported versions

The latest release on the `main` branch is supported. Older tagged releases are not
patched.

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**. Instead:

1. Email the maintainer, or
2. Use GitHub's **private vulnerability reporting** (Security tab → "Report a vulnerability").

Please include: affected version, reproduction steps, and impact. We aim to acknowledge
within a few days.

## Known considerations

- **Malformed PDFs**: rendering relies on Mozilla's `pdf.js`. We track its releases and
  update promptly; automated dependency updates are enabled (Dependabot).
- **OCR models**: `tesseract.js` downloads language models on first use. If you require a
  fully air-gapped setup, bundle the models locally.
- **Unsigned installers**: desktop/mobile installers are currently unsigned. Verify the
  download source (this repository's Releases page) before installing.
- **API keys**: AI feature keys are stored in your browser's localStorage and sent
  directly to the chosen provider. Treat them as you would any secret; use scoped keys.

## Dependency hygiene

- Production dependencies are audited (`npm audit --omit=dev`) and currently report **no
  known vulnerabilities**.
- Development tooling (Vite, Vitest, esbuild) may carry advisories that do not affect the
  shipped product; they are updated on a regular cadence.
