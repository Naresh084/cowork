import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, clearMockInvokeResponses, setMockInvokeResponse } from '../test/mocks/tauri-core';
import { useConnectorStore } from './connector-store';
import { useSkillStore } from './skill-store';
import { useCommandStore } from './command-store';
import { useSubagentStore } from './subagent-store';
import { useSettingsStore } from './settings-store';

const WORKING_DIRECTORY = '/tmp/geminicowork';

function resetDiscoveryStores(): void {
  useConnectorStore.getState().reset();
  useSkillStore.getState().reset();
  useCommandStore.getState().reset();
  useSubagentStore.getState().reset();
  useSettingsStore.setState({
    installedSkillConfigs: [],
    installedCommandConfigs: [],
    installedConnectorConfigs: [],
  });
}

describe('discovery cache behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-11T00:00:00.000Z'));
    clearMockInvokeResponses();
    (invoke as unknown as { mockClear: () => void }).mockClear();
    resetDiscoveryStores();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches connector discovery within TTL and bypasses on force', async () => {
    setMockInvokeResponse('discover_connectors', { connectors: [] });

    await useConnectorStore.getState().discoverConnectors(WORKING_DIRECTORY);
    await useConnectorStore.getState().discoverConnectors(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(1);

    await useConnectorStore.getState().discoverConnectors(WORKING_DIRECTORY, { force: true });
    expect(invoke).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_001);
    await useConnectorStore.getState().discoverConnectors(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('caches skill discovery within TTL and bypasses on force', async () => {
    setMockInvokeResponse('agent_discover_skills', []);

    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY);
    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(1);

    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY, { force: true });
    expect(invoke).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_001);
    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('caches command discovery within TTL and bypasses on force', async () => {
    setMockInvokeResponse('deep_command_list', []);

    await useCommandStore.getState().discoverCommands(WORKING_DIRECTORY);
    await useCommandStore.getState().discoverCommands(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(1);

    await useCommandStore.getState().discoverCommands(WORKING_DIRECTORY, { force: true });
    expect(invoke).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_001);
    await useCommandStore.getState().discoverCommands(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('caches subagent loading within TTL and bypasses on force', async () => {
    setMockInvokeResponse('deep_subagent_list', []);

    await useSubagentStore.getState().loadSubagents(WORKING_DIRECTORY);
    await useSubagentStore.getState().loadSubagents(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(1);

    await useSubagentStore.getState().loadSubagents(WORKING_DIRECTORY, { force: true });
    expect(invoke).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_001);
    await useSubagentStore.getState().loadSubagents(WORKING_DIRECTORY);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
