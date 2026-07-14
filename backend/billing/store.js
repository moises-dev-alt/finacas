import { FieldValue, Timestamp, firestoreDb } from './firebase.js';
import { HttpError } from './errors.js';
import {
  defaultPublicSubscription,
  isCanonicalPublicSubscription,
  legacyPublicSubscription,
  publicSubscription,
  stripeSubscriptionIds,
} from './subscription.js';
import {
  createProTrialGrant,
  expiredProTrialGrant,
  proTrialPublicSubscription,
  shouldExpireProTrial,
} from './trial.js';

const WEBHOOK_LEASE_MS = 2 * 60 * 1000;
const CHECKOUT_ATTEMPT_LOCK_MS = 10 * 60 * 1000;

function safeDocumentId(value, label) {
  const id = String(value || '');
  if (!id || id.includes('/') || id.length > 200) {
    throw new HttpError(400, 'invalid_identifier', `${label} invalido.`);
  }
  return id;
}

function financeRef(uid) {
  return firestoreDb().doc(`users/${safeDocumentId(uid, 'Usuario')}/finance/current`);
}

function privateRef(uid) {
  return firestoreDb().doc(`billingPrivate/${safeDocumentId(uid, 'Usuario')}`);
}

function trialRef(uid) {
  return firestoreDb().doc(`trialGrants/${safeDocumentId(uid, 'Usuario')}`);
}

function checkoutAttemptRef(uid) {
  return firestoreDb().doc(`checkoutAttempts/${safeDocumentId(uid, 'Usuario')}`);
}

function customerRef(customerId) {
  return firestoreDb().doc(`stripeCustomers/${safeDocumentId(customerId, 'Cliente Stripe')}`);
}

function eventRef(eventId) {
  return firestoreDb().doc(`stripeWebhookEvents/${safeDocumentId(eventId, 'Evento Stripe')}`);
}

function freePublicState(current) {
  return {
    ...defaultPublicSubscription(),
    syncedAt: current?.syncedAt || null,
  };
}

function writePublicSubscription(target, reference, subscription) {
  target.set(reference, {
    subscription,
    updatedAt: FieldValue.serverTimestamp(),
  }, { mergeFields: ['subscription', 'updatedAt'] });
}

function timestampIdentity(value) {
  if (value && Number.isFinite(Number(value.seconds))) {
    return `${Number(value.seconds)}:${Number(value.nanoseconds || 0)}`;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return value || null;
}

export function privateBillingBinding(privateBilling) {
  if (!privateBilling || typeof privateBilling !== 'object') return null;
  return {
    stripeSubscriptionId: String(privateBilling.stripeSubscriptionId || ''),
    stripeCustomerId: String(privateBilling.stripeCustomerId || ''),
    lastStripeEventId: String(privateBilling.lastStripeEventId || ''),
    lastStripeEventCreated: Number(privateBilling.lastStripeEventCreated || 0),
    updatedAt: timestampIdentity(privateBilling.updatedAt),
  };
}

export function privateBillingBindingMatches(expected, current) {
  const left = privateBillingBinding(expected);
  const right = privateBillingBinding(current);
  if (!left || !right) return false;
  return Object.keys(left).every(field => left[field] === right[field]);
}

export function subscriptionNeedsCanonicalReset(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;

  const plan = String(subscription.plan || 'free');
  const status = String(subscription.status || 'active');
  if (plan !== 'free' || status !== 'active') return true;

  if (Boolean(subscription.entitled) || Boolean(subscription.canManage)) return true;
  if (subscription.provider || subscription.stripeStatus) return true;
  if (Boolean(subscription.cancelAtPeriodEnd)) return true;

  return [
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripePriceId',
    'currentPeriodEnd',
    'cancelAt',
    'upgradedAt',
    'canceledAt',
    'checkoutStartedAt',
  ].some(field => Boolean(subscription[field]));
}

export function unlinkedPublicSubscriptionResolution(current, {
  now = new Date(),
  trialGrant = null,
} = {}) {
  const legacyState = legacyPublicSubscription(current, { now });
  if (legacyState) {
    return {
      subscription: legacyState,
      needsWrite: !isCanonicalPublicSubscription(current, legacyState),
    };
  }

  const trialState = proTrialPublicSubscription(trialGrant, { now });
  if (trialState) {
    return {
      subscription: trialState,
      needsWrite: !isCanonicalPublicSubscription(current, trialState),
    };
  }

  const canonicalState = freePublicState(current);
  if (!current || !subscriptionNeedsCanonicalReset(current)) {
    return { subscription: canonicalState, needsWrite: false };
  }

  const synchronizedAt = now instanceof Date ? now : new Date(now);
  return {
    subscription: {
      ...defaultPublicSubscription(),
      syncedAt: synchronizedAt.toISOString(),
    },
    needsWrite: true,
  };
}

export async function resetPublicSubscription(uid, expectedPrivateBilling) {
  if (!expectedPrivateBilling) {
    throw new HttpError(500, 'billing_binding_required', 'O vinculo esperado da assinatura nao foi informado.');
  }

  const privateReference = privateRef(uid);
  const publicReference = financeRef(uid);
  return firestoreDb().runTransaction(async transaction => {
    const privateSnapshot = await transaction.get(privateReference);
    const publicSnapshot = await transaction.get(publicReference);
    const currentPrivateBilling = privateSnapshot.exists ? privateSnapshot.data() : null;

    if (!privateBillingBindingMatches(expectedPrivateBilling, currentPrivateBilling)) {
      return {
        bindingChanged: true,
        privateBilling: currentPrivateBilling,
        subscription: null,
      };
    }

    const current = publicSnapshot.data()?.subscription;
    const canonicalState = freePublicState(current);
    if (!current || !subscriptionNeedsCanonicalReset(current)) {
      return {
        bindingChanged: false,
        privateBilling: currentPrivateBilling,
        subscription: canonicalState,
      };
    }

    const publicState = {
      ...defaultPublicSubscription(),
      syncedAt: new Date().toISOString(),
    };
    writePublicSubscription(transaction, publicReference, publicState);
    return {
      bindingChanged: false,
      privateBilling: currentPrivateBilling,
      subscription: publicState,
    };
  });
}

/**
 * Resolve o estado publico somente enquanto o usuario continua sem qualquer
 * billingPrivate. A leitura dos dois documentos e a eventual gravacao ocorrem
 * na mesma transacao; se o webhook criar o vinculo Stripe no meio, o Firestore
 * repete a transacao e este helper sinaliza o vinculo em vez de sobrescreve-lo.
 */
export async function resolveUnlinkedPublicSubscription(uid, {
  authCreatedAt = null,
  trialEligibleSince = null,
  now = new Date(),
} = {}) {
  const privateReference = privateRef(uid);
  const publicReference = financeRef(uid);
  const trialReference = trialRef(uid);
  const synchronizedAt = now instanceof Date ? now : new Date(now);

  return firestoreDb().runTransaction(async transaction => {
    const privateSnapshot = await transaction.get(privateReference);

    if (privateSnapshot.exists) {
      return {
        linked: true,
        privateBilling: privateSnapshot.data(),
        subscription: null,
      };
    }

    const publicSnapshot = await transaction.get(publicReference);
    const trialSnapshot = await transaction.get(trialReference);

    let trialGrant = trialSnapshot.exists ? trialSnapshot.data() : null;
    if (!trialSnapshot.exists && authCreatedAt && trialEligibleSince) {
      trialGrant = createProTrialGrant(authCreatedAt, {
        eligibleSince: trialEligibleSince,
        now: synchronizedAt,
      });
      if (trialGrant) transaction.set(trialReference, trialGrant);
    }

    if (shouldExpireProTrial(trialGrant, { now: synchronizedAt })) {
      trialGrant = expiredProTrialGrant(trialGrant, { now: synchronizedAt });
      transaction.set(trialReference, { expiredAt: trialGrant.expiredAt }, { merge: true });
    }

    const current = publicSnapshot.data()?.subscription;
    const resolution = unlinkedPublicSubscriptionResolution(current, {
      now: synchronizedAt,
      trialGrant,
    });
    if (resolution.needsWrite) {
      writePublicSubscription(transaction, publicReference, resolution.subscription);
    }
    return {
      linked: false,
      privateBilling: null,
      subscription: resolution.subscription,
    };
  });
}

export async function readPrivateBilling(uid) {
  const snapshot = await privateRef(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function claimCheckoutAttempt(uid, attemptId, { now = new Date() } = {}) {
  const reference = checkoutAttemptRef(uid);
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowTime)) {
    throw new HttpError(500, 'checkout_clock_invalid', 'Nao foi possivel iniciar o checkout agora.');
  }

  return firestoreDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const currentExpiresAt = snapshot.data()?.expiresAt;
    const currentExpiresAtMs = typeof currentExpiresAt?.toMillis === 'function'
      ? currentExpiresAt.toMillis()
      : new Date(currentExpiresAt || 0).getTime();

    if (Number.isFinite(currentExpiresAtMs) && currentExpiresAtMs > nowTime) {
      return { claimed: false, retryAt: new Date(currentExpiresAtMs).toISOString() };
    }

    const expiresAtMs = nowTime + CHECKOUT_ATTEMPT_LOCK_MS;
    transaction.set(reference, {
      attemptId: String(attemptId || ''),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
    });
    return { claimed: true, retryAt: new Date(expiresAtMs).toISOString() };
  });
}

function subscriptionSyncPayload(subscription, options = {}) {
  const ids = stripeSubscriptionIds(subscription);
  if (!ids.stripeSubscriptionId || !ids.stripeCustomerId) {
    throw new HttpError(502, 'stripe_subscription_invalid', 'A assinatura retornada pelo Stripe esta incompleta.');
  }

  const publicState = publicSubscription(subscription, options);
  const privateUpdate = {
    ...ids,
    lastAction: options.action || null,
    lastActorUid: options.actorUid || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (options.eventId) privateUpdate.lastStripeEventId = options.eventId;
  if (options.eventType) privateUpdate.lastStripeEventType = options.eventType;
  if (Number(options.eventCreated) > 0) {
    privateUpdate.lastStripeEventCreated = Number(options.eventCreated);
  }

  return { ids, privateUpdate, publicState };
}

function writeSubscriptionSync(target, uid, payload) {
  target.set(financeRef(uid), {
    subscription: payload.publicState,
    updatedAt: FieldValue.serverTimestamp(),
  }, { mergeFields: ['subscription', 'updatedAt'] });

  target.set(privateRef(uid), payload.privateUpdate, { merge: true });

  target.set(customerRef(payload.ids.stripeCustomerId), {
    uid,
    stripeSubscriptionId: payload.ids.stripeSubscriptionId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function syncSubscription(uid, subscription, options = {}) {
  const payload = subscriptionSyncPayload(subscription, options);
  const batch = firestoreDb().batch();
  writeSubscriptionSync(batch, uid, payload);
  await batch.commit();
  return payload.publicState;
}

export async function syncSubscriptionIfBindingUnchanged(
  uid,
  subscription,
  expectedPrivateBilling,
  options = {},
) {
  if (!expectedPrivateBilling) {
    throw new HttpError(500, 'billing_binding_required', 'O vinculo esperado da assinatura nao foi informado.');
  }

  const payload = subscriptionSyncPayload(subscription, options);
  const privateReference = privateRef(uid);
  return firestoreDb().runTransaction(async transaction => {
    const privateSnapshot = await transaction.get(privateReference);
    const currentPrivateBilling = privateSnapshot.exists ? privateSnapshot.data() : null;
    if (!privateBillingBindingMatches(expectedPrivateBilling, currentPrivateBilling)) {
      return {
        bindingChanged: true,
        privateBilling: currentPrivateBilling,
        subscription: null,
      };
    }

    writeSubscriptionSync(transaction, uid, payload);
    return {
      bindingChanged: false,
      privateBilling: currentPrivateBilling,
      subscription: payload.publicState,
    };
  });
}

export async function resolveSubscriptionUid(subscription) {
  const ids = stripeSubscriptionIds(subscription);
  const metadataUid = String(subscription?.metadata?.firebaseUid || '');
  let mappedUid = '';

  if (ids.stripeCustomerId) {
    const customer = await customerRef(ids.stripeCustomerId).get();
    mappedUid = String(customer.data()?.uid || '');
  }

  if (metadataUid && mappedUid && metadataUid !== mappedUid) {
    throw new HttpError(409, 'stripe_mapping_conflict', 'O cliente Stripe esta associado a outro usuario.');
  }

  return metadataUid || mappedUid || '';
}

export async function resolveCustomerUid(customerId) {
  if (!customerId) return '';
  const snapshot = await customerRef(customerId).get();
  return String(snapshot.data()?.uid || '');
}

export async function claimWebhookEvent(event) {
  const reference = eventRef(event.id);
  const now = Date.now();
  return firestoreDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() || {};
    if (current.status === 'processed') return 'duplicate';
    if (current.status === 'processing' && current.leaseUntil?.toMillis?.() > now) return 'busy';

    transaction.set(reference, {
      type: event.type,
      stripeCreated: Number(event.created || 0),
      livemode: Boolean(event.livemode),
      status: 'processing',
      attempts: Number(current.attempts || 0) + 1,
      leaseUntil: Timestamp.fromMillis(now + WEBHOOK_LEASE_MS),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: current.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'claimed';
  });
}

export async function completeWebhookEvent(event, result) {
  await eventRef(event.id).set({
    status: 'processed',
    result,
    leaseUntil: null,
    processedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function failWebhookEvent(event, error) {
  await eventRef(event.id).set({
    status: 'failed',
    lastErrorCode: String(error?.code || error?.type || error?.name || 'processing_error').slice(0, 120),
    leaseUntil: Timestamp.fromMillis(0),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
