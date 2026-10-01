import "./globals.css"; // <<--- บรรทัดนี้สำคัญที่สุด เพื่อดึงสีและปุ่มต่างๆ มาใช้
import { Inter, Kanit } from "next/font/google"; // ดึงฟอนต์ Kanit มาใช้กับภาษาไทย

const kanit = Kanit({ 
  subsets: ["thai"], 
  weight: ["300", "400", "700"] 
});

export const metadata = {
  title: 'ระบบเบิกอุปกรณ์ Store',
  description: 'จัดการเบิกจ่ายอุปกรณ์ใน Store',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={kanit.className}>{children}</body>
    </html>
  )
}