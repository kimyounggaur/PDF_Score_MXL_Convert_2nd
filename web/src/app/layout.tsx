import type { Metadata } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

const ibmPlexSansKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ibm-plex-sans-kr",
  fallback: ["Apple SD Gothic Neo", "Malgun Gothic", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "PDF 악보 MXL 변환",
  description: "인쇄 악보 PDF를 MusicXML(MXL)로 변환합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={ibmPlexSansKr.variable}>
      <body>{children}</body>
    </html>
  );
}
