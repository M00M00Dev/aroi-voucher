export async function getVouchers() {
  const url = process.env.VOUCHER_API_URL;
  if (!url) throw new Error('VOUCHER_API_URL is not defined in .env.local');

  const response = await fetch(url, {
    cache: 'no-store' // This makes sure it doesn't show old data
  });
  
  if (!response.ok) throw new Error('Failed to fetch from Google Sheets');
  
  const data = await response.json();
  
  // Convert Google's 2D array into a list of objects
  const [headers, ...rows] = data;
  return rows.map((row: any) => {
    const obj: any = {};
    headers.forEach((header: string, index: number) => {
      obj[header] = row[index];
    });
    return obj;
  });
}