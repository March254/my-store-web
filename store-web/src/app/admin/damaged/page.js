'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase' // ปรับ Path ให้ตรงกับโฟลเดอร์ src/lib

export default function ReportDamagedPage() {
  const [products, setProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [amount, setAmount] = useState(1)
  const [borrowerName, setBorrowerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
    
    if (!error && data) {
      setProducts(data)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedProductId) {
      alert('กรุณาเลือกอุปกรณ์')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const selectedProduct = products.find(p => String(p.id) === String(selectedProductId))
      const productName = selectedProduct ? (selectedProduct.name || selectedProduct.product_name) : 'ไม่ระบุชื่อ'

      const { error } = await supabase
        .from('transaction_logs')
        .insert([
          {
            product_id: selectedProductId,
            product_name: productName,
            borrower_name: borrowerName || 'ADMIN (แจ้งชำรุด)',
            amount: Number(amount),
            type: 'damaged',
          }
        ])

      if (error) throw error

      setMessage('บันทึกรายการอุปกรณ์เสียเรียบร้อยแล้ว!')
      setSelectedProductId('')
      setAmount(1)
      setBorrowerName('')

    } catch (err) {
      console.error(err)
      setMessage(`เกิดข้อผิดพลาด: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto my-10 bg-white rounded-2xl shadow-xl space-y-6">
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-red-600 italic uppercase">
            บันทึกแจ้งอุปกรณ์เสีย / ชำรุด
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ลงบันทึกประวัติการชำรุดของอุปกรณ์เข้าสู่ระบบ
          </p>
        </div>
        <a href="/" className="text-xs font-bold text-slate-500 hover:text-slate-800 underline">
          กลับหน้าหลัก
        </a>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">
            เลือกอุปกรณ์ *
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            required
            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
          >
            <option value="">-- เลือกอุปกรณ์ --</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.product_name} (รหัส: {item.id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">
            จำนวนที่เสีย / ชำรุด *
          </label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">
            ผู้แจ้งเรื่อง / หมายเหตุอาการเสีย
          </label>
          <input
            type="text"
            placeholder="เช่น สายขาด / เปิดไม่ติด (แจ้งโดย admin)"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:bg-slate-400 mt-4"
        >
          {loading ? 'กำลังบันทึก...' : 'บันทึกรายการเสีย'}
        </button>
      </form>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-bold ${message.includes('เกิดข้อผิดพลาด') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}
    </div>
  )
}