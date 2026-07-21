import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import type { Role } from "@ecommerce-orderflow/domain";

// The role is a UI hint only: it decides which action buttons render. The real
// security boundary is Hasura (verifies the JWT via Keycloak JWKS) and the
// workflow service (re-derives the actor from Hasura-forwarded claims). We take
// the role from next-auth's `profile`, i.e. the ID-token claims next-auth has
// already validated during the OIDC handshake — never by hand-parsing a token.
type KeycloakProfile = { hasura_default_role?: Role };

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? "web",
      clientSecret: "", // public client with PKCE
      issuer: process.env.KEYCLOAK_ISSUER,
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.role = (profile as KeycloakProfile | undefined)?.hasura_default_role ?? "customer";
        token.idToken = account.id_token;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.role = token.role as Role;
      session.userId = token.sub as string;
      session.idToken = token.idToken as string;
      return session;
    },
  },
};
