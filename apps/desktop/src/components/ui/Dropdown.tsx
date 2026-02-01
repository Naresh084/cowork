import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  items?: DropdownItem[]; // Submenu
  onSelect?: () => void;
}

export interface DropdownSection {
  label?: string;
  items: DropdownItem[];
}

interface DropdownProps {
  trigger: ReactNode;
  sections: DropdownSection[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  triggerClassName?: string;
}

export function Dropdown({
  trigger,
  sections,
  align = 'start',
  side = 'bottom',
  className,
  triggerClassName,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const padding = 8;

    let top = side === 'bottom'
      ? triggerRect.bottom + padding
      : triggerRect.top - menuRect.height - padding;

    let left = triggerRect.left;
    if (align === 'center') {
      left = triggerRect.left + (triggerRect.width - menuRect.width) / 2;
    } else if (align === 'end') {
      left = triggerRect.right - menuRect.width;
    }

    // Keep within viewport
    if (left < padding) left = padding;
    if (left + menuRect.width > window.innerWidth - padding) {
      left = window.innerWidth - menuRect.width - padding;
    }
    if (top + menuRect.height > window.innerHeight - padding) {
      top = triggerRect.top - menuRect.height - padding;
    }
    if (top < padding) {
      top = triggerRect.bottom + padding;
    }

    setPosition({ top, left });
  }, [align, side]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleClickOutside = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, calculatePosition]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }, []);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled || item.items) return;
    item.onSelect?.();
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn('inline-flex items-center', triggerClassName)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {trigger}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              'fixed z-50 min-w-[180px] py-1',
              'bg-gray-900 border border-gray-700 rounded-lg shadow-xl',
              'animate-in fade-in-0 zoom-in-95 duration-150',
              className
            )}
            style={{ top: position.top, left: position.left }}
            onKeyDown={handleKeyDown}
          >
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {sectionIndex > 0 && (
                  <div className="my-1 h-px bg-gray-700/50" />
                )}
                {section.label && (
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500">
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
                        'w-full flex items-center gap-2 px-3 py-2 text-sm',
                        'transition-colors',
                        item.disabled
                          ? 'text-gray-600 cursor-not-allowed'
                          : item.danger
                          ? 'text-red-400 hover:bg-red-500/10'
                          : 'text-gray-200 hover:bg-gray-700/50',
                        item.checked && 'bg-gray-700/30'
                      )}
                    >
                      {item.checked !== undefined && (
                        <span className="w-4">
                          {item.checked && <Check size={14} />}
                        </span>
                      )}
                      {item.icon && (
                        <span className="flex-shrink-0 text-gray-400">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-auto text-xs text-gray-500">
                          {item.shortcut}
                        </span>
                      )}
                      {item.items && (
                        <ChevronRight size={14} className="text-gray-500" />
                      )}
                    </button>

                    {/* Submenu */}
                    {item.items && activeSubmenu === item.id && (
                      <div
                        className={cn(
                          'absolute top-0 left-full ml-1 min-w-[160px] py-1',
                          'bg-gray-900 border border-gray-700 rounded-lg shadow-xl',
                          'animate-in fade-in-0 slide-in-from-left-2 duration-150'
                        )}
                      >
                        {item.items.map((subItem) => (
                          <button
                            key={subItem.id}
                            role="menuitem"
                            disabled={subItem.disabled}
                            onClick={() => handleItemClick(subItem)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 text-sm',
                              'transition-colors',
                              subItem.disabled
                                ? 'text-gray-600 cursor-not-allowed'
                                : subItem.danger
                                ? 'text-red-400 hover:bg-red-500/10'
                                : 'text-gray-200 hover:bg-gray-700/50'
                            )}
                          >
                            {subItem.icon && (
                              <span className="text-gray-400">{subItem.icon}</span>
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
