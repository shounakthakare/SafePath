import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, ShieldCheck, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout/Layout';
import GlassCard from '../../components/GlassCard/GlassCard';
import Button from '../../components/Button/Button';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import { Html5QrcodeScanner } from 'html5-qrcode';

// ─── Real QR Scanner ────────────────────────────────────────────────────────
function RealQRScanner({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Delay initialization slightly to bypass React 18 Strict Mode double-invoke 
    // which causes the html5-qrcode UI to duplicate itself.
    const timer = setTimeout(() => {
      if (!isMounted) return;

      scannerRef.current = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 }, supportedScanTypes: [0, 1] },
        false
      );

      const success = async (text: string) => {
        if (scannerRef.current) {
          try {
            await scannerRef.current.clear();
          } catch (e) {
            // ignore
          }
          scannerRef.current = null;
        }
        // Only trigger if looks like a token or full URL
        let token = text;
        try {
          const url = new URL(text);
          token = url.searchParams.get('token') || text;
        } catch {
          // Not a URL, use text directly
        }
        onScan(token);
      };

      scannerRef.current.render(success, () => {});
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
      // Forcefully clean DOM to prevent duplicate UI artifacts on remount
      const el = document.getElementById('qr-reader');
      if (el) el.innerHTML = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      <style>{`
        #qr-reader {
          border: none !important;
          background: rgba(255,255,255,0.05);
          border-radius: 12px;
          overflow: hidden;
        }
        #qr-reader__scan_region {
          min-height: 200px;
        }
        #qr-reader__dashboard_section_csr button {
          background: linear-gradient(135deg, #D4AF37 0%, #AA8A2A 100%);
          color: #0A1628;
          border: none;
          padding: 10px 24px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 14px;
          margin-top: 16px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
        }
        #qr-reader__dashboard_section_csr button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
        }
        #qr-reader__dashboard_section_swaplink {
          text-decoration: none;
          display: inline-block;
          margin-top: 16px;
          margin-bottom: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          padding: 10px 24px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(8px);
        }
        #qr-reader__dashboard_section_swaplink:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: #D4AF37;
          color: #D4AF37;
        }
        #qr-reader a { color: #D4AF37; }
        #qr-reader span {
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
        }
        #qr-reader input[type="file"] {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          padding: 12px;
          border-radius: 10px;
          border: 1px dashed rgba(255, 255, 255, 0.3);
          width: 80%;
          max-width: 250px;
          margin: 16px auto;
          display: block;
          cursor: pointer;
        }
        #qr-reader select {
          background: rgba(10, 22, 40, 0.9);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 8px;
          border-radius: 8px;
          margin-bottom: 12px;
          outline: none;
        }
      `}</style>
      <div id="qr-reader" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QRLoginPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const setGuest        = useAppStore((s) => s.setGuestProfile);

  const [mode,        setMode]        = useState<'scanning' | 'manual' | 'verifying' | 'success' | 'error'>('scanning');
  const [manualToken, setManualToken] = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [guestName,   setGuestName]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const urlToken = searchParams.get('token');

  // Auto-verify when token is in URL (from QR scan)
  useEffect(() => {
    if (urlToken) {
      verifyToken(urlToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  const verifyToken = async (token: string) => {
    if (!token.trim()) return;
    setMode('verifying');
    setErrorMsg('');

    try {
      const guest = await api.getGuestByToken(token.trim());

      setGuest({
        id:              `guest-${guest.room_number}`,
        name:            guest.guest_name,
        roomNumber:      guest.room_number,
        floor:           guest.floor,
        language:        guest.language,
        email:           guest.email,
        mobile:          guest.mobile,
        qrToken:         guest.qr_token,
        checkinDatetime: guest.checkin_datetime,
        checkedIn:       true,
      });

      setGuestName(guest.guest_name);
      setMode('success');
      toast.success(`Welcome, ${guest.guest_name}! Room ${guest.room_number} ready.`);

      setTimeout(() => navigate('/guest-dashboard'), 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid QR code';
      setErrorMsg(msg);
      setMode('error');
    }
  };

  const handleManualSubmit = () => verifyToken(manualToken);

  return (
    <Layout showBackground={true}>
      {/* Logo */}
      <div className="flex items-center justify-center pt-8 pb-2">
        <span className="font-playfair text-gold text-2xl font-bold">SafePath</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <GlassCard className="w-full max-w-sm">

          <AnimatePresence mode="wait">

            {/* ── SCANNING STATE ── */}
            {mode === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="text-center">
                  <h1 className="font-playfair text-white text-2xl font-bold mb-1">
                    Guest Login
                  </h1>
                  <p className="text-white/50 text-sm">
                    Scan the QR code provided by hotel staff
                  </p>
                </div>

                <RealQRScanner onScan={(text) => verifyToken(text)} />

                <div className="w-full space-y-3">
                  <p className="text-white/30 text-xs text-center">
                    Open your camera app and point it at the QR code —<br />
                    this page will open automatically
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-white/30 text-xs">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={() => { setMode('manual'); setTimeout(() => inputRef.current?.focus(), 100); }}
                    className="flex items-center justify-center gap-2"
                  >
                    <KeyRound size={14} />
                    Enter token manually
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── MANUAL TOKEN ENTRY ── */}
            {mode === 'manual' && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h1 className="font-playfair text-white text-2xl font-bold mb-1">
                    Enter Your Code
                  </h1>
                  <p className="text-white/50 text-sm">
                    Paste the token from your welcome message
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-white/50 text-xs">Guest Token</label>
                  <input
                    ref={inputRef}
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                    placeholder="Paste your token here…"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                  />
                </div>

                <Button variant="gold" fullWidth onClick={handleManualSubmit} disabled={!manualToken.trim()}>
                  Verify & Login
                </Button>

                <button
                  onClick={() => setMode('scanning')}
                  className="text-white/40 text-sm hover:text-white text-center transition-colors"
                >
                  ← Back to QR scan
                </button>
              </motion.div>
            )}

            {/* ── VERIFYING ── */}
            {mode === 'verifying' && (
              <motion.div
                key="verifying"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6 py-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 size={48} className="text-gold" />
                </motion.div>
                <div className="text-center">
                  <p className="text-white font-semibold">Verifying your QR code…</p>
                  <p className="text-white/40 text-sm mt-1">Checking with hotel system</p>
                </div>
              </motion.div>
            )}

            {/* ── SUCCESS ── */}
            {mode === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-safe/20 border-2 border-green-500 flex items-center justify-center"
                >
                  <ShieldCheck size={40} className="text-green-400" />
                </motion.div>
                <div className="text-center">
                  <h2 className="font-playfair text-white text-2xl font-bold">
                    Welcome, {guestName}!
                  </h2>
                  <p className="text-white/50 text-sm mt-1">
                    Taking you to your dashboard…
                  </p>
                </div>
                <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-1 bg-gold rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.8 }}
                  />
                </div>
              </motion.div>
            )}

            {/* ── ERROR ── */}
            {mode === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 py-4"
              >
                <div className="w-20 h-20 rounded-full bg-danger/20 border-2 border-red-500 flex items-center justify-center">
                  <AlertCircle size={40} className="text-red-400" />
                </div>
                <div className="text-center">
                  <h2 className="font-playfair text-white text-xl font-bold">QR Code Invalid</h2>
                  <p className="text-red-300 text-sm mt-2 max-w-xs">{errorMsg}</p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <Button variant="gold" fullWidth onClick={() => { setMode('manual'); setManualToken(''); }}>
                    Try Another Code
                  </Button>
                  <Button variant="ghost" fullWidth onClick={() => setMode('scanning')}>
                    Back to Scan
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </GlassCard>
      </div>
    </Layout>
  );
}
