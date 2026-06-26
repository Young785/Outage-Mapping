export const metadata = {
  title: "Outage Map",
  description: "Power outage map viewer",
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
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
