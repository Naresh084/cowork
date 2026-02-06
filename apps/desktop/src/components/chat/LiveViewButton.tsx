import { Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface LiveViewButtonProps {
  onClick: () => void;
}

/**
 * Floating button that appears when computer_use tool is running.
 * Clicking it opens the split-screen Live Browser View.
 *
 * Position: Bottom-right of chat area, above the InputArea
 * Animation: Slides in from right with spring physics, pulsing blue glow
 */
export function LiveViewButton({ onClick }: LiveViewButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 20, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      className={cn(
        // Positioning: absolute in bottom-right, above InputArea (which is ~80px tall)
        'absolute bottom-24 right-6 z-20',
        // Layout
        'flex items-center gap-2 px-4 py-2.5',
        // Colors: Dark background with blue border glow
        'bg-[#101421] border border-[#1D4ED8]/40',
        // Shape
        'rounded-xl',
        // Text color
        'text-[#93C5FD]',
        // Shadow for depth
        'shadow-lg shadow-[#1D4ED8]/20',
        // Hover state
        'hover:bg-[#1A1F2E] hover:border-[#1D4ED8]/60 hover:scale-[1.02]',
        // Transitions
        'transition-all duration-200',
        // Pulsing glow animation (defined in globals.css)
        'animate-pulse-glow-blue'
      )}
    >
      {/* Eye icon */}
      <Eye className="w-4 h-4" />

      {/* Label */}
      <span className="text-sm font-medium">Live View</span>

      {/* Pulsing indicator dot */}
      <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
    </motion.button>
  );
}
