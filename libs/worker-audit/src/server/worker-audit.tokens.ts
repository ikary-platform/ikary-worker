/**
 * NestJS injection token for the DatabaseService. Bound by WorkerAuditModule
 * to whatever token the host app provides via `databaseProviderToken`.
 */
export const WORKER_AUDIT_DATABASE = Symbol('WORKER_AUDIT_DATABASE');

/** Injection token for the validated WorkerAuditConfig. */
export const WORKER_AUDIT_CONFIG = Symbol('WORKER_AUDIT_CONFIG');
