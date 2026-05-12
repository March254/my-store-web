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
      // ล็อคอินสำเร็จ ส่งไปหน้าหลัก
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mb-4 shadow-lg shadow-blue-100">
            M
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-800">
            MAKER<span className="text-blue-600">STOCK</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">คลังอุปกรณ์อัจฉริยะ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">
              Email Address
            </label>
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
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">
              Password
            </label>
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

        <p className="text-center text-slate-400 text-xs mt-8">
          ติดต่อ Admin หากไม่สามารถเข้าสู่ระบบได้
        </p>
      </div>
    </div>
  );
}