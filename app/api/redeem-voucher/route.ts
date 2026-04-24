import { NextResponse } from 'next/server';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const url = `${process.env.VOUCHER_API_URL}?action=redeem&code=${code}`;
    
    // 1. Tell Google to mark as USED
    const res = await fetch(url, {
      method: 'GET', // Apps Script handles redeems via GET
      redirect: 'follow',
      cache: 'no-store'
    });

    const data = await res.json();

    if (data.success) {
      // 2. Send the confirmation SMS to the customer
      try {
        const rawNumbers = data.phone.toString().replace(/\D/g, '');
        const cleanPhone = rawNumbers.startsWith('61') ? `+${rawNumbers}` : `+61${rawNumbers.substring(1)}`;
        const today = new Date().toLocaleDateString('en-AU');

        await client.messages.create({
          body: `Hi ${data.name}, your AROI voucher (${data.reward}) has been successfully redeemed on ${today}. Thank you!`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: cleanPhone,
        });
      } catch (smsError) {
        console.error("SMS failed but sheet updated:", smsError);
      }
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false });
  } catch (error: any) {
    console.error('Redemption API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}