import { Injectable } from "@nestjs/common";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/** Owns the Prometheus registry and the service's domain + RED metrics. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly transitions: Counter<"action" | "from" | "to" | "role">;
  readonly ordersPlaced: Counter<"role">;
  readonly requestDuration: Histogram<"route" | "outcome">;

  constructor() {
    this.registry.setDefaultLabels({ service: "workflow-service" });
    collectDefaultMetrics({ register: this.registry });

    this.transitions = new Counter({
      name: "orderflow_transitions_total",
      help: "Order state transitions applied, by action/from/to/role.",
      labelNames: ["action", "from", "to", "role"],
      registers: [this.registry],
    });
    this.ordersPlaced = new Counter({
      name: "orderflow_orders_placed_total",
      help: "Orders placed, by placing role.",
      labelNames: ["role"],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: "orderflow_action_duration_seconds",
      help: "Handler duration by route and outcome (ok/error).",
      labelNames: ["route", "outcome"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
  }
}
