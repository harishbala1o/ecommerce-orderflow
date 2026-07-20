"use client";

import Link from "next/link";
import { useQuery } from "urql";
import { OrdersListDocument } from "@ecommerce-orderflow/graphql-client";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney, shortId } from "@/lib/format";

export default function OrdersPage() {
  const [{ data, fetching, error }] = useQuery({ query: OrdersListDocument });

  if (error) {
    return <p className="text-sm text-rose-700">Could not load orders: {error.message}</p>;
  }

  const orders = data?.orders ?? [];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <span className="text-sm text-slate-500">
          {fetching ? "Refreshing…" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm" data-testid="orders-table">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">
                  <Link href={`/orders/${o.id}`} className="text-slate-900 underline-offset-2 hover:underline">
                    {shortId(o.id)}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{o.customer.display_name}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-4 py-2.5 text-slate-600">
                  {o.items.reduce((n, i) => n + i.quantity, 0)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(o.total_cents)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{formatDate(o.updated_at)}</td>
              </tr>
            ))}
            {!fetching && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
