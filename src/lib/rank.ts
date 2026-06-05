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
  return titlePosition === "suffix" ? `${nick} ${titleText.trim()}` : `${titleText}${nick}`;
}

export const TIER_ORDER = ["Common", "Rare", "Epic", "Legendary", "Godlike"] as const;
export type TitleTier = typeof TIER_ORDER[number];

export function tierTone(tier: string): string {
  switch (tier) {
    case "Rare": return "text-blue-400";
    case "Epic": return "text-purple-400";
    case "Legendary": return "text-secondary";
    case "Godlike": return "text-destructive font-bold";
    default: return "text-muted-foreground";
  }
}