"""One-off import of the "AROI Voucher 2026" Google Sheet into Supabase public.vouchers.

Usage: python3 import_sheet.py [--dry-run]
Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from /Users/chai/aroi-services/server/.env.

The sheet's Apps Script runs in America/Los_Angeles, so every sheet date/time is
interpreted in that zone. Expiry is stored as the Melbourne calendar date.
Rows with no Voucher ID are skipped (they cannot be looked up or redeemed) and
listed on stdout. Every imported row keeps its original cells in legacy_row.
"""
import csv, json, sys, urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SHEET_TZ = ZoneInfo('America/Los_Angeles')
MEL_TZ = ZoneInfo('Australia/Melbourne')
HERE = Path(__file__).parent
CSV_PATH = HERE / 'sheet-export-2026-10-02.csv'
FORMATS = ['%m/%d/%Y %H:%M:%S', '%m/%d/%Y %H:%M', '%m/%d/%Y', '%Y-%m-%d %H:%M', '%Y-%m-%d']


def parse(s):
    s = (s or '').strip()
    if not s:
        return None
    for f in FORMATS:
        try:
            return datetime.strptime(s, f).replace(tzinfo=SHEET_TZ)
        except ValueError:
            pass
    raise ValueError(f'Unrecognised date: {s!r}')


def env():
    vals = {}
    for line in Path('/Users/chai/aroi-services/server/.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals['SUPABASE_URL'], vals['SUPABASE_SERVICE_ROLE_KEY']


def main():
    dry = '--dry-run' in sys.argv
    rows, skipped = [], []
    with CSV_PATH.open(newline='', encoding='utf-8') as f:
        for n, r in enumerate(csv.DictReader(f), start=2):
            code = (r['Voucher ID'] or '').strip().upper()
            if not code:
                skipped.append((n, r['Timestamp']))
                continue
            expires = parse(r['Expired date'])
            rows.append({
                'code': code,
                'location': r['Location'] or None,
                'customer_name': r['Customer Name'] or None,
                'phone': r['Phone'] or None,
                'value': r['Value'] or None,
                'free_items': r['Free Item/s'] or None,
                'status': 'Used' if r['Status'].strip().lower() in ('used', 'redeemed') else 'Active',
                'issued_at': parse(r['Timestamp']).isoformat(),
                'expires_on': expires.astimezone(MEL_TZ).date().isoformat() if expires else None,
                'redeemed_at': (d.isoformat() if (d := parse(r['Redeemed At'])) else None),
                'source': 'sheet_import',
                'legacy_row': {'sheet_row': n, **r},
            })

    print(f'{len(rows)} rows to import, {len(skipped)} skipped (no Voucher ID):')
    for n, ts in skipped:
        print(f'  sheet row {n} ({ts})')
    if dry:
        print(json.dumps(rows[:2], indent=2))
        return

    url, key = env()
    req = urllib.request.Request(
        f'{url}/rest/v1/vouchers?on_conflict=code',
        data=json.dumps(rows).encode(),
        method='POST',
        headers={
            'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
            # ignore-duplicates: re-running never overwrites a row the app has since changed
            'Prefer': 'resolution=ignore-duplicates,return=representation',
        },
    )
    with urllib.request.urlopen(req) as res:
        print(f'Inserted {len(json.load(res))} new rows (HTTP {res.status})')


if __name__ == '__main__':
    main()
