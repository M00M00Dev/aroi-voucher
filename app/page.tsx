'use client';

import { useState } from 'react';
import { Send, Store, User, Phone, Tag, Calendar, ChevronDown, Gift } from 'lucide-react';

export default function IssueVoucher() {
  const [loading, setLoading] = useState(false);
  
  const getExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 60);
    return date.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    location: 'Maruay Thai',
    name: '',
    phone: '',
    value: '',
    freeItems: '',
    expiryDate: getExpiryDate(),
  });

  const formatPhone = (value: string) => {
    const nums = value.replace(/\D/g, '');
    if (nums.length <= 4) return nums;
    if (nums.length <= 7) return `${nums.slice(0, 4)}-${nums.slice(4)}`;
    return `${nums.slice(0, 4)}-${nums.slice(4, 7)}-${nums.slice(7, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, phone: formatPhone(e.target.value) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/issue-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData), // Voucher code is now generated on server
      });
      
      const data = await res.json();
      if (data.success) {
        alert(`Success! Voucher ${data.voucherId} issued.`);
        setFormData({ ...formData, name: '', phone: '', value: '', freeItems: '' });
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert("System Error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F3F4F6] py-10 px-4 font-sans text-[#111827]">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black italic tracking-tighter flex items-center justify-center gap-2 uppercase">
          AROI <span className="text-[#F97316]">VOUCHER</span>
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 mt-1">
          Issuance System • Updated Template
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-[40px] shadow-xl border border-gray-100 p-10 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase text-gray-400">Location</label>
              <div className="relative">
                <Store className="absolute left-4 top-3.5 text-orange-500" size={18} />
                <select 
                  className="w-full pl-12 pr-10 py-3.5 bg-gray-50 rounded-2xl text-sm font-bold outline-none ring-1 ring-gray-100 focus:ring-orange-500 appearance-none"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                >
                  <option>Maruay Thai</option>
                  <option>PAD Thai Food</option>
                </select>
                <ChevronDown className="absolute right-4 top-3.5 text-gray-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase text-gray-400">Customer Name</label>
              <div className="relative">
                <User className="absolute left-4 top-3.5 text-orange-500" size={18} />
                <input 
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 rounded-2xl text-sm font-bold outline-none ring-1 ring-gray-100 focus:ring-orange-500"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-gray-400">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 text-orange-500" size={16} />
                  <input required type="tel" className="w-full pl-10 pr-2 py-3.5 bg-gray-50 rounded-2xl text-[12px] font-bold outline-none ring-1 ring-gray-100 focus:ring-orange-500" placeholder="04xx-xxx-xxx" value={formData.phone} onChange={handlePhoneChange} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-gray-400">Expiry</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input readOnly className="w-full pl-10 pr-2 py-3.5 bg-gray-100 rounded-2xl text-[12px] font-bold text-gray-500" value={formData.expiryDate} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-gray-400">Value ($)</label>
                <div className="relative">
                  <Tag className="absolute left-3.5 top-3.5 text-orange-500" size={16} />
                  <input className="w-full pl-10 pr-2 py-3.5 bg-gray-50 rounded-2xl text-[12px] font-bold outline-none ring-1 ring-gray-100 focus:ring-orange-500" placeholder="10" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-gray-400">Free Item</label>
                <div className="relative">
                  <Gift className="absolute left-3.5 top-3.5 text-orange-500" size={16} />
                  <input className="w-full pl-10 pr-2 py-3.5 bg-gray-50 rounded-2xl text-[12px] font-bold outline-none ring-1 ring-gray-100 focus:ring-orange-500" placeholder="e.g. Soda" value={formData.freeItems} onChange={(e) => setFormData({...formData, freeItems: e.target.value})} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#F97316] to-[#FBBF24] text-white font-black italic tracking-tighter py-4 rounded-2xl shadow-lg disabled:opacity-50 uppercase flex items-center justify-center gap-2">
              {loading ? "PROCESSING..." : <><Send size={20} /> Issue Voucher</>}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}