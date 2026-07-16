'use client';

import { useState } from 'react';
import { 
  Search, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  User, 
  Calendar, 
  Phone, 
  AlertTriangle, 
  Gift,
  ArrowRight
} from 'lucide-react';

export default function VerifyVoucher() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'found' | 'error' | 'redeemed' | 'expired'>('idle');
  const [voucher, setVoucher] = useState<any>(null);

  // Helper to format technical timestamps to "20 Apr 2026 at 13:46"
  const formatRedeemDate = (dateString: string) => {
    if (!dateString || dateString === "Recently") return "Recently";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', ' at');
    } catch (e) {
      return dateString;
    }
  };

  // Helper to format currency values correctly
  const formatCurrency = (val: any) => {
    if (!val || val === "0" || val === 0 || val === "") return null;
    const numericValue = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val;
    if (isNaN(numericValue)) return null;
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(numericValue);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (code.length < 6) return;

    setStatus('loading');
    setVoucher(null); 

    try {
      const res = await fetch(`/api/verify-voucher?code=${code.toUpperCase().trim()}`);
      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();

      if (data.success && data.data) {
        setVoucher(data.data);
        if (data.data.status === "REDEEMED") {
          setStatus('redeemed');
        } else if (data.data.status === "EXPIRED") {
          setStatus('expired');
        } else {
          setStatus('found');
        }
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  const handleRedeem = async () => {
    if (!confirm("Confirm Redemption? This will void the voucher permanently.")) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/redeem-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.toUpperCase().trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setVoucher((prev: any) => ({ ...prev, status: "JUST_REDEEMED" }));
        setStatus('redeemed');
      } else {
        alert("Redemption failed.");
        setStatus('found');
      }
    } catch (err) {
      setStatus('found');
    }
  };

  const renderRewardDisplay = (isSuccessScreen: boolean = false) => {
    if (!voucher) return null;
    
    const formattedVal = formatCurrency(voucher.value);
    const items = voucher.freeItems;
    
    const hasValue = formattedVal !== null;
    const hasItems = items && items.trim() !== "";

    if (isSuccessScreen) {
      if (hasValue && hasItems) return `${formattedVal} + ${items}`;
      return hasValue ? formattedVal : items;
    }

    if (hasValue && hasItems) {
      return (
        <div className="flex flex-col">
          <span className="text-3xl font-black italic tracking-tighter text-white">{formattedVal}</span>
          <span className="text-orange-500 font-bold text-sm uppercase mt-1">+ {items}</span>
        </div>
      );
    }
    if (hasValue) return <span className="text-3xl font-black italic tracking-tighter text-white">{formattedVal}</span>;
    if (hasItems) return <span className="text-2xl font-black italic uppercase text-orange-400 leading-tight">{items}</span>;
    return <span className="text-xl font-bold opacity-30 italic text-white">No Reward Found</span>;
  };

  return (
    <main className="min-h-screen bg-[#070B14] text-white p-6 font-sans selection:bg-orange-500/30 flex flex-col items-center">
      <div className="max-w-md w-full pt-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">
            AROI <span className="text-orange-500">STAFF ONLY</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mt-2">Voucher Verification • v3.2 Stable</p>
        </div>

        <form onSubmit={handleSearch} className="relative mb-8">
          <input
            className="w-full bg-slate-900/50 border-2 border-slate-800 rounded-3xl py-5 px-8 text-2xl font-mono tracking-[0.4em] uppercase outline-none focus:border-orange-500 text-center transition-all"
            placeholder="XXXXXX"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="absolute right-3 top-3 bg-orange-500 p-4 rounded-2xl active:scale-95 transition-all">
            <Search size={20} />
          </button>
        </form>

        <div className="space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center py-20 animate-pulse">
              <Loader2 className="animate-spin text-orange-500 mb-4" size={50} strokeWidth={3} />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 text-center">Accessing Database...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-[40px] text-center animate-in zoom-in-95">
              <XCircle className="mx-auto text-red-500 mb-4" size={50} />
              <h2 className="text-xl font-black text-red-500 uppercase tracking-tighter">Code Not Found</h2>
              <button onClick={() => setStatus('idle')} className="mt-6 text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-500 px-8 py-3 rounded-full">Try Again</button>
            </div>
          )}

          {status === 'expired' && (
            <div className="bg-slate-800/80 border border-slate-700 p-8 rounded-[40px] text-center animate-in zoom-in-95">
              <AlertTriangle className="mx-auto text-slate-400 mb-4" size={50} />
              <h2 className="text-xl font-black text-slate-300 uppercase tracking-tighter">Voucher Expired</h2>
              <p className="text-slate-500 text-sm mt-2">Expired: {voucher?.expiryDisplay}</p>
              <button onClick={() => { setCode(''); setStatus('idle'); setVoucher(null); }} className="mt-6 text-[10px] font-black uppercase tracking-widest bg-slate-700 text-slate-300 px-8 py-3 rounded-full">Scan Next</button>
            </div>
          )}

          {status === 'found' && voucher && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-[40px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 flex items-center gap-1"><User size={10} /> Customer</p>
                  <h2 className="text-3xl font-bold tracking-tighter leading-tight">{voucher.name}</h2>
                  <div className="flex items-center gap-2 mt-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 w-fit">
                    <Phone size={10} className="text-orange-500" />
                    <p className="text-xs font-mono font-bold text-slate-400">{voucher.phone}</p>
                  </div>
                </div>
                <div className="bg-green-500/20 text-green-400 px-4 py-1 rounded-full text-[10px] font-black border border-green-500/20 uppercase tracking-widest">Active</div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-[28px] border border-slate-700/50 shadow-inner">
                  <p className="text-[10px] uppercase text-orange-500 font-black tracking-widest mb-3 flex items-center gap-2"><Gift size={14} /> Reward</p>
                  {renderRewardDisplay(false)}
                </div>
                <div className="bg-slate-900/40 p-5 rounded-[28px] border border-slate-800/50 flex justify-between items-center">
                  <p className="text-sm font-bold text-slate-200">{voucher.expiryDisplay}</p>
                  <Calendar size={20} className="text-slate-700" />
                </div>
              </div>

              <button onClick={handleRedeem} className="w-full bg-white text-black font-black py-5 rounded-3xl hover:bg-orange-500 hover:text-white transition-all uppercase italic text-xl active:scale-95 shadow-lg shadow-white/5">
                Confirm Redemption
              </button>
            </div>
          )}

          {status === 'redeemed' && (
            <div className={`p-10 rounded-[40px] text-center text-white shadow-2xl animate-in zoom-in-95 ${voucher?.status === "REDEEMED" ? 'bg-amber-600 shadow-amber-900/40' : 'bg-green-600 shadow-green-900/40'}`}>
              {voucher?.status === "REDEEMED" ? (
                <>
                  <AlertTriangle className="mx-auto mb-4" size={64} />
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter">Already Used</h2>
                  <div className="mt-4 p-5 bg-black/20 rounded-3xl">
                    <p className="text-[10px] uppercase font-black tracking-widest mb-1 text-white/50">Redemption Recorded</p>
                    <p className="font-mono font-bold text-xl text-white">{formatRedeemDate(voucher.redeemedAt)}</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="mx-auto mb-6" size={70} />
                  <h2 className="text-4xl font-black italic uppercase mb-2">Success</h2>
                  <div className="bg-black/10 p-5 rounded-3xl inline-block mb-6 border border-white/5 w-full">
                    <p className="text-[10px] font-black uppercase text-white/50 mb-2 tracking-widest">Items Redeemed</p>
                    <p className="text-2xl font-black italic uppercase tracking-tight text-white leading-tight">
                      {renderRewardDisplay(true)}
                    </p>
                  </div>
                  <p className="font-bold text-white/80 text-sm italic uppercase tracking-widest">Voucher Voided & SMS Sent</p>
                </>
              )}
              <button onClick={() => { setCode(''); setStatus('idle'); setVoucher(null); }} className="mt-8 bg-slate-950 text-white w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-colors">
                Scan Next <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}