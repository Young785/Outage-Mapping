import type { Metadata, Viewport } from "next";

const siteUrl = "https://stormtrackertool.com";

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StormTracker — Power Outage Map & Storm Response Platform",
    template: "%s | StormTracker",
  },
  description:
    "StormTracker is a storm response platform for power outage mapping, field investigations, smart dispatch, multi-stop routing, and live tech GPS tracking.",
  keywords: [
    "storm response platform",
    "power outage map",
    "outage field map",
    "utility storm dispatch",
    "field technician routing",
    "outage investigations",
    "stormtrackertool",
    "Xcel outage map",
    "Connexus outage map",
  ],
  authors: [{ name: "StormTracker" }],
  creator: "StormTracker",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "StormTracker",
    title: "StormTracker — Power Outage Map & Storm Response Platform",
    description:
      "Map outages, dispatch field techs, optimize multi-stop routes, and manage storm operations from one platform.",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "StormTracker outage map and storm response platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StormTracker — Outage Map & Storm Dispatch",
    description:
      "Power outage mapping, field investigations, smart dispatch, and routing optimization for storm response teams.",
    images: ["/og.svg"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "StormTracker",
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`,
      description:
        "Storm response platform for power outage mapping, dispatch, and field operations.",
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "StormTracker",
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      name: "StormTracker",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description:
        "Power outage map viewer and storm response platform with field investigations, smart dispatch, routing optimization, and live tech GPS tracking.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`.pac-container { z-index: 10000 !important; }`}</style>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
