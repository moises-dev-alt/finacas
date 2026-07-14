import { resume } from '../../backend/billing/handlers.js';
import { apiRoute } from '../../backend/billing/http.js';

export default async function handler(request) {
  return apiRoute(request, ['POST'], () => resume(request));
}

export const config = { path: '/api/billing/resume' };

