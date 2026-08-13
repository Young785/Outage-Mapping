import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Site Navigation Guide",
  description:
    "StormTracker site navigation guide for outages, map, dashboard, jobs, opportunities, and field workflows.",
  alternates: {
    canonical: "/docs/guide",
  },
  openGraph: {
    title: "StormTracker Site Navigation Guide",
    description:
      "A practical guide to navigating StormTracker pages and storm response workflows.",
    url: "/docs/guide",
  },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
