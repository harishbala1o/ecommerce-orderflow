"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { Provider as UrqlProvider, Client, cacheExchange, fetchExchange } from "urql";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

function GraphqlProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const token = session?.accessToken;

  // When the refresh token is also expired the access token can no longer be
  // renewed. Clear the dead session (signOut) and return to /login, where the
  // user signs in fresh. We must NOT auto-signIn here: that keeps the errored
  // cookie alive and loops. signOut removes the cookie, so the error clears and
  // the effect can't re-fire. A ref guards against a double-invoke.
  const handledError = useRef(false);
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError" && !handledError.current) {
      handledError.current = true;
      void signOut({ callbackUrl: "/login" });
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
