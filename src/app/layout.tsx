import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { TabBar } from "@/components/tab-bar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Buddy",
  description: "Traccia tornei e risultati dei tuoi TCG.",
  appleWebApp: { capable: true, title: "TCG Buddy", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#FFD23F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${spaceGrotesk.variable} h-full antialiased`}>
      <body className="mx-auto flex min-h-full max-w-md flex-col pb-24">
        {children}
        <Suspense fallback={null}>
          <TabBar />
        </Suspense>
      </body>
    </html>
  );
}
