/* ============================================================
   BLOG_POSTS_FALLBACK — bundled snapshot for offline/local preview only.
   ------------------------------------------------------------
   The live site reads from /api/posts (Postgres, via Admin -> Blog
   Posts). This file is ONLY used when that API is unreachable --
   e.g. opening these files directly without the backend running.
   Shape matches what /api/posts returns exactly.
   ============================================================ */

const BLOG_POSTS_FALLBACK = [
  {
    slug: "road-to-hana-self-drive-vs-guided",
    title: "Road to Hana: Self-Drive vs. Guided Tour — Which Actually Saves You Money?",
    category: "Planning & Comparisons",
    island: "Maui",
    contentFormat: "comparison",
    author: "Hoa Hoang",
    excerpt: "We priced out both routes — rental car, gas, time off your trip — against three guided operators. The cheaper option isn't the one most people assume.",
    body: "Self-driving the Road to Hana is usually framed as the free option, since you're not paying a tour operator. That's only true if you ignore three costs most people forget to add up: the rental car itself, gas for roughly 120 miles of low-speed mountain driving, and the day you lose to driving instead of looking at anything.\n\nA compact rental for the day typically runs $70 to $110 depending on season, plus another $25 to $35 in gas given how much of the drive is in low gear. That alone puts a rental day in a similar range to a mid-priced guided tour before accounting for the time cost of navigating 620 curves and 59 one-lane bridges yourself.\n\nGuided Road to Hana tours on Maui range from van-based group tours to fully private departures, generally scaling with group size and flexibility.\n\nFor a first Hana trip, the guided option is usually the better value once fatigue and lost sightseeing time are counted. Returning visitors who already know the route are the exception — for them, self-driving still makes sense.",
    readTime: 7,
    tags: ["maui", "road to hana", "comparison"],
    disclosureText: "This guide contains affiliate links to FareHarbor, TripAdvisor, and GetYourGuide. If you book through one, we may earn a commission — it never affects our ratings or what we choose to feature.",
    relatedTourSlug: "unique-maui-tours-road-to-hana",
    featuredImage: null,
    publishedAt: "2026-09-10",
    updatedAt: "2026-09-10"
  },
  {
    slug: "6-percent-problem-luau-reviews",
    title: "The 6% Problem: What Low-Rated Luau Reviews Actually Complain About",
    category: "Real Traveler Reviews & Data",
    island: null,
    contentFormat: "honest_take",
    author: "Hoa Hoang",
    excerpt: "We read every 1-2 star luau review in our dataset. Three complaints came up far more than the rest — and they're avoidable if you know what to book around.",
    body: "Sample fallback content — replace by publishing a real post in Admin.",
    readTime: 6,
    tags: [],
    disclosureText: "",
    relatedTourSlug: null,
    featuredImage: null,
    publishedAt: "2026-09-05",
    updatedAt: "2026-09-05"
  },
  {
    slug: "is-the-helicopter-tour-worth-it",
    title: "Is the $300 Helicopter Tour Worth It? We Read 400 Reviews So You Don't Have To",
    category: "Tour Reviews by Type",
    island: "Kauai",
    contentFormat: "deep_dive_review",
    author: "Hoa Hoang",
    excerpt: "A breakdown of what actually shows up in helicopter tour reviews — visibility, doors-off vs doors-on, and the one detail that predicts a 1-star review almost every time.",
    body: "Sample fallback content — replace by publishing a real post in Admin.",
    readTime: 9,
    tags: [],
    disclosureText: "",
    relatedTourSlug: null,
    featuredImage: null,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-29"
  }
];
