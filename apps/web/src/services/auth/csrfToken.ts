let csrfToken: string | undefined;

export function setMemoryCsrfToken(value: string | undefined): void {
  csrfToken = value && value.trim() ? value : undefined;
}

export function clearMemoryCsrfToken(): void {
  csrfToken = undefined;
}

export function csrfHeader(): Record<string, string> {
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}
