import type { ProcessorContext, ProcessResult } from '@/types/tool';

export interface ProtectOptions {
  /** User password. In v1 we use it as both user and owner password. */
  password: string;
}

/**
 * Shape of the `@cantoo/pdf-lib` fork's added encryption API.
 *
 * The fork extends `PDFDocument` with an `encrypt(options)` method that
 * configures AES password protection; the next `save()` then writes the
 * encrypted document. See:
 *   https://github.com/cantoo-scribe/pdf-lib
 *   src/core/security/PDFSecurity.ts   (SecurityOptions, UserPermissions)
 *   src/api/PDFDocument.ts             (doc.encrypt(...))
 */
interface UserPermissions {
  printing?: boolean | 'lowResolution' | 'highResolution';
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
}

interface SecurityOptions {
  userPassword?: string;
  ownerPassword?: string;
  permissions?: UserPermissions;
}

/**
 * Minimum surface of `PDFDocument` we rely on. We deliberately do not
 * import the fork's types statically so this file still typechecks while
 * the package is being installed. The dynamic-import cast is the sole
 * concession to interop.
 */
interface EncryptablePdfDocument {
  encrypt(options: SecurityOptions): void;
  save(options?: { useObjectStreams?: boolean; addDefaultPage?: boolean }): Promise<Uint8Array>;
}

interface CantooModule {
  PDFDocument: {
    load(
      bytes: ArrayBuffer | Uint8Array,
      options?: { ignoreEncryption?: boolean },
    ): Promise<EncryptablePdfDocument>;
  };
}

/**
 * Real AES password protection via the `@cantoo/pdf-lib` fork.
 *
 * Flow:
 *   1. Load the PDF (bypassing existing encryption if any).
 *   2. Call `doc.encrypt({ userPassword, ownerPassword, permissions })`
 *      — this is the fork's addition on top of pdf-lib.
 *   3. `doc.save()` writes the encrypted stream.
 *
 * The user password and owner password are set to the same value in v1;
 * anyone opening the file needs it. Permissions are all granted so the
 * owner-password-equivalent user (i.e. the person who knows the password)
 * can print, edit, copy, etc.
 */
export async function protectProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();

  const opts = ctx.options as ProtectOptions;
  const password = (opts.password ?? '').trim();
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }

  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');

  ctx.onProgress?.(0.1, 'Loading PDF…');

  // Dynamic import so bundlers keep it off the initial chunk, and so the
  // build doesn't fail before the fork is installed.
  const cantoo = (await import('@cantoo/pdf-lib')) as unknown as CantooModule;
  const { PDFDocument } = cantoo;

  const bytes = file.arrayBuffer.slice(0);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  ctx.onProgress?.(0.5, 'Encrypting…');

  doc.encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: true,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: true,
    },
  });

  ctx.onProgress?.(0.9, 'Writing PDF…');

  const outputBytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });

  const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'protected.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
