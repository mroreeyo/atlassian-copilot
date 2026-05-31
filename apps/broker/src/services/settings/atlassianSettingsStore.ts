import type { AtlassianConnectionStatus, AtlassianSettingsRequest } from '@akc/shared';
import { decryptSecret, encryptSecret, readJsonProfile, removeJsonProfile, writeJsonProfile, type EncryptedSecret } from './credentialStore.js';
export { resolveStateDir } from './credentialStore.js';

const defaultJiraProjects = ['AKC', 'NFS'];
const defaultConfluenceSpaces = ['AKC'];
const profileFileName = 'atlassian-profile.json';
interface StoredAtlassianProfile {
  version: 1;
  siteUrl: string;
  email: string;
  apiToken: EncryptedSecret;
  allowedJiraProjects: string[];
  allowedConfluenceSpaces: string[];
  lastValidatedAt?: string | undefined;
  lastError?: string | undefined;
  updatedAt: string;
}

export interface ResolvedAtlassianCredentials extends AtlassianConnectionStatus {
  apiToken?: string | undefined;
}

export interface AtlassianValidationResult {
  ok: boolean;
  message: string;
  validatedAt?: string | undefined;
  error?: string | undefined;
}

export function readResolvedAtlassianCredentials(env = process.env): ResolvedAtlassianCredentials {
  const personal = readPersonalAtlassianProfile(env);
  if (personal) {
    const apiToken = decryptSecret(personal.apiToken, env);
    const connected = Boolean(personal.lastValidatedAt) && !personal.lastError;
    return {
      source: 'personal',
      connectionState: personal.lastError ? 'failed' : connected ? 'connected' : 'configured',
      configured: true,
      connected,
      siteUrl: personal.siteUrl,
      email: personal.email,
      apiToken,
      tokenConfigured: true,
      allowedJiraProjects: personal.allowedJiraProjects,
      allowedConfluenceSpaces: personal.allowedConfluenceSpaces,
      statusMessage: atlassianStatusMessage('personal', true, connected, personal.lastError),
      lastValidatedAt: personal.lastValidatedAt,
      lastError: personal.lastError
    };
  }

  const siteUrl = env.ATLASSIAN_URL?.trim();
  const email = env.ATLASSIAN_EMAIL?.trim();
  const apiToken = env.ATLASSIAN_API_TOKEN?.trim();
  if (siteUrl && email && apiToken) {
    return {
      source: 'environment',
      connectionState: 'configured',
      configured: true,
      connected: false,
      siteUrl,
      email,
      apiToken,
      tokenConfigured: true,
      allowedJiraProjects: parseAllowlist(env.JIRA_PROJECT_ALLOWLIST, defaultJiraProjects),
      allowedConfluenceSpaces: parseAllowlist(env.CONFLUENCE_SPACE_ALLOWLIST, defaultConfluenceSpaces),
      statusMessage: '서버 환경 변수로 Atlassian 연결 정보가 준비되어 있습니다. 연결 테스트로 조회 가능 여부를 확인하세요.'
    };
  }

  return {
    source: 'none',
    connectionState: 'not_configured',
    configured: false,
    connected: false,
    tokenConfigured: false,
    allowedJiraProjects: parseAllowlist(env.JIRA_PROJECT_ALLOWLIST, defaultJiraProjects),
    allowedConfluenceSpaces: parseAllowlist(env.CONFLUENCE_SPACE_ALLOWLIST, defaultConfluenceSpaces),
    statusMessage: '개인 Atlassian 연결이 아직 없습니다. 실제 조회 데이터가 없으면 코파일럿은 데이터 없음으로 응답합니다.'
  };
}

export function savePersonalAtlassianSettings(input: AtlassianSettingsRequest, env = process.env): void {
  const existingPersonal = readPersonalAtlassianProfile(env);
  const existingToken = existingPersonal ? decryptSecret(existingPersonal.apiToken, env) : undefined;
  const apiToken = input.apiToken?.trim() || existingToken;
  if (!apiToken) {
    throw new Error('개인 Atlassian 설정을 저장하려면 API 토큰이 필요합니다.');
  }

  const profile: StoredAtlassianProfile = {
    version: 1,
    siteUrl: input.siteUrl.trim(),
    email: input.email.trim(),
    apiToken: encryptSecret(apiToken, env),
    allowedJiraProjects: normalizeAllowlist(input.jiraProjectAllowlist, defaultJiraProjects),
    allowedConfluenceSpaces: normalizeAllowlist(input.confluenceSpaceAllowlist, defaultConfluenceSpaces),
    updatedAt: new Date().toISOString()
  };
  if (existingPersonal && !input.apiToken?.trim() && existingPersonal.siteUrl === profile.siteUrl && existingPersonal.email === profile.email) {
    profile.lastValidatedAt = existingPersonal.lastValidatedAt;
    profile.lastError = existingPersonal.lastError;
  }

  writeJsonProfile(profileFileName, profile, env);
}

export function clearPersonalAtlassianSettings(env = process.env): void {
  removeJsonProfile(profileFileName, env);
}

export function recordPersonalAtlassianValidation(result: AtlassianValidationResult, env = process.env): void {
  const existing = readPersonalAtlassianProfile(env);
  if (!existing) return;
  const updated: StoredAtlassianProfile = {
    ...existing,
    lastValidatedAt: result.ok ? (result.validatedAt ?? new Date().toISOString()) : existing.lastValidatedAt,
    lastError: result.ok ? undefined : (result.error ?? result.message),
    updatedAt: new Date().toISOString()
  };
  writeJsonProfile(profileFileName, updated, env);
}

export async function testResolvedAtlassianConnection(credentials: ResolvedAtlassianCredentials): Promise<AtlassianValidationResult> {
  if (!credentials.siteUrl || !credentials.email || !credentials.apiToken) {
    return { ok: false, message: '테스트할 수 있는 Atlassian 연결 정보가 없습니다.' };
  }

  try {
    const response = await fetch(`${normalizeSiteUrl(credentials.siteUrl)}/rest/api/3/myself`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64')}`
      }
    });
    if (!response.ok) return { ok: false, message: `Atlassian 연결 테스트가 실패했습니다. 상태 ${response.status}.` };
    return { ok: true, message: 'Atlassian 연결 테스트를 통과했습니다.', validatedAt: new Date().toISOString() };
  } catch {
    return { ok: false, message: 'Atlassian 응답을 받기 전에 연결 테스트가 실패했습니다.' };
  }
}

function readPersonalAtlassianProfile(env = process.env): StoredAtlassianProfile | null {
  const parsed = readJsonProfile<StoredAtlassianProfile>(profileFileName, 1, env);
  if (!parsed) return null;
  return {
    ...parsed,
    allowedJiraProjects: normalizeAllowlist(parsed.allowedJiraProjects, defaultJiraProjects),
    allowedConfluenceSpaces: normalizeAllowlist(parsed.allowedConfluenceSpaces, defaultConfluenceSpaces)
  };
}

function parseAllowlist(value: string | undefined, fallback: string[]): string[] {
  if (!value) return [...fallback];
  return normalizeAllowlist(value.split(','), fallback);
}

function normalizeAllowlist(values: string[], fallback: string[]): string[] {
  const normalized = values.map((value) => value.trim().toUpperCase()).filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : [...fallback];
}

function atlassianStatusMessage(source: 'personal' | 'environment', tokenConfigured: boolean, connected: boolean, lastError?: string): string {
  if (!tokenConfigured) return 'Atlassian이 선택되었지만 서버가 저장된 API 토큰을 복호화할 수 없습니다.';
  if (lastError) return 'Atlassian 연결은 저장되었지만 마지막 연결 테스트가 실패했습니다.';
  if (connected) return 'Atlassian 연결이 저장되었고 마지막 연결 테스트가 통과했습니다.';
  return source === 'environment'
    ? '서버 환경 변수로 Atlassian 연결 정보가 준비되어 있습니다. 연결 테스트로 조회 가능 여부를 확인하세요.'
    : 'Atlassian 연결이 저장되었습니다. 연결 테스트로 조회 가능 여부를 확인하세요.';
}

function normalizeSiteUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  if (parsed.protocol !== 'https:') throw new Error('Atlassian site URL must use https.');
  return parsed.origin;
}
