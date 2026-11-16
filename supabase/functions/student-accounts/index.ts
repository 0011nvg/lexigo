const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
Deno.serve(async req => {
  if (req.method !== "GET" || !new URL(req.url).pathname.endsWith("/health")) return new Response("Not found", {status:404});
  const r = await fetch(url + "/auth/v1/admin/custom-providers", {headers: {apikey:key, Authorization:"Bearer " + key}});
  return Response.json({service:"student-accounts", provider_api_status:r.status, ready:false}, {headers:{"Cache-Control":"no-store"}});
});