import assert from 'node:assert/strict';
import test from 'node:test';

import { firebaseCredentials } from '../billing/config.js';
import { checkoutPaymentLink } from '../billing/payment-link.js';
import {
  defaultPublicSubscription,
  isCanonicalPublicSubscription,
  isTerminalSubscriptionStatus,
  legacyPublicSubscription,
  publicSubscription,
  subscriptionPeriodEnd,
} from '../billing/subscription.js';
import {
  privateBillingBindingMatches,
  subscriptionNeedsCanonicalReset,
  unlinkedPublicSubscriptionResolution,
} from '../billing/store.js';
import { eventTargetsCurrentSubscription } from '../billing/webhook.js';

function withPaymentLink(value, action) {
  const previous = process.env.STRIPE_PAYMENT_LINK_URL;
  process.env.STRIPE_PAYMENT_LINK_URL = value;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env.STRIPE_PAYMENT_LINK_URL;
    else process.env.STRIPE_PAYMENT_LINK_URL = previous;
  }
}

function withFirebaseCredentialEnvironment(values, action) {
  const names = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  try {
    return action();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('credencial Firebase remove a formatacao copiada do JSON sem alterar o PEM', () => {
  withFirebaseCredentialEnvironment({
    FIREBASE_PROJECT_ID: 'financas-ed7aa',
    FIREBASE_CLIENT_EMAIL: '\"client_email\": \"firebase-adminsdk-test@financas-ed7aa.iam.gserviceaccount.com\",',
    FIREBASE_PRIVATE_KEY: '\"private_key\": \"-----BEGIN PRIVATE KEY-----\\nLINHA1\\nLINHA2\\n-----END PRIVATE KEY-----\\n\",',
  }, () => {
    assert.deepEqual(firebaseCredentials(), {
      projectId: 'financas-ed7aa',
      clientEmail: 'firebase-adminsdk-test@financas-ed7aa.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nLINHA1\nLINHA2\n-----END PRIVATE KEY-----',
    });
  });
});

function stripeSubscription(overrides = {}) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    created: 1_700_000_000,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          price: { id: 'price_123' },
        },
      ],
    },
    ...overrides,
  };
}

test('checkout vincula UID e bloqueia o e-mail autenticado', () => {
  withPaymentLink('https://buy.stripe.com/test_abc?utm_source=ignore', () => {
    const result = new URL(checkoutPaymentLink('firebase_UID-123', 'User@Example.com', {
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
    }));
    assert.equal(result.origin + result.pathname, 'https://buy.stripe.com/test_abc');
    assert.equal(result.searchParams.get('client_reference_id'), 'firebase_UID-123');
    assert.equal(result.searchParams.get('locked_prefilled_email'), 'user@example.com');
    assert.equal(result.searchParams.get('utm_source'), 'ignore');
    assert.equal(result.searchParams.get('utm_content'), 'mr_coin_123e4567-e89b-42d3-a456-426614174000');
  });
});

test('checkout gera uma tentativa unica para evitar cache da sessao anterior', () => {
  withPaymentLink('https://buy.stripe.com/test_abc', () => {
    const first = new URL(checkoutPaymentLink('firebase_UID-123', 'user@example.com'));
    const second = new URL(checkoutPaymentLink('firebase_UID-123', 'user@example.com'));
    const attemptPattern = /^mr_coin_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    assert.match(first.searchParams.get('utm_content'), attemptPattern);
    assert.match(second.searchParams.get('utm_content'), attemptPattern);
    assert.notEqual(first.searchParams.get('utm_content'), second.searchParams.get('utm_content'));
  });
});

test('checkout rejeita identificador de tentativa fora do formato UUID v4', () => {
  withPaymentLink('https://buy.stripe.com/test_abc', () => {
    for (const attemptId of ['', '../sessao-antiga', 'a'.repeat(151), '123e4567-e89b-12d3-a456-426614174000']) {
      assert.throws(
        () => checkoutPaymentLink('firebase_UID-123', 'user@example.com', { attemptId }),
        error => error?.code === 'invalid_checkout_attempt_id',
      );
    }
  });
});

test('checkout rejeita um link que não seja Payment Link HTTPS do Stripe', () => {
  withPaymentLink('https://example.com/checkout', () => {
    assert.throws(
      () => checkoutPaymentLink('firebase_UID-123', 'user@example.com'),
      error => error?.code === 'invalid_payment_link',
    );
  });
});

test('fim do período usa o menor current_period_end dos itens', () => {
  const subscription = stripeSubscription({
    items: {
      data: [
        { current_period_end: 1_800_000_100 },
        { current_period_end: 1_800_000_000 },
      ],
    },
  });
  assert.equal(subscriptionPeriodEnd(subscription), new Date(1_800_000_000 * 1000).toISOString());
});

test('active e past_due mantêm o direito ao plano Pro', () => {
  for (const status of ['active', 'past_due']) {
    const result = publicSubscription(stripeSubscription({ status }));
    assert.equal(result.plan, 'pro');
    assert.equal(result.status, 'active');
    assert.equal(result.entitled, true);
    assert.equal(result.stripeStatus, status);
  }
});

test('assinatura cancelada remove o direito ao Pro', () => {
  const result = publicSubscription(stripeSubscription({
    status: 'canceled',
    ended_at: 1_750_000_000,
  }));
  assert.equal(result.plan, 'free');
  assert.equal(result.entitled, false);
  assert.equal(result.canManage, false);
  assert.equal(result.canceledAt, new Date(1_750_000_000 * 1000).toISOString());
});

test('estado padrão nunca concede acesso pago', () => {
  assert.deepEqual(defaultPublicSubscription(), {
    plan: 'free',
    status: 'active',
    entitled: false,
    canManage: false,
    provider: null,
    stripeStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    cancelAt: null,
    upgradedAt: null,
    canceledAt: null,
    syncedAt: null,
  });
});

test('somente estados realmente encerrados permitem substituir o vínculo', () => {
  assert.equal(isTerminalSubscriptionStatus('canceled'), true);
  assert.equal(isTerminalSubscriptionStatus('incomplete_expired'), true);
  assert.equal(isTerminalSubscriptionStatus('active'), false);
  assert.equal(isTerminalSubscriptionStatus('past_due'), false);
});

test('evento de assinatura antiga não pode substituir a atual', () => {
  assert.equal(eventTargetsCurrentSubscription('', 'sub_new'), true);
  assert.equal(eventTargetsCurrentSubscription('sub_current', 'sub_current'), true);
  assert.equal(eventTargetsCurrentSubscription('sub_current', 'sub_old'), false);
});

test('somente estado legado ou órfão exige limpeza no Firestore', () => {
  assert.equal(subscriptionNeedsCanonicalReset(undefined), false);
  assert.equal(subscriptionNeedsCanonicalReset(defaultPublicSubscription()), false);
  assert.equal(subscriptionNeedsCanonicalReset({ plan: 'free', status: 'active' }), false);
  assert.equal(subscriptionNeedsCanonicalReset({ plan: 'pro', status: 'active' }), true);
  assert.equal(subscriptionNeedsCanonicalReset({ plan: 'free', status: 'active', entitled: true }), true);
  assert.equal(subscriptionNeedsCanonicalReset({ plan: 'free', status: 'active', provider: 'stripe' }), true);
});

test('Pro manual antigo é migrado para um estado legado canônico', () => {
  const upgradedAt = '2025-06-12T15:30:00.000Z';
  const syncedAt = '2026-07-14T12:00:00.000Z';
  const result = legacyPublicSubscription({
    plan: 'pro',
    status: 'active',
    checkoutStartedAt: '2025-06-12T15:20:00.000Z',
    upgradedAt,
  }, { now: new Date(syncedAt) });

  assert.deepEqual(result, {
    plan: 'pro',
    status: 'active',
    entitled: true,
    canManage: false,
    provider: 'legacy',
    stripeStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    cancelAt: null,
    upgradedAt,
    canceledAt: null,
    syncedAt,
  });
});

test('migração legada preserva e normaliza upgradedAt válido', () => {
  const canonical = {
    plan: 'pro',
    status: 'active',
    entitled: true,
    canManage: false,
    provider: 'legacy',
    stripeStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    cancelAt: null,
    upgradedAt: { seconds: 1_750_000_000 },
    canceledAt: null,
    syncedAt: '2026-07-14T12:00:00.000Z',
  };
  const result = legacyPublicSubscription(canonical, {
    now: new Date('2026-07-14T13:00:00.000Z'),
  });

  assert.equal(result.upgradedAt, new Date(1_750_000_000 * 1000).toISOString());
  assert.equal(result.provider, 'legacy');
  assert.equal(result.canManage, false);
});

test('Pro legado já canônico não precisa de nova gravação', () => {
  const historical = {
    plan: 'pro',
    status: 'active',
    checkoutStartedAt: null,
    upgradedAt: '2025-06-12T15:30:00.000Z',
  };
  const state = legacyPublicSubscription(historical, {
    now: new Date('2026-07-14T12:00:00.000Z'),
  });

  assert.equal(isCanonicalPublicSubscription(state, state), true);
  assert.equal(isCanonicalPublicSubscription({ ...state, checkoutStartedAt: null }, state), false);
  assert.equal(unlinkedPublicSubscriptionResolution(state, {
    now: new Date('2026-07-14T13:00:00.000Z'),
  }).needsWrite, false);
});

test('Pro órfão do Stripe ou estado contraditório nunca vira legado', () => {
  const base = {
    plan: 'pro',
    status: 'active',
    checkoutStartedAt: null,
    upgradedAt: '2025-06-12T15:30:00.000Z',
  };

  const suspicious = [
    { ...base, provider: 'stripe' },
    { ...base, stripeSubscriptionId: 'sub_orphan' },
    { ...base, stripe_customer_id: 'cus_orphan' },
    { ...base, stripeStatus: 'active' },
    { ...base, cancelAtPeriodEnd: true },
    { ...base, cancelAtPeriodEnd: 'false' },
    { ...base, cancelAtPeriodEnd: false, cancel_at_period_end: true },
    { ...base, entitled: false },
    { ...base, entitled: 'true' },
    { ...base, canManage: true },
    { ...base, status: 'canceled' },
    { ...base, upgradedAt: 'data-inválida' },
    { ...base, upgradedAt: '2027-06-12T15:30:00.000Z' },
    { plan: 'pro', status: 'active', upgradedAt: base.upgradedAt },
  ];

  for (const candidate of suspicious) {
    assert.equal(legacyPublicSubscription(candidate, {
      now: new Date('2026-07-14T12:00:00.000Z'),
    }), null);
  }
});

test('resolução sem billingPrivate migra legado e limpa Stripe órfão', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const legacy = unlinkedPublicSubscriptionResolution({
    plan: 'pro',
    status: 'active',
    checkoutStartedAt: null,
    upgradedAt: '2025-06-12T15:30:00.000Z',
  }, { now });
  assert.equal(legacy.subscription.provider, 'legacy');
  assert.equal(legacy.subscription.entitled, true);
  assert.equal(legacy.needsWrite, true);

  const orphan = unlinkedPublicSubscriptionResolution({
    plan: 'pro',
    status: 'active',
    entitled: true,
    provider: 'stripe',
    stripeStatus: 'active',
    upgradedAt: '2025-06-12T15:30:00.000Z',
  }, { now });
  assert.equal(orphan.subscription.plan, 'free');
  assert.equal(orphan.subscription.entitled, false);
  assert.equal(orphan.needsWrite, true);
});

test('reset só pode usar o mesmo vínculo privado observado pelo status', () => {
  const expected = {
    stripeSubscriptionId: 'sub_old',
    stripeCustomerId: 'cus_123',
    lastStripeEventId: 'evt_1',
    lastStripeEventCreated: 1_750_000_000,
    updatedAt: { seconds: 1_750_000_001, nanoseconds: 12 },
  };

  assert.equal(privateBillingBindingMatches(expected, { ...expected }), true);
  assert.equal(privateBillingBindingMatches(expected, {
    ...expected,
    stripeSubscriptionId: 'sub_new',
  }), false);
  assert.equal(privateBillingBindingMatches(expected, {
    ...expected,
    lastStripeEventId: 'evt_2',
    updatedAt: { seconds: 1_750_000_002, nanoseconds: 0 },
  }), false);
  assert.equal(privateBillingBindingMatches(expected, null), false);
});
