// Account data export ("Download my data").
//
// The privacy policy promises this; this is the implementation. Bundles
// everything tied to the user's account into a single zip and either
// triggers a browser download (web) or hands it to the system share
// sheet (native, via expo-sharing). Pure client-side — no Cloud
// Function involvement, no extra server cost — because the user already
// has read access to all their own Firestore docs and Storage URLs.
//
// Bundle layout:
//
//   whatif-export-<timestamp>.zip
//     ├── user.json                 — sanitized user doc (no internal
//     │                                tokens, no RC ids)
//     ├── README.txt                — orientation for the recipient
//     └── generations/
//         ├── <id1>/
//         │   ├── metadata.json     — category, prompts, timestamps
//         │   ├── original.jpg
//         │   ├── result_0.jpg
//         │   └── result_1.jpg
//         ├── <id2>/
//         │   └── ...
//
// Memory note: a typical user (a few dozen generations × ~6 images each
// at ~200 KB) lands at ~30-50 MB. JSZip generates the whole archive in
// memory, which is fine on web and modern mobile. Truly massive
// archives (hundreds of generations) might OOM on older Android — if
// that becomes a real complaint, the right fix is streaming output via
// `generateInternalStream`. Not optimizing prematurely.

import { Platform } from 'react-native';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { listGenerations, getUserDoc, type GenerationDoc, type UserDoc } from './firestore';

export type ExportProgress =
  | { step: 'fetching-meta' }
  | { step: 'fetching-images'; loaded: number; total: number }
  | { step: 'zipping' }
  | { step: 'saving' }
  | { step: 'done' };

/**
 * Bundle and deliver the user's data. On web, triggers a browser
 * download. On native, writes to the cache directory and opens the
 * share sheet (Files / iCloud / Drive / etc).
 *
 * Progress callback fires at each major phase boundary plus per-image
 * during the dominant fetch phase so the UI can show "Bundling 5 of
 * 24 files…" rather than an unmoving spinner.
 *
 * Throws on hard failures (auth, no user doc). Soft failures
 * (individual image 404, network blip on one fetch) are logged and
 * skipped — the user gets a partial export rather than nothing.
 */
export async function exportAccountData(
  uid: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  onProgress?.({ step: 'fetching-meta' });

  // Parallel-fetch the user doc and the generation list — they don't
  // depend on each other and the user usually has 1-30 generations
  // (small enough to slurp in one query).
  const [user, generations] = await Promise.all([
    getUserDoc(uid),
    listGenerations(uid),
  ]);

  const zip = new JSZip();

  // README — gives context to a recipient who might be an estate
  // executor, a privacy regulator, or just the user 6 months later
  // wondering what these files are.
  zip.file('README.txt', buildReadme(generations.length));

  // Sanitized user doc. Internal-only fields (push tokens, RC id) are
  // stripped — the user doesn't need them and they aren't useful
  // outside the app's runtime context.
  zip.file('user.json', JSON.stringify(sanitizeUser(user), null, 2));

  const genFolder = zip.folder('generations');
  if (!genFolder) {
    throw new Error('Failed to create generations folder in archive.');
  }

  // Each generation contributes 1 (original) + N (results) image
  // fetches. Counting them up front gives us a stable denominator for
  // the progress UI rather than a moving target.
  const totalImages = generations.reduce(
    (acc, g) => acc + 1 + (g.results?.length ?? 0),
    0,
  );
  let loaded = 0;
  const tick = () => {
    loaded++;
    onProgress?.({ step: 'fetching-images', loaded, total: totalImages });
  };

  for (const gen of generations) {
    const subFolder = genFolder.folder(gen.id);
    if (!subFolder) continue;

    subFolder.file('metadata.json', JSON.stringify(buildGenerationMeta(gen), null, 2));

    // Original. Soft-fail on 404/network — partial bundle beats no
    // bundle. The result-fetch loop below uses the same pattern.
    if (gen.originalImageURL) {
      try {
        const blob = await fetchAsArrayBuffer(gen.originalImageURL);
        subFolder.file('original.jpg', blob);
      } catch (e) {
        console.warn(`[export] original fetch failed for ${gen.id}:`, e);
      }
    }
    tick();

    for (let i = 0; i < gen.results.length; i++) {
      const r = gen.results[i];
      try {
        const buf = await fetchAsArrayBuffer(r.imageURL);
        subFolder.file(`result_${i}.jpg`, buf);
      } catch (e) {
        console.warn(`[export] result ${i} fetch failed for ${gen.id}:`, e);
      }
      tick();
    }
  }

  onProgress?.({ step: 'zipping' });
  const zipped = await zip.generateAsync({
    type: Platform.OS === 'web' ? 'blob' : 'base64',
    // DEFLATE level 6 is the JSZip default — good balance of speed and
    // size. Level 9 saves a few percent at significant CPU cost; not
    // worth it for an interactive operation.
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  onProgress?.({ step: 'saving' });
  const filename = `whatif-export-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  await deliver(zipped, filename);

  onProgress?.({ step: 'done' });
}

// ───────────────────────────── helpers ─────────────────────────────

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Strip fields that are runtime-only or that we'd rather not include
 * in a user-facing export (FCM/Expo push tokens, RC linkage, internal
 * bookkeeping). What's left is the data that's meaningful to the user
 * if they're migrating or backing up.
 */
function sanitizeUser(user: UserDoc | null): Record<string, unknown> {
  if (!user) return {};
  const u = user as UserDoc & {
    expoPushToken?: unknown;
    expoPushTokenPlatform?: unknown;
    expoPushTokenUpdatedAt?: unknown;
  };
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    freeGenerationsUsed: u.freeGenerationsUsed,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionExpiry: timestampToISO(u.subscriptionExpiry),
    createdAt: timestampToISO(u.createdAt),
    updatedAt: timestampToISO(u.updatedAt),
  };
}

function buildGenerationMeta(gen: GenerationDoc): Record<string, unknown> {
  return {
    id: gen.id,
    categoryId: gen.categoryId,
    categoryLabel: gen.categoryLabel,
    status: gen.status,
    createdAt: timestampToISO(gen.createdAt),
    // Strip the imageURL itself from the metadata — the actual bytes
    // are in the sibling original.jpg / result_*.jpg files. Keeping
    // the URL would just point at a Firestore Storage path that may
    // expire or be revoked; the bundled bytes are the durable copy.
    results: gen.results.map((r) => ({ label: r.label, prompt: r.prompt })),
  };
}

function timestampToISO(ts: { toDate?: () => Date } | null | undefined): string | null {
  if (!ts) return null;
  try {
    return ts.toDate?.()?.toISOString() ?? null;
  } catch {
    return null;
  }
}

function buildReadme(generationCount: number): string {
  return [
    'What If — Account Data Export',
    '=============================',
    '',
    `This archive contains your account data and ${generationCount} generation${
      generationCount === 1 ? '' : 's'
    } as of ${new Date().toISOString()}.`,
    '',
    'Layout:',
    '  user.json              — your account profile (email, plan, etc.)',
    '  generations/<id>/      — one folder per generation',
    '    metadata.json        — what was generated (category, prompts, timestamps)',
    '    original.jpg         — the photo you uploaded',
    '    result_N.jpg         — the AI-transformed images',
    '',
    'Image bytes are embedded in this archive — they will keep working',
    "even if the original cloud URLs expire later. There's no software",
    'you need to install to view them; any image viewer works.',
    '',
  ].join('\n');
}

/**
 * Hand the finished zip to the platform-appropriate sink.
 *
 *   - Web: build a Blob URL and click a temporary <a download>. Works
 *     in every modern browser without permissions.
 *   - Native: write the zip into the cache directory (where Expo
 *     allows app-private writes) and open the system share sheet via
 *     expo-sharing. From there the user picks Files / iCloud / Drive /
 *     mail / etc. We use base64 from JSZip + writeAsStringAsync rather
 *     than streaming because expo-file-system's streaming API isn't
 *     stable across SDK versions.
 */
async function deliver(zipped: Blob | string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!(zipped instanceof Blob)) {
      throw new Error('expected Blob on web');
    }
    const url = URL.createObjectURL(zipped);
    try {
      // Programmatic <a> click — the standard browser-download trick.
      // Both Safari and Chromium-based browsers honor `download`.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Free the blob URL after a short delay; some browsers still
      // hold the reference briefly while the download is initiated.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }

  // Native path.
  if (typeof zipped !== 'string') {
    throw new Error('expected base64 string on native');
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('cacheDirectory unavailable');
  const path = `${cacheDir}${filename}`;
  await FileSystem.writeAsStringAsync(path, zipped, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/zip',
      dialogTitle: 'Save your What If data',
      UTI: 'public.zip-archive',
    });
  } else {
    // Sharing unavailable shouldn't happen on real devices, but if it
    // does we leave the file in cache so the user can find it via
    // the device file manager.
    console.warn(`[export] sharing unavailable; file at ${path}`);
  }
}
