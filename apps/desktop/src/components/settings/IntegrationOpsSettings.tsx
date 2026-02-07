import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function IntegrationOpsSettings() {
  const [channel, setChannel] = useState('slack');
  const [message, setMessage] = useState('Integration rich messaging test');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runTest = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const response = await invoke<{ success: boolean; reason?: string }>(
        'agent_integration_test_action',
        { channel, message },
      );
      if (response.success) {
        setResult('Message action test succeeded.');
      } else {
        setResult(response.reason || 'Message action test failed.');
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">Rich Messaging Operations</h4>
          <SettingHelpPopover settingId="integration.messageTool" />
        </div>
        <p className="mt-1 text-xs text-white/45">
          Integrations expose channel actions through one canonical tool (`message`). Supported actions depend on each
          connected channel capability matrix.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-xs text-white/55 uppercase tracking-wide">Channel</label>
          <SettingHelpPopover settingId="integration.messageOpsChannel" />
        </div>
        <input
          type="text"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="block text-xs text-white/55 uppercase tracking-wide">Test message</label>
          <SettingHelpPopover settingId="integration.messageOpsPayload" />
        </div>
        <textarea
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={isRunning || !channel.trim() || !message.trim()}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            isRunning || !channel.trim() || !message.trim()
              ? 'bg-white/[0.06] text-white/35 cursor-not-allowed'
              : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
          )}
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Run message action
        </button>
        {result ? <p className="text-xs text-white/55">{result}</p> : null}
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/55">
          Impact: validates integration action routing and capability gating. Security: test only in approved channels.
          Session behavior: no new session required for action-level integration tests.
        </p>
      </div>
    </div>
  );
}
