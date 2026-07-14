import { randomUUID } from 'node:crypto';

import { configuredPaymentLinkUrl } from './config.js';
import { HttpError } from './errors.js';

const CHECKOUT_ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stripeObjectId(value) {
  if (typeof value === 'string') return value;
  return value?.id || '';
}

function parsedPaymentLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, 'invalid_payment_link', 'O link de pagamento nao foi configurado corretamente.');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'buy.stripe.com' || url.pathname === '/') {
    throw new HttpError(503, 'invalid_payment_link', 'O link de pagamento precisa ser um Payment Link HTTPS do Stripe.');
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function normalizedPaymentLink(value) {
  const url = parsedPaymentLink(value);
  url.search = '';
  return url;
}

function checkoutAttemptId(value) {
  const attemptId = String(value ?? randomUUID()).trim();
  if (!CHECKOUT_ATTEMPT_ID_PATTERN.test(attemptId)) {
    throw new HttpError(500, 'invalid_checkout_attempt_id', 'Nao foi possivel iniciar uma nova tentativa de pagamento.');
  }
  return attemptId.toLowerCase();
}

export function checkoutPaymentLink(uid, email, options = {}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(uid || ''))) {
    throw new HttpError(400, 'invalid_user_id', 'Identificador de usuario invalido.');
  }
  if (!email) {
    throw new HttpError(400, 'email_required', 'A conta precisa ter um e-mail para abrir o pagamento.');
  }

  const url = parsedPaymentLink(configuredPaymentLinkUrl());
  url.searchParams.set('client_reference_id', uid);
  url.searchParams.set('locked_prefilled_email', String(email).trim().toLowerCase());
  url.searchParams.set('utm_content', `mr_coin_${checkoutAttemptId(options?.attemptId)}`);
  return url.toString();
}

export async function verifyCheckoutPaymentLink(session, stripe) {
  if (session?.mode !== 'subscription') {
    throw new HttpError(400, 'invalid_checkout_mode', 'A sessao nao pertence a uma assinatura.');
  }

  const paymentLinkId = stripeObjectId(session.payment_link);
  if (!paymentLinkId) {
    throw new HttpError(400, 'payment_link_missing', 'A sessao nao foi criada pelo Payment Link configurado.');
  }

  const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);
  const expected = normalizedPaymentLink(configuredPaymentLinkUrl()).toString();
  const received = normalizedPaymentLink(paymentLink.url).toString();
  if (expected !== received) {
    throw new HttpError(400, 'payment_link_mismatch', 'A sessao pertence a outro Payment Link.');
  }

  return paymentLink;
}

export { stripeObjectId };
