import type { Confidence, ToolRisk, ToolStatus } from '@akc/shared';

export type SemanticTone = 'ai' | 'success' | 'warning' | 'danger';

export function toolRiskTone(risk: ToolRisk): SemanticTone {
  if (risk === 'destructive') return 'danger';
  if (risk === 'write') return 'warning';
  return 'ai';
}

export function toolStatusTone(status: ToolStatus): SemanticTone {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  return 'ai';
}

export function confidenceTone(confidence: Confidence): SemanticTone {
  return confidence === 'high' ? 'success' : 'warning';
}
