import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ดึงรายชื่อผู้ใช้ทั้งหมด
export async function GET() {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ลบผู้ใช้ตาม ID
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}