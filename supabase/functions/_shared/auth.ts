import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface AuthUser {
  id: string;
  email?: string;
  isAnonymous: boolean;
}

/**
 * Get admin client (bypasses RLS)
 */
export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * Get client with user's JWT (respects RLS)
 */
export function getUserClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}

/**
 * Extract and validate user from request
 * Works with both anonymous and authenticated users
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const client = getUserClient(authHeader);

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    isAnonymous: user.is_anonymous ?? false,
  };
}

/**
 * Get user's subscription tier
 */
export async function getUserTier(
  userId: string
): Promise<"free" | "supporter"> {
  const admin = getAdminClient();

  const { data } = await admin
    .from("subscriptions")
    .select("tier, expires_at")
    .eq("user_id", userId)
    .single();

  if (!data) {
    return "free";
  }

  // Check if subscription is expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return "free";
  }

  return data.tier as "free" | "supporter";
}
