import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { BrandMark } from '../icons/BrandMark';

interface StreamingMessageProps {
  content: string;
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#111218] border border-white/[0.08] flex items-center justify-center">
        <BrandMark className="w-3.5 h-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 select-none">
        <div
          className={cn(
            'w-fit max-w-full rounded-xl px-3 py-2',
            'bg-transparent border border-transparent'
          )}
        >
          {/* Text content */}
          {content && (
            <div className="w-fit max-w-full">
              <pre className="whitespace-pre-wrap font-sans text-[13px] text-white/80 w-fit max-w-full select-text">
                {content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
