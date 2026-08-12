/** Shape of a Hasura Action request body. */
export interface HasuraActionBody {
  input?: unknown;
  session_variables?: Record<string, string | undefined>;
}

/** Shape of a Hasura Event Trigger delivery. */
export interface HasuraEventBody {
  id?: string;
  event?: { data?: { new?: Record<string, unknown> | null } };
}
