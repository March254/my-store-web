'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

export default function ImportUsersPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage('กำลังอ่านไฟล์ Excel...')

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        // อ่านข้อมูลจาก Sheet แรก
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // แปลงแถวข้อมูลเป็น JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        if (jsonData.length === 0) {
          setMessage('ไม่พบข้อมูลในไฟล์ Excel')
          setLoading(false)
          return
        }

        setMessage(`พบข้อมูล ${jsonData.length} รายการ กำลังนำเข้าสู่ฐานข้อมูล...`)

        // บันทึกลง Supabase (เปลี่ยน 'users' เป็นชื่อตารางจริงใน Supabase ของคุณ)
        const { error } = await supabase
          .from('users')
          .insert(jsonData)

        if (error) throw error

        setMessage(`นำเข้าข้อมูลสำเร็จทั้งหมด ${jsonData.length} รายการ!`)
      } catch (err) {
        console.error(err)
        setMessage(`เกิดข้อผิดพลาด: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto my-10 bg-white rounded-2xl shadow-xl space-y-6">
      <h2 className="text-2xl font-black text-slate-800 italic uppercase">
        นำเข้ารายชื่อผ่าน Excel
      </h2>
      
      <div className="border-2 border-dashed border-slate-300 p-8 rounded-2xl text-center bg-slate-50">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
        <p className="mt-3 text-xs text-slate-400">รองรับไฟล์ .xlsx, .xls และ .csv</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-bold ${loading ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}
    </div>
  )
}