/**
 * /robots.txt (réécrit vers cette fonction par vercel.json).
 * Pages publiques ouvertes à Google ; intranet, console admin et API fermés au crawl.
 * (Espace agences, Mon séjour, Modification : explorables mais `noindex` via vercel.json.)
 * Le sitemap suit le domaine appelé (vercel.app aujourd’hui, hurghadadream.com demain).
 */
export default function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hurghada-dream-intranet.vercel.app";
  const origin = `https://${host}`;
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /intranet",
    "Disallow: /superadmin",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.status(200).send(body);
}
