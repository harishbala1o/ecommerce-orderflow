-- Phase 0 safety foundations.
--
-- Forward-only: the applied 1720000000000_init migration is left untouched.

-- 1. The privileged business role is renamed away from `admin`.
--
-- Hasura reserves `admin` for a built-in role that bypasses every permission
-- check, so no browser session may hold it. Keeping the domain's privileged
-- role under a different name makes it impossible to grant Hasura's superuser
-- by accident while expressing a business privilege.
alter table users drop constraint if exists users_role_check;
update users set role = 'business_admin' where role = 'admin';
alter table users add constraint users_role_check
  check (role in ('customer', 'ops', 'business_admin'));

-- Historical audit rows keep whatever role was recorded at the time; rewriting
-- them would falsify the audit trail. Only the forward-looking label changes.

-- 2. Optimistic concurrency for operator actions.
--
-- Two operators acting on the same order must not silently overwrite each
-- other. Every transition bumps this, and a state-changing request may carry
-- the version it believes it is acting on.
alter table orders add column version integer not null default 1;

-- 3. Idempotency for state-changing operations.
--
-- Scoped to (operation, actor, key) with a payload fingerprint, so:
--   - the same key with the same payload replays the stored response;
--   - the same key with a different payload is a conflict, never a silent
--     application of the wrong request.
create table idempotency_keys (
  operation    text        not null,
  actor_id     uuid        not null,
  key          text        not null,
  fingerprint  text        not null,
  -- `in_progress` is a durable claim, not a success. It is never treated as a
  -- completed operation; a crashed attempt is recovered by the reconciliation
  -- work in a later phase.
  status       text        not null default 'in_progress'
                 check (status in ('in_progress', 'succeeded', 'failed')),
  response     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (operation, actor_id, key)
);

create index idempotency_keys_created_idx on idempotency_keys (created_at);

create trigger idempotency_keys_touch before update on idempotency_keys
  for each row execute function set_updated_at();
