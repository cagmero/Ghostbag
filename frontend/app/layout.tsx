import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { WalletConnector } from "@/components/WalletConnector";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ghostbag — Confidential Treasury",
  description:
    "Private treasury management with encrypted payments and homomorphic risk analytics powered by Fhenix CoFHE.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background antialiased`}>
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
                <span className="text-lg font-bold text-primary">Ghostbag</span>
                <WalletConnector />
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
