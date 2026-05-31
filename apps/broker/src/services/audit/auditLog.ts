import type { AuditLogEntry } from '@akc/shared';

const entries: AuditLogEntry[] = [];

export function recordAudit(entry: AuditLogEntry): void {
  entries.push(entry);
}

export function listAuditEntries(): AuditLogEntry[] {
  return [...entries];
}

export function clearAuditEntriesForTests(): void {
  entries.length = 0;
}
