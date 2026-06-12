import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileNav } from "@/components/MobileNav";
import { ArrowLeft, BookOpen } from "lucide-react";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [{ title: "Rules of Accord — Absolute Communism" }],
  }),
  component: RulesPage,
});

const rules = [
  {
    id: "1",
    title: "General Provisions",
    children: [
      {
        id: "1.1",
        title: "Multi-Accounting & Smurfing",
        children: [
          {
            id: "1.1.1",
            title: "State Decree No. 47 — Amnesty Program",
            body: `Smurf accounts gifting Aura to themselves have been detected by AuraGuard. Every comrade must now confirm their true account and list any secondary accounts.

• Listed secondaries will be permanently banned at the reset.
• Your main account receives one free Suitcase per declared alt.
• If AuraGuard catches you smurfing after the reset, both accounts are permanently banned.
• If you swear before the State that this is your only account and AuraGuard proves otherwise, both accounts will be permanently banned.`,
          },
        ],
      },
    ],
  },
];

function RulesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <MobileNav />

      <div className="max-w-2xl mx-auto px-4 pt-16 pb-24">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <BookOpen className="size-6 text-primary" />
          <h1 className="font-display text-3xl uppercase text-foreground">
            Rules of Accord
          </h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8 border-l-2 border-primary/40 pl-3">
          The laws that bind the collective. Ignorance is not absolution.
        </p>

        <div className="space-y-8">
          {rules.map((section) => (
            <section key={section.id}>
              <h2 className="font-display text-xl uppercase text-primary mb-4 tracking-wide">
                {section.id}. {section.title}
              </h2>
              <div className="space-y-6">
                {section.children?.map((sub) => (
                  <div key={sub.id}>
                    <h3 className="font-display text-sm uppercase text-secondary-foreground bg-secondary inline-block px-2 mb-3">
                      {sub.id} {sub.title}
                    </h3>
                    <div className="space-y-4">
                      {sub.children?.map((rule) => (
                        <div
                          key={rule.id}
                          className="border-2 border-primary/20 bg-card p-4 shadow-[3px_3px_0_0_var(--primary)]/10"
                        >
                          <h4 className="font-display text-sm uppercase text-foreground mb-2 tracking-wider">
                            {rule.id} {rule.title}
                          </h4>
                          <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                            {rule.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t-2 border-dashed border-primary/20 pt-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Long live the State
          </p>
        </div>
      </div>
    </main>
  );
}
