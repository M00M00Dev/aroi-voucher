import { NextResponse } from 'next/server';
import { supabase, melbourneToday, displayDate } from '@/lib/supabase';

const DAY_MS = 1000 * 60 * 60 * 24;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) return NextResponse.json({ success: false, error: 'No code' }, { status: 400 });

  try {
    const { data: v, error } = await supabase()
      .from('vouchers')
      .select('customer_name, phone, value, free_items, status, expires_on, redeemed_at')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!v) return NextResponse.json({ success: false, message: 'Not found' });

    if (v.status === 'Used') {
      return NextResponse.json({ success: true, data: { status: 'REDEEMED', redeemedAt: v.redeemed_at } });
    }
    // Pending/Failed = the SMS never went out, so the customer never got this code
    if (v.status !== 'Active') {
      return NextResponse.json({ success: true, data: { status: 'NOT_ISSUED' } });
    }

    let expiryDisplay = 'No expiry date';
    if (v.expires_on) {
      const daysLeft = Math.round((Date.parse(v.expires_on) - Date.parse(melbourneToday())) / DAY_MS);
      if (daysLeft < 0) {
        return NextResponse.json({ success: true, data: { status: 'EXPIRED', expiryDisplay: displayDate(v.expires_on) } });
      }
      expiryDisplay = `${displayDate(v.expires_on)} (${daysLeft} days left)`;
    }

    return NextResponse.json({
      success: true,
      data: {
        name: v.customer_name,
        phone: v.phone,
        value: v.value,
        freeItems: v.free_items,
        expiryDisplay,
        status: 'ACTIVE',
      },
    });
  } catch (error: any) {
    console.error('Verify error:', error.message);
    return NextResponse.json({ success: false, error: 'Connection failed' }, { status: 502 });
  }
}
