export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    if (payload.fieldErrors && typeof payload.fieldErrors === "object") {
      this.fieldErrors = payload.fieldErrors as Record<string, string>;
    }
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Request failed";
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}
