import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-register";
import { OfflineNotice } from "@/components/pwa/offline-notice";
import { ThemeProvider } from "@/components/providers/theme-provider";

const geistSans = localFont({
  src: [
    { path: "../fonts/GeistSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeistSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeistSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/GeistSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "../fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AlphaFlow",
    template: "%s · AlphaFlow",
  },
  description: "Intelligent Danish bookkeeping — Skat & Moms for moderne virksomheder",
  keywords: ["Accounting", "Bookkeeping", "VAT", "Moms", "Small Business", "Denmark", "Peppol", "E-invoicing", "OCR", "Receipt Scanning"],
  authors: [{ name: "AlphaFlow" }],
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AlphaFlow",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineNotice />
          <PwaProvider>
            {children}
          </PwaProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
