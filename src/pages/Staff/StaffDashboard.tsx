import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellRing, Map, Megaphone, BarChart2, Users,
  CheckCircle, Sparkles, LogOut, RefreshCw,
  UserPlus, Copy, ExternalLink, Download,
  Mail, Phone, QrCode, Trash2, Shield
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar/Navbar';
import GlassCard from '../../components/GlassCard/GlassCard';
import Button from '../../components/Button/Button';
import SeverityBadge from '../../components/Badge/SeverityBadge';
import HotelMap from '../../components/HotelMap/HotelMap';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import type { RoomStatus, GuestRecord, StatsResponse, RegisterGuestResponse, ApiAlert, ApiBroadcast } from '../../api/client';
import { db } from '../../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

type Tab = 'register' | 'alerts' | 'map' | 'guests' | 'broadcast' | 'occupancy' | 'staff';

// ─── helpers ──────────────────────────────────────────────────────────────────
const LANGUAGES = [
  'English', 'Hindi', 'Spanish', 'French', 'Arabic',
  'German', 'Chinese', 'Japanese', 'Russian', 'Portuguese',
] as const;

const SEV_BORDER: Record<number, string> = {
  1: 'border-l-green-500', 2: 'border-l-yellow-500', 3: 'border-l-orange-500',
  4: 'border-l-red-500',   5: 'border-l-red-900',
};
const TARGET_LABELS: Record<string, string> = {
  all: 'All Guests', floor1: 'Floor 1', floor2: 'Floor 2', floor3: 'Floor 3',
};
const BROADCAST_SUGGESTIONS: Record<string, string> = {
  all:    'Attention all guests: An emergency has been reported. Please follow exit signs and evacuate calmly.',
  floor1: 'Floor 1 guests: Please evacuate immediately using Stairwell A or B. Avoid corridor near rooms 102–103.',
  floor2: 'Floor 2 guests: A precautionary evacuation is underway. Proceed calmly to the nearest stairwell.',
  floor3: 'Floor 3 guests: Please remain in your rooms until further instructions from staff.',
};
const INPUT = 'w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-gold transition-colors text-sm';

// ─── Register Guest Tab ───────────────────────────────────────────────────────
function RegisterGuestTab() {
  const [form, setForm] = useState({
    name: '', roomNumber: '', language: 'English' as string, email: '', mobile: '', guestsCount: 1,
  });
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [result,    setResult]    = useState<RegisterGuestResponse | null>(null);
  const [qrUrl,     setQrUrl]     = useState('');
  const qrRef = useRef<SVGSVGElement>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())       e.name       = 'Guest name is required';
    if (!form.roomNumber)        e.roomNumber  = 'Room number is required';
    else if (Number(form.roomNumber) < 101 || Number(form.roomNumber) > 310)
                                 e.roomNumber  = 'Room must be between 101 and 310';
    if (!form.email.trim())      e.email       = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address';
    if (!form.mobile.trim())     e.mobile      = 'Mobile number is required';
    return e;
  };

  const handleRegister = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      const res = await api.registerGuest({
        name:       form.name.trim(),
        roomNumber: Number(form.roomNumber),
        language:   form.language,
        email:      form.email.trim(),
        mobile:     form.mobile.trim(),
        guestsCount: form.guestsCount,
      });
      const url = `${window.location.origin}/guest-login?token=${res.token}`;
      setQrUrl(url);
      setResult(res);
      toast.success(`QR code generated for ${res.guest.name}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    if (!result) return;
    navigator.clipboard.writeText(qrUrl);
    toast.success('Link copied to clipboard!');
  };

  const openGuestView = () => {
    if (!result) return;
    window.open(qrUrl, '_blank');
  };

  const resetForm = () => {
    setResult(null);
    setQrUrl('');
    setForm({ name: '', roomNumber: '', language: 'English', email: '', mobile: '', guestsCount: 1 });
    setErrors({});
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas  = document.createElement('canvas');
    canvas.width  = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const a  = document.createElement('a');
      a.href   = canvas.toDataURL('image/png');
      a.download = `safepath-room${result?.guest.roomNumber ?? ''}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <UserPlus size={22} className="text-gold" />
        <h2 className="font-playfair text-white text-2xl font-semibold">Register Guest</h2>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Registration Form ── */}
        {!result && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-xl"
          >
            <GlassCard>
              <p className="text-white/50 text-sm mb-5">
                Fill in guest details. A unique QR code will be generated and sent to the guest's email and mobile.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="text-white/50 text-xs mb-1 block">Guest Full Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setErrors((p) => ({ ...p, name: '' })); }}
                    placeholder="e.g. Rahul Mehta"
                    className={INPUT}
                  />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                </div>

                {/* Room */}
                <div>
                  <label className="text-white/50 text-xs mb-1 block">Room Number *</label>
                  <input
                    value={form.roomNumber}
                    onChange={(e) => { setForm((p) => ({ ...p, roomNumber: e.target.value })); setErrors((p) => ({ ...p, roomNumber: '' })); }}
                    type="number"
                    placeholder="101 – 310"
                    className={INPUT}
                  />
                  {form.roomNumber && (
                    <p className="text-gold text-xs mt-1">
                      📍 Floor {Number(form.roomNumber) < 200 ? 1 : Number(form.roomNumber) < 300 ? 2 : 3}
                    </p>
                  )}
                  {errors.roomNumber && <p className="text-red-400 text-xs mt-1">{errors.roomNumber}</p>}
                </div>

                {/* Language */}
                <div>
                  <label className="text-white/50 text-xs mb-1 block">Language Preference *</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
                    className={`${INPUT} appearance-none`}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-navy">{l}</option>
                    ))}
                  </select>
                </div>

                {/* Email */}
                <div>
                  <label className="text-white/50 text-xs mb-1 flex items-center gap-1">
                    <Mail size={11} /> Guest Email *
                  </label>
                  <input
                    value={form.email}
                    onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setErrors((p) => ({ ...p, email: '' })); }}
                    type="email"
                    placeholder="guest@example.com"
                    className={INPUT}
                  />
                  {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                </div>

                {/* Mobile */}
                <div>
                  <label className="text-white/50 text-xs mb-1 flex items-center gap-1">
                    <Phone size={11} /> Mobile Number *
                  </label>
                  <input
                    value={form.mobile}
                    onChange={(e) => { setForm((p) => ({ ...p, mobile: e.target.value })); setErrors((p) => ({ ...p, mobile: '' })); }}
                    type="tel"
                    placeholder="+91 9876543210"
                    className={INPUT}
                  />
                  {errors.mobile && <p className="text-red-400 text-xs mt-1">{errors.mobile}</p>}
                </div>

                {/* No of Guests */}
                <div>
                  <label className="text-white/50 text-xs mb-1 block">Number of Guests</label>
                  <input
                    value={form.guestsCount}
                    onChange={(e) => setForm((p) => ({ ...p, guestsCount: Number(e.target.value) || 1 }))}
                    type="number"
                    min="1"
                    max="10"
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="mt-5">
                <Button variant="gold" fullWidth onClick={handleRegister} disabled={loading}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        ⟳
                      </motion.span>
                      Generating QR Code…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <QrCode size={16} /> Register Guest & Generate QR
                    </span>
                  )}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── QR Generated ── */}
        {result && (
          <motion.div
            key="qr-result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-2xl"
          >
            {/* Success banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 bg-safe/10 border border-green-500/30 rounded-2xl px-5 py-4 mb-5"
            >
              <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-300 font-semibold text-sm">Guest Registered Successfully!</p>
                <p className="text-white/50 text-xs mt-0.5">
                  QR code and welcome message sent to{' '}
                  <span className="text-white/80">{result.guest.email}</span> and{' '}
                  <span className="text-white/80">{result.guest.mobile}</span>
                </p>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* QR Code Panel */}
              <GlassCard className="flex flex-col items-center gap-4">
                <p className="text-white/60 text-sm font-medium">Guest QR Code</p>

                {/* QR code with white background */}
                <div className="p-4 bg-white rounded-2xl shadow-xl">
                  <QRCodeSVG
                    ref={qrRef}
                    value={qrUrl}
                    size={180}
                    level="H"
                    includeMargin={false}
                    fgColor="#0A1628"
                  />
                </div>

                <div className="w-full flex flex-col gap-2">
                  <button
                    onClick={downloadQR}
                    className="w-full flex items-center justify-center gap-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-xl py-2 transition-all"
                  >
                    <Download size={13} /> Download QR
                  </button>
                  <button
                    onClick={copyToken}
                    className="w-full flex items-center justify-center gap-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-xl py-2 transition-all"
                  >
                    <Copy size={13} /> Copy Guest Link
                  </button>
                </div>
              </GlassCard>

              {/* Guest Info Panel */}
              <div className="flex flex-col gap-4">
                <GlassCard>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Guest Details</p>
                  <div className="space-y-2.5">
                    {[
                      ['Name',     result.guest.name],
                      ['Room',     `Room ${result.guest.roomNumber} · Floor ${result.guest.floor}`],
                      ['Language', result.guest.language],
                      ['Guests',   String(form.guestsCount)],
                      ['Email',    result.guest.email],
                      ['Mobile',   result.guest.mobile],
                      ['Check-in', result.guest.checkinDatetime.replace('T', ' ')],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-white/40 text-xs w-16 flex-shrink-0 pt-0.5">{label}</span>
                        <span className="text-white text-sm font-medium">{val}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Demo Actions</p>
                  <div className="space-y-2">
                    <Button variant="gold" fullWidth onClick={openGuestView} className="flex items-center justify-center gap-2">
                      <ExternalLink size={14} />
                      Open Guest View (Demo)
                    </Button>
                    <Button variant="ghost" fullWidth onClick={resetForm}>
                      + Register Another Guest
                    </Button>
                  </div>
                </GlassCard>
              </div>
            </div>

            {/* Token display */}
            <div className="mt-4 bg-black/30 rounded-xl p-3 border border-white/10">
              <p className="text-white/30 text-xs mb-1">Guest login URL (scan to open)</p>
              <p className="text-white/60 text-xs font-mono break-all">{qrUrl}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Guests Tab ───────────────────────────────────────────────────────────────
function GuestsTab() {
  const [guests,      setGuests]      = useState<GuestRecord[]>([]);
  const [showAll,     setShowAll]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const [selectedGuestQR, setSelectedGuestQR] = useState<{name: string, url: string} | null>(null);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try { setGuests(await api.getGuests(showAll ? 'all' : 'active')); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to fetch guests'); }
    finally { setLoading(false); }
  }, [showAll]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const handleCheckout = async (roomNumber: number) => {
    setCheckingOut(roomNumber);
    try {
      const res = await api.checkout(roomNumber);
      toast.success(res.message);
      fetchGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCheckingOut(null);
    }
  };

  const active = guests.filter((g) => g.status === 'active');
  const past   = guests.filter((g) => g.status === 'checked_out');

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-gold" />
          <h2 className="font-playfair text-white text-2xl font-semibold">Guest Registry</h2>
          {active.length > 0 && (
            <span className="bg-safe/20 text-green-400 text-xs font-bold px-2.5 py-1 rounded-full">
              {active.length} checked in
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((p) => !p)}
            className="text-xs text-white/50 hover:text-white border border-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            {showAll ? 'Active only' : 'Show all'}
          </button>
          <button onClick={fetchGuests} className="text-white/40 hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Currently Checked In</h3>

      {active.length === 0 ? (
        <div className="flex items-center gap-3 text-white/40 py-10 justify-center">
          <Users size={24} />
          <span className="text-sm">No active guests — register one via the Register tab.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 mb-6">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-navy-light border-b border-white/10">
                {['Guest', 'Room', 'Floor', 'Language', 'Email', 'Mobile', 'Check-in Date & Time', 'Action'].map((h) => (
                  <th key={h} className="py-3 px-4 text-left text-white/50 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {active.map((g) => (
                  <motion.tr
                    key={g.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4 text-white font-semibold flex items-center gap-2">
                        {g.guest_name}
                        {g.qr_token && (
                            <button 
                                onClick={() => setSelectedGuestQR({
                                    name: g.guest_name,
                                    url: `${window.location.origin}/guest-login?token=${g.qr_token}`
                                })}
                                className="text-gold/60 hover:text-gold transition-colors"
                                title="View Guest QR"
                            >
                                <QrCode size={14} />
                            </button>
                        )}
                    </td>
                    <td className="py-3 px-4 text-gold font-bold">{g.room_number}</td>
                    <td className="py-3 px-4 text-white/60">{g.floor}</td>
                    <td className="py-3 px-4">
                      <span className="bg-white/10 text-white/70 rounded-full text-xs px-2 py-0.5">{g.language}</span>
                    </td>
                    <td className="py-3 px-4 text-white/60 text-xs">{g.email || '—'}</td>
                    <td className="py-3 px-4 text-white/60 text-xs">{g.mobile || '—'}</td>
                    <td className="py-3 px-4 text-white/70 text-xs">
                      <div>{g.checkin_datetime.split('T')[0]}</div>
                      <div className="text-white/40">{g.checkin_datetime.split('T')[1] ?? ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleCheckout(g.room_number)}
                        disabled={checkingOut === g.room_number}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 rounded-lg px-3 py-1.5 transition-all mx-auto disabled:opacity-50"
                      >
                        <LogOut size={12} />
                        {checkingOut === g.room_number ? 'Checking out…' : 'Check Out'}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {showAll && past.length > 0 && (
        <div>
          <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
            Previous Check-outs ({past.length})
          </h3>
          <div className="overflow-x-auto rounded-xl border border-white/10 opacity-60">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-navy-light border-b border-white/10">
                  {['Guest', 'Room', 'Language', 'Check-in', 'Check-out'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left text-white/40 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {past.map((g) => (
                  <tr key={g.id} className="border-b border-white/5">
                    <td className="py-2 px-4 text-white/60">{g.guest_name}</td>
                    <td className="py-2 px-4 text-white/40">{g.room_number}</td>
                    <td className="py-2 px-4 text-white/40 text-xs">{g.language}</td>
                    <td className="py-2 px-4 text-white/40 text-xs">{g.checkin_datetime}</td>
                    <td className="py-2 px-4 text-white/40 text-xs">{g.checkout_datetime ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QR Modal */}
      <AnimatePresence>
        {selectedGuestQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm"
            onClick={() => setSelectedGuestQR(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-navy border border-white/20 rounded-2xl p-6 shadow-2xl flex flex-col items-center"
            >
              <h3 className="text-white text-lg font-playfair font-semibold mb-1">{selectedGuestQR.name}'s QR Code</h3>
              <p className="text-white/50 text-xs mb-5">Scan to access the live guest emergency guide</p>
              <div className="p-4 bg-white rounded-xl mb-5">
                <QRCodeSVG
                  value={selectedGuestQR.url}
                  size={200}
                  level="H"
                  includeMargin={false}
                  fgColor="#0A1628"
                />
              </div>
              <Button variant="ghost" fullWidth onClick={() => setSelectedGuestQR(null)}>
                Close
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Occupancy Tab ────────────────────────────────────────────────────────────
function OccupancyTab({ stats }: { stats: StatsResponse | null }) {
  if (!stats) return (
    <div className="flex items-center gap-2 text-white/40 py-12 justify-center">
      <RefreshCw size={18} className="animate-spin" />
      <span className="text-sm">Loading occupancy data…</span>
    </div>
  );
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BarChart2 size={22} className="text-gold" />
        <h2 className="font-playfair text-white text-2xl font-semibold">Occupancy Overview</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.byFloor.map((f) => (
          <GlassCard key={f.floor}>
            <div className="text-gold font-playfair text-4xl font-bold mb-2">Floor {f.floor}</div>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div><div className="text-2xl font-bold text-white">{f.total}</div><div className="text-white/40 text-xs">Rooms</div></div>
              <div><div className="text-2xl font-bold text-red-400">{f.occupied}</div><div className="text-white/40 text-xs">Occupied</div></div>
              <div><div className="text-2xl font-bold text-green-400">{f.total - f.occupied}</div><div className="text-white/40 text-xs">Free</div></div>
            </div>
            <div className="bg-white/10 h-2 rounded-full overflow-hidden">
              <div className="bg-gold h-2 rounded-full transition-all" style={{ width: `${(f.occupied / f.total) * 100}%` }} />
            </div>
            <div className="text-white/30 text-xs mt-1 text-right">{Math.round((f.occupied / f.total) * 100)}% occupied</div>
          </GlassCard>
        ))}
      </div>
      <div className="flex gap-6 text-sm text-white/60">
        <span>Total: <span className="text-white font-bold">{stats.total}</span></span>
        <span>Occupied: <span className="text-red-400 font-bold">{stats.occupied}</span></span>
        <span>Available: <span className="text-green-400 font-bold">{stats.available}</span></span>
      </div>
    </div>
  );
}

// ─── Staff Management Tab ────────────────────────────────────────────────────────────
function StaffManagementTab() {
  const [staffList, setStaffList] = useState<import('../../api/client').ApiStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [newStaff, setNewStaff] = useState({ staff_id: '', name: '', pin: '' });

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try { setStaffList(await api.getStaff()); }
    catch (err) { toast.error('Failed to load staff list'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleCreate = async () => {
    if (!newStaff.staff_id.trim() || !newStaff.name.trim() || !newStaff.pin.trim()) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      await api.addStaff({ ...newStaff, staff_id: newStaff.staff_id.trim() });
      toast.success('Staff added successfully');
      setNewStaff({ staff_id: '', name: '', pin: '' });
      fetchStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add staff');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Are you sure you want to remove staff ${id}?`)) return;
    try {
      await api.deleteStaff(id);
      toast.success('Staff removed');
      fetchStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove staff');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Shield size={22} className="text-gold" />
          <h2 className="font-playfair text-white text-2xl font-semibold">Staff Registry</h2>
        </div>
        <button onClick={fetchStaff} className="text-white/40 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-light border-b border-white/10">
                  <th className="py-3 px-4 text-left text-white/50 font-medium">Staff ID</th>
                  <th className="py-3 px-4 text-left text-white/50 font-medium">Name</th>
                  <th className="py-3 px-4 text-left text-white/50 font-medium">Role</th>
                  <th className="py-3 px-4 text-right text-white/50 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {staffList.map((s) => (
                    <motion.tr key={s.staff_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-gold font-bold">{s.staff_id}</td>
                      <td className="py-3 px-4 text-white font-medium">{s.name}</td>
                      <td className="py-3 px-4 text-white/60 capitalize">{s.role}</td>
                      <td className="py-3 px-4 text-right">
                        {s.staff_id !== 'admin' && (
                          <button onClick={() => handleDelete(s.staff_id)} className="text-red-400 hover:text-red-300 transition-colors" title="Remove Staff">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <GlassCard>
            <p className="text-white/50 text-sm mb-4">Add New Staff Member</p>
            <div className="space-y-3">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Staff ID</label>
                <input value={newStaff.staff_id} onChange={(e) => setNewStaff(p => ({...p, staff_id: e.target.value}))} placeholder="e.g. SP-1234" className={INPUT} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Name</label>
                <input value={newStaff.name} onChange={(e) => setNewStaff(p => ({...p, name: e.target.value}))} placeholder="e.g. John Doe" className={INPUT} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Security PIN</label>
                <input value={newStaff.pin} onChange={(e) => setNewStaff(p => ({...p, pin: e.target.value}))} type="password" placeholder="••••" className={INPUT} />
              </div>
              <Button variant="gold" fullWidth onClick={handleCreate} className="mt-2 text-sm py-2" disabled={loading}>
                Create Account
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StaffDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('register');
  const [broadcastTarget, setBroadcastTarget] = useState<string>('all');
  const [broadcastText,   setBroadcastText]   = useState('');
  const [rooms,  setRooms]  = useState<RoomStatus[]>([]);
  const [stats,  setStats]  = useState<StatsResponse | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [broadcastMessages, setBroadcastMessages] = useState<ApiBroadcast[]>([]);

  const dangerZones      = useAppStore((s) => s.dangerZones);
  const toggleDangerZone = useAppStore((s) => s.toggleDangerZone);
  const setActiveRole    = useAppStore((s) => s.setActiveRole);

  const activeAlerts   = alerts.filter((a) => a.status === 'active');
  const resolvedAlerts = alerts.filter((a) => a.status === 'acknowledged');

  // Continuous SOS Alarm with mute support
  const [lastAlertCount, setLastAlertCount] = useState(0);
  
  useEffect(() => {
    if (activeAlerts.length > lastAlertCount) {
      setIsMuted(false); // New alert arrives -> unmute
    }
    setLastAlertCount(activeAlerts.length);
  }, [activeAlerts.length, lastAlertCount]);

  useEffect(() => {
    // Stop siren if muted or no alerts
    if (activeAlerts.length === 0 || isMuted) {
      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch(e) {}
        oscRef.current = null;
      }
      return;
    }

    // Play/continue siren
    if (!oscRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.value = 0.1;

        const interval = setInterval(() => {
          if (!oscRef.current) return clearInterval(interval);
          const freq = osc.frequency.value === 800 ? 1200 : 800;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
        }, 300);

        osc.start();
        oscRef.current = osc;

        return () => {
          clearInterval(interval);
        };
      } catch(e) {}
    }
  }, [activeAlerts.length, isMuted]);

  const fetchRooms = useCallback(async () => {
    try { setRooms(await api.getRooms()); } catch { /* offline */ }
  }, []);
  const fetchStats = useCallback(async () => {
    try { setStats(await api.getStats()); } catch { /* offline */ }
  }, []);
  const fetchAlerts = useCallback(async () => {
    try { setAlerts(await api.getAlerts()); } catch { /* offline */ }
  }, []);
  const fetchBroadcasts = useCallback(async () => {
    try { setBroadcastMessages(await api.getBroadcasts()); } catch { /* offline */ }
  }, []);

  const acknowledgeAlert = async (id: number) => {
    try {
      await api.acknowledgeAlert(id);
      fetchAlerts();
    } catch { /* offline */ }
  };

  useEffect(() => { 
    setActiveRole('staff');
    fetchRooms(); fetchStats(); fetchAlerts(); fetchBroadcasts(); 
    
    // Real-time Firestore listeners
    const alertsQuery = query(collection(db, 'alerts'), orderBy('timestamp', 'desc'));
    const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          // Ensure severity is a number for the badge to work
          severity: Number(d.severity || 1)
        } as any;
      });
      setAlerts(data);
    });

    const broadcastsQuery = query(collection(db, 'broadcasts'), orderBy('timestamp', 'desc'), limit(10));
    const unsubBroadcasts = onSnapshot(broadcastsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setBroadcastMessages(data);
    });

    return () => {
      unsubAlerts();
      unsubBroadcasts();
    };
  }, [fetchRooms, fetchStats, fetchAlerts, fetchBroadcasts, setActiveRole]);

  useEffect(() => {
    if (activeTab === 'map' || activeTab === 'occupancy') { fetchRooms(); fetchStats(); }
  }, [activeTab, fetchRooms, fetchStats]);

  const NAV: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'register',  label: 'Register Guest', icon: <UserPlus size={17} /> },
    { id: 'alerts',    label: 'Alerts',         icon: <BellRing size={17} />, badge: activeAlerts.length },
    { id: 'map',       label: 'Floor Map',      icon: <Map size={17} /> },
    { id: 'guests',    label: 'Guest Registry', icon: <Users size={17} /> },
    { id: 'broadcast', label: 'Broadcast',      icon: <Megaphone size={17} /> },
    { id: 'occupancy', label: 'Occupancy',      icon: <BarChart2 size={17} /> },
    { id: 'staff',     label: 'Staff Registry', icon: <Shield size={17} /> },
  ];

  return (
    <div className="flex h-screen bg-navy overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-navy-light border-r border-white/10 flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-white/10">
          <span className="font-playfair text-gold font-semibold text-xl block">SafePath</span>
          <span className="text-gold/50 text-xs">Staff Console</span>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                activeTab === item.id
                  ? 'border-l-2 border-gold text-gold bg-white/5'
                  : 'text-white/55 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {!!item.badge && (
                <span className="bg-danger text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Navbar role="staff" />
        <div className="p-6">

          {activeTab === 'register' && <RegisterGuestTab />}
          {activeTab === 'staff' && <StaffManagementTab />}

          {/* ── ALERTS ── */}
          {activeTab === 'alerts' && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <h2 className="font-playfair text-white text-2xl font-semibold">Active Alerts</h2>
                {activeAlerts.length > 0 && (
                  <span className="bg-danger text-white text-xs font-bold px-2.5 py-1 rounded-full">{activeAlerts.length}</span>
                )}
                {activeAlerts.length > 0 && (
                  <button 
                     onClick={() => setIsMuted(!isMuted)} 
                     className="ml-auto flex items-center gap-1.5 text-xs border border-white/20 rounded-lg px-3 py-1.5 text-white/70 hover:text-white transition-colors"
                  >
                     {isMuted ? '🔇 Unmute Siren' : '🔊 Mute Siren'}
                  </button>
                )}
              </div>
              {activeAlerts.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <CheckCircle size={40} className="text-safe" />
                  <p className="text-white/50">All clear — no active alerts.</p>
                </div>
              )}
              <AnimatePresence>
                {activeAlerts.map((alert) => (
                  <motion.div
                    key={alert.id} layout
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                    className={`bg-navy-light rounded-xl p-4 mb-3 border border-white/10 border-l-4 ${SEV_BORDER[alert.severity] || SEV_BORDER[5]}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                       <span className="text-gold font-bold">Room {alert.room_number}</span>
                      <span className="bg-white/10 text-white/55 text-xs px-2 py-0.5 rounded-full">Floor {alert.floor}</span>
                      <SeverityBadge severity={alert.severity as any} />
                      <span className="text-white/35 text-xs ml-auto">
                        {alert.timestamp.split('T')[1] ?? alert.timestamp}
                      </span>
                    </div>
                    <p className="text-white font-medium">{alert.guest_name}</p>
                    <p className="text-white/55 text-sm mt-0.5">{alert.message}</p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="ghost" className="text-sm py-1.5 px-4"
                        onClick={() => { acknowledgeAlert(alert.id); toast.success('Alert acknowledged'); }}>
                        Acknowledge
                      </Button>
                      <Button variant="ghost" className="text-sm py-1.5 px-4"
                        onClick={() => setActiveTab('map')}>
                        View on Map
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* ── FLOOR MAP ── */}
          {activeTab === 'map' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-playfair text-white text-2xl font-semibold">Interactive Hotel Map</h2>
                <Button variant="gold" onClick={() => toast.success('Zones saved. Guest routes recalculating.')}>
                  Save Zones
                </Button>
              </div>
              <GlassCard>
                <p className="text-white/50 text-sm mb-4">
                  Click a room to target for broadcast. Current Target: <span className="text-gold font-bold">{broadcastTarget === 'all' ? 'All' : broadcastTarget}</span>
                </p>
                <HotelMap rooms={rooms} dangerZones={dangerZones} onRoomClick={(r) => {
                  setBroadcastTarget(`room${r}`);
                  toast.success(`Target set to Room ${r} for broadcasting.`);
                  setActiveTab('broadcast');
                }} showLegend />
              </GlassCard>
            </div>
          )}

          {activeTab === 'guests' && <GuestsTab />}

          {/* ── BROADCAST ── */}
          {activeTab === 'broadcast' && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <Megaphone size={22} className="text-gold" />
                <h2 className="font-playfair text-white text-2xl font-semibold">Broadcast to Guests</h2>
              </div>
              <GlassCard className="max-w-2xl mb-5">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-white/50 text-xs mb-1 block">Target</label>
                      <select
                        value={broadcastTarget}
                        onChange={(e) => setBroadcastTarget(e.target.value)}
                        className="w-full bg-navy-light border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-colors appearance-none text-sm"
                      >
                        {Object.entries(TARGET_LABELS).map(([v, l]) => (
                          <option key={v} value={v} className="bg-navy">{l}</option>
                        ))}
                        {rooms.map((r) => (
                          <option key={`room${r.room_number}`} value={`room${r.room_number}`} className="bg-navy">Room {r.room_number}</option>
                        ))}
                      </select>
                    </div>
                    <Button variant="ghost" onClick={async () => {
                      if (!broadcastTarget) return;
                      const originalText = broadcastText;
                      setBroadcastText('Generating suggestion...');
                      try {
                        const res = await fetch(`http://${window.location.hostname}:5000/api/ai/suggest-broadcast?target=${broadcastTarget}`);
                        const data = await res.json();
                        setBroadcastText(data.suggestion);
                      } catch(e) {
                         setBroadcastText(originalText || 'Please pay attention to the following instructions.');
                         toast.error('Failed to get AI suggestion');
                      }
                    }}
                      className="flex items-center gap-1.5 whitespace-nowrap">
                      <Sparkles size={13} className="text-gold" /> AI Suggest
                    </Button>
                  </div>
                  <div className="relative">
                    <textarea
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value.slice(0, 280))}
                      placeholder="Type your message…"
                      rows={4}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/35 focus:outline-none focus:border-gold resize-none transition-colors text-sm"
                    />
                    <span className="absolute bottom-3 right-4 text-white/30 text-xs">{broadcastText.length}/280</span>
                  </div>
                  <Button variant="gold" fullWidth onClick={async () => {
                    if (!broadcastText.trim()) { toast.error('Message is empty'); return; }
                    try {
                      await api.createBroadcast({ target: broadcastTarget, message: broadcastText.trim() });
                      fetchBroadcasts();
                      toast.success('Broadcast sent!');
                      setBroadcastText('');
                    } catch (e) {
                      toast.error('Failed to send broadcast');
                    }
                  }}>
                    Send Broadcast
                  </Button>
                </div>
              </GlassCard>
              <div>
                <div className="flex items-center justify-between mb-3 max-w-2xl">
                  <h3 className="text-white/45 text-xs font-semibold uppercase tracking-wider">Recent Broadcasts</h3>
                  {broadcastMessages.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!window.confirm('Delete all broadcasts?')) return;
                        try {
                          await api.clearAllBroadcasts();
                          fetchBroadcasts();
                          toast.success('All broadcasts cleared');
                        } catch {
                          toast.error('Failed to clear broadcasts');
                        }
                      }}
                      className="text-red-400 text-xs hover:text-red-300 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 max-w-2xl">
                  <AnimatePresence>
                    {broadcastMessages.slice(0, 5).map((msg, idx) => (
                      <motion.div key={msg.id || idx} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-3 items-start">
                        <span className="text-white/35 text-xs whitespace-nowrap mt-0.5">
                          {msg.timestamp.split('T')[1]?.substring(0, 5) ?? msg.timestamp}
                        </span>
                        <span className="bg-gold/20 text-gold text-xs rounded-full px-2 py-0.5 whitespace-nowrap">
                          {msg.target.startsWith('room') ? 'Room Targeted' : TARGET_LABELS[msg.target] || 'General'}
                        </span>
                        <p className="text-white/65 text-sm flex-1">{msg.message}</p>
                        <button
                          onClick={async () => {
                            try {
                              await api.deleteBroadcast(msg.id);
                              fetchBroadcasts();
                              toast.success('Broadcast deleted');
                            } catch {
                              toast.error('Failed to delete');
                            }
                          }}
                          className="text-white/20 hover:text-red-400 transition-colors"
                          title="Delete Broadcast"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {broadcastMessages.length === 0 && <p className="text-white/25 text-sm italic">No broadcasts sent yet.</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'occupancy' && <OccupancyTab stats={stats} />}
        </div>
      </main>
    </div>
  );
}
