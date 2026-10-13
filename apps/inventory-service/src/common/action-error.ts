import { HttpException, HttpStatus } from "@nestjs/common";
import { ZodError } from "zod";
import {
  BusinessError,
  InfrastructureError,
  InsufficientStockError,
  ReservationConflictError,
  ReservationNotFoundError,
  UnknownStockItemError,
} from "./errors.js";

/**
 * Maps a thrown error to a structured response (`{ message, extensions: { code } }`).
 *
 * The status is chosen so the caller can act on it:
 *   400 the request was malformed, do not retry
 *   404 the referenced thing does not exist
 *   409 a conflict with current state, the caller must re-read and decide
 *   500 we failed, the caller (and Hasura) should retry
 *
 * Anything unrecognised is treated as infrastructure and returned as 500. A
 * 4xx would tell Hasura the delivery succeeded in being rejected and stop the
 * retry, silently dropping work.
 */
export function toHttpException(err: unknown): HttpException {
  if (err instanceof InsufficientStockError) {
    return new HttpException(
      {
        message: err.message,
        // Structured detail so the calling service can rebuild the same rich
        // error it raised before inventory was split into its own context.
        extensions: {
          code: "insufficient-stock",
          productId: err.productId,
          requested: err.requested,
          available: err.availableQty,
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  if (err instanceof ReservationConflictError) {
    return new HttpException(
      {
        message: err.message,
        extensions: {
          code: "reservation-conflict",
          orderId: err.orderId,
          productId: err.productId,
          existing: err.existingQty,
          requested: err.requestedQty,
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  if (err instanceof UnknownStockItemError) {
    return new HttpException(
      { message: err.message, extensions: { code: "unknown-product" } },
      HttpStatus.NOT_FOUND,
    );
  }

  if (err instanceof ReservationNotFoundError) {
    return new HttpException(
      { message: err.message, extensions: { code: "not-found" } },
      HttpStatus.NOT_FOUND,
    );
  }

  if (err instanceof ZodError) {
    return new HttpException(
      { message: "Invalid input", extensions: { code: "bad-input" } },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (err instanceof BusinessError) {
    return new HttpException(
      { message: err.message, extensions: { code: "rejected" } },
      HttpStatus.BAD_REQUEST,
    );
  }

  // Everything else, including InfrastructureError and anything unanticipated.
  // The message is masked; the cause is logged by the caller.
  const code = err instanceof InfrastructureError ? "storage-unavailable" : "internal";
  return new HttpException(
    { message: "Internal error", extensions: { code } },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
