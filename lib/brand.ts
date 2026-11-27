// Names shown to people: login screens, menu, browser tab, invite text and
// sync emails all read them from here, so the product is renamed in one place.
// No imports: the sync scripts (Node) use this file too.

export const BRAND = {
  /** Company badge on the sign-in screens. */
  company: "TERO DIGITAL",
  /** Full product name. */
  product: "TERO 360 Insights",
  /** Product name without the company, for the large sign-in title. */
  productShort: "360 Insights",
} as const;
