import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Project X",
  description:
    "La app exclusiva de Project X para tu evento de graduación. Fotos, chat, encuestas y más.",
  manifest: "/manifest.json",
  metadataBase: new URL("https://app.projectxeventos.es"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Project X",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Project X",
    description: "La app exclusiva de tu graduacion. Fotos, chat, encuestas y mas.",
    url: "https://app.projectxeventos.es",
    siteName: "Project X",
    type: "website",
    locale: "es_ES",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Project X logo" }],
  },
  twitter: {
    card: "summary",
    title: "Project X",
    description: "La app exclusiva de tu graduacion. Fotos, chat, encuestas y mas.",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`h-full antialiased ${geist.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-white overscroll-none">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
