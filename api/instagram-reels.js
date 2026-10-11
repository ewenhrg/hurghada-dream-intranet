import { INSTAGRAM_HANDLE, loadInstagramReels } from "./instagramReels.js";

export default async function handler(_req, res) {
  const reels = await loadInstagramReels();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  res.status(200).json({ handle: INSTAGRAM_HANDLE, reels });
}
