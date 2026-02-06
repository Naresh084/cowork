import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  items?: ContextMenuItem[];
  onSelect?: () => void;
}

export interface ContextMenuSection {
  label?: string;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  children: ReactNode;
  sections: ContextMenuSection[];
  className?: string;
  disabled?: boolean;
}

export function ContextMenu({
  children,
  sections,
  className,
  disabled = false,
}: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (disabled) return;

      e.preventDefault();
      e.stopPropagation();

      const x = e.clientX;
      const y = e.clientY;

      // Position will be adjusted after menu renders
      setPosition({ x, y });
      setIsOpen(true);
    },
    [disabled]
  );

  useEffect(() => {
    if (isOpen && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8;

      let { x, y } = position;

      // Adjust if menu goes off screen
      if (x + menuRect.width > viewportWidth - padding) {
        x = viewportWidth - menuRect.width - padding;
      }
      if (y + menuRect.height > viewportHeight - padding) {
        y = viewportHeight - menuRect.height - padding;
      }
      if (x < padding) x = padding;
      if (y < padding) y = padding;

      if (x !== position.x || y !== position.y) {
        setPosition({ x, y });
      }
    }
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', () => setIsOpen(false), true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', () => setIsOpen(false), true);
    };
  }, [isOpen]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.items) return;
    item.onSelect?.();
    setIsOpen(false);
  };

  return (
    <>
      <div onContextMenu={handleContextMenu} className={className}>
        {children}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              'fixed z-50 min-w-[180px] py-1',
              'bg-[#0D0D0F] border border-white/[0.08] rounded-lg shadow-xl',
              'animate-in fade-in-0 zoom-in-95 duration-100'
            )}
            style={{ top: position.y, left: position.x }}
          >
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {sectionIndex > 0 && (
                  <div className="my-1 h-px bg-white/[0.06]" />
                )}
                {section.label && (
                  <div className="px-3 py-1.5 text-xs font-medium text-white/50">
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseEnter={() => item.items && setActiveSubmenu(item.id)}
                    onMouseLeave={() => setActiveSubmenu(null)}
                  >
                    <button
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-sm',
                        'transition-colors',
                        item.disabled
                          ? 'text-white/50 cursor-not-allowed'
                          : item.danger
                          ? 'text-red-400 hover:bg-red-500/10'
                          : 'text-white/90 hover:bg-white/[0.06]',
                        item.checked && 'bg-white/[0.04]'
                      )}
                    >
                      {item.checked !== undefined && (
                        <span className="w-4">
                          {item.checked && <Check size={14} className="text-[#93C5FD]" />}
                        </span>
                      )}
                      {item.icon && (
                        <span className="flex-shrink-0 text-white/70">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-auto text-xs text-white/50">
                          {item.shortcut}
                        </span>
                      )}
                      {item.items && (
                        <ChevronRight size={14} className="text-white/50" />
                      )}
                    </button>

                    {/* Submenu */}
                    {item.items && activeSubmenu === item.id && (
                      <div
                        className={cn(
                          'absolute top-0 left-full ml-1 min-w-[160px] py-1',
                          'bg-[#0D0D0F] border border-white/[0.08] rounded-lg shadow-xl',
                          'animate-in fade-in-0 slide-in-from-left-2 duration-100'
                        )}
                      >
                        {item.items.map((subItem) => (
                          <button
                            key={subItem.id}
                            role="menuitem"
                            disabled={subItem.disabled}
                            onClick={() => handleItemClick(subItem)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-1.5 text-sm',
                              'transition-colors',
                              subItem.disabled
                                ? 'text-white/50 cursor-not-allowed'
                                : subItem.danger
                                ? 'text-red-400 hover:bg-red-500/10'
                                : 'text-white/90 hover:bg-white/[0.06]'
                            )}
                          >
                            {subItem.icon && (
                              <span className="text-white/70">{subItem.icon}</span>
                            )}
                            <span className="flex-1 text-left">{subItem.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
