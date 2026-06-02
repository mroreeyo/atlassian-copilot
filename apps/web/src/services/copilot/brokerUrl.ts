const brokerBaseUrl = safeBrokerBaseUrl(import.meta.env.VITE_BROKER_BASE_URL ?? '');

function safeBrokerBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) throw new Error('브라우저 Broker URL은 http(s) URL이어야 합니다.');
  const url = new URL(trimmed, 'http://localhost');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('브라우저 Broker URL은 http(s) URL이어야 합니다.');
  if (url.username || url.password) throw new Error('브라우저 Broker URL에는 인증 정보를 포함할 수 없습니다.');
  if (url.hash) throw new Error('브라우저 Broker URL에는 해시를 포함할 수 없습니다.');
  if (url.search) throw new Error('브라우저 Broker URL에는 쿼리 값을 포함할 수 없습니다.');
  return trimmed.replace(/\/+$/, '');
}

export function brokerUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) throw new Error('서버 응답은 상대 /api URL만 사용할 수 있습니다.');
  if (!path.startsWith('/api/')) throw new Error(`잘못된 서버 경로: ${path}`);
  return `${brokerBaseUrl}${path}`;
}
