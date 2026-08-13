import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Documentation",
  description:
    "StormTracker documentation covering outage maps, field investigations, smart dispatch, routing modes, storm phase controls, and admin tools.",
  alternates: {
    canonical: "/docs",
  },
  openGraph: {
    title: "StormTracker Platform Documentation",
    description:
      "Learn how StormTracker supports outage mapping, dispatch, routing, and storm operations.",
    url: "/docs",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
