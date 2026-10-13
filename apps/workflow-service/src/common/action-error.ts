import { HttpException, HttpStatus } from "@nestjs/common";
import { ZodError } from "zod";
import {
  ForbiddenTransitionError,
  IllegalTransitionError,
  InsufficientStockError,
} from "@ecommerce-orderflow/domain";
import {
  IdempotencyConflictError,
  OrderNotFoundError,
  UnauthenticatedError,
  UnknownProductError,
  VersionConflictError,
} from "../orders/errors.js";

/**
 * Maps a thrown error to a Hasura Action error response
 * (`{ message, extensions: { code } }`).
 *
 * The status reflects what actually happened rather than being a blanket 400:
 * a conflict tells the caller to re-read and decide, and an unrecognised
 * failure is a 5xx so it is visible as a failure rather than looking like a
 * well-handled rejection. Unknown errors are masked so internals never leak.
 */
export function toActionException(err: unknown): HttpException {
  if (err instanceof VersionConflictError) {
    return new HttpException(
      {
        message: err.message,
        extensions: {
          code: "version-conflict",
          orderId: err.orderId,
          expectedVersion: err.expected,
          currentVersion: err.actual,
          currentStatus: err.currentStatus,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
  if (err instanceof IdempotencyConflictError) {
    return new HttpException(
      { message: err.message, extensions: { code: "idempotency-conflict" } },
      HttpStatus.CONFLICT,
    );
  }

  const { code, message } = classify(err);
  const status =
    code === "internal"
      ? HttpStatus.INTERNAL_SERVER_ERROR
      : code === "not-found" || code === "unknown-product"
        ? HttpStatus.NOT_FOUND
        : code === "forbidden" || code === "unauthenticated"
          ? HttpStatus.FORBIDDEN
          : code === "insufficient-stock"
            ? HttpStatus.CONFLICT
            : HttpStatus.BAD_REQUEST;
  return new HttpException({ message, extensions: { code } }, status);
}

function classify(err: unknown): { code: string; message: string } {
  if (err instanceof ZodError) {
    return { code: "bad-input", message: "Invalid input" };
  }
  if (err instanceof IllegalTransitionError) {
    return { code: "illegal-transition", message: err.message };
  }
  if (err instanceof ForbiddenTransitionError) {
    return { code: "forbidden", message: err.message };
  }
  if (err instanceof InsufficientStockError) {
    return { code: "insufficient-stock", message: err.message };
  }
  if (err instanceof OrderNotFoundError) {
    return { code: "not-found", message: err.message };
  }
  if (err instanceof UnknownProductError) {
    return { code: "unknown-product", message: err.message };
  }
  if (err instanceof UnauthenticatedError) {
    return { code: "unauthenticated", message: err.message };
  }
  return { code: "internal", message: "Internal error" };
}
