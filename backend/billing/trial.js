const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const PRO_TRIAL_DURATION_DAYS = 7;
export const PRO_TRIAL_SCHEMA_VERSION = 1;

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

export function createProTrialGrant(authCreatedAt, {
  eligibleSince,
  now = new Date(),
} = {}) {
  const startsAt = isoFromDateValue(authCreatedAt);
  const normalizedEligibleSince = isoFromDateValue(eligibleSince);
  const decidedAt = isoFromDateValue(now);
  if (!startsAt || !normalizedEligibleSince || !decidedAt) return null;

  const endsAt = new Date(
    Date.parse(startsAt) + (PRO_TRIAL_DURATION_DAYS * DAY_MS),
  ).toISOString();

  const startTime = Date.parse(startsAt);
  const eligibleSinceTime = Date.parse(normalizedEligibleSince);
  const decidedTime = Date.parse(decidedAt);

  return {
    schemaVersion: PRO_TRIAL_SCHEMA_VERSION,
    durationDays: PRO_TRIAL_DURATION_DAYS,
    eligible: startTime >= eligibleSinceTime
      && startTime <= decidedTime + MAX_CLOCK_SKEW_MS,
    authCreatedAt: startsAt,
    eligibleSince: normalizedEligibleSince,
    startsAt,
    endsAt,
    decidedAt,
    expiredAt: null,
  };
}

export function normalizeProTrialGrant(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== PRO_TRIAL_SCHEMA_VERSION) return null;
  if (value.durationDays !== PRO_TRIAL_DURATION_DAYS) return null;
  if (typeof value.eligible !== 'boolean') return null;

  const authCreatedAt = isoFromDateValue(value.authCreatedAt);
  const eligibleSince = isoFromDateValue(value.eligibleSince);
  const startsAt = isoFromDateValue(value.startsAt);
  const endsAt = isoFromDateValue(value.endsAt);
  const decidedAt = isoFromDateValue(value.decidedAt);
  const expiredAt = value.expiredAt ? isoFromDateValue(value.expiredAt) : null;
  if (!authCreatedAt || !eligibleSince || !startsAt || !endsAt || !decidedAt) return null;
  if (value.expiredAt && !expiredAt) return null;
  if (authCreatedAt !== startsAt) return null;

  const expectedEnd = Date.parse(startsAt) + (PRO_TRIAL_DURATION_DAYS * DAY_MS);
  if (Date.parse(endsAt) !== expectedEnd) return null;

  const expectedEligibility = Date.parse(startsAt) >= Date.parse(eligibleSince)
    && Date.parse(startsAt) <= Date.parse(decidedAt) + MAX_CLOCK_SKEW_MS;
  if (value.eligible !== expectedEligibility) return null;

  return {
    schemaVersion: PRO_TRIAL_SCHEMA_VERSION,
    durationDays: PRO_TRIAL_DURATION_DAYS,
    eligible: value.eligible,
    authCreatedAt,
    eligibleSince,
    startsAt,
    endsAt,
    decidedAt,
    expiredAt,
  };
}

export function shouldExpireProTrial(grant, { now = new Date() } = {}) {
  const normalized = normalizeProTrialGrant(grant);
  const normalizedNow = isoFromDateValue(now);
  if (!normalized || !normalizedNow || !normalized.eligible || normalized.expiredAt) return false;
  return Date.parse(normalizedNow) >= Date.parse(normalized.endsAt);
}

export function expiredProTrialGrant(grant, { now = new Date() } = {}) {
  const normalized = normalizeProTrialGrant(grant);
  const normalizedNow = isoFromDateValue(now);
  if (!normalized || !normalizedNow || !shouldExpireProTrial(normalized, { now: normalizedNow })) {
    return normalized;
  }
  return { ...normalized, expiredAt: normalizedNow };
}

export function proTrialPublicSubscription(grant, { now = new Date() } = {}) {
  const normalized = normalizeProTrialGrant(grant);
  const normalizedNow = isoFromDateValue(now);
  if (!normalized || !normalizedNow || !normalized.eligible || normalized.expiredAt) return null;

  const nowTime = Date.parse(normalizedNow);
  if (nowTime < Date.parse(normalized.startsAt) || nowTime >= Date.parse(normalized.endsAt)) {
    return null;
  }

  return {
    plan: 'pro',
    status: 'active',
    entitled: true,
    canManage: false,
    provider: 'trial',
    stripeStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: normalized.endsAt,
    cancelAt: null,
    upgradedAt: normalized.startsAt,
    canceledAt: null,
    syncedAt: normalized.decidedAt,
  };
}
