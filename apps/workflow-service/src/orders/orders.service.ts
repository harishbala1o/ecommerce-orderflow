import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import { applyTransition, ForbiddenTransitionError } from "@ecommerce-orderflow/domain";
import { OrderRepository } from "../db/order.repository.js";
import { MetricsService } from "../observability/metrics.service.js";
import { InventoryClient } from "../inventory/inventory.client.js";
import type { PlaceOrderInput, TransitionOrderInput, Session } from "./dto.js";
import { OrderNotFoundError, UnauthenticatedError, UnknownProductError } from "./errors.js";

export interface OrderResult {
  id: string;
  status: string;
}

const tracer = trace.getTracer("orderflow.workflow");

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly repo: OrderRepository,
    private readonly metrics: MetricsService,
    private readonly inventory: InventoryClient,
  ) {}

  /**
   * Places an order as a saga across two bounded contexts.
   *
   * Stock is held in the inventory service *before* the order is created, so a
   * customer is told immediately if the goods are unavailable and no order row
   * is created for something that cannot be fulfilled. The two services own
   * separate databases, so this cannot be one transaction: if the local write
   * fails after a successful hold, a compensating release runs, and the
   * inventory sweeper reclaims the hold if even that does not get through.
   */
  async placeOrder(session: Session, input: PlaceOrderInput): Promise<OrderResult> {
    if (!session.userId) {
      throw new UnauthenticatedError("placeOrder requires an authenticated user");
    }
    const userId = session.userId;
    const productIds = input.items.map((i) => i.productId);

    // Price the order first: an unknown product should fail before any stock is held.
    const { totalCents, priceById } = await this.priceOrder(productIds, input);

    const orderId = randomUUID();
    await this.inventory.reserve(orderId, input.items);

    let order: OrderResult;
    try {
      order = await this.repo.withTransaction(async (client) => {
        const created = await this.repo.createOrder(client, userId, totalCents, orderId);
        for (const item of input.items) {
          await this.repo.insertItem(
            client,
            created.id,
            item.productId,
            item.quantity,
            priceById.get(item.productId)!,
          );
        }
        await this.repo.insertEvent(client, {
          orderId: created.id,
          fromStatus: null,
          toStatus: "PENDING",
          action: "create",
          actorId: userId,
          actorRole: session.role,
        });
        return { id: created.id, status: created.status };
      });
    } catch (err) {
      await this.inventory.releaseQuietly(orderId);
      throw err;
    }

    // The order exists, so the hold is no longer speculative and must not expire.
    await this.inventory.confirm(orderId);

    this.metrics.ordersPlaced.inc({ role: session.role });
    this.logger.log(`order ${order.id} placed by ${session.role} (${input.items.length} items)`);
    return order;
  }

  /** Resolves catalog prices, capturing them at purchase time. */
  private async priceOrder(
    productIds: string[],
    input: PlaceOrderInput,
  ): Promise<{ totalCents: number; priceById: Map<string, number> }> {
    return this.repo.withTransaction(async (client) => {
      const products = await this.repo.findProducts(client, productIds);
      const byId = new Map(products.map((p) => [p.id, p]));
      const priceById = new Map<string, number>();
      let totalCents = 0;
      for (const item of input.items) {
        const product = byId.get(item.productId);
        if (!product) {
          throw new UnknownProductError(item.productId);
        }
        priceById.set(item.productId, product.unit_price_cents);
        totalCents += product.unit_price_cents * item.quantity;
      }
      return { totalCents, priceById };
    });
  }

  async transitionOrder(session: Session, input: TransitionOrderInput): Promise<OrderResult> {
    return tracer.startActiveSpan("order.transition", async (span) => {
      span.setAttributes({ "order.id": input.orderId, "order.action": input.action, "actor.role": session.role });
      try {
        return await this.repo.withTransaction(async (client) => {
          const order = await this.repo.getOrderForUpdate(client, input.orderId);
          if (!order) {
            throw new OrderNotFoundError(input.orderId);
          }
          // Ownership: a customer may only act on their own order.
          if (session.role === "customer" && order.customer_id !== session.userId) {
            throw new ForbiddenTransitionError(session.role, input.action, order.status);
          }

          // Domain gate: legal transition + role permission (throws on violation).
          const result = applyTransition({
            current: order.status,
            action: input.action,
            role: session.role,
          });

          await this.repo.updateStatus(client, order.id, result.to);
          await this.repo.insertEvent(client, {
            orderId: order.id,
            fromStatus: result.from,
            toStatus: result.to,
            action: input.action,
            actorId: session.userId ?? null,
            actorRole: session.role,
          });

          this.metrics.transitions.inc({
            action: input.action,
            from: result.from,
            to: result.to,
            role: session.role,
          });
          span.setAttribute("order.to", result.to);
          this.logger.log(
            `order ${order.id}: ${result.from} -> ${result.to} via ${input.action} by ${session.role}`,
          );
          return { id: order.id, status: result.to };
        });
      } finally {
        span.end();
      }
    });
  }

}
