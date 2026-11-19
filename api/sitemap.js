/**
 * /sitemap.xml (réécrit vers cette fonction par vercel.json).
 * Pages fixes + chaque excursion du catalogue (hors pause) + chaque hôtel publié,
 * lus en direct dans Supabase avec la clé publique (mêmes droits que le site).
 */
const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/catalogue", priority: "0.9", changefreq: "daily" },
  { path: "/hotels", priority: "0.9", changefreq: "weekly" },
  { path: "/evenements", priority: "0.7", changefreq: "monthly" },
  { path: "/demande-hotel", priority: "0.6", changefreq: "monthly" },
  { path: "/contacts", priority: "0.6", changefreq: "monthly" },
  { path: "/qui-sommes-nous", priority: "0.6", changefreq: "monthly" },
  { path: "/politique", priority: "0.3", changefreq: "yearly" },
  { path: "/confidentialite", priority: "0.2", changefreq: "yearly" },
];

const DEFAULT_SITE_KEY = "hurghada_dream_0606";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function readTable(baseUrl, key, query) {
  try {
    const response = await fetch(`${baseUrl}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hurghada-dream-intranet.vercel.app";
  const origin = `https://${host}`;
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  const rawKey = String(process.env.VITE_SITE_KEY || "").trim();
  const siteKey = rawKey && !/^https?:/i.test(rawKey) ? rawKey : DEFAULT_SITE_KEY;

  const urls = STATIC_PAGES.map((page) => ({ loc: `${origin}${page.path}`, ...page }));

  if (supabaseUrl && anonKey) {
    const site = encodeURIComponent(siteKey);
    const [activities, hotels] = await Promise.all([
      readTable(supabaseUrl, anonKey, `activities?select=id,catalog_paused&site_key=eq.${site}`),
      readTable(supabaseUrl, anonKey, `public_hotels_catalog?select=id,slug&site_key=eq.${site}&is_published=eq.true`),
    ]);
    activities
      .filter((row) => row?.id != null && row.catalog_paused !== true)
      .forEach((row) => {
        urls.push({
          loc: `${origin}/catalogue/activity/${encodeURIComponent(String(row.id))}`,
          priority: "0.8",
          changefreq: "weekly",
        });
      });
    hotels
      .filter((row) => row && (row.slug || row.id))
      .forEach((row) => {
        urls.push({
          loc: `${origin}/hotels/${encodeURIComponent(String(row.slug || row.id))}`,
          priority: "0.7",
          changefreq: "weekly",
        });
      });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url><loc>${escapeXml(url.loc)}</loc><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`
    ),
    "</urlset>",
    "",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
  res.status(200).send(xml);
}
