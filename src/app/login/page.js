"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("อีเมลหรือรหัสผ่านไม่ถูกต้อง: " + error.message);
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  // --- ส่วนที่เพิ่มขึ้นมา: ฟังก์ชันแจ้งปัญหา ---
  const reportIssue = () => {
    const adminEmail = "admin@yourdomain.com"; // เปลี่ยนเป็นเมลของคุณ
    const subject = encodeURIComponent("แจ้งปัญหาการใช้งานระบบ MAKERSTOCK");
    const body = encodeURIComponent(`อีเมลผู้ใช้งาน: ${email}\nปัญหาที่พบ: `);
    window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          {/* --- ส่วนที่เพิ่มขึ้นมา: การดึงโลโก้พร้อมระบบ Fallback --- */}
          <div className="mb-4">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-20 h-20 rounded-2xl object-contain shadow-lg shadow-blue-100 border border-slate-50" 
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{display: 'none'}} className="w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center text-white text-3xl font-black shadow-lg">
              M
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tighter text-slate-800">
            MAKER<span className="text-blue-600">STOCK</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">คลังอุปกรณ์อัจฉริยะ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Email Address</label>
            <input
              type="email"
              placeholder="s660xxxxxxxxx@email.com"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-blue-600 active:scale-95 transition-all disabled:bg-slate-300 mt-4"
          >
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {/* --- ส่วนที่เพิ่มขึ้นมา: ปุ่มแจ้งปัญหา --- */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center">
          <button 
            onClick={reportIssue}
            className="text-blue-600 text-sm font-bold hover:text-blue-800 transition-colors flex items-center gap-2"
          >
            ⚠️ พบปัญหาในการเข้าใช้งาน? แจ้ง Admin
          </button>
          <p className="text-slate-400 text-[10px] mt-2 uppercase font-black tracking-widest">
            MakerStock Support System
          </p>
        </div>
      </div>
    </div>
  );
}