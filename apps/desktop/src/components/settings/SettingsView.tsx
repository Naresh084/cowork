import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Settings2, MessageSquare, Hash, Send, SlidersHorizontal, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../stores/app-store';
import { useIntegrationStore } from '../../stores/integration-store';
import { GeneralSettings } from './GeneralSettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { WhatsAppSettings } from './WhatsAppSettings';
import { SlackSettings } from './SlackSettings';
import { TelegramSettings } from './TelegramSettings';

type SettingsTab = 'general' | 'apiKeys' | 'integrations' | 'whatsapp' | 'slack' | 'telegram';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string; color?: string }>;
  color?: string;
}

const tabConfig: TabConfig[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'apiKeys', label: 'API & Keys', icon: KeyRound },
  { id: 'integrations', label: 'Integrations', icon: SlidersHorizontal },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: '#25D366' },
  { id: 'slack', label: 'Slack', icon: Hash, color: '#9B59B6' },
  { id: 'telegram', label: 'Telegram', icon: Send, color: '#2AABEE' },
];

const tabContent: Record<SettingsTab, React.ComponentType> = {
  general: GeneralSettings,
  apiKeys: ApiKeysSettings,
  integrations: IntegrationSettings,
  whatsapp: WhatsAppSettings,
  slack: SlackSettings,
  telegram: TelegramSettings,
};

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const platforms = useIntegrationStore((s) => s.platforms);

  // Refresh platform statuses from sidecar when settings screen opens
  useEffect(() => {
    const store = useIntegrationStore.getState();
    store.refreshStatuses();

    const interval = setInterval(() => {
      void useIntegrationStore.getState().refreshStatuses();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const ActiveContent = tabContent[activeTab];

  return (
    <div className="flex flex-col h-full bg-[#0E0F13]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.08]">
        <button
          onClick={() => setCurrentView('chat')}
          className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-[#93C5FD]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white/90">Settings</h1>
            <p className="text-xs text-white/40">Configure models and integrations</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-white/[0.08]">
        {tabConfig.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isConnected =
            tab.id !== 'general' &&
            tab.id !== 'apiKeys' &&
            tab.id !== 'integrations' &&
            platforms[tab.id as 'whatsapp' | 'slack' | 'telegram']?.connected;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-white/[0.08] text-white/90'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
              )}
            >
              <Icon
                className="w-4 h-4"
                color={tab.color && isActive ? tab.color : undefined}
              />
              <span>{tab.label}</span>
              {tab.id !== 'general' && tab.id !== 'apiKeys' && tab.id !== 'integrations' && (
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    isConnected
                      ? ''
                      : 'border border-white/20'
                  )}
                  style={
                    isConnected
                      ? {
                          backgroundColor: tab.color,
                          boxShadow: `0 0 4px 1px ${tab.color}40`,
                        }
                      : undefined
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <ActiveContent />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
