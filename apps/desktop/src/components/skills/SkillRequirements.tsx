import { Check, X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillRequirements as SkillRequirementsType, SkillEligibility, InstallOption } from '@gemini-cowork/shared';
import { toast } from '../ui/Toast';

interface SkillRequirementsProps {
  requirements?: SkillRequirementsType;
  eligibility?: SkillEligibility;
  installOptions?: InstallOption[];
}

export function SkillRequirements({
  requirements,
  eligibility,
  installOptions,
}: SkillRequirementsProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const hasRequirements =
    requirements?.bins?.length ||
    requirements?.anyBins?.length ||
    requirements?.env?.length ||
    requirements?.os?.length;

  if (!hasRequirements) {
    return (
      <div className="text-sm text-zinc-500">
        <Check className="w-4 h-4 inline mr-2 text-green-500" />
        No special requirements
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Binary Requirements */}
      {requirements?.bins && requirements.bins.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-2">Required Binaries</h4>
          <ul className="space-y-1">
            {requirements.bins.map((bin) => {
              const found = eligibility?.foundBins?.[bin];
              const isMissing = eligibility?.missingBins.includes(bin);

              return (
                <li
                  key={bin}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isMissing ? 'text-red-400' : 'text-green-400'
                  )}
                >
                  {isMissing ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
                    {bin}
                  </code>
                  {found && (
                    <span className="text-xs text-zinc-500 truncate">
                      ({found})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Environment Variables */}
      {requirements?.env && requirements.env.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-2">
            Environment Variables
          </h4>
          <ul className="space-y-1">
            {requirements.env.map((envVar) => {
              const isMissing = eligibility?.missingEnvVars.includes(envVar);

              return (
                <li
                  key={envVar}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isMissing ? 'text-red-400' : 'text-green-400'
                  )}
                >
                  {isMissing ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
                    {envVar}
                  </code>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Platform Requirements */}
      {requirements?.os && requirements.os.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-2">
            Supported Platforms
          </h4>
          <div className="flex gap-2">
            {requirements.os.map((os) => (
              <span
                key={os}
                className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  eligibility?.platformMismatch
                    ? 'bg-red-950/50 text-red-400'
                    : 'bg-zinc-800 text-zinc-300'
                )}
              >
                {os === 'darwin' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux'}
              </span>
            ))}
          </div>
          {eligibility?.platformMismatch && (
            <p className="text-xs text-red-400 mt-1">
              Your platform is not supported
            </p>
          )}
        </div>
      )}

      {/* Install Options */}
      {installOptions && installOptions.length > 0 && eligibility?.installHints && eligibility.installHints.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-2">
            Installation Options
          </h4>
          <div className="space-y-2">
            {eligibility.installHints.map((hint, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2"
              >
                <code className="text-xs text-zinc-300">{hint}</code>
                <button
                  onClick={() => copyToClipboard(hint)}
                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
