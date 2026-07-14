import { randomUUID } from 'node:crypto';

import { canonicalUser, requireAdmin, requireUser } from './auth.js';
import { appUrl, configurationHealth, proTrialEligibleSince } from './config.js';
import { HttpError } from './errors.js';
import { json } from './http.js';
import { checkoutPaymentLink, stripeObjectId } from './payment-link.js';
import { stripeClient } from './stripe-client.js';
import {
  claimCheckoutAttempt,
  readPrivateBilling,
  resetPublicSubscription,
  resolveUnlinkedPublicSubscription,
  syncSubscription,
  syncSubscriptionIfBindingUnchanged,
} from './store.js';

const EXISTING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
]);
const STATUS_BINDING_RETRIES = 3;

function isMissingStripeResource(error) {
  return error?.code === 'resource_missing' || error?.statusCode === 404;
}

function assertSubscriptionOwner(uid, privateBilling, subscription) {
  const customerId = stripeObjectId(subscription?.customer);
  const metadataUid = String(subscription?.metadata?.firebaseUid || '');
  if (privateBilling?.stripeCustomerId && customerId !== privateBilling.stripeCustomerId) {
    throw new HttpError(409, 'stripe_customer_mismatch', 'A assinatura nao pertence ao cliente esperado.');
  }
  if (metadataUid && metadataUid !== uid) {
    throw new HttpError(409, 'stripe_user_mismatch', 'A assinatura nao pertence a este usuario.');
  }
}

function trialContext(user) {
  return {
    authCreatedAt: user?.metadata?.creationTime || null,
    trialEligibleSince: proTrialEligibleSince(),
  };
}

async function retrieveSubscription(uid, knownPrivateBilling = null) {
  const privateBilling = knownPrivateBilling || await readPrivateBilling(uid);
  const subscriptionId = privateBilling?.stripeSubscriptionId;
  if (!subscriptionId) {
    throw new HttpError(404, 'subscription_not_found', 'Nenhuma assinatura Stripe foi encontrada para esta conta.');
  }

  let subscription;
  try {
    subscription = await stripeClient().subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
  } catch (error) {
    if (isMissingStripeResource(error)) {
      throw new HttpError(404, 'subscription_not_found', 'A assinatura nao existe mais no Stripe.');
    }
    throw error;
  }
  assertSubscriptionOwner(uid, privateBilling, subscription);
  return { privateBilling, subscription };
}

async function retryCurrentSubscriptionStatus(uid, context, attempt) {
  if (attempt + 1 >= STATUS_BINDING_RETRIES) {
    throw new HttpError(
      503,
      'billing_state_changed',
      'A assinatura mudou durante a verificacao. Tente novamente.',
    );
  }
  return currentSubscriptionStatus(uid, context, attempt + 1);
}

async function resetOrRetryStatus(uid, privateBilling, context, attempt) {
  const reset = await resetPublicSubscription(uid, privateBilling);
  if (!reset.bindingChanged) return reset.subscription;
  return retryCurrentSubscriptionStatus(uid, context, attempt);
}

async function currentSubscriptionStatus(uid, context, attempt = 0) {
  let privateBilling = await readPrivateBilling(uid);

  if (!privateBilling) {
    const resolution = await resolveUnlinkedPublicSubscription(uid, context);
    if (!resolution.linked) return resolution.subscription;
    privateBilling = resolution.privateBilling;
  }

  if (!privateBilling?.stripeSubscriptionId) {
    return resetOrRetryStatus(uid, privateBilling, context, attempt);
  }

  try {
    const {
      privateBilling: retrievedPrivateBilling,
      subscription,
    } = await retrieveSubscription(uid, privateBilling);
    const synchronized = await syncSubscriptionIfBindingUnchanged(
      uid,
      subscription,
      retrievedPrivateBilling,
      { action: 'status', actorUid: uid },
    );
    if (synchronized.bindingChanged) return retryCurrentSubscriptionStatus(uid, context, attempt);
    return synchronized.subscription;
  } catch (error) {
    if (error instanceof HttpError && error.code === 'subscription_not_found') {
      return resetOrRetryStatus(uid, privateBilling, context, attempt);
    }
    throw error;
  }
}

async function syncCurrentSubscription(uid, subscription, options = {}) {
  return syncSubscription(uid, subscription, {
    action: options.action || 'status',
    actorUid: options.actorUid || uid,
  });
}

async function scheduleCancellation(uid, actorUid, action = 'cancel_at_period_end') {
  const { subscription } = await retrieveSubscription(uid);
  if (subscription.status === 'canceled') {
    throw new HttpError(409, 'subscription_already_canceled', 'Esta assinatura ja foi cancelada.');
  }

  const updated = subscription.cancel_at_period_end
    ? subscription
    : await stripeClient().subscriptions.update(subscription.id, { cancel_at_period_end: true });

  const publicState = await syncCurrentSubscription(uid, updated, { action, actorUid });
  return json({ subscription: publicState });
}

export async function health() {
  return json({
    ok: true,
    service: 'mr-coin-billing',
    configured: configurationHealth(),
    timestamp: new Date().toISOString(),
  });
}

export async function checkout(request) {
  const token = await requireUser(request);
  const user = await canonicalUser(token.uid);

  let privateBilling = await readPrivateBilling(token.uid);
  if (!privateBilling) {
    const resolution = await resolveUnlinkedPublicSubscription(token.uid, trialContext(user));
    if (!resolution.linked && resolution.subscription?.provider === 'legacy') {
      throw new HttpError(
        409,
        'legacy_subscription_active',
        'Esta conta ja possui acesso Pro legado e nao precisa iniciar outra assinatura.',
      );
    }
    privateBilling = resolution.privateBilling;
  }

  if (privateBilling?.stripeSubscriptionId) {
    try {
      const current = await stripeClient().subscriptions.retrieve(privateBilling.stripeSubscriptionId);
      if (EXISTING_SUBSCRIPTION_STATUSES.has(current.status)) {
        throw new HttpError(409, 'subscription_already_exists', 'Esta conta ja possui uma assinatura Stripe.');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  const attemptId = randomUUID();
  const url = checkoutPaymentLink(token.uid, user.email, { attemptId });
  const attempt = await claimCheckoutAttempt(token.uid, attemptId);
  if (!attempt.claimed) {
    throw new HttpError(
      409,
      'checkout_already_open',
      'Um checkout foi aberto recentemente. Use a aba de pagamento existente ou aguarde alguns minutos.',
    );
  }

  return json({ url });
}

export async function status(request) {
  const token = await requireUser(request);
  const user = await canonicalUser(token.uid);
  const subscription = await currentSubscriptionStatus(token.uid, trialContext(user));
  return json({
    subscription,
    serverNow: new Date().toISOString(),
  });
}

export async function portal(request) {
  const token = await requireUser(request);
  const privateBilling = await readPrivateBilling(token.uid);
  if (!privateBilling?.stripeCustomerId) {
    throw new HttpError(404, 'stripe_customer_not_found', 'Nenhum cliente Stripe foi encontrado para esta conta.');
  }

  const session = await stripeClient().billingPortal.sessions.create({
    customer: privateBilling.stripeCustomerId,
    return_url: `${appUrl()}/#assinatura`,
  });
  return json({ url: session.url });
}

export async function cancel(request) {
  const token = await requireUser(request);
  return scheduleCancellation(token.uid, token.uid);
}

export async function resume(request) {
  const token = await requireUser(request);
  const { subscription } = await retrieveSubscription(token.uid);
  if (subscription.status === 'canceled') {
    throw new HttpError(409, 'subscription_canceled', 'Uma assinatura encerrada nao pode ser retomada.');
  }

  const updated = subscription.cancel_at_period_end
    ? await stripeClient().subscriptions.update(subscription.id, { cancel_at_period_end: false })
    : subscription;
  const publicState = await syncCurrentSubscription(token.uid, updated, {
    action: 'resume',
    actorUid: token.uid,
  });
  return json({ subscription: publicState });
}

export async function adminCancel(request, targetUid) {
  const admin = await requireAdmin(request);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(targetUid || ''))) {
    throw new HttpError(400, 'target_user_required', 'Informe o usuario que sera cancelado.');
  }
  await canonicalUser(targetUid);
  return scheduleCancellation(targetUid, admin.uid, 'admin_cancel_at_period_end');
}
