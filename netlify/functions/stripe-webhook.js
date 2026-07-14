import { stripeWebhook } from '../../backend/billing/webhook.js';

export default async function handler(request) {
  return stripeWebhook(request);
}

export const config = { path: '/api/stripe/webhook' };

