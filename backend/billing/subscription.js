import { stripeObjectId } from './payment-link.js';

const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);
const TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);

const PUBLIC_SUBSCRIPTION_FIELDS = [
  'plan',
  'status',
  'entitled',
  'canManage',
  'provider',
  'stripeStatus',
  'cancelAtPeriodEnd',
  'currentPeriodEnd',
  'cancelAt',
  'upgradedAt',
  'canceledAt',
  'syncedAt',
];

const HISTORICAL_LEGACY_FIELDS = [
  'plan',
  'status',
  'checkoutStartedAt',
  'upgradedAt',
];

export function isTerminalSubscriptionStatus(status) {
  return TERMINAL_STATUSES.has(String(status || ''));
}

function isoFromUnix(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function isoFromDateValue(value) {
  if (value === null || value === undefined || value === '') return null;

  let date;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (
    value
    && typeof value === 'object'
    && Number.isFinite(Number(value.seconds))
  ) {
    date = new Date(Number(value.seconds) * 1000);
  } else {
    date = value instanceof Date ? value : new Date(value);
  }

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function hasExactFields(value, expectedFields) {
  const keys = Object.keys(value || {}).sort();
  const expected = [...expectedFields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isHistoricalLegacyShape(subscription, nowTime) {
  if (!hasExactFields(subscription, HISTORICAL_LEGACY_FIELDS)) return false;
  if (subscription.plan !== 'pro' || subscription.status !== 'active') return false;

  const checkoutStartedAt = subscription.checkoutStartedAt === null
    ? null
    : isoFromDateValue(subscription.checkoutStartedAt);
  if (subscription.checkoutStartedAt !== null && !checkoutStartedAt) return false;
  if (checkoutStartedAt && Date.parse(checkoutStartedAt) > nowTime) return false;
  return true;
}

function isCanonicalLegacyShape(subscription) {
  return hasExactFields(subscription, PUBLIC_SUBSCRIPTION_FIELDS)
    && subscription.plan === 'pro'
    && subscription.status === 'active'
    && subscription.entitled === true
    && subscription.canManage === false
    && subscription.provider === 'legacy'
    && subscription.stripeStatus === null
    && subscription.cancelAtPeriodEnd === false
    && subscription.currentPeriodEnd === null
    && subscription.cancelAt === null
    && subscription.canceledAt === null
    && Boolean(isoFromDateValue(subscription.syncedAt));
}

/**
 * Converte somente o formato Pro que era gravado pela ativacao manual antiga.
 * Estados ligados ao Stripe, contraditorios ou sem uma data de ativacao valida
 * nao sao considerados legado para que um vinculo quebrado nao conceda acesso.
 */
export function legacyPublicSubscription(subscription, { now = new Date() } = {}) {
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) return null;

  const normalizedNow = isoFromDateValue(now);
  const upgradedAt = isoFromDateValue(subscription.upgradedAt);
  if (!normalizedNow || !upgradedAt || Date.parse(upgradedAt) > Date.parse(normalizedNow)) return null;

  const historical = isHistoricalLegacyShape(subscription, Date.parse(normalizedNow));
  const canonical = isCanonicalLegacyShape(subscription);
  if (!historical && !canonical) return null;

  const syncedAt = canonical ? isoFromDateValue(subscription.syncedAt) : normalizedNow;

  return {
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
  };
}

export function isCanonicalPublicSubscription(subscription, expected) {
  if (!subscription || !expected) return false;
  if (!hasExactFields(subscription, PUBLIC_SUBSCRIPTION_FIELDS)) return false;
  return PUBLIC_SUBSCRIPTION_FIELDS.every(field => subscription[field] === expected[field]);
}

export function subscriptionPeriodEnd(subscription) {
  const ends = (subscription?.items?.data || [])
    .map(item => Number(item?.current_period_end))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!ends.length) return null;
  return isoFromUnix(Math.min(...ends));
}

export function publicSubscription(subscription, { eventCreated } = {}) {
  const stripeStatus = String(subscription?.status || 'canceled');
  const hasAccess = ACCESS_STATUSES.has(stripeStatus);
  const canceledAt = stripeStatus === 'canceled'
    ? isoFromUnix(subscription?.ended_at || eventCreated)
    : null;

  return {
    plan: hasAccess ? 'pro' : 'free',
    status: hasAccess ? 'active' : stripeStatus,
    entitled: hasAccess,
    canManage: !isTerminalSubscriptionStatus(stripeStatus),
    provider: 'stripe',
    stripeStatus,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    cancelAt: isoFromUnix(subscription?.cancel_at),
    upgradedAt: hasAccess ? isoFromUnix(subscription?.created) : null,
    canceledAt,
    syncedAt: new Date().toISOString(),
  };
}

export function stripeSubscriptionIds(subscription) {
  const firstItem = subscription?.items?.data?.[0];
  return {
    stripeSubscriptionId: stripeObjectId(subscription),
    stripeCustomerId: stripeObjectId(subscription?.customer),
    stripePriceId: stripeObjectId(firstItem?.price),
  };
}

export function defaultPublicSubscription() {
  return {
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
  };
}
