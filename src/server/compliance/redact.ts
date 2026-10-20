// Redacts PII and secrets from values before they are logged or stored in
// audit metadata. Conservative by design: when in doubt, redact.

const SENSITIVE_KEY = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|session|email|e-mail|^name$|first_?name|last_?name|full_?name|display_?name|phone)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi;
// Long opaque strings (JWTs, API keys).
const OPAQUE = /\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{32,})\b/g;

export const REDACTED = "[redacted]";

export function redactString(value: string): string {
  return value.replace(EMAIL, "[email]").replace(BEARER, "$1 [redacted]").replace(OPAQUE, REDACTED);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return out;
}
