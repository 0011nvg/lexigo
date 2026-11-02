// Local stand-in for https://<project>.supabase.co: routes /auth/v1 → GoTrue, /rest/v1 → PostgREST, adds CORS.
import http from 'node:http';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3000]];
const port = Number(process.env.PROXY_PORT || 54321);
http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range,x-supabase-api-version', 'access-control-max-age': '600' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404, cors); return res.end('not found'); }
  const path = req.url.slice(r[0].length) || '/';
  const up = http.request({ host: '127.0.0.1', port: r[1], path, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + r[1] } }, u => {
    res.writeHead(u.statusCode, { ...u.headers, ...cors }); u.pipe(res);
  });
  up.on('error', e => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log('proxy on', port));
