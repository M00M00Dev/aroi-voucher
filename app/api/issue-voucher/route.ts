import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// SMS send — Mobile Message (sole provider; Twilio removed 2026-07-16 after
// confirmed working test send).
// NOTE: Mobile Message's API is SMS-only (no MMS/image attachments), so unlike
// the old Twilio path this can't send the QR code as an attached image — it
// sends the QR code URL as a link in the message body instead. Confirmed
// acceptable trade-off (user physically received test SMS and confirmed the
// QR link renders as expected).
async function sendVoucherSms(to: string, message: string) {
  const username = process.env.MOBILEMESSAGE_USERNAME;
  const password = process.env.MOBILEMESSAGE_PASSWORD;
  const sender   = process.env.MOBILEMESSAGE_SENDER;
  if (!username || !password || !sender) throw new Error('Mobile Message credentials are not configured');
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

// Generates the 6-digit alphanumeric unique code
function generateVoucherCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { location, name, phone, value, freeItems, expiryDate } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'Customer name is required' }, { status: 400 });
    }
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
    }
    if (!expiryDate || typeof expiryDate !== 'string' || !expiryDate.includes('-')) {
      return NextResponse.json({ success: false, error: 'Expiry date is required' }, { status: 400 });
    }

    // 1. Save to Supabase (public.vouchers). Retry on the rare code collision.
    let voucherCode = '';
    for (let attempt = 0; attempt < 5 && !voucherCode; attempt++) {
      const candidate = generateVoucherCode();
      const { error } = await supabase().from('vouchers').insert({
        code: candidate,
        location: location || null,
        customer_name: name.trim(),
        phone: phone.trim(),
        value: value || null,
        free_items: freeItems || null,
        expires_on: expiryDate,
      });
      if (!error) voucherCode = candidate;
      else if (error.code !== '23505') throw new Error(`Could not save voucher: ${error.message}`);
    }
    if (!voucherCode) throw new Error('Could not generate a unique voucher code');

    // 2. Format Phone Number (E.164)
    const rawNumbers = phone.replace(/\D/g, '');
    const cleanPhone = rawNumbers.startsWith('61') ? `+${rawNumbers}` : `+61${rawNumbers.substring(1)}`;

    // 3. Construct Reward Display
    let rewardLine = "";
    const hasValue = value && value.trim() !== "" && value !== "$0.00" && value !== "$";
    const hasItems = freeItems && freeItems.trim() !== "";

    if (hasValue && hasItems) {
      rewardLine = `${value} + ${freeItems}`;
    } else if (hasValue) {
      rewardLine = value;
    } else {
      rewardLine = freeItems || "—";
    }

    // Format expiry date for SMS (DD/MM/YYYY)
    const dateParts = expiryDate.split('-');
    const formattedExpiry = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    // 4. Generate QR Code URL
    // Mobile Message's API is SMS-only (no MMS), so unlike the old Twilio path
    // this is now sent as a plain link in the text rather than an attached image.
    const qrCodeUrl = `https://quickchart.io/qr?text=${voucherCode}&size=300&caption=${voucherCode}&format=png&v=.png`;

    const messageBody = `Hi ${name.trim()},

Thank you very much for your support small business.

Here is a voucher for store credit.
Reward: ${rewardLine}
Voucher Code: ${voucherCode}
Expired Date: ${formattedExpiry}
QR code: ${qrCodeUrl}

Chai
Owner of ${location}
Khob Khun Krub. 🇹🇭🙏`;

    // 5. Send the SMS
    await sendVoucherSms(cleanPhone, messageBody);
    await supabase().from('vouchers').update({ sms_sent_at: new Date().toISOString() }).eq('code', voucherCode);

    return NextResponse.json({ success: true, voucherId: voucherCode });

  } catch (error: any) {
    console.error('Issuance API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}