import { adminUids } from './config.js';
import { firebaseAuth } from './firebase.js';
import { HttpError } from './errors.js';

export async function requireUser(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, 'authentication_required', 'Entre na sua conta para continuar.');
  }

  let auth;
  try {
    auth = firebaseAuth();
  } catch (error) {
    console.error(`[billing] firebase_admin_initialization_failed: ${error?.code || error?.name || 'error'}`);
    throw new HttpError(
      503,
      'firebase_admin_unavailable',
      'O servico de assinaturas esta temporariamente indisponivel.',
    );
  }

  try {
    return await auth.verifyIdToken(match[1], true);
  } catch (error) {
    if (error?.code === 'app/invalid-credential') {
      console.error('[billing] firebase_admin_credential_rejected: app/invalid-credential');
      throw new HttpError(
        503,
        'firebase_admin_unavailable',
        'O servico de assinaturas esta temporariamente indisponivel.',
      );
    }

    console.warn(`[billing] firebase_token_rejected: ${error?.code || error?.name || 'error'}`);
    throw new HttpError(401, 'invalid_token', 'Sua sessao expirou. Entre novamente.');
  }
}

export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user.admin === true || adminUids().has(user.uid)) return user;
  throw new HttpError(403, 'admin_required', 'Acesso permitido somente para administradores.');
}

export async function canonicalUser(uid) {
  try {
    const user = await firebaseAuth().getUser(uid);
    if (user.disabled) {
      throw new HttpError(403, 'user_disabled', 'Esta conta esta desativada.');
    }
    return user;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.code === 'auth/user-not-found') {
      throw new HttpError(404, 'user_not_found', 'Usuario nao encontrado.');
    }
    throw error;
  }
}
