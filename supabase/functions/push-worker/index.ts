// LEXI · push-worker (2026-11-04): отправляет Web Push из очереди public.push_outbox.
// Вызывается базой (pg_net: сразу после новой записи и cron каждую минуту) с заголовком x-lexi-cron.
// Секреты не хранятся в коде: ключи VAPID и секрет вызова лежат в Vault проекта. Ключи VAPID создаются
// здесь при первом запуске (WebCrypto, P-256) и сохраняются в Vault функцией push_store_vapid.
// Деплой: supabase functions deploy push-worker --no-verify-jwt   (проверка доступа — по секрету вызова)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function makeVapid() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = new Uint8Array(65); pub[0] = 4; pub.set(fromB64u(jwk.x!), 1); pub.set(fromB64u(jwk.y!), 33);
  return { publicKey: b64u(pub), privateKey: jwk.d!, subject: "mailto:0011nvg@gmail.com" };
}

let cfg: { cron: string; vapid: { publicKey: string; privateKey: string; subject: string } } | null = null;
async function config() {
  if (cfg) return cfg;
  let { data, error } = await sb.rpc("push_internal_config");
  if (error) throw error;
  if (!data.vapid) {
    await sb.rpc("push_store_vapid", { v: await makeVapid() });
    ({ data, error } = await sb.rpc("push_internal_config"));
    if (error) throw error;
  }
  cfg = { cron: data.cron, vapid: JSON.parse(data.vapid) };
  return cfg;
}

const TTL: Record<string, number> = { lesson: 3 * 86400, done: 86400, daily: 3 * 3600, test: 600 };

Deno.serve(async (req) => {
  try {
    const c = await config();
    const given = req.headers.get("x-lexi-cron") || "";
    if (!c.cron || given.length !== c.cron.length || given !== c.cron) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    webpush.setVapidDetails(c.vapid.subject, c.vapid.publicKey, c.vapid.privateKey);
    const { data: items, error } = await sb.rpc("push_claim", { n: 100 });
    if (error) throw error;
    const report = { items: items.length, delivered: 0, removed: 0, failed: 0, details: [] as unknown[] };
    for (const it of items) {
      const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth,fails").eq("user_id", it.user_id);
      let ok = 0;
      const payload = JSON.stringify({ title: it.title, body: it.body, url: it.url, tag: it.kind + ":" + it.id, kind: it.kind });
      for (const s of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: TTL[it.kind] ?? 86400, urgency: it.kind === "daily" ? "normal" : "high" });
          ok++; await sb.from("push_subscriptions").update({ last_ok: new Date().toISOString(), fails: 0 }).eq("id", s.id);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode || 0;
          report.details.push({ status: code, body: String((e as { body?: string }).body || (e as Error).message || "").slice(0, 160) });
          // подписка больше не действует (приложение удалено, разрешение отозвано) — удаляем
          if (code === 404 || code === 410 || s.fails + 1 >= 5) { await sb.from("push_subscriptions").delete().eq("id", s.id); report.removed++; }
          else { await sb.from("push_subscriptions").update({ fails: s.fails + 1 }).eq("id", s.id); report.failed++; }
        }
      }
      report.delivered += ok;
      // сообщение закрыто: доставлено хотя бы на одно устройство или у ученика не осталось подписок
      const { count } = await sb.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", it.user_id);
      if (ok || !count) await sb.from("push_outbox").update({ sent_at: new Date().toISOString(), delivered: ok }).eq("id", it.id);
    }
    return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("push-worker", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500 });
  }
});
