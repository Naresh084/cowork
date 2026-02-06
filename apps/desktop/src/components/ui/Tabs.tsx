import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type KeyboardEvent,
  useRef,
  useCallback,
} from 'react';
import { cn } from '../../lib/utils';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  const activeTab = value !== undefined ? value : internalValue;
  const setActiveTab = useCallback(
    (tab: string) => {
      if (value === undefined) {
        setInternalValue(tab);
      }
      onValueChange?.(tab);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn('flex flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export function TabsList({ children, className, variant = 'default' }: TabsListProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!tabsRef.current) return;

    const tabs = Array.from(
      tabsRef.current.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
    );
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);

    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== currentIndex && tabs[newIndex]) {
      tabs[newIndex].focus();
      tabs[newIndex].click();
    }
  }, []);

  const variantStyles = {
    default: 'bg-[#1A1A1E]/50 p-1 rounded-lg gap-1',
    pills: 'gap-2',
    underline: 'border-b border-white/[0.08] gap-4',
  };

  return (
    <div
      ref={tabsRef}
      role="tablist"
      className={cn('flex items-center', variantStyles[variant], className)}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
  variant?: 'default' | 'pills' | 'underline';
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled = false,
  icon,
  variant = 'default',
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  const variantStyles = {
    default: cn(
      'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
      isActive
        ? 'bg-[#1A1A1E] text-white/90 shadow-sm'
        : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
    ),
    pills: cn(
      'px-4 py-2 rounded-full text-sm font-medium transition-all',
      isActive
        ? 'bg-[#1D4ED8] text-white shadow-sm'
        : 'text-white/50 hover:text-white/70 bg-[#1A1A1E]/50 hover:bg-white/[0.06]'
    ),
    underline: cn(
      'px-1 py-3 text-sm font-medium transition-all relative',
      'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5',
      'after:transition-all',
      isActive
        ? 'text-white/90 after:bg-[#1D4ED8]'
        : 'text-white/50 hover:text-white/70 after:bg-transparent'
    ),
  };

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={cn(
        'inline-flex items-center gap-2',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/50',
        disabled && 'opacity-50 cursor-not-allowed',
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
  forceMount?: boolean;
}

export function TabsContent({
  value,
  children,
  className,
  forceMount = false,
}: TabsContentProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive && !forceMount) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!isActive}
      className={cn(
        'focus:outline-none',
        isActive && 'animate-in fade-in-0 duration-200',
        className
      )}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
