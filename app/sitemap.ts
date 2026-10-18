import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site.ts";

// output: "export" ではビルド時に確定させる必要がある
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/cases`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/redact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/batch`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
