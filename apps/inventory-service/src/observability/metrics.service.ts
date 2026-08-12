import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/** Prometheus registry plus the inventory domain metrics. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly reservations: Counter<"outcome">;
  readonly movements: Counter<"kind">;
  readonly requestDuration: Histogram<"route" | "outcome">;
  readonly throttled: Counter<"route">;
  readonly onHand: Gauge<"sku">;
  readonly reserved: Gauge<"sku">;
  readonly availableQty: Gauge<"sku">;
  readonly openAlerts: Gauge<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: "inventory-service" });
    collectDefaultMetrics({ register: this.registry });

    this.reservations = new Counter({
      name: "inventory_reservations_total",
      help: "Reservation outcomes: held, confirmed, released, committed, insufficient_stock.",
      labelNames: ["outcome"],
      registers: [this.registry],
    });
    this.movements = new Counter({
      name: "inventory_movements_total",
      help: "Stock movements by kind.",
      labelNames: ["kind"],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: "inventory_request_duration_seconds",
      help: "Handler duration by route and outcome.",
      labelNames: ["route", "outcome"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.throttled = new Counter({
      name: "inventory_throttled_total",
      help: "Requests rejected by the rate limiter, by route.",
      labelNames: ["route"],
      registers: [this.registry],
    });
    this.onHand = new Gauge({
      name: "inventory_on_hand",
      help: "Units physically in stock, by SKU.",
      labelNames: ["sku"],
      registers: [this.registry],
    });
    this.reserved = new Gauge({
      name: "inventory_reserved",
      help: "Units promised to orders but not yet shipped, by SKU.",
      labelNames: ["sku"],
      registers: [this.registry],
    });
    this.availableQty = new Gauge({
      name: "inventory_available",
      help: "Units that can still be promised (on hand minus reserved), by SKU.",
      labelNames: ["sku"],
      registers: [this.registry],
    });
    this.openAlerts = new Gauge({
      name: "inventory_alerts_open",
      help: "Number of stock alerts currently open.",
      registers: [this.registry],
    });
  }
}
