/**
 * Canonical list of the 4 Hawaii islands this site covers.
 * This is the ONLY place this list should be defined server-side —
 * import it everywhere else instead of re-declaring it (per the
 * duplication risk flagged in the code audit).
 */
const ISLANDS = [
  { slug: "oahu", name: "Oahu", gradient: "linear-gradient(135deg,#0B3B4F,#5C8A72)",
    intro: "Oahu carries the largest share of tours we track — Honolulu-area snorkel and dive operators, Pearl Harbor historic tours, and North Shore surf schools and shark dives make up most of the island's listings." },
  { slug: "maui", name: "Maui", gradient: "linear-gradient(135deg,#B8592F,#0B3B4F)",
    intro: "Maui's tour scene centers on boat charters out of Lahaina and Ma'alaea, the Road to Hana (both self-drive and guided), and Haleakala sunrise/sunset tours." },
  { slug: "kauai", name: "Kauai", gradient: "linear-gradient(135deg,#5C8A72,#26313A)",
    intro: "Kauai's tours are dominated by Na Pali Coast boat and raft trips, helicopter air tours, and a smaller set of land-based hiking and ranch adventures." },
  { slug: "big-island", name: "Big Island", gradient: "linear-gradient(135deg,#26313A,#B85C4A)",
    intro: "Big Island tours split between Kona-side snorkel and dive charters (including manta ray night snorkels), and volcano/waterfall tours based out of Hilo." },
];

module.exports = { ISLANDS };
