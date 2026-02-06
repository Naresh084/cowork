import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, ArrowRight, Loader2, ExternalLink, AlertCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { BrandMark } from '../icons/BrandMark';

export function Onboarding() {
  const [userName, setUserName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { setApiKey: saveApiKey, validateApiKey, isAuthenticated } = useAuthStore();
  const { updateSetting, userName: existingUserName } = useSettingsStore();

  // Check if we only need to collect name (API key already exists)
  const needsOnlyName = isAuthenticated && !existingUserName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidating) return;

    // Validate name
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    // If we only need name, save and return
    if (needsOnlyName) {
      updateSetting('userName', userName.trim());
      return;
    }

    // Validate API key
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setError(null);
    setIsValidating(true);

    try {
      if (!apiKey.startsWith('AI') || apiKey.length < 30) {
        setError('Invalid API key format. Should start with "AI" and be at least 30 characters.');
        setIsValidating(false);
        return;
      }

      const isValid = await validateApiKey(apiKey).catch(() => false);
      if (!isValid) {
        setError('Invalid API key. Please check and try again.');
        setIsValidating(false);
        return;
      }

      // Save both name and API key
      updateSetting('userName', userName.trim());
      await saveApiKey(apiKey);

      const { fetchModels } = useSettingsStore.getState();
      fetchModels(apiKey).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsValidating(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0B0C10] relative overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1D4ED8]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#8A62C2]/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#008585]/5 rounded-full blur-[150px]" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
            `,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      {/* Main Content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Glass Card */}
        <motion.div
          variants={itemVariants}
          className={cn(
            'rounded-3xl overflow-hidden',
            'bg-white/[0.03] backdrop-blur-xl',
            'border border-white/[0.08]',
            'shadow-2xl shadow-black/40'
          )}
        >
          {/* Header Section */}
          <div className="px-8 pt-10 pb-6 text-center relative">
            {/* Decorative gradient line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#1D4ED8] to-transparent" />

            {/* Icon */}
            <motion.div
              variants={itemVariants}
              className="relative mx-auto mb-6"
            >
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <BrandMark className="w-16 h-16" />
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              variants={itemVariants}
              className="text-3xl font-bold mb-3"
              style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #DBEAFE 50%, #1D4ED8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Welcome to Cowork
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-white/50 text-sm"
            >
              {needsOnlyName
                ? "Let's personalize your experience"
                : "Set up your workspace in seconds"
              }
            </motion.p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            {/* Name Input */}
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Your Name
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-white/30" />
                </div>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className={cn(
                    'w-full pl-12 pr-4 py-3.5 rounded-xl',
                    'bg-[#0D0D0F] border border-white/[0.08]',
                    'text-white placeholder:text-white/30',
                    'focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50 focus:border-[#1D4ED8]',
                    'transition-all duration-200',
                    error && !userName.trim() && 'border-[#FF5449] focus:ring-[#FF5449]/50'
                  )}
                />
              </div>
            </motion.div>

            {/* API Key Input (only show if needed) */}
            {!needsOnlyName && (
              <motion.div variants={itemVariants}>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  API Key
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <KeyRound className="w-5 h-5 text-white/30" />
                  </div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                    className={cn(
                      'w-full pl-12 pr-4 py-3.5 rounded-xl',
                      'bg-[#0D0D0F] border border-white/[0.08]',
                      'text-white placeholder:text-white/30',
                      'focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50 focus:border-[#1D4ED8]',
                      'transition-all duration-200',
                      error && !apiKey.trim() && 'border-[#FF5449] focus:ring-[#FF5449]/50'
                    )}
                  />
                </div>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[#FF5449] text-sm bg-[#FF5449]/10 px-4 py-2.5 rounded-lg border border-[#FF5449]/20"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isValidating}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl',
                'bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8]',
                'text-white font-semibold',
                'shadow-lg shadow-[#1D4ED8]/25',
                'hover:shadow-xl hover:shadow-[#1D4ED8]/35',
                'hover:from-[#1D4ED8] hover:to-[#93C5FD]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-300'
              )}
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>

            {/* Help Link */}
            {!needsOnlyName && (
              <motion.div variants={itemVariants} className="text-center pt-2">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#1D4ED8] hover:text-[#93C5FD] transition-colors"
                >
                  Get your API key from Google AI Studio
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </motion.div>
            )}
          </form>

          {/* Security Note */}
          <motion.div
            variants={itemVariants}
            className="px-8 pb-8"
          >
            <div className={cn(
              'p-4 rounded-xl',
              'bg-white/[0.02] border border-white/[0.06]'
            )}>
              <p className="text-xs text-white/40 text-center leading-relaxed">
                {needsOnlyName
                  ? "Your name is stored locally and helps personalize your experience."
                  : "Your API key is stored securely in your system's local credentials storage and never sent anywhere except to Google's API."
                }
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Version/Brand Footer */}
        <motion.div
          variants={itemVariants}
          className="text-center mt-6"
        >
          <p className="text-white/20 text-xs">
            Cowork v1.0
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
