import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, RefreshCcw, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSettingHelp } from '@/content/help/settings-help-content';

interface SettingHelpPopoverProps {
  settingId: string;
  className?: string;
}

export function SettingHelpPopover({ settingId, className }: SettingHelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const entry = getSettingHelp(settingId);
  const viewportPadding = 12;
  const panelWidth = 360;

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = Boolean(triggerRef.current?.contains(target));
      const clickedPanel = Boolean(panelRef.current?.contains(target));
      if (!clickedTrigger && !clickedPanel && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = Math.min(panelWidth, viewportWidth - viewportPadding * 2);
      const estimatedHeight = panelRef.current?.offsetHeight || 420;

      let left = rect.right - maxWidth;
      left = Math.max(viewportPadding, Math.min(left, viewportWidth - maxWidth - viewportPadding));

      let top = rect.bottom + 8;
      if (top + estimatedHeight > viewportHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - estimatedHeight - 8);
      }

      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width: maxWidth,
      });
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const helpPanel = useMemo(() => {
    if (!open) return null;
    return (
      <div
        ref={panelRef}
        style={panelStyle}
        className={cn(
          'z-[130] rounded-xl border border-white/[0.12] bg-[#111218] p-3',
          'shadow-2xl shadow-black/50',
        )}
      >
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-white/90">{entry?.title}</h4>
          <p className="text-xs text-white/55">{entry?.description}</p>
        </div>

        <div className="mt-3 space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">What It Controls</p>
          <p className="text-xs text-white/70">{entry?.what_it_controls}</p>
        </div>

        <div className="mt-2 space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">When To Use</p>
          <p className="text-xs text-white/70">{entry?.when_to_use}</p>
        </div>

        <div className="mt-2 space-y-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
            <Wrench className="h-3 w-3" />
            Used By Tools
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entry?.tool_impact.map((tool) => (
              <span
                key={`${entry.id}-${tool}`}
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-white/75"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Security Notes</p>
          <p className="text-xs text-white/70">{entry?.security_notes}</p>
        </div>

        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
            entry?.requires_new_session
              ? 'border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#FCD34D]'
              : 'border-[#1D4ED8]/30 bg-[#1D4ED8]/10 text-[#93C5FD]',
          )}
        >
          <RefreshCcw className="h-3 w-3" />
          {entry?.requires_new_session ? 'New session required after change' : 'Applies without a new session'}
        </div>
      </div>
    );
  }, [entry, open, panelStyle]);

  if (!entry) {
    return null;
  }

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1 text-xs',
          'text-white/55 hover:text-white/85 hover:bg-white/[0.05] transition-colors',
        )}
        aria-label={`Help for ${entry.title}`}
      >
        <CircleHelp className="h-3.5 w-3.5" />
        Help
      </button>

      {open ? createPortal(helpPanel, document.body) : null}
    </div>
  );
}
