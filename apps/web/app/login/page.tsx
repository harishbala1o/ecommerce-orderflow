"use client";

import { signIn } from "next-auth/react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginCard() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold tracking-tight">Ecommerce OrderFlow</h1>
      <p className="mt-2 text-sm text-slate-600">
        Order management for customers, operations, and administrators.
      </p>
      <button
        onClick={() => signIn("keycloak", { callbackUrl })}
        className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Sign in
      </button>
      <p className="mt-4 text-xs text-slate-400">Authentication via Keycloak (OIDC)</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
