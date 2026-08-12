import { HttpException, HttpStatus } from "@nestjs/common";
import { ZodError } from "zod";
import {
  InsufficientStockError,
  ReservationNotFoundError,
  UnknownStockItemError,
} from "./errors.js";

/**
 * Maps a thrown error to a structured response (`{ message, extensions: { code } }`).
 * Insufficient stock is a 409 so the calling service can distinguish "you asked for
 * too much" from "your request was malformed". Unknown errors are masked.
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
  const { code, message } = classify(err);
  return new HttpException({ message, extensions: { code } }, HttpStatus.BAD_REQUEST);
}

function classify(err: unknown): { code: string; message: string } {
  if (err instanceof ZodError) return { code: "bad-input", message: "Invalid input" };
  if (err instanceof UnknownStockItemError) {
    return { code: "unknown-product", message: err.message };
  }
  if (err instanceof ReservationNotFoundError) {
    return { code: "not-found", message: err.message };
  }
  return { code: "internal", message: "Internal error" };
}
