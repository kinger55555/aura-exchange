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