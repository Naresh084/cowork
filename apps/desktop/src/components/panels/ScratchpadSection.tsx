import { useState, useEffect, useRef } from 'react';
import { StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { CollapsibleSection } from './CollapsibleSection';

/**
 * ScratchpadSection - Quick notes area persisted in settings-store
 *
 * Features:
 * - Auto-saves content to localStorage via zustand persist
 * - Debounced save to prevent excessive updates
 * - Restores content on mount
 */
export function ScratchpadSection() {
  const { scratchpadContent, setScratchpadContent } = useSettingsStore();
  const [localContent, setLocalContent] = useState(scratchpadContent);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local state with store on mount
  useEffect(() => {
    setLocalContent(scratchpadContent);
  }, [scratchpadContent]);

  // Debounced save to store
  const handleChange = (value: string) => {
    setLocalContent(value);

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce save
    debounceRef.current = setTimeout(() => {
      setScratchpadContent(value);
    }, 300);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <CollapsibleSection id="scratchpad" title="Scratchpad" icon={StickyNote}>
      <textarea
        value={localContent}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Quick notes..."
        className={cn(
          'w-full h-32 p-2.5 text-sm',
          'bg-[#151518] rounded-lg',
          'border border-white/[0.08]',
          'text-white/80 placeholder:text-white/30',
          'resize-none',
          'focus:outline-none focus:border-[#6B6EF0]/50',
          'transition-colors'
        )}
      />
    </CollapsibleSection>
  );
}
