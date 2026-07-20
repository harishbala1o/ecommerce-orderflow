/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query OrdersList {\n  orders(order_by: {updated_at: desc}) {\n    id\n    status\n    total_cents\n    updated_at\n    customer {\n      display_name\n    }\n    items {\n      id\n      quantity\n    }\n  }\n}\n\nquery OrderDetail($id: uuid!) {\n  orders_by_pk(id: $id) {\n    id\n    status\n    total_cents\n    created_at\n    updated_at\n    customer {\n      display_name\n      email\n    }\n    items {\n      id\n      quantity\n      unit_price_cents\n      product {\n        name\n        sku\n      }\n    }\n    events(order_by: {created_at: asc}) {\n      id\n      from_status\n      to_status\n      action\n      actor_role\n      created_at\n    }\n  }\n}\n\nquery ProductsList {\n  products(order_by: {name: asc}) {\n    id\n    sku\n    name\n    description\n    unit_price_cents\n    stock_qty\n  }\n}\n\nmutation PlaceOrder($items: [OrderItemInput!]!) {\n  placeOrder(items: $items) {\n    id\n    status\n  }\n}\n\nmutation TransitionOrder($orderId: uuid!, $action: String!) {\n  transitionOrder(orderId: $orderId, action: $action) {\n    id\n    status\n  }\n}": typeof types.OrdersListDocument,
};
const documents: Documents = {
    "query OrdersList {\n  orders(order_by: {updated_at: desc}) {\n    id\n    status\n    total_cents\n    updated_at\n    customer {\n      display_name\n    }\n    items {\n      id\n      quantity\n    }\n  }\n}\n\nquery OrderDetail($id: uuid!) {\n  orders_by_pk(id: $id) {\n    id\n    status\n    total_cents\n    created_at\n    updated_at\n    customer {\n      display_name\n      email\n    }\n    items {\n      id\n      quantity\n      unit_price_cents\n      product {\n        name\n        sku\n      }\n    }\n    events(order_by: {created_at: asc}) {\n      id\n      from_status\n      to_status\n      action\n      actor_role\n      created_at\n    }\n  }\n}\n\nquery ProductsList {\n  products(order_by: {name: asc}) {\n    id\n    sku\n    name\n    description\n    unit_price_cents\n    stock_qty\n  }\n}\n\nmutation PlaceOrder($items: [OrderItemInput!]!) {\n  placeOrder(items: $items) {\n    id\n    status\n  }\n}\n\nmutation TransitionOrder($orderId: uuid!, $action: String!) {\n  transitionOrder(orderId: $orderId, action: $action) {\n    id\n    status\n  }\n}": types.OrdersListDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query OrdersList {\n  orders(order_by: {updated_at: desc}) {\n    id\n    status\n    total_cents\n    updated_at\n    customer {\n      display_name\n    }\n    items {\n      id\n      quantity\n    }\n  }\n}\n\nquery OrderDetail($id: uuid!) {\n  orders_by_pk(id: $id) {\n    id\n    status\n    total_cents\n    created_at\n    updated_at\n    customer {\n      display_name\n      email\n    }\n    items {\n      id\n      quantity\n      unit_price_cents\n      product {\n        name\n        sku\n      }\n    }\n    events(order_by: {created_at: asc}) {\n      id\n      from_status\n      to_status\n      action\n      actor_role\n      created_at\n    }\n  }\n}\n\nquery ProductsList {\n  products(order_by: {name: asc}) {\n    id\n    sku\n    name\n    description\n    unit_price_cents\n    stock_qty\n  }\n}\n\nmutation PlaceOrder($items: [OrderItemInput!]!) {\n  placeOrder(items: $items) {\n    id\n    status\n  }\n}\n\nmutation TransitionOrder($orderId: uuid!, $action: String!) {\n  transitionOrder(orderId: $orderId, action: $action) {\n    id\n    status\n  }\n}"): typeof import('./graphql').OrdersListDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
