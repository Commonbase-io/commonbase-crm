export class HttpError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly payload?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    fieldErrors?: Record<string, string>,
    payload?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.payload = payload;
  }
}

export class NotFoundError extends HttpError {
  constructor() {
    super(404, "Not found");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, payload?: Record<string, unknown>) {
    super(409, message, undefined, payload);
    this.name = "ConflictError";
  }
}
