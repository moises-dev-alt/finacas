import { adminCancel } from '../../backend/billing/handlers.js';
import { apiRoute } from '../../backend/billing/http.js';

function targetUid(request, context) {
  if (context?.params?.uid) return context.params.uid;
  const match = new URL(request.url).pathname.match(/\/api\/admin\/subscriptions\/([^/]+)\/cancel$/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default async function handler(request, context) {
  return apiRoute(request, ['POST'], () => adminCancel(request, targetUid(request, context)));
}

export const config = { path: '/api/admin/subscriptions/:uid/cancel' };

