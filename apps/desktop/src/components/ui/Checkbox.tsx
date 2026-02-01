import { forwardRef, type InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  indeterminate?: boolean;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, indeterminate, error, className, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-start gap-3 cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-4 h-4 rounded border-2 transition-all',
              'bg-gray-800/50 border-gray-600',
              'peer-checked:bg-blue-600 peer-checked:border-blue-600',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-gray-900',
              'peer-disabled:opacity-50',
              error && 'border-red-500',
              indeterminate && 'bg-blue-600 border-blue-600'
            )}
          >
            {indeterminate ? (
              <Minus size={12} className="text-white absolute inset-0 m-auto" />
            ) : (
              <Check
                size={12}
                className={cn(
                  'text-white absolute inset-0 m-auto',
                  'opacity-0 scale-50 transition-all',
                  'peer-checked:opacity-100 peer-checked:scale-100'
                )}
                style={{
                  opacity: props.checked ? 1 : 0,
                  transform: props.checked ? 'scale(1)' : 'scale(0.5)',
                }}
              />
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="text-sm font-medium text-gray-200">{label}</span>
            )}
            {description && (
              <span className="text-xs text-gray-500">{description}</span>
            )}
            {error && <span className="text-xs text-red-400 mt-0.5">{error}</span>}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
