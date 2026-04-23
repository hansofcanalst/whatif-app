import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPrompt, isPremiumCategory, buildScopedPrompt } from './prompts';

const FREE_CAP = 3;
// Image edit/generation model. Overridable via env. Keep default in sync
// with app/api/generate+api.ts.
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const RATE_LIMIT_PER_MINUTE = 10;

interface GenerateBody {
  imageBase64: string;
  category: string;
  subcategoryIds: string[];
  // Optional people-scoping (from the detection step). When present and
  // the image has multiple people, we wrap each subcategory prompt with
  // a "only transform these people" preamble. Omitted / empty means
  // transform the whole image (original behavior).
  selectedPeopleLabels?: string[];
  totalPeopleInImage?: number;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

async function verifyAuth(req: functions.https.Request): Promise<string> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing bearer token');
  }
  const token = header.substring(7);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

async function checkRateLimit(uid: string): Promise<void> {
  const ref = admin.firestore().collection('rateLimits').doc(uid);
  const now = Date.now();
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStart?: number; count?: number } | undefined;
    const windowStart = data?.windowStart ?? 0;
    const count = data?.count ?? 0;
    if (now - windowStart < 60_000) {
      if (count >= RATE_LIMIT_PER_MINUTE) {
        throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
      }
      tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    } else {
      tx.set(ref, { windowStart: now, count: 1 });
    }
  });
}

async function checkQuotaAndCategory(uid: string, category: string): Promise<void> {
  const userRef = admin.firestore().collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'User not found');
  const user = snap.data() as { freeGenerationsUsed?: number; subscriptionStatus?: string };
  const isPro = user.subscriptionStatus === 'pro';
  if (isPremiumCategory(category) && !isPro) {
    const err: any = new Error('Paywall required: premium category');
    err.status = 402;
    throw err;
  }
  if (!isPro && (user.freeGenerationsUsed ?? 0) >= FREE_CAP) {
    const err: any = new Error('Paywall required: free quota exceeded');
    err.status = 402;
    throw err;
  }
}

async function generateOne(imageBase64: string, prompt: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    { text: prompt },
  ]);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = (part as any).inlineData;
    if (inline?.data) return inline.data as string;
  }
  throw new Error('Model returned no image.');
}

async function uploadImage(
  uid: string,
  generationId: string,
  key: string,
  base64: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(`users/${uid}/generations/${generationId}/${key}.jpg`);
  const buf = Buffer.from(base64, 'base64');
  await file.save(buf, { contentType: 'image/jpeg', public: false });
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 });
  return url;
}

export const generate = functions
  .runWith({ timeoutSeconds: 120, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    try {
      const uid = await verifyAuth(req);
      const body = req.body as GenerateBody;
      if (!body?.imageBase64 || !body?.category || !Array.isArray(body.subcategoryIds)) {
        res.status(400).send('Invalid body');
        return;
      }
      if (body.subcategoryIds.length === 0) {
        res.status(400).send('No subcategories selected');
        return;
      }
      if (body.subcategoryIds.length > 6) {
        res.status(400).send('Too many subcategories');
        return;
      }

      await checkRateLimit(uid);

      try {
        await checkQuotaAndCategory(uid, body.category);
      } catch (e: any) {
        if (e?.status === 402) {
          res.status(402).send(e.message);
          return;
        }
        throw e;
      }

      const generationId = admin.firestore().collection('generations').doc().id;
      const genRef = admin.firestore().collection('generations').doc(generationId);

      const originalURL = await uploadImage(uid, generationId, 'original', body.imageBase64);

      await genRef.set({
        id: generationId,
        userId: uid,
        categoryId: body.category,
        categoryLabel: body.category,
        originalImageURL: originalURL,
        results: [],
        status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const results: Array<{ imageURL: string; prompt: string; label: string; subcategoryId: string }> = [];
      for (let i = 0; i < body.subcategoryIds.length; i++) {
        const subId = body.subcategoryIds[i];
        const meta = getPrompt(body.category, subId);
        if (!meta) continue;
        try {
          const scopedPrompt = buildScopedPrompt(
            meta.prompt,
            body.selectedPeopleLabels,
            body.totalPeopleInImage,
          );
          console.log('[fn/generate] ▼▼▼ PROMPT SENT TO NANO BANANA ▼▼▼');
          console.log('[fn/generate] subId:', subId, '| total:', body.totalPeopleInImage, '| selected:', body.selectedPeopleLabels);
          console.log(scopedPrompt);
          console.log('[fn/generate] ▲▲▲ END PROMPT ▲▲▲');
          const resultB64 = await generateOne(body.imageBase64, scopedPrompt);
          const url = await uploadImage(uid, generationId, `result_${i}`, resultB64);
          // Store the base (unwrapped) prompt — the gallery shows the
          // transformation the user asked for, not the scoping preamble.
          results.push({ imageURL: url, prompt: meta.prompt, label: meta.label, subcategoryId: subId });
        } catch (err) {
          console.warn(`Generation failed for ${subId}:`, err);
        }
      }

      if (results.length === 0) {
        await genRef.update({ status: 'failed' });
        res.status(500).send("This one didn't work out — try a different photo or category!");
        return;
      }

      await genRef.update({
        results: results.map(({ imageURL, prompt, label }) => ({ imageURL, prompt, label })),
        status: 'complete',
      });

      const userRef = admin.firestore().collection('users').doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data() as { subscriptionStatus?: string };
      if (user.subscriptionStatus !== 'pro') {
        await userRef.update({
          freeGenerationsUsed: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      res.status(200).json({ generationId, results });
    } catch (e: any) {
      console.error('generate failed', e);
      if (e instanceof functions.https.HttpsError) {
        res.status(e.code === 'unauthenticated' ? 401 : 500).send(e.message);
      } else {
        res.status(500).send(e?.message ?? 'Internal error');
      }
    }
  });
