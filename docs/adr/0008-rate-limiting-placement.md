# 8. Rate limiting in the services, keyed on the user

Date: 2026-08-12 · Status: Accepted

## Context

Nothing bounded how much work a single caller could trigger. Hasura's own per-role rate
limiting is an Enterprise feature and is unavailable on the open-source engine this project
runs, so it could not be used.

## Decision

Enforce limits in the services with `@nestjs/throttler`, keyed on the **Hasura-forwarded
user id** with an IP fallback. Order actions get 30 requests per minute; inventory commands,
which are cheaper, get 60.

Three endpoint classes are **exempt**, and each exemption prevents a specific failure:

| Exempt | If it were throttled |
|--------|----------------------|
| Event Trigger handlers | Hasura retries failed events. Throttling would reject retries and silently drop stock releases and notifications, defeating at-least-once delivery. |
| `/health` | Kubernetes polls every 5 seconds. A throttled probe reads as an unhealthy container and triggers a pointless restart. |
| `/metrics` | Prometheus scrapes every 5 seconds, consuming the entire per-minute budget on its own. |

## Consequences

- Keying on the user id matters more than it first appears: every request reaches the
  service from a **single Hasura pod**, so an IP-only key would put all users in one shared
  bucket and let one heavy user starve everyone else.
- Guards run before interceptors in NestJS, so a throttled request never reaches the metrics
  interceptor. It therefore appears in neither the numerator nor the denominator of the RED
  histogram and **cannot burn the availability error budget**. That is the correct outcome:
  refusing excess load is the system working, not failing. Visibility comes from a dedicated
  `orderflow_throttled_total` counter instead.
- In-memory counters mean limits are per replica. With three replicas the effective limit is
  three times the configured value. A shared store such as Redis would be needed for exact
  global limits.

## Alternatives considered

- **Edge or ingress only.** Architecturally the most correct place, and still wanted in
  production, but nothing would be verifiable locally and the internal service would remain
  unbounded.
- **A fixed IP-based limit.** Simpler, but useless here for the reason above: all traffic
  shares one source address.
