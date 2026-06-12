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
      {
        id: "1.2",
        title: "Aura Exploitation & Unauthorized Transfers",
        children: [
          {
            id: "1.2.1",
            title: "Automated Collection & Botting",
            body: `The use of scripts, bots, macros, browser extensions, or any automated tool to generate, collect, or transfer Aura is strictly prohibited. This includes automated rank grinding and unattended gameplay loops.

Punishment: Permanent ban of all detected accounts. Confiscation of all Aura, titles, and ranks.`,
          },
          {
            id: "1.2.2",
            title: "Coordinated Self-Dealing & Muling",
            body: `Creating or controlling accounts whose primary purpose is to funnel Aura, titles, or rank progress to another account is a crime against the collective. This includes using friends or alt networks as conduits.

Punishment: Permanent ban of all accounts involved. Reversal of all transferred Aura and items.`,
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Conduct & Decency",
    children: [
      {
        id: "2.1",
        title: "Harassment & Disruption",
        children: [
          {
            id: "2.1.1",
            title: "Targeted Abuse & Threats",
            body: `Repeated hostile messages, threats of real-world harm, doxxing, or sustained targeted harassment of any comrade is forbidden. The State protects the collective peace.

Punishment: 7-day silence on first offense. 30-day silence on second. Permanent ban on third. Severe cases result in immediate permanent ban.`,
          },
          {
            id: "2.1.2",
            title: "Hate Speech & Extremism",
            body: `Any promotion of hate speech, discrimination, or extremist ideology against protected groups is a betrayal of collective unity.

Punishment: Immediate permanent ban. No appeal.`,
          },
        ],
      },
      {
        id: "2.2",
        title: "Impersonation & Fraud",
        children: [
          {
            id: "2.2.1",
            title: "False Representation of Authority",
            body: `Impersonating staff, moderators, or the Owner—whether by nickname, title, badge, or direct claim—is classified as counter-revolutionary sabotage.

Punishment: Immediate permanent ban. Confiscation of all fraudulently obtained goods.`,
          },
          {
            id: "2.2.2",
            title: "Scamming & Deceptive Trades",
            body: `Deceiving comrades through false promises, chargebacks, or misrepresentation in any exchange involving Aura, titles, or tickets is strictly prohibited.

Punishment: Full reversal of trades where possible. 30-day ban on first offense. Permanent ban on repeat offenses.`,
          },
        ],
      },
    ],
  },
  {
    id: "3",
    title: "Game Integrity",
    children: [
      {
        id: "3.1",
        title: "Exploits & Bugs",
        children: [
          {
            id: "3.1.1",
            title: "Intentional Abuse of Glitches",
            body: `Knowingly using a bug, glitch, or unintended mechanic to gain Aura, titles, ranks, or any advantage is theft from the collective. Reporting bugs through proper channels is rewarded; exploiting them is punished.

Punishment: Rollback of all ill-gotten gains. 14-day ban on first offense. Permanent ban on second.`,
          },
        ],
      },
      {
        id: "3.2",
        title: "External Commerce",
        children: [
          {
            id: "3.2.1",
            title: "Real-Money Trading (RMT)",
            body: `Selling, buying, or trading Aura, accounts, titles, or any in-game asset for real-world currency, crypto, or goods on external platforms is prohibited. The State economy is closed.

Punishment: Permanent ban of buyer and seller. Blacklist of associated payment accounts where traceable.`,
          },
        ],
      },
    ],
  },
  {
    id: "4",
    title: "Enforcement & Appeals",
    children: [
      {
        id: "4.1",
        title: "Judicial Process",
        children: [
          {
            id: "4.1.1",
            title: "Right of Appeal",
            body: `Comrades may appeal bans and punishments through the Justice system once per incident. Appeals must include evidence. Frivolous or repeat appeals without new evidence will be denied and may extend the silence period.

Note: Appeals for permanent bans involving multi-accounting, RMT, or hate speech are rarely overturned. The State remembers.`,
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
