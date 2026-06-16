const defaultProviderTimeoutMs = 30_000;

export interface ProviderTimeout {
  signal: AbortSignal;
  abort(reason?: unknown): void;
  clear(): void;
}

export function createProviderTimeout(env = process.env, externalSignal?: AbortSignal): ProviderTimeout {
  const controller = new AbortController();
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const onExternalAbort = () => abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort(externalSignal.reason);
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeout = setTimeout(() => abort(new Error('LLM provider request timed out.')), providerTimeoutMs(env));
  return {
    signal: controller.signal,
    abort,
    clear() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };
}

export async function fetchWithProviderTimeout(input: RequestInfo | URL, init: RequestInit = {}, env = process.env): Promise<Response> {
  const timeout = createProviderTimeout(env, init.signal ?? undefined);
  try {
    return await fetch(input, { ...init, signal: timeout.signal });
  } finally {
    timeout.clear();
  }
}

export async function* readAbortableStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
      if (done) return;
      if (value) yield value;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore pending-read release races after abort; the abort path already rejected the caller.
    }
  }
}

function readWithAbort(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) {
    void reader.cancel(signal.reason).catch(() => undefined);
    return Promise.reject(abortError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      void reader.cancel(signal.reason).catch(() => undefined);
      reject(abortError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error('LLM provider request aborted.');
}

function providerTimeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.AKC_LLM_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultProviderTimeoutMs;
}
