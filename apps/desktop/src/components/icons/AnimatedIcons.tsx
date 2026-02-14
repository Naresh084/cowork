// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '../../lib/utils';

interface AnimatedIconProps {
  size?: number;
  className?: string;
}

export function PulseIcon({ size = 16, className }: AnimatedIconProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <span className="relative flex h-full w-full">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
        <span className="relative inline-flex rounded-full h-full w-full bg-current" />
      </span>
    </span>
  );
}

export function SpinnerIcon({ size = 16, className }: AnimatedIconProps) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function TypingDotsIcon({ size = 24, className }: AnimatedIconProps) {
  const dotSize = Math.max(4, size / 6);
  return (
    <span
      className={cn('inline-flex items-center justify-center gap-1', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="rounded-full bg-current animate-bounce"
        style={{ width: dotSize, height: dotSize, animationDelay: '0ms' }}
      />
      <span
        className="rounded-full bg-current animate-bounce"
        style={{ width: dotSize, height: dotSize, animationDelay: '150ms' }}
      />
      <span
        className="rounded-full bg-current animate-bounce"
        style={{ width: dotSize, height: dotSize, animationDelay: '300ms' }}
      />
    </span>
  );
}

export function SuccessCheckIcon({ size = 16, className }: AnimatedIconProps) {
  return (
    <svg
      className={cn('text-green-500', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        className="stroke-current"
        strokeWidth="2"
        fill="none"
        style={{
          strokeDasharray: 63,
          strokeDashoffset: 0,
          animation: 'circle-draw 0.4s ease-out forwards',
        }}
      />
      <path
        d="M8 12l2.5 2.5L16 9"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          strokeDasharray: 20,
          strokeDashoffset: 0,
          animation: 'check-draw 0.3s 0.3s ease-out forwards',
        }}
      />
      <style>{`
        @keyframes circle-draw {
          from { stroke-dashoffset: 63; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}

export function ErrorCrossIcon({ size = 16, className }: AnimatedIconProps) {
  return (
    <svg
      className={cn('text-red-500', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        className="stroke-current"
        strokeWidth="2"
        fill="none"
        style={{
          strokeDasharray: 63,
          animation: 'error-circle 0.4s ease-out forwards',
        }}
      />
      <path
        d="M15 9l-6 6M9 9l6 6"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        style={{
          strokeDasharray: 20,
          animation: 'error-cross 0.3s 0.3s ease-out forwards',
        }}
      />
      <style>{`
        @keyframes error-circle {
          from { stroke-dashoffset: 63; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes error-cross {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}

export function WaveformIcon({ size = 24, className }: AnimatedIconProps) {
  const barCount = 5;
  const barWidth = size / 8;
  const gap = (size - barWidth * barCount) / (barCount + 1);

  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="bg-current animate-waveform"
          style={{
            width: barWidth,
            marginLeft: i === 0 ? 0 : gap,
            borderRadius: barWidth / 2,
            animationDelay: `${i * 100}ms`,
            height: '40%',
          }}
        />
      ))}
      <style>{`
        @keyframes waveform {
          0%, 100% { height: 20%; }
          50% { height: 80%; }
        }
        .animate-waveform {
          animation: waveform 1s ease-in-out infinite;
        }
      `}</style>
    </span>
  );
}

export function ProgressRingIcon({
  size = 24,
  progress = 0,
  className,
}: AnimatedIconProps & { progress?: number }) {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        className="text-gray-700"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="text-blue-500 transition-all duration-300"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function ThinkingIcon({ size = 24, className }: AnimatedIconProps) {
  return (
    <svg
      className={cn('text-blue-400', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Brain shape */}
      <path
        d="M12 4C8.5 4 6 6.5 6 9c0 1.5.5 2.5 1.5 3.5s1.5 2.5 1.5 4.5v1h6v-1c0-2 .5-3.5 1.5-4.5S18 10.5 18 9c0-2.5-2.5-5-6-5z"
        className="stroke-current"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M9 18h6v1a1 1 0 01-1 1h-4a1 1 0 01-1-1v-1z" className="fill-current opacity-50" />

      {/* Thinking sparkles */}
      <circle cx="4" cy="6" r="1" className="fill-current animate-pulse" style={{ animationDelay: '0ms' }} />
      <circle cx="20" cy="8" r="1" className="fill-current animate-pulse" style={{ animationDelay: '200ms' }} />
      <circle cx="6" cy="3" r="0.8" className="fill-current animate-pulse" style={{ animationDelay: '400ms' }} />
    </svg>
  );
}

interface StreamingTextIconProps extends AnimatedIconProps {
  lines?: number;
}

export function StreamingTextIcon({ size = 24, lines = 3, className }: StreamingTextIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <rect
          key={i}
          x="4"
          y={6 + i * 5}
          width={16 - (i === lines - 1 ? 6 : 0)}
          height="2"
          rx="1"
          className="fill-current"
          style={{
            animation: 'streaming-text 1.5s ease-in-out infinite',
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes streaming-text {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
