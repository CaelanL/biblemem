import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getAuthUser, getAdminClient } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  unauthorized,
  badRequest,
  jsonResponse,
  serverError,
} from "../_shared/errors.ts";
import {
  checkAndIncrementBibleUsage,
  rateLimitResponse,
} from "../_shared/usage.ts";

const ESV_API_KEY = Deno.env.get("ESV_API_KEY");
const NLT_API_KEY = Deno.env.get("NLT_API_KEY");

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only GET allowed
  if (req.method !== "GET") {
    return badRequest("Method not allowed");
  }

  // Authenticate user
  const user = await getAuthUser(req);
  if (!user) {
    return unauthorized();
  }

  // Parse query params
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const version = url.searchParams.get("version") || "ESV";

  if (!ref) {
    return badRequest("Missing 'ref' parameter");
  }

  if (version !== "ESV" && version !== "NLT") {
    return badRequest("Unsupported version. Use ESV or NLT.");
  }

  // Check usage
  const usage = await checkAndIncrementBibleUsage(user.id);
  if (!usage.allowed) {
    return rateLimitResponse(usage.used, usage.limit);
  }

  try {
    // Check cache first
    const cached = await getCachedVerse(ref, version);
    if (cached) {
      return jsonResponse({
        reference: ref,
        version,
        text: cached,
        cached: true,
      });
    }

    // Fetch from API
    let text: string;
    if (version === "ESV") {
      text = await fetchESV(ref);
    } else {
      text = await fetchNLT(ref);
    }

    // Cache for 24 hours
    await cacheVerse(ref, version, text);

    return jsonResponse({
      reference: ref,
      version,
      text,
      cached: false,
    });
  } catch (error) {
    console.error("Bible fetch error:", error);
    return serverError("Failed to fetch verse");
  }
});

/**
 * Check cache for verse
 */
async function getCachedVerse(
  reference: string,
  version: string
): Promise<string | null> {
  const admin = getAdminClient();

  const { data } = await admin
    .from("verse_cache")
    .select("text")
    .eq("reference", reference)
    .eq("version", version)
    .gt("expires_at", new Date().toISOString())
    .single();

  return data?.text ?? null;
}

/**
 * Cache verse for 24 hours
 */
async function cacheVerse(
  reference: string,
  version: string,
  text: string
): Promise<void> {
  const admin = getAdminClient();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await admin.from("verse_cache").upsert(
    {
      reference,
      version,
      text,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "reference,version" }
  );
}

/**
 * Fetch from ESV API
 */
async function fetchESV(ref: string): Promise<string> {
  if (!ESV_API_KEY) {
    throw new Error("ESV_API_KEY not configured");
  }

  const params = new URLSearchParams({
    q: ref,
    "include-passage-references": "false",
    "include-verse-numbers": "false",
    "include-first-verse-numbers": "false",
    "include-footnotes": "false",
    "include-footnote-body": "false",
    "include-headings": "false",
    "include-short-copyright": "false",
    "include-selahs": "true",
    "indent-paragraphs": "0",
    "indent-poetry": "false",
  });

  const response = await fetch(
    `https://api.esv.org/v3/passage/text/?${params}`,
    {
      headers: { Authorization: `Token ${ESV_API_KEY}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("ESV API error:", error);
    throw new Error(`ESV API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.passages?.[0]?.trim() || "";

  if (!text) {
    throw new Error("Verse not found");
  }

  return text;
}

/**
 * Fetch from NLT API
 */
async function fetchNLT(ref: string): Promise<string> {
  if (!NLT_API_KEY) {
    throw new Error("NLT_API_KEY not configured");
  }

  // NLT uses dot notation: "John 3:16" → "John.3.16"
  // Handle ranges: "John 3:16-18" → "John.3.16-18"
  const nltRef = ref
    .replace(/\s+/g, ".")
    .replace(":", ".")
    .replace(/-(\d+)$/, "-$1"); // Keep range intact

  const response = await fetch(
    `https://api.nlt.to/api/passages?ref=${encodeURIComponent(nltRef)}&key=${NLT_API_KEY}`
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("NLT API error:", error);
    throw new Error(`NLT API error: ${response.status}`);
  }

  const html = await response.text();
  return parseNLTResponse(html);
}

/**
 * Parse NLT HTML response to extract verse text
 * NLT returns full HTML documents with verse text in specific structures
 */
function parseNLTResponse(html: string): string {
  // First, try to extract content from <p> tags within the body
  // NLT wraps verse text in paragraph tags

  // Remove everything outside the body
  let content = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    content = bodyMatch[1];
  }

  // Remove script tags
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove style tags
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove header/nav/footer sections that might contain branding
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Remove verse number spans (class="vn") - we don't want verse numbers in text
  content = content.replace(/<span[^>]*class="vn"[^>]*>[\s\S]*?<\/span>/gi, "");

  // Remove section headings (h1, h2, h3, etc.)
  content = content.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "");

  // Now strip remaining HTML tags
  content = content
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace nbsp
    .replace(/&amp;/g, "&") // Replace ampersand
    .replace(/&lt;/g, "<") // Replace less than
    .replace(/&gt;/g, ">") // Replace greater than
    .replace(/&quot;/g, '"') // Replace quotes
    .replace(/&#39;/g, "'") // Replace apostrophe
    .replace(/&rsquo;/g, "'") // Right single quote
    .replace(/&lsquo;/g, "'") // Left single quote
    .replace(/&rdquo;/g, '"') // Right double quote
    .replace(/&ldquo;/g, '"') // Left double quote
    .replace(/&mdash;/g, "—") // Em dash
    .replace(/&ndash;/g, "–") // En dash
    .replace(/&#\d+;/g, "") // Remove any remaining numeric entities
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();

  // Remove common NLT branding/footer text
  content = content
    .replace(/Holy Bible,?\s*New Living Translation.*/i, "")
    .replace(/NLT\.to.*/i, "")
    .replace(/Tyndale House.*/i, "")
    .replace(/Copyright.*/i, "")
    .trim();

  if (!content) {
    throw new Error("Could not parse NLT response");
  }

  return content;
}
