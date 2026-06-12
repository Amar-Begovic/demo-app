import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#16a34a",
};

export const metadata: Metadata = {
  manifest: "/manifest.json",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
  },
};

export default function ScannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              // First unregister any old service workers
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(r) { r.unregister(); });
              });
              // Then register fresh SW scoped to /m/
              navigator.serviceWorker.register('/sw.js', { scope: '/m/' });
            }
          `,
        }}
      />
    </div>
  );
}
