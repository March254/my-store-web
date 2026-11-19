"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("products"); // products | users | history | stock_date
  const [loading, setLoading] = useState(true);

  // 1. State จัดการอุปกรณ์
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: "", category: "", stock: 1, image_url: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", stock: 0, image_url: "" });

  // 2. State จัดการรายชื่อผู้ใช้
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState("");

  // 3. State ค้นหาประวัติ (ชื่อ + วัน/เดือน/ปี)
  const [logs, setLogs] = useState([]);
  const [logSearchText, setLogSearchText] = useState("");
  const [logSearchDate, setLogSearchDate] = useState(""); // รูปแบบ YYYY-MM-DD

  // 4. State เช็กสต็อกย้อนหลังตาม วัน/เดือน/ปี
  const [stockCheckDate, setStockCheckDate] = useState(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  });
  const [stockCheckSearch, setStockCheckSearch] = useState("");

  // อีเมลแอดมิน (ให้ตรงกับหน้าหลัก)
  const ADMIN_EMAILS = ["admin@email.com", "your-email@email.com"];

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase())) {
        router.push("/");
        return;
      }
      await Promise.all([fetchProducts(), fetchUsers(), fetchLogs()]);
      setLoading(false);
    };
    init();
  }, []);

  // --- ฟังก์ชันจัดการอุปกรณ์ ---
  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    if (data) setProducts(data);
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name.trim()) return alert("กรุณากรอกชื่ออุปกรณ์");
    const { error } = await supabase.from("products").insert([{
      name: newProduct.name.trim(),
      category: newProduct.category.trim() || "ทั่วไป",
      stock: parseInt(newProduct.stock) || 0,
      image_url: newProduct.image_url.trim() || null
    }]);
    if (error) return alert("เพิ่มไม่สำเร็จ: " + error.message);
    setNewProduct({ name: "", category: "", stock: 1, image_url: "" });
    fetchProducts();
    alert("เพิ่มอุปกรณ์เรียบร้อยแล้ว");
  };

  const startEditProduct = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      category: item.category || "",
      stock: item.stock,
      image_url: item.image_url || ""
    });
  };

  const handleSaveEditProduct = async (id) => {
    const { error } = await supabase.from("products").update({
      name: editForm.name.trim(),
      category: editForm.category.trim() || "ทั่วไป",
      stock: parseInt(editForm.stock) || 0,
      image_url: editForm.image_url.trim() || null
    }).eq("id", id);
    if (error) return alert("แก้ไขไม่สำเร็จ: " + error.message);
    setEditingId(null);
    fetchProducts();
  };

  const handleDeleteProduct = async (id, name) => {
    if (!confirm(`ยืนยันการลบอุปกรณ์ "${name}" ออกจากระบบถาวรหรือไม่?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return alert("ลบไม่สำเร็จ: " + error.message);
    fetchProducts();
  };

  // --- ฟังก์ชันจัดการรายชื่อผู้ใช้ ---
  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (data.users) setUsersList(data.users);
  };

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(`ยืนยันการลบบัญชีผู้ใช้ "${email}" ออกจากระบบถาวรหรือไม่?`)) return;
    const res = await fetch(`/api/admin/users?id=${userId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return alert("ลบผู้ใช้ไม่สำเร็จ: " + data.error);
    fetchUsers();
    alert("ลบบัญชีผู้ใช้เรียบร้อยแล้ว");
  };

  // --- ฟังก์ชันดึงประวัติทั้งหมด ---
  const fetchLogs = async () => {
    const { data } = await supabase.from("transaction_logs").select("*").order("created_at", { ascending: false });
    if (data) setLogs(data);
  };

  // ตัวกรองรายชื่อผู้ใช้
  const filteredUsers = usersList.filter(u =>
    (u.email || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  // ตัวกรองประวัติ (กรองทั้งชื่อ/อุปกรณ์ และ วัน/เดือน/ปี)
  const filteredLogs = logs.filter(log => {
    const matchText =
      (log.borrower_name || "").toLowerCase().includes(logSearchText.toLowerCase()) ||
      (log.product_name || "").toLowerCase().includes(logSearchText.toLowerCase());

    let matchDate = true;
    if (logSearchDate) {
      const logDateLocal = new Date(log.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
      matchDate = logDateLocal === logSearchDate;
    }
    return matchText && matchDate;
  });

  // --- คำนวณยอดอุปกรณ์ย้อนหลัง ณ สิ้นวันที่เลือก ---
  const stockSnapshotList = products
    .filter(item =>
      item.name.toLowerCase().includes(stockCheckSearch.toLowerCase()) ||
      (item.category || "").toLowerCase().includes(stockCheckSearch.toLowerCase())
    )
    .map(item => {
      let stockAtEndOfDate = item.stock;
      let withdrawnOnDate = 0;
      let returnedOnDate = 0;
      let damagedOnDate = 0;

      logs.forEach(log => {
        const isSameProduct =
          (log.product_id && String(log.product_id) === String(item.id)) ||
          log.product_name === item.name;
        if (!isSameProduct) return;

        const logDateLocal = new Date(log.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

        // รายการที่เกิดขึ้น "หลังจาก" วันที่เลือก -> ย้อนกลับค่าให้เป็นสภาพ ณ สิ้นวันที่เลือก
        if (stockCheckDate && logDateLocal > stockCheckDate) {
          if (log.type === "withdraw" || log.type === "damaged") {
            stockAtEndOfDate += log.amount;
          } else if (log.type === "return") {
            stockAtEndOfDate -= log.amount;
          }
        }

        // สรุปความเคลื่อนไหวที่เกิดขึ้น "ภายในวันนั้น"
        if (stockCheckDate && logDateLocal === stockCheckDate) {
          if (log.type === "withdraw") withdrawnOnDate += log.amount;
          if (log.type === "return") returnedOnDate += log.amount;
          if (log.type === "damaged") damagedOnDate += log.amount;
        }
      });

      return {
        ...item,
        stockAtEndOfDate: Math.max(0, stockAtEndOfDate),
        withdrawnOnDate,
        returnedOnDate,
        damagedOnDate
      };
    });

  // ฟังก์ชัน Export CSV ยอดอุปกรณ์ตามวันที่เลือก
  const handleExportStockSnapshotCSV = () => {
    const headers = ["ชื่ออุปกรณ์", "หมวดหมู่", `คงเหลือ ณ วันที่ ${stockCheckDate}`, "เบิกออกในวันนั้น", "รับคืนในวันนั้น", "ชำรุดในวันนั้น", "คงเหลือปัจจุบัน"];
    const rows = stockSnapshotList.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.category || "ทั่วไป").replace(/"/g, '""')}"`,
      item.stockAtEndOfDate,
      item.withdrawnOnDate,
      item.returnedOnDate,
      item.damagedOnDate,
      item.stock
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-report-${stockCheckDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-black text-blue-600">LOADING SETTINGS...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-10 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">
              Admin <span className="text-blue-600">Settings</span>
            </h1>
            <p className="text-xs font-bold text-slate-400">จัดการอุปกรณ์ รายชื่อผู้ใช้ และตรวจสอบสต็อกย้อนหลังตามวันที่</p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-black uppercase shadow-md active:scale-95 transition-all"
          >
            ← กลับหน้าหลัก
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm gap-2">
          <button
            onClick={() => setActiveTab("products")}
            className={`py-3.5 px-2 rounded-xl font-black text-xs uppercase transition-all ${
              activeTab === "products" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            📦 จัดการอุปกรณ์ ({products.length})
          </button>
          <button
            onClick={() => setActiveTab("stock_date")}
            className={`py-3.5 px-2 rounded-xl font-black text-xs uppercase transition-all ${
              activeTab === "stock_date" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            📊 ยอดอุปกรณ์ตามวันที่
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`py-3.5 px-2 rounded-xl font-black text-xs uppercase transition-all ${
              activeTab === "users" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            👥 จัดการรายชื่อ ({usersList.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3.5 px-2 rounded-xl font-black text-xs uppercase transition-all ${
              activeTab === "history" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            📅 ประวัติเบิก-คืน
          </button>
        </div>

        {/* ==================== TAB 1: จัดการอุปกรณ์ ==================== */}
        {activeTab === "products" && (
          <div className="space-y-8">
            <form onSubmit={handleAddProduct} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <h2 className="text-sm font-black uppercase text-blue-600 mb-4">+ เพิ่มอุปกรณ์ใหม่เข้าระบบ</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="ชื่ออุปกรณ์ *"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                  required
                />
                <input
                  type="text"
                  placeholder="หมวดหมู่ (เช่น Sensor)"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="จำนวนสต็อก"
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="ลิงก์รูปภาพ URL (ถ้ามี)"
                  value={newProduct.image_url}
                  onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                className="mt-4 bg-emerald-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase shadow-md active:scale-95 transition-all"
              >
                บันทึกเพิ่มอุปกรณ์
              </button>
            </form>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-sm font-black uppercase text-slate-800">รายการอุปกรณ์ทั้งหมด (แก้ไข / ลบ)</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {products.map((item) => (
                  <div key={item.id} className="p-4 flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-slate-50/70">
                    {editingId === item.id ? (
                      <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="p-2.5 border rounded-xl text-xs font-bold"
                          placeholder="ชื่ออุปกรณ์"
                        />
                        <input
                          type="text"
                          value={editForm.category}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className="p-2.5 border rounded-xl text-xs font-bold"
                          placeholder="หมวดหมู่"
                        />
                        <input
                          type="number"
                          value={editForm.stock}
                          onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                          className="p-2.5 border rounded-xl text-xs font-bold"
                          placeholder="สต็อก"
                        />
                        <input
                          type="text"
                          value={editForm.image_url}
                          onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                          className="p-2.5 border rounded-xl text-xs font-bold"
                          placeholder="URL รูปภาพ"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSaveEditProduct(item.id)}
                            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black"
                          >
                            บันทึก
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-[10px] font-black"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400">No Img</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-sm text-slate-800 uppercase truncate">{item.name}</p>
                            <p className="text-[10px] font-bold text-slate-400">
                              หมวดหมู่: <span className="text-blue-600">{item.category || "-"}</span> | คงเหลือ:{" "}
                              <span className="text-slate-900 font-black">{item.stock} ชิ้น</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => startEditProduct(item)}
                            className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-amber-200 transition-all"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(item.id, item.name)}
                            className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-red-200 transition-all"
                          >
                            ลบออก
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB ใหม่: เช็กยอดอุปกรณ์ตาม วัน/เดือน/ปี ==================== */}
        {activeTab === "stock_date" && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-sm font-black uppercase text-slate-800">ตรวจสอบจำนวนอุปกรณ์ตาม วัน / เดือน / ปี</h2>
                <p className="text-[11px] font-bold text-slate-400">แสดงยอดคงเหลือ ณ สิ้นวันที่เลือก พร้อมสรุปยอดเบิก-คืนในวันนั้น</p>
              </div>
              <button
                onClick={handleExportStockSnapshotCSV}
                className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
              >
                📥 Export CSV ({stockCheckDate})
              </button>
            </div>

            {/* ตัวเลือกวันที่ + ค้นหา */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
              <div>
                <label className="block text-[10px] font-black text-blue-800 uppercase mb-1">📅 เลือกวัน / เดือน / ปี</label>
                <input
                  type="date"
                  value={stockCheckDate}
                  onChange={(e) => setStockCheckDate(e.target.value)}
                  className="w-full p-3 bg-white border border-blue-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">ค้นหาชื่ออุปกรณ์ หรือ หมวดหมู่</label>
                <input
                  type="text"
                  placeholder="พิมพ์ชื่ออุปกรณ์ หรือหมวดหมู่..."
                  value={stockCheckSearch}
                  onChange={(e) => setStockCheckSearch(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* ตารางแสดงยอด */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-3">ชื่ออุปกรณ์</th>
                    <th className="py-3 px-3 text-center">คงเหลือ ณ วันที่เลือก</th>
                    <th className="py-3 px-3 text-center">เบิกในวันนั้น</th>
                    <th className="py-3 px-3 text-center">คืนในวันนั้น</th>
                    <th className="py-3 px-3 text-center">ชำรุด</th>
                    <th className="py-3 px-3 text-right">สต็อกปัจจุบัน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {stockSnapshotList.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-3">
                        <p className="font-black text-slate-800 uppercase">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400">{item.category || "ทั่วไป"}</p>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-block bg-blue-100 text-blue-700 font-black px-3 py-1 rounded-lg text-sm">
                          {item.stockAtEndOfDate}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-amber-600">
                        {item.withdrawnOnDate > 0 ? `-${item.withdrawnOnDate}` : "-"}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-600">
                        {item.returnedOnDate > 0 ? `+${item.returnedOnDate}` : "-"}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-red-500">
                        {item.damagedOnDate > 0 ? `-${item.damagedOnDate}` : "-"}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-500">
                        {item.stock} ชิ้น
                      </td>
                    </tr>
                  ))}
                  {stockSnapshotList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 font-bold text-xs uppercase">
                        ไม่พบรายการอุปกรณ์ที่ค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: จัดการรายชื่อผู้ใช้ ==================== */}
        {activeTab === "users" && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <h2 className="text-sm font-black uppercase text-slate-800">รายชื่อผู้ใช้งานทั้งหมดในระบบ</h2>
              <input
                type="text"
                placeholder="ค้นหาอีเมลผู้ใช้..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full sm:w-72 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              />
            </div>

            <div className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const isSelfAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes((u.email || "").toLowerCase());
                return (
                  <div key={u.id} className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-black text-sm text-slate-800">
                        {u.email}{" "}
                        {isSelfAdmin && (
                          <span className="ml-2 bg-blue-100 text-blue-700 text-[9px] px-2 py-0.5 rounded-full uppercase">
                            Admin
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">
                        สร้างเมื่อ: {new Date(u.created_at).toLocaleDateString("th-TH")}
                      </p>
                    </div>
                    {!isSelfAdmin && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="bg-red-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                      >
                        ลบรายชื่อออก
                      </button>
                    )}
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <p className="text-center text-slate-400 text-xs font-bold py-8">ไม่พบรายชื่อผู้ใช้ที่ค้นหา</p>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: ค้นหาประวัติ (รายชื่อ + วัน/เดือน/ปี) ==================== */}
        {activeTab === "history" && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
            <h2 className="text-sm font-black uppercase text-slate-800 mb-4">ค้นหาประวัติการเบิก-คืน (รายชื่อ / วัน-เดือน-ปี)</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">ค้นหาจากรายชื่อ (อีเมล) หรือชื่ออุปกรณ์</label>
                <input
                  type="text"
                  placeholder="พิมพ์อีเมล หรือชื่ออุปกรณ์..."
                  value={logSearchText}
                  onChange={(e) => setLogSearchText(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">เลือกวัน / เดือน / ปี</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={logSearchDate}
                    onChange={(e) => setLogSearchDate(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                  />
                  {logSearchDate && (
                    <button
                      onClick={() => setLogSearchDate("")}
                      className="px-3 bg-slate-200 text-slate-700 rounded-xl text-xs font-black"
                      title="ล้างวันที่"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[11px] font-bold text-slate-400 mb-3">พบทั้งหมด {filteredLogs.length} รายการ</p>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-800 uppercase">{log.product_name}</span>
                      <span className="text-xs font-black text-blue-600">x{log.amount}</span>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${
                          log.type === "withdraw"
                            ? "bg-amber-100 text-amber-700"
                            : log.type === "damaged"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {log.type === "withdraw" ? "เบิกของ" : log.type === "damaged" ? "ชำรุด" : "คืนของ"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">ผู้ทำรายการ: {log.borrower_name}</p>
                    {log.return_date && (
                      <p className="text-[10px] font-bold text-amber-600">
                        กำหนดคืน: {new Date(log.return_date).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[11px] font-bold text-slate-400">
                    {new Date(log.created_at).toLocaleString("th-TH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <p className="text-center text-slate-400 font-bold py-10 text-xs uppercase">ไม่พบประวัติตามเงื่อนไขที่ค้นหา</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}