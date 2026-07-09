import type { Metadata } from "next";
import { MUIProvider } from "./registry";

export const metadata: Metadata = {
  title: "Conductor",
  description: "AI 原生的软件开发流程编排平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <MUIProvider>{children}</MUIProvider>
      </body>
    </html>
  );
}
