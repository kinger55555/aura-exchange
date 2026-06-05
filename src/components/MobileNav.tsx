import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Trophy, ShieldAlert, LogOut, User, ShoppingBag, Menu, Gamepad2, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";

export function MobileNav() {
  const { user } = useAuth();
  const { location } = useRouterState();
  const [isStaff, setIsStaff] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("staff_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => setIsStaff((data?.length ?? 0) > 0));
  }, [user]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const items = [
    { to: "/dashboard" as const, label: "Home", icon: Home },
    { to: "/shop" as const, label: "Shop", icon: ShoppingBag },
    { to: "/titles" as const, label: "Titles", icon: Tag },
    { to: "/games" as const, label: "Games", icon: Gamepad2 },
    { to: "/leaderboard" as const, label: "Leaderboard", icon: Trophy },
    { to: "/settings" as const, label: "Me", icon: User },
    ...(isStaff ? [{ to: "/justice" as const, label: "Justice", icon: ShieldAlert }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className="fixed top-3 right-3 z-50 size-11 flex items-center justify-center bg-primary text-primary-foreground border-2 border-secondary shadow-[3px_3px_0_0_var(--secondary)] hover:bg-primary/90"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-primary text-primary-foreground border-l-4 border-secondary w-72 p-0">
        <SheetHeader className="px-6 py-5 border-b-2 border-secondary/40">
          <SheetTitle className="text-secondary uppercase tracking-widest text-lg">The State</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col p-3 gap-1">
          {items.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <li key={to}>
                <SheetClose asChild>
                  <Link
                    to={to}
                    className={`flex items-center gap-3 px-4 py-3 text-sm uppercase tracking-wider rounded ${
                      active ? "bg-primary-foreground/15 text-secondary" : "hover:bg-primary-foreground/10"
                    }`}
                  >
                    <Icon className="size-5" />
                    {label}
                  </Link>
                </SheetClose>
              </li>
            );
          })}
          <li className="mt-2 pt-2 border-t-2 border-secondary/40">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm uppercase tracking-wider rounded hover:bg-primary-foreground/10"
            >
              <LogOut className="size-5" />
              Desert
            </button>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}