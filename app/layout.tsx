import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

/**
 * Inter carries the Latin text and figures; Noto Sans Thai fills in Thai
 * glyphs. Declaring Thai second lets Inter win for shared characters so
 * numerals stay tabular across both scripts.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const notoThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "A-Factory ERP",
  description: "ระบบ ERP สำหรับโรงงาน — จัดซื้อ คลังสินค้า และงานขาย",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <body
        style={
          {
            "--font-sans": `var(--font-inter), var(--font-noto-thai), system-ui, sans-serif`,
          } as React.CSSProperties
        }
        className="font-sans"
      >
        {children}
      </body>
    </html>
  );
}
