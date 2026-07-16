import { NextResponse } from 'next/server';
import twilio from 'twilio';

// SMS send — Mobile Message (default) or Twilio via SMS_PROVIDER env toggle.
// Kept identical to issue-voucher/route.ts's helper — see that file's comment
// for the MMS→SMS-only trade-off note (not relevant here, this send is text-only).
async function sendVoucherSms(to: string, message: string) {
  const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();

  if (provider === 'twilio') {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      throw new Error('Twilio credentials not configured');
    }
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to });
    return;
  }

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

    if (!process.env.VOUCHER_API_URL) {
      throw new Error('VOUCHER_API_URL is not configured');
    }

    const cleanCode = code.trim().toUpperCase();
    const url = `${process.env.VOUCHER_API_URL}?action=redeem&code=${encodeURIComponent(cleanCode)}`;

    // 1. Tell Google to mark as USED
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error('Invalid response from database');
    }

    if (data.success) {
      // 2. Send the confirmation SMS to the customer
      try {
        const rawNumbers = (data.phone ?? '').toString().replace(/\D/g, '');
        if (!rawNumbers) throw new Error('No phone number returned from sheet');
        const cleanPhone = rawNumbers.startsWith('61') ? `+${rawNumbers}` : `+61${rawNumbers.substring(1)}`;
        const today = new Date().toLocaleDateString('en-AU');

        await sendVoucherSms(
          cleanPhone,
          `Hi ${data.name}, your AROI voucher (${data.reward}) has been successfully redeemed on ${today}. Thank you!`,
        );
      } catch (smsError) {
        console.error("SMS failed but sheet updated:", smsError);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: data.error || 'Redemption failed' });
  } catch (error: any) {
    console.error('Redemption API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}