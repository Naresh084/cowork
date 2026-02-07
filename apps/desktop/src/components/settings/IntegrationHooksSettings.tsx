import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

interface HookRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; config?: Record<string, unknown> };
  action: { type: string; config?: Record<string, unknown> };
  updatedAt: number;
}

interface HookRun {
  id: string;
  ruleId: string;
  status: 'success' | 'error';
  startedAt: number;
  finishedAt: number;
  error?: string;
}

export function IntegrationHooksSettings() {
  const [rules, setRules] = useState<HookRule[]>([]);
  const [runs, setRuns] = useState<HookRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('slack');
  const [text, setText] = useState('Automated integration hook message');
  const [intervalSeconds, setIntervalSeconds] = useState('300');

  const load = async () => {
    setLoading(true);
    try {
      const response = await invoke<{ rules: HookRule[]; runs: HookRun[] }>(
        'agent_integration_hooks_list',
      );
      setRules(Array.isArray(response.rules) ? response.rules : []);
      setRuns(Array.isArray(response.runs) ? response.runs.slice(0, 10) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createRule = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await invoke('agent_integration_hooks_create', {
        input: {
          name: name.trim(),
          enabled: true,
          trigger: {
            type: 'cron',
            config: {
              intervalSeconds: Number(intervalSeconds) || 300,
            },
          },
          action: {
            type: 'integration_action',
            config: {
              channel,
              action: 'send',
              payload: { text },
            },
          },
        },
      });
      setName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">Create Hook Rule</h4>
          <SettingHelpPopover settingId="integration.hooksRule" />
        </div>
        <p className="text-xs text-white/45">
          Hooks run automation from integration triggers. Current runtime triggers include cron, path, and integration
          events, plus manual run-now execution.
        </p>
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55 uppercase tracking-wide">Rule Name</label>
          <SettingHelpPopover settingId="integration.hooksRuleName" />
        </div>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Rule name"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-3 flex items-center justify-between gap-2">
            <label className="text-xs text-white/55 uppercase tracking-wide">Trigger + Action Inputs</label>
            <SettingHelpPopover settingId="integration.hooksTriggerAction" />
          </div>
          <input
            type="text"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            placeholder="channel (slack/discord/...)"
            className="px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
          />
          <input
            type="number"
            min={5}
            value={intervalSeconds}
            onChange={(event) => setIntervalSeconds(event.target.value)}
            placeholder="interval seconds"
            className="px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
          />
          <button
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void createRule()}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              creating || !name.trim()
                ? 'bg-white/[0.06] text-white/35 cursor-not-allowed'
                : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
            )}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder="Message payload"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white/90">Rules and Recent Runs</h4>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-white/70 hover:bg-white/[0.06]"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>

        <div className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-xs text-white/45">No hook rules configured.</p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-white/85">{rule.name}</p>
                    <p className="text-[11px] text-white/45">
                      Trigger: {rule.trigger.type} | Action: {rule.action.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void invoke('agent_integration_hooks_run_now', { ruleId: rule.id }).then(() => load())}
                      className="p-1.5 rounded-md text-white/70 hover:bg-white/[0.08]"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void invoke('agent_integration_hooks_delete', { ruleId: rule.id }).then(() => load())}
                      className="p-1.5 rounded-md text-[#FF5449] hover:bg-[#FF5449]/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {runs.length > 0 ? (
          <div className="space-y-1 pt-2 border-t border-white/[0.06]">
            {runs.map((run) => (
              <p key={run.id} className="text-[11px] text-white/55">
                {run.status === 'success' ? 'Success' : 'Error'} | {run.ruleId} | {new Date(run.startedAt).toLocaleString()}
                {run.error ? ` | ${run.error}` : ''}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/55">
          Impact: hook rules automate channel actions from cron/path/integration events and manual run-now. Security:
          prefer allowlisted channels and dry-run first. Session behavior: hook config changes apply immediately.
        </p>
      </div>
    </div>
  );
}
