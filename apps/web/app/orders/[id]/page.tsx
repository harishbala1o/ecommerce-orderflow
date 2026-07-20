"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery } from "urql";
import { OrderDetailDocument, TransitionOrderDocument } from "@ecommerce-orderflow/graphql-client";
import { TRANSITIONS, type OrderAction, type OrderStatus } from "@ecommerce-orderflow/domain";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney, shortId } from "@/lib/format";

const ACTION_LABELS: Record<OrderAction, string> = {
  confirm: "Confirm",
  pack: "Pack",
  ship: "Ship",
  deliver: "Mark delivered",
  cancel: "Cancel order",
  return: "Process return",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: OrderDetailDocument,
    variables: { id },
  });
  const [transitionState, transition] = useMutation(TransitionOrderDocument);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <p className="text-sm text-rose-700">Could not load order: {error.message}</p>;
  if (fetching && !data) return <p className="text-sm text-slate-500">Loading…</p>;

  const order = data?.orders_by_pk;
  if (!order) {
    return <p className="text-sm text-slate-600">Order not found (or you do not have access to it).</p>;
  }

  // The domain package is the single source of truth for which actions this
  // role may take from the current status. Row-level permissions already
  // guarantee a customer can only be looking at their own order.
  const actions = session
    ? TRANSITIONS.filter(
        (rule) => rule.from === (order.status as OrderStatus) && rule.allowedRoles.includes(session.role),
      )
    : [];

  async function runAction(action: OrderAction) {
    setActionError(null);
    const result = await transition({ orderId: order!.id, action });
    if (result.error) {
      setActionError(result.error.graphQLErrors[0]?.message ?? result.error.message);
    } else {
      refetch({ requestPolicy: "network-only" });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">Order {shortId(order.id)}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {order.customer.display_name} · placed {formatDate(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="order-actions">
          {actions.map((rule) => (
            <button
              key={rule.action}
              disabled={transitionState.fetching}
              onClick={() => runAction(rule.action)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                rule.action === "cancel"
                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-slate-900 text-white hover:bg-slate-700"
              }`}
            >
              {ACTION_LABELS[rule.action]}
            </button>
          ))}
        </div>
      )}
      {actionError && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="action-error">
          {actionError}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Line items</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">{item.product.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.product.sku}</td>
                  <td className="px-4 py-2.5 text-slate-600">× {item.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(item.unit_price_cents * item.quantity)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(order.total_cents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
        <ol className="mt-2 space-y-0" data-testid="order-timeline">
          {order.events.map((event, i) => (
            <li key={event.id} className="relative flex gap-3 pb-4 text-sm">
              {i < order.events.length - 1 && (
                <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" aria-hidden />
              )}
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-400 bg-white" aria-hidden />
              <div>
                <p>
                  <span className="font-medium capitalize">{event.action}</span>
                  {event.from_status && <span className="text-slate-500"> · {event.from_status} → </span>}
                  {!event.from_status && <span className="text-slate-500"> → </span>}
                  <span className="text-slate-700">{event.to_status}</span>
                  {event.actor_role && <span className="text-slate-400"> by {event.actor_role}</span>}
                </p>
                <p className="text-xs text-slate-400">{formatDate(event.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
