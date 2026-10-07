import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { Shell } from "@/components/shell";
import { WarehouseProvider } from "@/components/warehouse";
import "./globals.css";

const sans = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-ibm" });

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "LED Warehouse",
  description: "Учёт складского LED-оборудования и заказов проката",
  applicationName: "LED Warehouse",
  manifest: `${basePath}/manifest.webmanifest`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <WarehouseProvider>
          <Shell>{children}</Shell>
        </WarehouseProvider>
      </body>
    </html>
  );
}
