import { describe, expect, it } from 'vitest';
import { confidenceTone, toolRiskTone, toolStatusTone } from '../features/copilot/tone';

describe('semantic tone mapping', () => {
  it('reserves danger for destructive or failed states', () => {
    expect(toolRiskTone('read')).toBe('ai');
    expect(toolRiskTone('write')).toBe('warning');
    expect(toolRiskTone('destructive')).toBe('danger');
    expect(toolStatusTone('failed')).toBe('danger');
  });

  it('uses success only for completed or high-confidence outcomes', () => {
    expect(toolStatusTone('completed')).toBe('success');
    expect(toolStatusTone('running')).toBe('ai');
    expect(confidenceTone('high')).toBe('success');
    expect(confidenceTone('medium')).toBe('warning');
    expect(confidenceTone('low')).toBe('warning');
  });
});
