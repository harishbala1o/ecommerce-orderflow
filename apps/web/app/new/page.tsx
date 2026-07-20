"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "urql";
import { PlaceOrderDocument, ProductsListDocument } from "@ecommerce-orderflow/graphql-client";
import { formatMoney } from "@/lib/format";

export default function NewOrderPage() {
  const router = useRouter();
  const [{ data, error }] = useQuery({ query: ProductsListDocument });
  const [placeState, placeOrder] = useMutation(PlaceOrderDocument);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (error) return <p className="text-sm text-rose-700">Could not load products: {error.message}</p>;

  const products = data?.products ?? [];
  const items = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
  const totalCents = products.reduce((sum, p) => sum + (quantities[p.id] ?? 0) * p.unit_price_cents, 0);

  function setQty(productId: string, qty: number) {
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, qty) }));
  }

  async function submit() {
    setSubmitError(null);
    const result = await placeOrder({ items });
    if (result.error) {
      setSubmitError(result.error.graphQLErrors[0]?.message ?? result.error.message);
    } else if (result.data?.placeOrder) {
      router.push(`/orders/${result.data.placeOrder.id}`);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">New order</h1>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm" data-testid="product-table">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">In stock</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
              <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.description}</p>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{p.stock_qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(p.unit_price_cents)}</td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="number"
                    min={0}
                    max={p.stock_qty}
                    value={quantities[p.id] ?? 0}
                    onChange={(e) => setQty(p.id, Number(e.target.value))}
                    aria-label={`Quantity of ${p.name}`}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Total: <span className="font-medium tabular-nums">{formatMoney(totalCents)}</span>
        </p>
        <button
          onClick={submit}
          disabled={items.length === 0 || placeState.fetching}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {placeState.fetching ? "Placing…" : "Place order"}
        </button>
      </div>
      {submitError && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="submit-error">
          {submitError}
        </p>
      )}
    </div>
  );
}
