import { NextResponse } from 'next/server';
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

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
    
    // Generate the unique 6-digit ID
    const voucherCode = generateVoucherCode();

    // 1. Save to Google Sheets
    const params = new URLSearchParams({
      location: location || '',
      name: name || '',
      phone: phone || '',
      value: value || '',
      freeItems: freeItems || '',
      voucherId: voucherCode,
    });

    const sheetResponse = await fetch(`${process.env.VOUCHER_API_URL}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!sheetResponse.ok) throw new Error('Google Sheets communication failed');
    const sheetData = await sheetResponse.json();
    if (!sheetData.success) throw new Error('Failed to write to Google Sheet');

    // 2. Format Phone Number for Twilio (E.164)
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
      rewardLine = freeItems;
    }

    // Format expiry date for SMS (DD/MM/YYYY)
    const dateParts = expiryDate.split('-');
    const formattedExpiry = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    // 4. Generate QR Code URL
    // IMPORTANT: We add .png at the end of the URL string so Twilio/Carriers recognize it as an image file.
    const qrCodeUrl = `https://quickchart.io/qr?text=${voucherCode}&size=300&caption=${voucherCode}&format=png&v=.png`;

    const messageBody = `Hi ${name},

Thank you very much for your support small business.

Here is a voucher for store credit.
Reward: ${rewardLine}
Voucher Code: ${voucherCode}
Expired Date: ${formattedExpiry}

Chai
Owner of ${location}
Khob Khun Krub. 🇹🇭🙏`;

    // 5. Send the MMS (SMS + QR Image) via Twilio
    await client.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      mediaUrl: [qrCodeUrl], // This sends the QR as an image attachment
      to: cleanPhone,
    });

    return NextResponse.json({ success: true, voucherId: voucherCode });

  } catch (error: any) {
    console.error('Issuance API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}