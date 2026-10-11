const HANDLE = "hurghada_dream";
const TTL_MS = 30 * 60 * 1000;

/** Couvertures publiques du profil, utilisées si l’API Instagram ne répond pas. */
const FALLBACK_REELS = [
  ["DT7mIghAj1r", "https://scontent.cdninstagram.com/v/t51.71878-15/622389340_847952934897575_7839846074535381194_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=101&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=ncH8xC76VY0Q7kNvwHvxSen&_nc_oc=Ado-JyF7Gl5nwBGeTRfJSYtc3SD8h7vTZNVYs2W_bCBO8nwrhvsHKVBzk_2tXFABDT0&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQMCC5P9l5M7f3TbbUeQKkWD_FfXRUsIbpTTBheCAXkSLQ&oe=6AD17A6C"],
  ["DRralmTjWQV", "https://scontent.cdninstagram.com/v/t51.71878-15/589213081_854094650711975_3097087706477671805_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=103&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=-BrNlJQ5GRsQ7kNvwEZRLrG&_nc_oc=Ados57uxieaSCheYoqZmgkN6OTRZv_73fr3q99XedWYAA1wBQMnH_C0_yZyEze6Kb80&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQPx9wuQ6qY_QL2L7kjbEx_stV2Otcvyowe9BMgNuEk7GA&oe=6AD17F11"],
  ["DBRUT2QijbL", "https://scontent.cdninstagram.com/v/t51.82787-15/639755996_18312943408248550_2270531489562784164_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=105&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=cuKvVez2rnsQ7kNvwG8PUHJ&_nc_oc=AdpYe5tvYagyaM1PEIP9fjemMR7_07MxGplgJbRwCqZveZ3kN4lEtOyeqSA-73nWRWQ&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQPhRpLWoSKVM5fyjvHr5JPOb1jmOiynJbMu2XIiAa5s9Q&oe=6AD16272"],
  ["DeEcLuVAbef", "https://scontent.cdninstagram.com/v/t51.82787-15/834098357_18343452283248550_6558248061483372590_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=109&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=klgKHmu89HUQ7kNvwHq9aeB&_nc_oc=AdqsGk6hGELwo8qub0Z9iJKOLFJDbfkZEyr-cw_7UcSQ-Z8vd9NCGPUlFMelzMn2xdU&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQOERFRLuY_BAogXSbhB4IOLLBP6ohOivJ8CFE0G2V-xBg&oe=6AD16549"],
  ["DdycpcmEwFr", "https://scontent.cdninstagram.com/v/t51.82787-15/825276728_18342587599248550_6749600314797239148_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=110&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=wqimm0x74YIQ7kNvwGkCwkp&_nc_oc=AdpTGBOYcLshPTqLkDlZsn9Sh1t8Y5V55GJfvmf-zzEZ2GVC738Qg0zm15P085mXoKI&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQNeL0s-2NVplVA8eGQobiJij0Qyse41zFw5V1ViC4PmWA&oe=6AD18E9A"],
  ["DdZVndIjUy1", "https://scontent.cdninstagram.com/v/t51.82787-15/819002871_18341640262248550_409631698555382987_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=104&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=SAOXRK4FpBoQ7kNvwErswzo&_nc_oc=Adojhxj1eMZicwGAoXndm00RweIYvlW1fFskvSRE_bwsECaRFbSie75w3HbdpCbycVg&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQMPPybw__aSLcfnz2ZA6h_Ct7GmT_ONhnp7w8qMX6bnbQ&oe=6AD16E8D"],
  ["DdHNnqjFWB4", "https://scontent.cdninstagram.com/v/t51.82787-15/818062818_18341640127248550_2042091161012694339_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=104&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=CES2O0wH3JAQ7kNvwGGdUFL&_nc_oc=Adps4Z0QC_oGO7FGYHz48W1Q47VkwLMMoD4pDJvc9faoA_ZUJVSdlp2VqwScAOZtyB4&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQM5qrkM11_rD26NCgGQ_rVRJIWFcv3DwUf-JB2Ib3B2Jw&oe=6AD171C3"],
  ["DcyovktgIz2", "https://scontent.cdninstagram.com/v/t51.82787-15/792206103_18339258109248550_2775265798975041304_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=103&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=ZNYW-iTSizcQ7kNvwGeBNUg&_nc_oc=AdrnLbwye0gIR2I-Yb-fUQ8XBcvz7IJF7K3W76xTFSVIWH_Xi8wBS_9sY0IahdHHiUo&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQPt3zXJ-D-3rTgfwBMP8YfaWK46TX2Gof34dB0g2K7Sqg&oe=6AD1680A"],
  ["DcYOcVbCA84", "https://scontent.cdninstagram.com/v/t51.71878-15/780982011_2417785855383137_8032611719423088467_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=110&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=CKMVsh_y6XAQ7kNvwG1xYH2&_nc_oc=Ado6ExoO9LyybLZw3i_pF0bugElsKe3RJXL0frPe-6yrIjiJC4QMBHMmuAkLGFuWUEE&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQN-s6Jsn4znYmjOABZOPotzRqDVNrbe53bl9_pt-NtpCQ&oe=6AD180F9"],
  ["DcGTnbECHQ3", "https://scontent.cdninstagram.com/v/t51.71878-15/775442118_921426167681213_8009709710407645563_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=105&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=KTDKJIYl0QsQ7kNvwHLYyx5&_nc_oc=AdqihVWX6YMhOqLUP9DhHYP8ntORbPozWn6vJY0RI5zkfXzxVbnK8OGSh2qVGl3btmg&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQObS3hD0e950rXHWGg3YnQwCIOGiiDt3ZLxM3fi7iWDoQ&oe=6AD1745E"],
  ["Db0ShTxColz", "https://scontent.cdninstagram.com/v/t51.71878-15/768190767_1065379772526797_7007962984772168005_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=102&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=b_T86S_9tmwQ7kNvwEAPirh&_nc_oc=AdpKrDyUpU_tOIPwet0ntcBplKqyS32HNKx4ty2NZbjv0p-PdYhvP8BquvB-2wCk9Vs&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQNJUWKszUw8lBgXmmeeI-9LQmzzv5gwMw4cRiT06Fv0LA&oe=6AD17E28"],
  ["DbiTcb-iV3M", "https://scontent.cdninstagram.com/v/t51.82787-15/762867164_18334669711248550_4500239390870745454_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=104&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=1KP4yWnpDnAQ7kNvwGmHDvz&_nc_oc=AdrBolkNhWqr0aZ5y-ShaTbx8aaUny8Wlh8zvvF-gQI1WjdwYqzr9GPtKy0O-yAE9rk&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=GESGJ57DQuuA_Ck5Ht_eOA&_nc_ss=78689&oh=00_AQOFwWjn3Zg3SSRwhYAzQvwavu0yDtbzZ7JjtCoGf-Nttw&oe=6AD17726"],
].map(([id, image]) => ({
  id,
  href: `https://www.instagram.com/reel/${id}/`,
  image,
  caption: "Réel Hurghada Dream",
}));

let cache = { at: 0, reels: [] };

function captionOf(node) {
  const text = node?.edge_media_to_caption?.edges?.[0]?.node?.text;
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 90);
}

function imageOf(node) {
  const fromResources = Array.isArray(node?.thumbnail_resources)
    ? node.thumbnail_resources[node.thumbnail_resources.length - 1]?.src
    : "";
  return String(node?.thumbnail_src || node?.display_url || fromResources || "").trim();
}

function toReel(node) {
  const id = String(node?.shortcode || "").trim();
  const image = imageOf(node);
  if (!id || !image) return null;
  return {
    id,
    href: `https://www.instagram.com/reel/${id}/`,
    image,
    caption: captionOf(node) || "Réel Hurghada Dream",
  };
}

function nodesFrom(user) {
  const buckets = [
    user?.edge_owner_to_timeline_media?.edges,
    user?.edge_felix_video_timeline?.edges,
  ];
  const nodes = [];
  for (const edges of buckets) {
    if (!Array.isArray(edges)) continue;
    for (const edge of edges) {
      if (edge?.node?.shortcode) nodes.push(edge.node);
    }
  }
  return nodes;
}

function pickReels(nodes) {
  const clips = nodes.filter((node) => node?.product_type === "clips" || node?.is_video === true);
  const chosen = clips.length ? clips : [];
  const seen = new Set();
  const reels = [];
  for (const node of chosen) {
    const reel = toReel(node);
    if (!reel || seen.has(reel.id)) continue;
    seen.add(reel.id);
    reels.push(reel);
    if (reels.length >= 12) break;
  }
  return reels;
}

export async function loadInstagramReels() {
  if (cache.reels.length && Date.now() - cache.at < TTL_MS) return cache.reels;

  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${HANDLE}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "application/json",
          "X-IG-App-ID": "936619743392459",
          Referer: `https://www.instagram.com/${HANDLE}/`,
        },
      }
    );
    if (!response.ok) return cache.reels.length ? cache.reels : FALLBACK_REELS;
    const payload = await response.json();
    const reels = pickReels(nodesFrom(payload?.data?.user));
    if (reels.length) cache = { at: Date.now(), reels };
    return reels.length ? reels : FALLBACK_REELS;
  } catch {
    return cache.reels.length ? cache.reels : FALLBACK_REELS;
  }
}

export const INSTAGRAM_HANDLE = HANDLE;
