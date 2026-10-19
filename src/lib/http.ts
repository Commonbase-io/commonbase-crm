import { fieldErrorsFromZod } from "@/lib/validation";
import type { ZodError } from "zod";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

export function validationFailed(error: ZodError): Response {
  return json({ error: "Validation failed", fieldErrors: fieldErrorsFromZod(error) }, 400);
}
