/**
 * Admin → Blog Posts → Categories (posts.category).
 * Active categories are the tabs on the public All Articles page.
 * The screens themselves are shared with Topics — see taxonomyRoutes.js.
 */
const { createTaxonomyRoutes } = require("./taxonomyRoutes");

const routes = createTaxonomyRoutes({
  table: "categories",
  postColumn: "category",
  base: "/admin/categories",
  singular: "Category",
  plural: "Categories",
  auditEntity: "category",
  intro: 'The list Blog Posts choose from — and the tabs on the public <a href="/blog" target="_blank">All Articles</a> page (active categories only, A–Z). Changes here update the live page right away. Renaming a category also moves its posts to the new name.',
  otherLink: { href: "/admin/topics", label: "Manage Topics" },
});

module.exports = {
  ...routes,
  /** Used by blogRoutes.js to populate the category dropdown on the Post form. */
  listActiveCategoryNames: routes.listActiveNames,
};
