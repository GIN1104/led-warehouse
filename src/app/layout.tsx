import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { Shell } from "@/components/shell";
import { getSession, type Role } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listUsers } from "@/lib/services/queries";
import "./globals.css";

const sans = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-ibm" });

export const metadata: Metadata = {
  title: "LED Warehouse",
  description: "Учёт складского LED-оборудования и заказов проката",
  applicationName: "LED Warehouse",
  manifest: "/manifest.webmanifest",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const users = listUsers(getDb()).map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role as Role,
  }));

  return (
    <html lang="ru">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <Shell session={{ id: session.id, name: session.name, role: session.role as Role }} users={users}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
