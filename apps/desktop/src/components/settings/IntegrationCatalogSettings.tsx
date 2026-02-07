import { DiscordSettings } from './DiscordSettings';
import { IMessageSettings } from './IMessageSettings';
import { LineSettings } from './LineSettings';
import { MatrixSettings } from './MatrixSettings';
import { SlackSettings } from './SlackSettings';
import { TeamsSettings } from './TeamsSettings';
import { TelegramSettings } from './TelegramSettings';
import { WhatsAppSettings } from './WhatsAppSettings';

export function IntegrationCatalogSettings() {
  return (
    <div className="space-y-3">
      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">WhatsApp</summary>
        <div className="px-4 pb-4 pt-1"><WhatsAppSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Slack</summary>
        <div className="px-4 pb-4 pt-1"><SlackSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Telegram</summary>
        <div className="px-4 pb-4 pt-1"><TelegramSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Discord</summary>
        <div className="px-4 pb-4 pt-1"><DiscordSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">iMessage (BlueBubbles)</summary>
        <div className="px-4 pb-4 pt-1"><IMessageSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Microsoft Teams</summary>
        <div className="px-4 pb-4 pt-1"><TeamsSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Matrix</summary>
        <div className="px-4 pb-4 pt-1"><MatrixSettings /></div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">LINE</summary>
        <div className="px-4 pb-4 pt-1"><LineSettings /></div>
      </details>
    </div>
  );
}

