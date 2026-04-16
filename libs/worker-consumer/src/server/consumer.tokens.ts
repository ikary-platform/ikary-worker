/**
 * Multi-provider injection token for IConsumer implementations.
 *
 * @example
 * ConsumerModule.register({
 *   consumers: [
 *     { provide: CONSUMER, useClass: AuditConsumer,   multi: true },
 *     { provide: CONSUMER, useClass: MetricsConsumer, multi: true },
 *   ],
 * })
 */
export const CONSUMER = Symbol('CONSUMER');

/** Injection token for the resolved ConsumerOptions. */
export const CONSUMER_OPTIONS = Symbol('CONSUMER_OPTIONS');

/**
 * Injection token for the DatabaseService used by repositories.
 * Bound to whatever DB service the host application provides, same
 * pattern as @ikary/system-log-core's databaseProviderToken.
 */
export const CONSUMER_DATABASE = Symbol('CONSUMER_DATABASE');
