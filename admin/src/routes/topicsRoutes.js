/**
 * Admin → Blog Posts → Topics. A post's topic is stored in posts.island_tag
 * (the column's old name — it used to hold only the island). Active topics fill
 * the post form dropdown and the public Topic filter; an article's topic also
 * shows as a tag on the article. Topics named like an island (Oahu, Maui,
 * Kauai, Big Island) also put the article on that island's destination page.
 */
const { createTaxonomyRoutes } = require("./taxonomyRoutes");

const routes = createTaxonomyRoutes({
  table: "topics",
  postColumn: "island_tag",
  base: "/admin/topics",
  singular: "Topic",
  plural: "Topics",
  auditEntity: "topic",
  intro: 'Topic tags for articles (e.g. an island, "Snorkeling", "Family travel", "Budget"). Visitors can filter the <a href="/blog" target="_blank">All Articles</a> page by topic. Topics named after an island (Oahu, Maui, Kauai, Big Island) also list the article on that island\'s destination page.',
  otherLink: { href: "/admin/categories", label: "Manage Categories" },
});

module.exports = { ...routes, listActiveTopicNames: routes.listActiveNames };
