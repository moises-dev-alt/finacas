const billingApiBaseUrl = String(import.meta.env.VITE_BILLING_API_URL || '').trim().replace(/\/+$/, '');

export const billingApiConfigured = Boolean(billingApiBaseUrl);

export class BillingApiError extends Error {
  constructor(message, { status = 0, code = 'billing-error', details = null } = {}) {
    super(message);
    this.name = 'BillingApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function endpointUrl(path) {
  if (!billingApiConfigured) {
    throw new BillingApiError('O serviço de assinaturas não está configurado.', {
      code: 'billing-not-configured',
    });
  }

  return `${billingApiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseResponse(response) {
  if (response.status === 204) return {};

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  return text ? { message: text } : {};
}

async function billingRequest(user, path, { method = 'GET', body, signal } = {}) {
  if (!user?.getIdToken) {
    throw new BillingApiError('Entre novamente para gerenciar sua assinatura.', {
      status: 401,
      code: 'billing-auth-required',
    });
  }

  const token = await user.getIdToken();
  let response;

  try {
    response = await fetch(endpointUrl(path), {
      method,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new BillingApiError('Não foi possível conectar ao serviço de assinaturas.', {
      code: 'billing-network-error',
      details: error,
    });
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new BillingApiError(
      payload?.message || payload?.error || 'Não foi possível concluir esta ação de assinatura.',
      {
        status: response.status,
        code: payload?.code || payload?.error || `billing-http-${response.status}`,
        details: payload,
      },
    );
  }

  return payload;
}

export function getBillingStatus(user, options = {}) {
  return billingRequest(user, '/api/billing/status', { signal: options.signal });
}

export function createBillingCheckout(user, payload, options = {}) {
  return billingRequest(user, '/api/billing/checkout', {
    method: 'POST',
    body: payload,
    signal: options.signal,
  });
}

export function createBillingPortal(user, payload, options = {}) {
  return billingRequest(user, '/api/billing/portal', {
    method: 'POST',
    body: payload,
    signal: options.signal,
  });
}

export function cancelBillingSubscription(user, payload, options = {}) {
  return billingRequest(user, '/api/billing/cancel', {
    method: 'POST',
    body: payload,
    signal: options.signal,
  });
}

export function resumeBillingSubscription(user, payload, options = {}) {
  return billingRequest(user, '/api/billing/resume', {
    method: 'POST',
    body: payload,
    signal: options.signal,
  });
}

export function billingRedirectUrl(payload) {
  const candidate = payload?.url || payload?.checkoutUrl || payload?.portalUrl;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') throw new Error('invalid protocol');
    return url.toString();
  } catch {
    throw new BillingApiError('O serviço de assinaturas retornou um endereço inválido.', {
      code: 'billing-invalid-redirect',
    });
  }
}
