import { canonicalUser } from './auth.js';
import { stripeWebhookSecret } from './config.js';
import { HttpError, asHttpError } from './errors.js';
import { json } from './http.js';
import { stripeObjectId, verifyCheckoutPaymentLink } from './payment-link.js';
import { stripeClient } from './stripe-client.js';
import { isTerminalSubscriptionStatus } from './subscription.js';
import {
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  readPrivateBilling,
  resolveCustomerUid,
  resolveSubscriptionUid,
  syncSubscription,
} from './store.js';

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function invoiceSubscriptionId(invoice) {
  return stripeObjectId(invoice?.subscription)
    || stripeObjectId(invoice?.parent?.subscription_details?.subscription);
}

async function retrieveSubscription(subscriptionId) {
  if (!subscriptionId) {
    throw new HttpError(400, 'subscription_missing', 'O evento nao contem uma assinatura.');
  }
  return stripeClient().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
}

function isMissingStripeResource(error) {
  return error?.code === 'resource_missing' || error?.statusCode === 404;
}

async function checkoutMayReplaceMapping(privateBilling, incomingSubscriptionId, incomingCustomerId) {
  if (!privateBilling) return true;
  const sameSubscription = privateBilling.stripeSubscriptionId === incomingSubscriptionId;
  const sameCustomer = !privateBilling.stripeCustomerId
    || privateBilling.stripeCustomerId === incomingCustomerId;
  if (sameSubscription && sameCustomer) return true;

  if (!privateBilling.stripeSubscriptionId) return true;
  try {
    const previous = await retrieveSubscription(privateBilling.stripeSubscriptionId);
    return isTerminalSubscriptionStatus(previous.status);
  } catch (error) {
    if (isMissingStripeResource(error)) return true;
    throw error;
  }
}

async function isCurrentSubscription(uid, subscriptionId) {
  const privateBilling = await readPrivateBilling(uid);
  return eventTargetsCurrentSubscription(privateBilling?.stripeSubscriptionId, subscriptionId);
}

export function eventTargetsCurrentSubscription(currentSubscriptionId, incomingSubscriptionId) {
  return !currentSubscriptionId || currentSubscriptionId === incomingSubscriptionId;
}

async function syncFromEvent(uid, subscription, event) {
  return syncSubscription(uid, subscription, {
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    action: 'stripe_webhook',
    actorUid: 'stripe',
  });
}

async function handleCheckoutCompleted(session, event) {
  const stripe = stripeClient();
  await verifyCheckoutPaymentLink(session, stripe);

  const uid = String(session.client_reference_id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new HttpError(400, 'checkout_user_missing', 'A sessao nao possui um usuario valido.');
  }

  const user = await canonicalUser(uid);
  const checkoutEmail = normalizedEmail(session.customer_details?.email || session.customer_email);
  if (!checkoutEmail || checkoutEmail !== normalizedEmail(user.email)) {
    throw new HttpError(400, 'checkout_email_mismatch', 'O e-mail do pagamento nao corresponde ao usuario.');
  }

  const subscriptionId = stripeObjectId(session.subscription);
  const sessionCustomerId = stripeObjectId(session.customer);
  let subscription = await retrieveSubscription(subscriptionId);
  const subscriptionCustomerId = stripeObjectId(subscription.customer);
  if (!sessionCustomerId || sessionCustomerId !== subscriptionCustomerId) {
    throw new HttpError(400, 'checkout_customer_mismatch', 'O cliente da assinatura nao corresponde ao checkout.');
  }

  const existingCustomerUid = await resolveCustomerUid(sessionCustomerId);
  if (existingCustomerUid && existingCustomerUid !== uid) {
    throw new HttpError(409, 'stripe_customer_already_linked', 'O cliente Stripe ja pertence a outro usuario.');
  }

  const privateBilling = await readPrivateBilling(uid);
  if (!(await checkoutMayReplaceMapping(privateBilling, subscriptionId, sessionCustomerId))) {
    throw new HttpError(409, 'user_already_linked', 'Este usuario ja possui outra assinatura Stripe ativa.');
  }

  const metadataUid = String(subscription.metadata?.firebaseUid || '');
  if (metadataUid && metadataUid !== uid) {
    throw new HttpError(409, 'stripe_user_mismatch', 'A assinatura ja pertence a outro usuario.');
  }

  if (!metadataUid) {
    await stripe.subscriptions.update(subscription.id, { metadata: { firebaseUid: uid } });
    subscription = await retrieveSubscription(subscription.id);
  }

  await syncFromEvent(uid, subscription, event);
  return { outcome: 'synced', uid, object: 'checkout.session' };
}

async function handleSubscriptionEvent(event) {
  const eventSubscription = event.data.object;
  const subscription = event.type === 'customer.subscription.deleted'
    ? eventSubscription
    : await retrieveSubscription(eventSubscription.id);
  const uid = await resolveSubscriptionUid(subscription);
  if (!uid) return { outcome: 'ignored', reason: 'subscription_without_user' };
  if (!(await isCurrentSubscription(uid, subscription.id))) {
    return { outcome: 'ignored', reason: 'stale_subscription_event' };
  }

  await syncFromEvent(uid, subscription, event);
  return { outcome: 'synced', uid, object: 'subscription' };
}

async function handleInvoiceEvent(invoice, event) {
  const customerId = stripeObjectId(invoice.customer);
  let uid = await resolveCustomerUid(customerId);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return { outcome: 'ignored', reason: 'invoice_without_subscription' };

  const subscription = await retrieveSubscription(subscriptionId);
  if (!uid) uid = await resolveSubscriptionUid(subscription);
  if (!uid) return { outcome: 'ignored', reason: 'invoice_without_user' };
  if (!(await isCurrentSubscription(uid, subscription.id))) {
    return { outcome: 'ignored', reason: 'stale_invoice_event' };
  }

  await syncFromEvent(uid, subscription, event);
  return { outcome: 'synced', uid, object: 'invoice' };
}

async function dispatch(event) {
  if (!HANDLED_EVENTS.has(event.type)) {
    return { outcome: 'ignored', reason: 'event_not_subscribed' };
  }

  if (event.type === 'checkout.session.completed') {
    return handleCheckoutCompleted(event.data.object, event);
  }
  if (event.type.startsWith('customer.subscription.')) {
    return handleSubscriptionEvent(event);
  }
  return handleInvoiceEvent(event.data.object, event);
}

function safeResult(result) {
  return {
    outcome: String(result?.outcome || 'processed'),
    reason: result?.reason ? String(result.reason).slice(0, 120) : null,
    object: result?.object ? String(result.object).slice(0, 80) : null,
  };
}

export async function stripeWebhook(request) {
  if (request.method !== 'POST') {
    const response = json({ error: 'method_not_allowed', message: 'Metodo nao permitido.' }, 405);
    response.headers.set('allow', 'POST');
    return response;
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return json({ error: 'signature_missing', message: 'Assinatura Stripe ausente.' }, 400);

  let stripe;
  let secret;
  try {
    stripe = stripeClient();
    secret = stripeWebhookSecret();
  } catch (rawError) {
    const error = asHttpError(rawError);
    console.error(`[billing] webhook_configuration_failed: ${rawError?.code || rawError?.name || 'error'}`);
    return json({ error: error.code, message: error.message }, error.status);
  }

  let event;
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.warn(`[billing] webhook_signature_invalid: ${error?.type || error?.name || 'error'}`);
    return json({ error: 'invalid_signature', message: 'Assinatura Stripe invalida.' }, 400);
  }

  let claim;
  try {
    claim = await claimWebhookEvent(event);
  } catch (rawError) {
    const error = asHttpError(rawError);
    console.error(`[billing] webhook_claim_failed: ${rawError?.code || rawError?.name || 'error'}`);
    return json({ error: error.code, message: error.message }, error.status);
  }

  if (claim === 'duplicate') return json({ received: true, duplicate: true });
  if (claim === 'busy') return json({ error: 'event_busy', message: 'Evento em processamento.' }, 409);

  try {
    const result = await dispatch(event);
    await completeWebhookEvent(event, safeResult(result));
    return json({ received: true, outcome: result.outcome });
  } catch (rawError) {
    const error = asHttpError(rawError);

    if (error.status >= 400 && error.status < 500) {
      console.warn(`[billing] webhook_ignored: ${error.code}`);
      await completeWebhookEvent(event, { outcome: 'ignored', reason: error.code });
      return json({ received: true, outcome: 'ignored' });
    }

    try {
      await failWebhookEvent(event, rawError);
    } catch (storageError) {
      console.error(`[billing] webhook_failure_record_failed: ${storageError?.code || storageError?.name || 'error'}`);
    }
    console.error(`[billing] webhook_processing_failed: ${rawError?.code || rawError?.type || rawError?.name || 'error'}`);
    return json({ error: error.code, message: error.message }, error.status);
  }
}
