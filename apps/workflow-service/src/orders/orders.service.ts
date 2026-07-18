import { Injectable, Logger } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  applyTransition,
  ForbiddenTransitionError,
  InsufficientStockError,
} from "@ecommerce-orderflow/domain";
import { OrderRepository } from "../db/order.repository.js";
import type { PlaceOrderInput, TransitionOrderInput, Session } from "./dto.js";
import { OrderNotFoundError, UnauthenticatedError, UnknownProductError } from "./errors.js";

export interface OrderResult {
  id: string;
  status: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly repo: OrderRepository) {}

  async placeOrder(session: Session, input: PlaceOrderInput): Promise<OrderResult> {
    if (!session.userId) {
      throw new UnauthenticatedError("placeOrder requires an authenticated user");
    }
    const userId = session.userId;
    const productIds = input.items.map((i) => i.productId);

    return this.repo.withTransaction(async (client) => {
      const products = await this.repo.findProducts(client, productIds);
      const byId = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      for (const item of input.items) {
        const product = byId.get(item.productId);
        if (!product) {
          throw new UnknownProductError(item.productId);
        }
        totalCents += product.unit_price_cents * item.quantity;
      }

      const order = await this.repo.createOrder(client, userId, totalCents);
      for (const item of input.items) {
        const product = byId.get(item.productId)!;
        await this.repo.insertItem(
          client,
          order.id,
          item.productId,
          item.quantity,
          product.unit_price_cents,
        );
      }
      await this.repo.insertEvent(client, {
        orderId: order.id,
        fromStatus: null,
        toStatus: "PENDING",
        action: "create",
        actorId: userId,
        actorRole: session.role,
      });

      this.logger.log(`order ${order.id} placed by ${session.role} (${input.items.length} items)`);
      return { id: order.id, status: order.status };
    });
  }

  async transitionOrder(session: Session, input: TransitionOrderInput): Promise<OrderResult> {
    return this.repo.withTransaction(async (client) => {
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

      // Stock is reserved atomically on confirmation.
      if (input.action === "confirm") {
        await this.reserveStock(client, order.id);
      }

      await this.repo.updateStatus(client, order.id, result.to);
      await this.repo.insertEvent(client, {
        orderId: order.id,
        fromStatus: result.from,
        toStatus: result.to,
        action: input.action,
        actorId: session.userId ?? null,
        actorRole: session.role,
      });

      this.logger.log(
        `order ${order.id}: ${result.from} -> ${result.to} via ${input.action} by ${session.role}`,
      );
      return { id: order.id, status: result.to };
    });
  }

  private async reserveStock(client: PoolClient, orderId: string): Promise<void> {
    const items = await this.repo.getOrderItems(client, orderId);
    const productIds = items.map((i) => i.product_id);
    const products = await this.repo.getProductsForUpdate(client, productIds);
    const stockById = new Map(products.map((p) => [p.id, p.stock_qty]));

    for (const item of items) {
      const available = stockById.get(item.product_id) ?? 0;
      if (available < item.quantity) {
        throw new InsufficientStockError(item.product_id, item.quantity, available);
      }
    }
    for (const item of items) {
      await this.repo.decrementStock(client, item.product_id, item.quantity);
    }
  }
}
