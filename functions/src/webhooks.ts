import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

interface RCEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id?: string;
    expiration_at_ms?: number;
    original_app_user_id?: string;
  };
}

const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);
const INACTIVE_TYPES = new Set(['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE']);

function planFromProduct(productId?: string): 'weekly' | 'monthly' | 'yearly' {
  if (!productId) return 'monthly';
  if (productId.includes('weekly')) return 'weekly';
  if (productId.includes('yearly') || productId.includes('annual')) return 'yearly';
  return 'monthly';
}

export const revenuecatWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const expected = process.env.REVENUECAT_WEBHOOK_SECRET || functions.config().revenuecat?.secret;
    const auth = req.headers.authorization;
    if (expected && auth !== `Bearer ${expected}`) {
      res.status(401).send('unauthorized');
      return;
    }

    const body = req.body as RCEvent;
    const ev = body?.event;
    if (!ev?.app_user_id || !ev?.type) {
      res.status(400).send('bad event');
      return;
    }
    const uid = ev.app_user_id;
    const userRef = admin.firestore().collection('users').doc(uid);
    const subRef = admin.firestore().collection('subscriptions').doc(uid);

    if (ACTIVE_TYPES.has(ev.type)) {
      const plan = planFromProduct(ev.product_id);
      const expiresAt = ev.expiration_at_ms
        ? admin.firestore.Timestamp.fromMillis(ev.expiration_at_ms)
        : null;
      await userRef.set(
        {
          subscriptionStatus: 'pro',
          subscriptionExpiry: expiresAt,
          revenueCatId: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await subRef.set(
        {
          userId: uid,
          plan,
          isActive: true,
          expiresAt,
          revenueCatCustomerId: uid,
          lastWebhookEvent: ev.type,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else if (INACTIVE_TYPES.has(ev.type)) {
      await userRef.set(
        {
          subscriptionStatus: 'free',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await subRef.set(
        {
          userId: uid,
          isActive: false,
          lastWebhookEvent: ev.type,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    res.status(200).send('ok');
  } catch (e) {
    console.error('webhook failed', e);
    res.status(500).send('error');
  }
});
