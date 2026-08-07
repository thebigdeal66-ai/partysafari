import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import GlobalRuntimeKillSwitch from "../components/GlobalRuntimeKillSwitch";
import GlobalUserLocationTracker from "../components/GlobalUserLocationTracker";
import LegalFooter from "../components/legal/LegalFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://partysafari.live"),
  applicationName: "PartySafari.live",
  title: {
    default: "PartySafari | Discover Tonight",
    template: "%s | PartySafari",
  },
  description: "Discover tonight's best parties, bars, clubs, live stories, and entertainment with PartySafari.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PartySafari",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "PartySafari.live",
    title: "PartySafari | Discover Tonight",
    description: "See live venue energy, discover what is happening tonight, and find the party near you.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "PartySafari | Discover Tonight",
    description: "See live venue energy, discover what is happening tonight, and find the party near you.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070B",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalRuntimeKillSwitch />
        <GlobalUserLocationTracker />
        <NavBar />
        {children}
        <LegalFooter />
      </body>
    </html>
  );
}
