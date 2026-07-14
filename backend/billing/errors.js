export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function asHttpError(error) {
  if (error instanceof HttpError) return error;

  if (error?.code === 'configuration_missing' || error?.code === 'configuration_invalid') {
    return new HttpError(503, error.code, 'O servico de cobranca ainda nao foi configurado corretamente.');
  }

  return new HttpError(500, 'internal_error', 'Nao foi possivel concluir a operacao de cobranca.');
}

