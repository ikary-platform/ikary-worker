---
"@ikary/worker": minor
"@ikary/system-amqp": minor
---

First real release of the worker framework:

- New `@ikary/system-amqp` lib: AMQP connection/publisher with 100% test coverage, hierarchical routing key builder
- Integration with `@ikary/system-log-core` for structured platform logging via `app.useLogger()`
- Migration tooling aligned with the `ikary` CLI — `pnpm migrate` delegates to `ikary local db migrate`, supports idempotent multi-repo migration tracking via `ikary_schema_versions`
- Thin `RabbitMQAdapter` in `apps/worker` — builds routing key and headers, delegates AMQP to `AmqpPublisherService`
- GitHub Actions suite mirroring `ikary-manifest`: CI, CodeQL, changesets, release pipeline, and 6 Claude workflows
