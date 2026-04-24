import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) return NextResponse.json({ success: false, error: 'No code' }, { status: 400 });

  try {
    const googleUrl = `${process.env.VOUCHER_API_URL}?action=verify&voucherId=${code.trim().toUpperCase()}`;
    
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
    const data = JSON.parse(text);

    if (data.success && data.found) {
      return NextResponse.json({ success: true, data: data.data });
    }

    return NextResponse.json({ success: false, message: 'Not found' });

  } catch (error: any) {
    console.error('Fetch Error:', error.message);
    return NextResponse.json({ success: false, error: 'Connection Timeout' }, { status: 504 });
  }
}