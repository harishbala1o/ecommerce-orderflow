import { HttpException, HttpStatus } from "@nestjs/common";
import { ZodError } from "zod";
import {
  ForbiddenTransitionError,
  IllegalTransitionError,
  InsufficientStockError,
} from "@ecommerce-orderflow/domain";
import {
  OrderNotFoundError,
  UnauthenticatedError,
  UnknownProductError,
} from "../orders/errors.js";

/**
 * Maps a thrown error to a Hasura Action error response
 * (`{ message, extensions: { code } }`, HTTP 400). Unknown errors are masked as
 * a generic internal error so implementation details never leak to clients.
 */
export function toActionException(err: unknown): HttpException {
  const { code, message } = classify(err);
  return new HttpException({ message, extensions: { code } }, HttpStatus.BAD_REQUEST);
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
