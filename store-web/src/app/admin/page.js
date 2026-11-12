'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

export default function ImportUsersPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorList, setErrorList] = useState([])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage('กำลังอ่านไฟล์ Excel...')
    setErrorList([])

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        if (jsonData.length === 0) {
          setMessage('ไม่พบข้อมูลในไฟล์ Excel')
          setLoading(false)
          return
        }

        setMessage(`พบข้อมูล ${jsonData.length} รายการ กำลังสร้างบัญชีผู้ใช้ใน Supabase...`)

        // =========================================================
        // เรียกใช้ API Route ที่สร้างไว้เพื่อสร้าง Auth User
        // =========================================================
        const res = await fetch('/api/import-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: jsonData }),
        })

        const result = await res.json()

        if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้างบัญชี')

        setMessage(result.message)
        if (result.errors) setErrorList(result.errors)

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
        นำเข้ารายชื่อบัญชีผู้ใช้ (Supabase Auth)
      </h2>
      
      <div className="border-2 border-dashed border-slate-300 p-8 rounded-2xl text-center bg-slate-50">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
        <p className="mt-3 text-xs text-slate-400">รองรับไฟล์ Excel ที่มีคอลัมน์ <b>email</b> (และ <b>password</b> เป็นตัวเลือกเสริม)</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-bold ${loading ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      {errorList.length > 0 && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs space-y-1">
          <p className="font-bold">รายการที่ไม่สามารถสร้างได้:</p>
          {errorList.map((err, i) => <p key={i}>• {err}</p>)}
        </div>
      )}
    </div>
  )
}