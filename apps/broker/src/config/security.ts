const localDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5180',
  'http://127.0.0.1:5180'
];

export function getAllowedOrigins(env = process.env): string[] {
  const configured = env.BROKER_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  return configured.length > 0 ? configured : localDevOrigins;
}

export function hasCredentialEnvironment(env = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || env.ATLASSIAN_URL || env.ATLASSIAN_EMAIL || env.ATLASSIAN_API_TOKEN);
}
