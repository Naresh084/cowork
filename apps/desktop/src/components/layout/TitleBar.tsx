import { cn } from '@/lib/utils';

export function TitleBar() {
  return (
    <div
      className={cn(
        'h-8 flex items-center',
        'bg-[#0D0D0F]',
        'window-drag'
      )}
    >
      {/* Traffic lights space */}
      <div className="w-20" />
    </div>
  );
}
