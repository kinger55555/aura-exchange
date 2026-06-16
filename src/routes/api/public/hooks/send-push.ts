import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            user_id?: string;
            title?: string;
            body?: string;
            url?: string;
          };
          if (!body.user_id || !body.title) {
            return new Response("missing fields", { status: 400 });
          }

          const vapidPublic = process.env.VAPID_PUBLIC_KEY;
          const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
          const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@aura-of-accord.lovable.app";
          if (!vapidPublic || !vapidPrivate) {
            return new Response("vapid not configured", { status: 500 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: subs, error } = await supabaseAdmin
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth")
            .eq("user_id", body.user_id);
          if (error) {
            console.error("[send-push] db error", error);
            return new Response("db error", { status: 500 });
          }
          if (!subs || subs.length === 0) {
            return Response.json({ ok: true, sent: 0 });
          }

          const webpush = (await import("web-push")).default;
          webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

          const payload = JSON.stringify({
            title: body.title,
            body: body.body || "",
            url: body.url || "/",
          });

          let sent = 0;
          const stale: string[] = [];
          await Promise.all(
            subs.map(async (s) => {
              try {
                await webpush.sendNotification(
                  { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                  payload,
                );
                sent++;
              } catch (err: any) {
                if (err?.statusCode === 404 || err?.statusCode === 410) {
                  stale.push(s.endpoint);
                } else {
                  console.error("[send-push] push error", err?.statusCode, err?.body);
                }
              }
            }),
          );
          if (stale.length > 0) {
            await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
          }
          return Response.json({ ok: true, sent, pruned: stale.length });
        } catch (e) {
          console.error("[send-push] unexpected", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});