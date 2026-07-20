"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();
  if (!session) return null;

  const canPlaceOrders = session.role === "customer" || session.role === "admin";

  // Federated logout: clearing only the next-auth session would leave the
  // Keycloak SSO cookie alive, silently re-authenticating the same user on
  // the next sign-in. End the Keycloak session too, then land on /login.
  async function handleSignOut() {
    const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ?? "http://localhost:8081/realms/ecommerce-orderflow";
    const idToken = session?.idToken;
    await signOut({ redirect: false });
    const params = new URLSearchParams({
      post_logout_redirect_uri: `${window.location.origin}/login`,
      client_id: "web",
      ...(idToken ? { id_token_hint: idToken } : {}),
    });
    window.location.href = `${issuer}/protocol/openid-connect/logout?${params}`;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Ecommerce OrderFlow
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
            Orders
          </Link>
          {canPlaceOrders && (
            <Link href="/new" className="text-sm text-slate-600 hover:text-slate-900">
              New order
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {session.user?.name}
            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
              {session.role}
            </span>
          </span>
          <button onClick={handleSignOut} className="text-sm text-slate-500 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
