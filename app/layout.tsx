import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenTavern — AI 角色聊天",
  description: "本地优先的 AI 角色聊天与角色卡管理应用。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
