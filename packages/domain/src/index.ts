export { ORDER_STATUSES, type OrderStatus } from "./order-status.js";
export { ROLES, type Role } from "./roles.js";
export {
  TRANSITIONS,
  findRule,
  canTransition,
  isTerminal,
  type OrderAction,
  type TransitionRule,
} from "./transitions.js";
export {
  applyTransition,
  type TransitionInput,
  type TransitionResult,
} from "./state-machine.js";
export {
  DomainError,
  IllegalTransitionError,
  ForbiddenTransitionError,
  InsufficientStockError,
} from "./errors.js";
