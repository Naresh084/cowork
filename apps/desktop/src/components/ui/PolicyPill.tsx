import { cn } from '../../lib/utils';

export type PolicyActionTone = 'allow' | 'ask' | 'deny' | 'review';

interface PolicyPillProps {
  action: PolicyActionTone;
  label?: string;
  className?: string;
}

const actionClasses: Record<PolicyActionTone, string> = {
  allow: 'border-[#50956A]/35 bg-[#50956A]/15 text-[#BBF7D0]',
  ask: 'border-[#1D4ED8]/35 bg-[#1D4ED8]/15 text-[#BFDBFE]',
  deny: 'border-[#FF5449]/35 bg-[#FF5449]/15 text-[#FCA5A5]',
  review: 'border-[#F5C400]/35 bg-[#F5C400]/15 text-[#FDE68A]',
};

const defaultLabels: Record<PolicyActionTone, string> = {
  allow: 'Allow',
  ask: 'Ask',
  deny: 'Deny',
  review: 'Review',
};

export function PolicyPill({
  action,
  label,
  className,
}: PolicyPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        actionClasses[action],
        className,
      )}
    >
      {label || defaultLabels[action]}
    </span>
  );
}
