export function getRank(balance: number): { title: string; tone: string } {
  if (balance < 0) return { title: "Absolute Loser", tone: "text-destructive" };
  if (balance < 100) return { title: "Peasant", tone: "text-muted-foreground" };
  if (balance < 500) return { title: "Comrade", tone: "text-primary" };
  if (balance < 1000) return { title: "Commissar", tone: "text-secondary-foreground" };
  return { title: "Stalin", tone: "text-primary font-bold" };
}

export function formatAura(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatDisplayName(
  nickname: string | null | undefined,
  titleText?: string | null,
  titlePosition?: "prefix" | "suffix" | null,
): string {
  const nick = nickname ?? "";
  if (!titleText) return nick;
  const t = `[${titleText.trim()}]`;
  return titlePosition === "suffix" ? `${nick} ${t}` : `${t} ${nick}`;
}

export const TIER_ORDER = ["Common", "Rare", "Epic", "Legendary", "Godlike"] as const;
export type TitleTier = typeof TIER_ORDER[number];

export function tierTone(tier: string): string {
  switch (tier) {
    case "Common": return "text-stone-400";
    case "Rare": return "text-blue-400";
    case "Epic": return "text-purple-400";
    case "Legendary": return "text-secondary";
    case "Godlike": return "text-destructive font-bold";
    default: return "text-muted-foreground";
  }
}

/**
 * Returns the className for a title, accounting for the "Exclusive" rarity
 * whose color depends on the specific title (glitch → violet, OG → red-gold).
 */
export function titleTone(t: { tier?: string | null; is_glitch?: boolean | null; text?: string | null } | null | undefined): string {
  if (!t) return "";
  if (t.tier === "Exclusive") {
    if (t.is_glitch) return "text-violet-400 font-bold drop-shadow-[0_0_6px_rgba(167,139,250,0.6)]";
    // O.G — antique gold leaning into red, with a subtle pulsing glow
    return "animate-og-shimmer font-bold";
  }
  return tierTone(t.tier ?? "");
}