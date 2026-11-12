import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// สร้าง Supabase Client ฝั่ง Server โดยใช้ Service Role Key (สิทธิ์ Admin)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { users } = await request.json()

    if (!users || !Array.isArray(users)) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    let successCount = 0
    let errors = []

    for (const user of users) {
      const email = user.email || user.Email
      const password = String(user.password || user.Password || '12345678') // รหัสผ่านเริ่มต้นถ้าใน Excel ไม่ได้ระบุ

      if (!email) continue

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // ยืนยันอีเมลให้อัตโนมัติ
      })

      if (error) {
        errors.push(`${email}: ${error.message}`)
      } else {
        successCount++
      }
    }

    return NextResponse.json({
      message: `นำเข้าสำเร็จ ${successCount} บัญชี`,
      errors: errors.length > 0 ? errors : null
    })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}