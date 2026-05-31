console.info(JSON.stringify({
  status: 'delegated',
  reason: 'smoke:openai is a compatibility alias; use smoke:llm for the provider-neutral personal LLM runtime.'
}, null, 2));

await import('./smoke-llm.js');

export {};
