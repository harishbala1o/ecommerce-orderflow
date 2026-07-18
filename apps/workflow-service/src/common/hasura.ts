/** Shapes of the payloads Hasura sends to Action and Event Trigger webhooks. */

export interface HasuraActionBody {
  input: unknown;
  session_variables?: Record<string, string | undefined>;
}

export interface HasuraEventRow {
  order_id?: string;
  to_status?: string;
  from_status?: string | null;
  action?: string;
}

export interface HasuraEventBody {
  id: string;
  event?: {
    op?: string;
    data?: {
      old?: HasuraEventRow | null;
      new?: HasuraEventRow | null;
    };
  };
}
