import { describe, expect, it } from 'vitest';
import { CommandValidator } from './validator.js';

describe('CommandValidator intent classification and trust scoring', () => {
  const validator = new CommandValidator({
    mode: 'workspace-write',
    allowNetwork: false,
    allowProcessSpawn: false,
    allowedPaths: [process.cwd(), '/tmp'],
    trustedCommands: ['ls', 'pwd', 'git status', 'git diff'],
  });

  it('classifies read intent with high trust for safe read-only commands', () => {
    const analysis = validator.analyze('ls -la');
    expect(analysis.intent.primary).toBe('read');
    expect(analysis.intent.intents).toContain('read');
    expect(analysis.trust.level).toBe('high');
    expect(analysis.trust.score).toBeGreaterThanOrEqual(0.75);
  });

  it('classifies delete intent with low trust for destructive commands', () => {
    const analysis = validator.analyze('rm -rf /tmp/demo');
    expect(analysis.intent.primary).toBe('delete');
    expect(['moderate', 'dangerous', 'blocked']).toContain(analysis.risk);
    expect(analysis.trust.level).toBe('low');
    expect(analysis.trust.score).toBeLessThan(0.45);
  });

  it('classifies network intent and lowers trust', () => {
    const analysis = validator.analyze('curl https://example.com');
    expect(analysis.intent.intents).toContain('network');
    expect(analysis.networkAccess).toBe(true);
    expect(analysis.trust.score).toBeLessThan(0.7);
  });

  it('applies trusted command prefixes to increase trust score', () => {
    const trusted = validator.analyze('git status --short');
    const untrusted = validator.analyze('python -V');
    expect(trusted.intent.intents).toContain('version_control');
    expect(trusted.trust.score).toBeGreaterThan(untrusted.trust.score);
  });
});
