import Stripe from 'stripe';
import { stripeSecretKey } from './config.js';

let client;

export function stripeClient() {
  if (!client) {
    client = new Stripe(stripeSecretKey(), {
      appInfo: { name: 'mr-coin-billing' },
      maxNetworkRetries: 2,
      timeout: 15_000,
    });
  }
  return client;
}

