import { NextResponse } from 'next/server';
import { supabase, melbourneToday, threeMonthsFrom, displayDate } from '@/lib/supabase';

// Issuing is fool-proofed against the 2026-10-02 incident, where failed
// attempts left valid vouchers the customer never received and staff kept
// re-issuing new codes to the same person:
//  1. A voucher is inserted as 'Pending' and only becomes 'Active' once
//     Mobile Message accepts the SMS. Failed sends become 'Failed'. Only
//     'Active' vouchers can be verified or redeemed.
//  2. The form sends a requestId that stays the same until a voucher is
//     issued. Pressing Issue again after an error re-sends the SAME code
//     instead of creating a new voucher.
//  3. If an Active voucher already went to this phone in the last
//     DUPLICATE_WINDOW_MIN minutes, the request is refused unless staff
//     explicitly confirm they want a second voucher.
//  4. Expiry is always 3 months from the issue date (set here, not by the form).

const DUPLICATE_WINDOW_MIN = 30;
const SMS_TIMEOUT_MS = 20000;

// SMS send — Mobile Message (sole provider; Twilio removed 2026-07-16).
// Mobile Message is SMS-only, so the QR code goes out as a link.
async function sendVoucherSms(to: string, message: string) {
  const username = process.env.MOBILEMESSAGE_USERNAME;
  const password = process.env.MOBILEMESSAGE_PASSWORD;
  const sender   = process.env.MOBILEMESSAGE_SENDER;
  if (!username || !password || !sender) throw new Error('Mobile Message credentials are not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.mobilemessage.com.au/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ messages: [{ to, message, sender }] }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    const result = data?.results?.[0];
    if (!res.ok || !result || result.status !== 'success') {
      throw new Error(result?.status || data?.error || `Mobile Message error (HTTP ${res.status})`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('SMS provider did not respond in time');
    throw err;
  } finally {
    clearTimeout(timer);
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

// Australian mobile -> E.164 (+614xxxxxxxx), or null if it isn't one
function toAuMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('61') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^4\d{8}$/.test(local) ? `+61${local}` : null;
}

type Voucher = {
  code: string; location: string | null; customer_name: string; phone: string;
  value: string | null; free_items: string | null; status: string; expires_on: string;
};

function buildMessage(v: Voucher) {
  const hasValue = v.value && v.value.trim() !== '' && v.value !== '$0.00' && v.value !== '$';
  const hasItems = v.free_items && v.free_items.trim() !== '';
  const rewardLine = hasValue && hasItems ? `${v.value} + ${v.free_items}` : hasValue ? v.value : v.free_items || '—';
  const qrCodeUrl = `https://quickchart.io/qr?text=${v.code}&size=300&caption=${v.code}&format=png&v=.png`;

  return `Hi ${v.customer_name},

Thank you very much for your support small business.

Here is a voucher for store credit.
Reward: ${rewardLine}
Voucher Code: ${v.code}
Expired Date: ${displayDate(v.expires_on)}
QR code: ${qrCodeUrl}

Chai
Owner of ${v.location}
Khob Khun Krub. 🇹🇭🙏`;
}

// Send the SMS for a Pending/Failed voucher and record the outcome.
async function sendAndActivate(v: Voucher, mobile: string) {
  try {
    await sendVoucherSms(mobile, buildMessage(v));
  } catch (err: any) {
    await supabase().from('vouchers').update({ status: 'Failed', sms_error: err.message }).eq('code', v.code);
    console.error(`Voucher ${v.code}: SMS failed — ${err.message}`);
    return NextResponse.json({
      success: false,
      error: `SMS could not be sent (${err.message}). The voucher is NOT valid. Check the number and press Issue again — the customer will get the same code, not a new one.`,
    }, { status: 502 });
  }
  const { error } = await supabase().from('vouchers')
    .update({ status: 'Active', sms_sent_at: new Date().toISOString(), sms_error: null })
    .eq('code', v.code);
  if (error) console.error(`Voucher ${v.code}: SMS sent but activation failed — ${error.message}`);
  return NextResponse.json({ success: true, voucherId: v.code });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { location, name, phone, value, freeItems, requestId, allowDuplicate } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'Customer name is required' }, { status: 400 });
    }
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
    }
    const mobile = toAuMobile(phone);
    if (!mobile) {
      return NextResponse.json({ success: false, error: 'Enter a valid Australian mobile number (04xx-xxx-xxx)' }, { status: 400 });
    }
    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json({ success: false, error: 'Please reload the page and try again' }, { status: 400 });
    }

    const db = supabase();
    const cols = 'code, location, customer_name, phone, value, free_items, status, expires_on';

    // 1. Same form submission pressed again -> reuse that voucher, never a new code
    const { data: prior, error: priorErr } = await db.from('vouchers').select(cols).eq('request_id', requestId).maybeSingle();
    if (priorErr) throw new Error(`Could not check voucher: ${priorErr.message}`);
    if (prior) {
      if (prior.status === 'Active' || prior.status === 'Used') {
        return NextResponse.json({ success: true, voucherId: prior.code });
      }
      // Retry of a failed send: keep the same code, but use any corrected name/number
      const fixed = { ...(prior as Voucher), customer_name: name.trim(), phone: phone.trim() };
      await db.from('vouchers').update({ customer_name: fixed.customer_name, phone: fixed.phone, status: 'Pending' }).eq('code', fixed.code);
      return sendAndActivate(fixed, mobile);
    }

    // 2. Recent Active voucher to the same phone -> stop unless staff confirmed
    if (!allowDuplicate) {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MIN * 60000).toISOString();
      const { data: recent } = await db.from('vouchers')
        .select('code, phone, issued_at').eq('status', 'Active').gte('issued_at', since)
        .order('issued_at', { ascending: false });
      const match = recent?.find((r) => toAuMobile(r.phone ?? '') === mobile);
      if (match) {
        const mins = Math.max(1, Math.round((Date.now() - Date.parse(match.issued_at)) / 60000));
        return NextResponse.json({
          success: false,
          duplicate: true,
          error: `Voucher ${match.code} was already sent to this number ${mins} min ago.`,
        }, { status: 409 });
      }
    }

    // 3. Create as Pending (not usable until the SMS is sent)
    const expiresOn = threeMonthsFrom(melbourneToday());
    let voucher: Voucher | null = null;
    for (let attempt = 0; attempt < 5 && !voucher; attempt++) {
      const { data, error } = await db.from('vouchers').insert({
        code: generateVoucherCode(),
        request_id: requestId,
        status: 'Pending',
        location: location || null,
        customer_name: name.trim(),
        phone: phone.trim(),
        value: value || null,
        free_items: freeItems || null,
        expires_on: expiresOn,
      }).select(cols).single();
      if (!error) voucher = data as Voucher;
      else if (error.code !== '23505') throw new Error(`Could not save voucher: ${error.message}`);
      else if (error.message.includes('request_id')) {
        return NextResponse.json({ success: false, error: 'This voucher is already being sent — please wait.' }, { status: 409 });
      }
    }
    if (!voucher) throw new Error('Could not generate a unique voucher code');

    // 4. Send SMS -> Active, or Failed
    return sendAndActivate(voucher, mobile);

  } catch (error: any) {
    console.error('Issuance API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
