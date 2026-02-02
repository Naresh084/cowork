import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value?: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  error?: string;
}

export function Select({
  value,
  onChange,
  options = [],
  groups,
  placeholder = 'Select an option',
  disabled = false,
  searchable = false,
  className,
  error,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Flatten options for keyboard navigation
  const allOptions = groups
    ? groups.flatMap((g) => g.options)
    : options;

  const filteredOptions = searchable && search
    ? allOptions.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : allOptions;

  const selectedOption = allOptions.find((opt) => opt.value === value);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const padding = 4;

    setPosition({
      top: triggerRect.bottom + padding,
      left: triggerRect.left,
      width: triggerRect.width,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      if (searchable) {
        setTimeout(() => searchRef.current?.focus(), 0);
      }

      const handleClickOutside = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
          setSearch('');
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', calculatePosition, true);
      window.addEventListener('resize', calculatePosition);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', calculatePosition, true);
        window.removeEventListener('resize', calculatePosition);
      };
    }
  }, [isOpen, calculatePosition, searchable]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          setIsOpen(false);
          setSearch('');
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            Math.min(prev + 1, filteredOptions.length - 1)
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const option = filteredOptions[highlightedIndex];
          if (option && !option.disabled) {
            onChange(option.value);
            setIsOpen(false);
            setSearch('');
          }
          break;
        }
      }
    },
    [isOpen, filteredOptions, highlightedIndex, onChange]
  );

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    setSearch('');
  };

  const renderOptions = (opts: SelectOption[]) =>
    opts.map((option) => {
      const globalIndex = filteredOptions.indexOf(option);
      return (
        <button
          key={option.value}
          role="option"
          aria-selected={option.value === value}
          onClick={() => handleSelect(option)}
          onMouseEnter={() => setHighlightedIndex(globalIndex)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm',
            'transition-colors',
            option.disabled
              ? 'text-white/30 cursor-not-allowed'
              : 'text-white/90',
            globalIndex === highlightedIndex && !option.disabled && 'bg-white/[0.06]',
            option.value === value && 'bg-[#6B6EF0]/20'
          )}
        >
          {option.icon && (
            <span className="flex-shrink-0 text-white/50">{option.icon}</span>
          )}
          <div className="flex-1 text-left">
            <div>{option.label}</div>
            {option.description && (
              <div className="text-xs text-white/50">{option.description}</div>
            )}
          </div>
          {option.value === value && (
            <Check size={14} className="flex-shrink-0 text-[#8B8EFF]" />
          )}
        </button>
      );
    });

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-[#1A1A1E] border border-white/[0.08]',
          'text-sm text-left',
          'focus:outline-none focus:ring-2 focus:ring-[#6B6EF0]/50 focus:border-[#6B6EF0]',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed bg-white/[0.04]',
          error && 'border-red-500 focus:ring-red-500/50 focus:border-red-500'
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {selectedOption ? (
          <>
            {selectedOption.icon && (
              <span className="text-white/50">{selectedOption.icon}</span>
            )}
            <span className="flex-1 text-white/90">{selectedOption.label}</span>
          </>
        ) : (
          <span className="flex-1 text-white/50">{placeholder}</span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            'text-white/50 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={cn(
              'fixed z-50 py-1 max-h-64 overflow-auto',
              'bg-[#0D0D0F] border border-white/[0.08] rounded-lg shadow-xl',
              'animate-in fade-in-0 zoom-in-95 duration-150'
            )}
            style={{
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            onKeyDown={handleKeyDown}
          >
            {searchable && (
              <div className="px-2 py-2 border-b border-white/[0.06]">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder="Search..."
                    className={cn(
                      'w-full pl-8 pr-3 py-1.5 text-sm',
                      'bg-[#1A1A1E] border border-white/[0.08] rounded',
                      'text-white/90 placeholder-white/30',
                      'focus:outline-none focus:border-[#6B6EF0]'
                    )}
                  />
                </div>
              </div>
            )}

            {groups ? (
              groups.map((group, groupIndex) => {
                const groupOptions = searchable && search
                  ? group.options.filter((opt) =>
                      opt.label.toLowerCase().includes(search.toLowerCase())
                    )
                  : group.options;

                if (groupOptions.length === 0) return null;

                return (
                  <div key={groupIndex}>
                    {groupIndex > 0 && (
                      <div className="my-1 h-px bg-white/[0.06]" />
                    )}
                    <div className="px-3 py-1.5 text-xs font-medium text-white/50">
                      {group.label}
                    </div>
                    {renderOptions(groupOptions)}
                  </div>
                );
              })
            ) : (
              renderOptions(filteredOptions)
            )}

            {filteredOptions.length === 0 && (
              <div className="px-3 py-6 text-sm text-white/50 text-center">
                No options found
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
