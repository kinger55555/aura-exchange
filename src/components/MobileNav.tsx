import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Trophy, ShieldAlert, LogOut, User, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function MobileNav() {
  const { user } = useAuth();
  const { location } = useRouterState();
  const [isStaff, setIsStaff] = useState(false);

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
    { to: "/leaderboard" as const, label: "Ranks", icon: Trophy },
    { to: "/settings" as const, label: "Me", icon: User },
    ...(isStaff ? [{ to: "/justice" as const, label: "Justice", icon: ShieldAlert }] : []),
  ];

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden md:block sticky top-0 z-40 bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="font-black tracking-widest text-secondary text-lg">
            AURA
          </Link>
          <ul className="flex items-center gap-1">
            {items.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider rounded ${
                      active ? "bg-primary-foreground/15 text-secondary" : "hover:bg-primary-foreground/10"
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider rounded hover:bg-primary-foreground/10"
              >
                <LogOut className="size-4" />
                Desert
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Mobile bottom nav */}
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-primary text-primary-foreground border-t-4 border-secondary safe-bottom md:hidden">
      <ul className="flex items-stretch">
        {items.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={`flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] uppercase tracking-wider ${
                  active ? "bg-primary-foreground/15 text-secondary" : ""
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            onClick={signOut}
            className="w-full h-full flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] uppercase tracking-wider"
          >
            <LogOut className="size-5" />
            Desert
          </button>
        </li>
      </ul>
    </nav>
    </>
  );
}