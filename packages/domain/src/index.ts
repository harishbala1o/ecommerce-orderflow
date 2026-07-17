export { ORDER_STATUSES, isTerminal, type OrderStatus } from "./order-status.js";
export { ROLES, type Role } from "./roles.js";
export {
  TRANSITIONS,
  findRule,
  canTransition,
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
} from "./errors.js";
