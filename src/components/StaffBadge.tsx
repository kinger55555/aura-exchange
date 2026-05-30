import { Crown, Shield, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "owner" | "admin" | "moderator" | null;

const cache = new Map<string, Role>();

export function useStaffRole(userId?: string | null) {
  const [role, setRole] = useState<Role>(userId ? (cache.get(userId) ?? null) : null);
  useEffect(() => {
    if (!userId) { setRole(null); return; }
    if (cache.has(userId)) { setRole(cache.get(userId)!); return; }
    supabase.from("staff_roles").select("role").eq("user_id", userId).then(({ data }) => {
      const ranks = (data ?? []).map((r: any) => r.role as string);
      const best: Role = ranks.includes("owner") ? "owner" : ranks.includes("admin") ? "admin" : ranks.includes("moderator") ? "moderator" : null;
      cache.set(userId, best);
      setRole(best);
    });
  }, [userId]);
  return role;
}

export function StaffBadge({ role, className = "" }: { role: Role; className?: string }) {
  if (!role) return null;
  if (role === "owner") return <Star aria-label="Owner" className={`inline size-3.5 text-secondary fill-secondary ${className}`} />;
  if (role === "admin") return <Crown aria-label="Admin" className={`inline size-3.5 text-secondary ${className}`} />;
  return <Shield aria-label="Moderator" className={`inline size-3.5 text-primary ${className}`} />;
}

export function StaffBadgeFor({ userId, className }: { userId?: string | null; className?: string }) {
  const role = useStaffRole(userId);
  return <StaffBadge role={role} className={className} />;
}