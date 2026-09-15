/* ============================================================
   BLOG_POSTS — sample editorial dataset
   ------------------------------------------------------------
   SAMPLE CONTENT — titles/excerpts illustrate the design system
   and the pillar-cluster taxonomy from tripreviewall-all-blog-brief.md.
   Only "road-to-hana-self-drive-vs-guided" has a full detail page
   built out; the rest are placeholders (link to "#") until the
   editorial team writes real articles.
   ============================================================ */

const BLOG_POSTS = [
  {
    slug: "road-to-hana-self-drive-vs-guided",
    title: "Road to Hana: Self-Drive vs. Guided Tour — Which Actually Saves You Money?",
    excerpt: "We priced out both routes — rental car, gas, time off your trip — against three guided operators. The cheaper option isn't the one most people assume.",
    category: "Planning & Comparisons",
    island: "Maui",
    author: "Hoa Hoang",
    publishedAt: "2026-09-10",
    updatedAt: "2026-09-10",
    readTime: 7,
    contentFormat: "comparison",
    hasDetailPage: true
  },
  {
    slug: "6-percent-problem-luau-reviews",
    title: "The 6% Problem: What Low-Rated Luau Reviews Actually Complain About",
    excerpt: "We read every 1–2★ luau review in our dataset. Three complaints came up far more than the rest — and they're avoidable if you know what to book around.",
    category: "Real Traveler Reviews & Data",
    island: null,
    author: "Hoa Hoang",
    publishedAt: "2026-09-05",
    updatedAt: "2026-09-05",
    readTime: 6,
    contentFormat: "honest_take",
    hasDetailPage: false
  },
  {
    slug: "is-the-helicopter-tour-worth-it",
    title: "Is the $300 Helicopter Tour Worth It? We Read 400 Reviews So You Don't Have To",
    excerpt: "A breakdown of what actually shows up in helicopter tour reviews — visibility, doors-off vs doors-on, and the one detail that predicts a 1-star review almost every time.",
    category: "Tour Reviews by Type",
    island: "Kauai",
    author: "Hoa Hoang",
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-29",
    readTime: 9,
    contentFormat: "deep_dive_review",
    hasDetailPage: false
  },
  {
    slug: "oahu-north-shore-guide",
    title: "Oahu's North Shore: A Practical Guide to Shark Dives, Surf Lessons and Shuttle Options",
    excerpt: "Everything clustered around Haleiwa in one place — what's actually different between the shark tour operators, and which surf schools suit true beginners.",
    category: "Island Guides",
    island: "Oahu",
    author: "Hoa Hoang",
    publishedAt: "2026-08-20",
    updatedAt: "2026-09-01",
    readTime: 11,
    contentFormat: "listicle",
    hasDetailPage: false,
    featuredPillar: true,
    pillarOrder: 1
  },
  {
    slug: "how-far-ahead-should-you-book-hawaii-tours",
    title: "How Far Ahead Should You Actually Book Hawaii Tours?",
    excerpt: "Booking windows by activity type, pulled from cancellation and availability patterns across our tracked operators.",
    category: "Booking & Practical Info",
    island: null,
    author: "Hoa Hoang",
    publishedAt: "2026-08-12",
    updatedAt: "2026-08-12",
    readTime: 5,
    contentFormat: "honest_take",
    hasDetailPage: false
  },
  {
    slug: "big-island-manta-ray-night-snorkel-operators-compared",
    title: "Big Island Manta Ray Night Snorkels: 4 Operators Compared",
    excerpt: "Same activity, same bay, four different boats. Here's what actually separates them beyond price.",
    category: "Tour Reviews by Type",
    island: "Big Island",
    author: "Hoa Hoang",
    publishedAt: "2026-08-02",
    updatedAt: "2026-08-02",
    readTime: 8,
    contentFormat: "comparison",
    hasDetailPage: false
  }
];
