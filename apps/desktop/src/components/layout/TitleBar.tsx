import { ChevronLeft, ChevronRight, Menu, PanelRight, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, type ViewMode } from '../../stores/settings-store';
import { motion } from 'framer-motion';

interface TitleBarProps {
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
}

const modeTabs: { id: ViewMode; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'cowork', label: 'Cowork' },
  { id: 'code', label: 'Code' },
];

export function TitleBar({ onToggleSidebar, onToggleRightPanel }: TitleBarProps) {
  const { rightPanelCollapsed, viewMode, setViewMode } = useSettingsStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'h-12 flex items-center justify-between px-4',
        'bg-stone-900/80 backdrop-blur-[12px]',
        'border-b border-stone-800',
        'window-drag',
        'relative'
      )}
    >
      {/* Left side - Navigation and sidebar toggle */}
      <div className="flex items-center gap-2 relative z-10">
        {/* Traffic lights space */}
        <div className="w-20" />

        {/* Back/Forward buttons (disabled for now) */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          disabled
          className={cn(
            'window-no-drag p-1.5 rounded-lg',
            'text-stone-600 cursor-not-allowed',
            'transition-all duration-150'
          )}
          title="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          disabled
          className={cn(
            'window-no-drag p-1.5 rounded-lg',
            'text-stone-600 cursor-not-allowed',
            'transition-all duration-150'
          )}
          title="Forward"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>

        {/* Sidebar toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleSidebar}
          className={cn(
            'window-no-drag p-1.5 rounded-lg',
            'text-stone-400 hover:text-stone-200 hover:bg-stone-800',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/40'
          )}
          title="Toggle sidebar"
        >
          <Menu className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Center - Mode tabs */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="flex items-center bg-stone-800/80 rounded-lg p-1">
          {modeTabs.map((tab) => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setViewMode(tab.id)}
              className={cn(
                'window-no-drag px-4 py-1.5 rounded-md text-sm font-medium',
                'transition-all duration-200',
                viewMode === tab.id
                  ? 'bg-stone-700 text-stone-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-700/50'
              )}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Right side - Panel toggle */}
      <div className="flex items-center gap-1.5 relative z-10">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleRightPanel}
          className={cn(
            'window-no-drag p-1.5 rounded-lg',
            'text-stone-400 hover:text-stone-200 hover:bg-stone-800',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/40'
          )}
          title={rightPanelCollapsed ? 'Show panel' : 'Hide panel'}
        >
          {rightPanelCollapsed ? (
            <PanelRight className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
