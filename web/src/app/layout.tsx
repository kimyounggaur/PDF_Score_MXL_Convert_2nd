import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF 악보 MXL 변환",
  description: "인쇄 악보 PDF를 MusicXML(MXL)로 변환합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
