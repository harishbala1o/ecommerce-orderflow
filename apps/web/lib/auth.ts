import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import KeycloakProvider from "next-auth/providers/keycloak";
import type { Role } from "@ecommerce-orderflow/domain";

// The role is a UI hint only: it decides which action buttons render. The real
// security boundary is Hasura (verifies the JWT via Keycloak JWKS) and the
// workflow service (re-derives the actor from Hasura-forwarded claims). We take
// the role from next-auth's `profile`, i.e. the ID-token claims next-auth has
// already validated during the OIDC handshake — never by hand-parsing a token.
type KeycloakProfile = { hasura_default_role?: Role };

const ISSUER = process.env.KEYCLOAK_ISSUER ?? "http://localhost:8081/realms/ecommerce-orderflow";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "web";

/**
 * Keycloak access tokens live ~1h but the next-auth session lives far longer.
 * Without this, an expired access token keeps getting sent to Hasura, which
 * rejects it (JWTExpired) even though the app still looks logged in. Exchange
 * the refresh token for a fresh access token when the current one has expired.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error("no refresh token");
    const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: token.refreshToken,
      }),
    });
    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };
    if (!res.ok) throw refreshed;
    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      // Keycloak rotates refresh tokens; keep the new one if present.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    // Refresh token itself expired (idle > its lifetime) or revoked — signal the
    // client to force a clean re-login rather than send a dead token to Hasura.
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: CLIENT_ID,
      clientSecret: "", // public client with PKCE
      issuer: ISSUER,
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in: capture tokens + expiry + role.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        token.role = (profile as KeycloakProfile | undefined)?.hasura_default_role ?? "customer";
        return token;
      }
      // Still valid (30s clock-skew buffer): use as-is.
      if (token.expiresAt && Date.now() < (token.expiresAt - 30) * 1000) {
        return token;
      }
      // Expired: refresh.
      return refreshAccessToken(token);
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.role = token.role as Role;
      session.userId = token.sub as string;
      session.idToken = token.idToken as string;
      session.error = token.error;
      return session;
    },
  },
};
