import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pump Station Calculator",
  description: "Проектирование и расчёт насосных станций",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
