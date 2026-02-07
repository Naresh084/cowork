import { BookOpenText, Compass, GraduationCap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import {
  HELP_ARTICLES,
  HELP_ARTICLE_BY_ID,
  GUIDED_TOURS,
} from '@/content/help/platform-help-content';
import { useHelpStore } from '@/stores/help-store';
import { CapabilityMatrix } from './CapabilityMatrix';

export function HelpCenterModal() {
  const {
    isHelpOpen,
    closeHelp,
    activeArticleId,
    openHelp,
    startTour,
    completedTours,
  } = useHelpStore();

  const article = HELP_ARTICLE_BY_ID[activeArticleId] || HELP_ARTICLE_BY_ID['platform-overview'];

  return (
    <Dialog open={isHelpOpen} onClose={closeHelp} className="max-w-5xl">
      <DialogHeader className="border-b border-white/[0.06] pb-3">
        <div className="flex items-start justify-between gap-4 pr-10">
          <div>
            <DialogTitle className="inline-flex items-center gap-2">
              <BookOpenText className="h-5 w-5 text-[#93C5FD]" />
              Help Center
            </DialogTitle>
            <p className="mt-1 text-sm text-white/50">
              Learn how Cowork works, build workflow automations, understand settings, and inspect current tool access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                startTour('workspace', true);
              }}
              className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white/90"
            >
              Start Workspace Tour
            </button>
            <button
              type="button"
              onClick={() => {
                startTour('onboarding', true);
              }}
              className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white/90"
            >
              Replay Onboarding Tour
            </button>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="grid max-h-[72vh] grid-cols-[240px_1fr] gap-4 overflow-hidden p-0">
        <aside className="overflow-y-auto border-r border-white/[0.06] p-3">
          <p className="px-2 text-[11px] uppercase tracking-wide text-white/45">Articles</p>
          <div className="mt-2 space-y-1">
            {HELP_ARTICLES.map((item) => {
              const isActive = item.id === article.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openHelp(item.id)}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-white/[0.09] text-white/90'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white/85',
                  )}
                >
                  <div className="text-sm font-medium">{item.title}</div>
                  <p className="mt-1 text-[11px] text-white/45">{item.summary}</p>
                </button>
              );
            })}
          </div>

          <p className="mt-4 px-2 text-[11px] uppercase tracking-wide text-white/45">Guided Tours</p>
          <div className="mt-2 space-y-1">
            {GUIDED_TOURS.map((tour) => (
              <button
                key={tour.id}
                type="button"
                onClick={() => startTour(tour.id, true)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-left hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white/85">{tour.title}</span>
                  {completedTours[tour.id] ? (
                    <span className="rounded bg-[#10B981]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#6EE7B7]">
                      Completed
                    </span>
                  ) : (
                    <span className="rounded bg-[#1D4ED8]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#93C5FD]">
                      Start
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-white/45">{tour.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="overflow-y-auto p-4 pr-5">
          <article className="space-y-3">
            <h3 className="text-lg font-semibold text-white/90">{article.title}</h3>
            <p className="text-sm text-white/55">{article.summary}</p>
            {article.sections.map((section) => (
              <div key={`${article.id}-${section.heading}`} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <h4 className="text-sm font-medium text-white/85">{section.heading}</h4>
                <p className="mt-1 text-xs leading-relaxed text-white/60">{section.body}</p>
                {section.bullets && section.bullets.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="text-xs text-white/55">
                        • {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </article>

          <div className="mt-4 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85">
              <Compass className="h-4 w-4 text-[#93C5FD]" />
              Live Capability Matrix
            </div>
            <CapabilityMatrix />
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85">
              <GraduationCap className="h-4 w-4 text-[#93C5FD]" />
              Next Steps
            </div>
            <p className="mt-1 text-xs text-white/55">
              Use settings-level Help buttons for detailed field explanations. Build flows from the Workflows view,
              monitor schedules from Automations, and replay tours anytime from here or from Settings and Sidebar.
            </p>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
