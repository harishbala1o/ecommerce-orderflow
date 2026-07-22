"use client";

import { SessionProvider, useSession, signIn } from "next-auth/react";
import { Provider as UrqlProvider, Client, cacheExchange, fetchExchange } from "urql";
import { useEffect, useMemo, type ReactNode } from "react";

function GraphqlProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const token = session?.accessToken;

  // When the refresh token is gone (idle past its lifetime), the access token
  // can no longer be renewed. Rather than send a dead token to Hasura, bounce
  // the user through Keycloak for a clean re-login.
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      void signIn("keycloak");
    }
  }, [session?.error]);

  const client = useMemo(
    () =>
      new Client({
        url: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:8080/v1/graphql",
        exchanges: [cacheExchange, fetchExchange],
        // Every request carries the Keycloak-issued JWT; Hasura derives the
        // role and user id from its claims. No admin secret in the browser.
        fetchOptions: (): RequestInit => ({
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        requestPolicy: "cache-and-network",
      }),
    [token],
  );

  return <UrqlProvider value={client}>{children}</UrqlProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GraphqlProvider>{children}</GraphqlProvider>
    </SessionProvider>
  );
}
