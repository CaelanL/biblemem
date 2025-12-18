import { corsHeaders } from "./cors.ts";

/**
 * Standardized error response
 */
export function errorResponse(
  message: string,
  status: number,
  details?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      ...details,
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

/**
 * 400 Bad Request
 */
export function badRequest(message: string): Response {
  return errorResponse(message, 400);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(message = "Unauthorized"): Response {
  return errorResponse(message, 401);
}

/**
 * 404 Not Found
 */
export function notFound(message = "Not found"): Response {
  return errorResponse(message, 404);
}

/**
 * 429 Rate Limited
 */
export function rateLimited(
  used: number,
  limit: number,
  resetsAt: string
): Response {
  return errorResponse("Rate limit exceeded", 429, {
    used,
    limit,
    resetsAt,
  });
}

/**
 * 500 Internal Server Error
 */
export function serverError(message = "Internal server error"): Response {
  return errorResponse(message, 500);
}

/**
 * Success response helper
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
