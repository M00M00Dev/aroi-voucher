import { NextResponse } from 'next/server';
import { supabase, melbourneToday } from '@/lib/supabase';

// SMS send — Mobile Message (sole provider; Twilio removed 2026-07-16 after
// confirmed working test send). Kept identical to issue-voucher/route.ts's helper.
async function sendVoucherSms(to: string, message: string) {
  const username = process.env.MOBILEMESSAGE_USERNAME;
  const password = process.env.MOBILEMESSAGE_PASSWORD;
  const sender   = process.env.MOBILEMESSAGE_SENDER;
  if (!username || !password || !sender) throw new Error('Mobile Message credentials not configured');
  const res = await fetch('https://api.mobilemessage.com.au/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ messages: [{ to, message, sender }] }),
  });
  const data = await res.json().catch(() => null);
  const result = data?.results?.[0];
  if (!res.ok || !result || result.status !== 'success') {
    throw new Error(result?.status || data?.error || `Mobile Message error (HTTP ${res.status})`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return NextResponse.json({ success: false, error: 'Voucher code is required' }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    // 1. Mark as Used — only if Active and not expired, in one atomic update,
    //    so a voucher can't be redeemed twice, unsent, or after expiry
    const { data: rows, error } = await supabase()
      .from('vouchers')
      .update({ status: 'Used', redeemed_at: new Date().toISOString() })
      .eq('code', cleanCode)
      .eq('status', 'Active')
      .gte('expires_on', melbourneToday())
      .select('customer_name, phone, value, free_items');
    if (error) throw new Error(`Could not redeem voucher: ${error.message}`);

    const voucher = rows?.[0];
    if (!voucher) {
      const { data: existing } = await supabase().from('vouchers').select('status').eq('code', cleanCode).maybeSingle();
      const reason = !existing ? 'Voucher not found'
        : existing.status === 'Used' ? 'Voucher already redeemed'
        : existing.status === 'Active' ? 'Voucher has expired'
        : 'Not a valid voucher — the SMS was never sent';
      return NextResponse.json({ success: false, error: reason });
    }

    // 2. Send the confirmation SMS to the customer
    try {
      const rawNumbers = (voucher.phone ?? '').toString().replace(/\D/g, '');
      if (!rawNumbers) throw new Error('No phone number on voucher');
      const cleanPhone = rawNumbers.startsWith('61') ? `+${rawNumbers}` : `+61${rawNumbers.substring(1)}`;
      const today = new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' });
      const value = (voucher.value ?? '').toString();
      const reward = voucher.free_items || (value.startsWith('$') ? value : `$${value}`);

      await sendVoucherSms(
        cleanPhone,
        `Hi ${voucher.customer_name}, your AROI voucher (${reward}) has been successfully redeemed on ${today}. Thank you!`,
      );
    } catch (smsError) {
      console.error("SMS failed but voucher marked used:", smsError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Redemption API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}