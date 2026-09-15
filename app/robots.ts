import type { MetadataRoute } from "next";

// MedTracking is not publicly launched (gift/personal-use status) and every
// real screen sits behind auth — there is no page here that should ever be
// indexed by a search engine, and doing so would put a personal-health-app
// URL into public search results for no benefit. Revisit if/when the app
// gets an actual public marketing/landing surface that wants indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
