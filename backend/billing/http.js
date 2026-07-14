import { allowedOrigins } from './config.js';
import { HttpError, asHttpError } from './errors.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function addCors(response, origin) {
  if (origin) response.headers.set('access-control-allow-origin', origin);
  response.headers.set('vary', 'Origin');
  response.headers.set('access-control-allow-headers', 'Authorization, Content-Type');
  response.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.headers.set('access-control-max-age', '600');
  return response;
}

function acceptedOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return { origin: '', allowed: true };
  return { origin, allowed: allowedOrigins().has(origin) };
}

export async function apiRoute(request, methods, action) {
  const cors = acceptedOrigin(request);
  if (!cors.allowed) {
    return json({ error: 'origin_not_allowed', message: 'Origem nao autorizada.' }, 403);
  }

  if (request.method === 'OPTIONS') {
    return addCors(new Response(null, { status: 204 }), cors.origin);
  }

  if (!methods.includes(request.method)) {
    const response = json({ error: 'method_not_allowed', message: 'Metodo nao permitido.' }, 405);
    response.headers.set('allow', methods.join(', '));
    return addCors(response, cors.origin);
  }

  try {
    return addCors(await action(), cors.origin);
  } catch (rawError) {
    const error = asHttpError(rawError);
    const log = error.status >= 500 ? console.error : console.warn;
    log(`[billing] ${error.code}: ${rawError?.code || rawError?.name || 'error'}`);
    return addCors(json({ error: error.code, message: error.message }, error.status), cors.origin);
  }
}

export function requirePost(request) {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'Metodo nao permitido.');
  }
}

