import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) return NextResponse.json({ success: false, error: 'No code' }, { status: 400 });

  if (!process.env.VOUCHER_API_URL) {
    return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  try {
    const cleanCode = encodeURIComponent(code.trim().toUpperCase());
    const googleUrl = `${process.env.VOUCHER_API_URL}?action=verify&voucherId=${cleanCode}`;
    
    // Create an abort controller to stop the "forever spin" after 8 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(googleUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow', 
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await res.text(); // Get raw text first to avoid JSON parse errors
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('Verify: unexpected non-JSON response from Google:', text.slice(0, 200));
      return NextResponse.json({ success: false, error: 'Invalid response from database' }, { status: 502 });
    }

    if (data.success && data.found) {
      return NextResponse.json({ success: true, data: data.data });
    }

    return NextResponse.json({ success: false, message: 'Not found' });

  } catch (error: any) {
    const isTimeout = error.name === 'AbortError';
    console.error('Verify fetch error:', error.message);
    return NextResponse.json(
      { success: false, error: isTimeout ? 'Connection Timeout' : 'Connection failed' },
      { status: isTimeout ? 504 : 502 }
    );
  }
}