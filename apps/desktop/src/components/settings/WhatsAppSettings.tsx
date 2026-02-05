import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';

export function WhatsAppSettings() {
  const platform = useIntegrationStore((s) => s.platforms.whatsapp);
  const whatsappQR = useIntegrationStore((s) => s.whatsappQR);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.whatsapp);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;

  const handleConnect = async () => {
    await connect('whatsapp');
  };

  const handleDisconnect = async () => {
    await disconnect('whatsapp');
  };

  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
            <div className="mt-2">
              <PlatformStatusBadge
                platform="whatsapp"
                connected={connected}
                displayName={displayName}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-[#FF5449]">{error}</p>
            )}
          </div>
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-lg text-sm bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#25D366' }}
              onMouseEnter={(e) => {
                if (!isConnecting) e.currentTarget.style.backgroundColor = '#1EB954';
              }}
              onMouseLeave={(e) => {
                if (!isConnecting) e.currentTarget.style.backgroundColor = '#25D366';
              }}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Connect'
              )}
            </button>
          )}
        </div>
      </div>

      {/* QR Code Section */}
      {!connected && whatsappQR && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
        >
          <h3 className="text-sm font-medium text-white/90 mb-3">Scan QR Code</h3>
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl">
              <img
                src={whatsappQR}
                alt="WhatsApp QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-white/40 text-center">
            Open WhatsApp on your phone and scan this QR code to connect.
          </p>
        </motion.div>
      )}

      {/* Setup Guide */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-medium text-white/90">How to connect</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/40 transition-transform',
              showGuide && 'rotate-180'
            )}
          />
        </button>
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <Step number={1} text="Click the Connect button above to generate a QR code." />
                <Step number={2} text="Open WhatsApp on your phone." />
                <Step number={3} text='Go to Settings > Linked Devices > Link a Device.' />
                <Step number={4} text="Point your phone camera at the QR code shown above." />
                <Step number={5} text="Wait for the connection to be established. Your messages will appear in the app." />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-[#25D366]/20 text-[#25D366] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
