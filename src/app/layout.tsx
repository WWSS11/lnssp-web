import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/Providers";
import "./globals.css";

const lxgwWenKai = localFont({
  src: [
    {
      path: "./fonts/LXGWWenKaiLite-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/LXGWWenKaiLite-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-lxgw-wenkai",
  display: "swap",
});

const lxgwWenKaiMono = localFont({
  src: [
    {
      path: "./fonts/LXGWWenKaiMonoLite-Regular.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-lxgw-wenkai-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "辽宁社保查询助手",
  description:
    "面向辽宁参保人员的社保查询与政策解读助手，提供养老、医保、缴费年限和补贴信息参考。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${lxgwWenKai.variable} ${lxgwWenKaiMono.variable}`}
    >
      <body className="antialiased text-foreground bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
