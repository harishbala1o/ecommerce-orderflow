import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import type { Role } from "@ecommerce-orderflow/domain";

function decodeRole(accessToken: string): Role {
  const payload = accessToken.split(".")[1] ?? "";
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    hasura_default_role?: Role;
  };
  return claims.hasura_default_role ?? "customer";
}

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
    jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.role = decodeRole(account.access_token);
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
