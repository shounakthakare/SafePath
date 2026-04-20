import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, Megaphone, Volume2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout/Layout';
import Navbar from '../../components/Navbar/Navbar';
import GlassCard from '../../components/GlassCard/GlassCard';
import Button from '../../components/Button/Button';
import HotelMap from '../../components/HotelMap/HotelMap';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import type { RoomStatus } from '../../api/client';
import { db } from '../../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

// Language name → BCP-47 code for SpeechSynthesis
const LANG_CODE: Record<string, string> = {
  English: 'en-US', Hindi: 'hi-IN', Russian: 'ru-RU', Spanish: 'es-ES',
  French: 'fr-FR', German: 'de-DE', Chinese: 'zh-CN', Japanese: 'ja-JP',
  Arabic: 'ar-SA', Portuguese: 'pt-BR', Italian: 'it-IT', Korean: 'ko-KR',
  Dutch: 'nl-NL', Turkish: 'tr-TR', Polish: 'pl-PL',
};

function speak(text: string, langName: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = LANG_CODE[langName] || 'en-US';
  utt.rate = 0.9;
  utt.volume = 1;
  // Try to pick a voice matching the language
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.lang.startsWith(utt.lang.slice(0, 2)));
  if (match) utt.voice = match;
  window.speechSynthesis.speak(utt);
}

export default function GuestDashboard() {
  const navigate         = useNavigate();
  const guestProfile     = useAppStore((s) => s.guestProfile);
  const dangerZones      = useAppStore((s) => s.dangerZones);
  const [apiBroadcasts, setApiBroadcasts] = useState<any[]>([]);
  const [sosActive,  setSosActive]  = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [countdown,  setCountdown]  = useState(30);
  const [rooms,      setRooms]      = useState<RoomStatus[]>([]);
  const [emergencyCategory, setEmergencyCategory] = useState<string>('Medical Emergency');
  const [customEmergency,   setCustomEmergency]   = useState<string>('');
  const spokenIds = useRef<Set<string>>(new Set());  // tracks already-spoken broadcast IDs

  // Predefined emergency options with pre-assigned severity levels
  const EMERGENCY_OPTIONS: { label: string; severity: 1|2|3|4|5 }[] = [
    { label: 'Medical Emergency',    severity: 4 },
    { label: 'Fire / Smoke',         severity: 5 },
    { label: 'Active Intruder',      severity: 5 },
    { label: 'Severe Water Leak',    severity: 3 },
    { label: 'Gas Smell / Leak',     severity: 4 },
    { label: 'Physical Altercation', severity: 4 },
    { label: 'Suspicious Package',   severity: 3 },
    { label: 'Structural Issue',     severity: 3 },
    { label: 'Power Outage',         severity: 2 },
    { label: 'Elevator Stuck',       severity: 2 },
    { label: 'Other',                severity: 2 },
  ];

  const SEVERITY_COLORS: Record<number, string> = {
    1: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    2: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    3: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    4: 'bg-red-500/20 text-red-300 border-red-500/30',
    5: 'bg-red-700/30 text-red-200 border-red-600/50',
  };

  const selectedOption = EMERGENCY_OPTIONS.find(o => o.label === emergencyCategory) || EMERGENCY_OPTIONS[0];
  const currentSeverity = selectedOption.severity;

  useEffect(() => {
    if (!guestProfile) navigate('/checkin');
  }, [guestProfile, navigate]);

  // Fetch room statuses and broadcasts
  const fetchRooms = useCallback(async () => {
    try { setRooms(await api.getRooms()); } catch { /* offline */ }
  }, []);

  const fetchBroadcasts = useCallback(async () => {
    try { 
      const data = await api.getBroadcasts(guestProfile?.language);
      const relevant = data.filter((m: any) => 
        m.target === 'all' || 
        m.target === `floor${guestProfile?.floor}` || 
        m.target === `room${guestProfile?.roomNumber}`
      );
      setApiBroadcasts(relevant);

      // Speak any new broadcast the guest hasn't heard yet
      relevant.forEach((msg: any) => {
        const id = msg.id || msg.timestamp + msg.message;
        if (!spokenIds.current.has(id)) {
          spokenIds.current.add(id);
          // Small delay so voices are loaded
          setTimeout(() => speak(msg.message, guestProfile?.language || 'English'), 500);
          toast(`📢 ${msg.message}`, { duration: 6000 });
        }
      });
    } catch { /* offline */ }
  }, [guestProfile]);

  useEffect(() => {
    fetchRooms();
    
    // Polling for local rooms data (state machine)
    const rid = setInterval(fetchRooms, 3000);

    // Real-time Firestore for Broadcasts
    const broadcastQuery = query(collection(db, 'broadcasts'), orderBy('timestamp', 'desc'), limit(10));
    const unsubBroadcasts = onSnapshot(broadcastQuery, () => {
      // Whenever Firestore updates, we fetch the translated versions from our backend
      fetchBroadcasts();
    });

    return () => {
      clearInterval(rid);
      unsubBroadcasts();
    };
  }, [fetchRooms, guestProfile]);

  // SOS modal countdown
  useEffect(() => {
    if (!showModal) return;
    setCountdown(30);
    const id = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) { clearInterval(id); setShowModal(false); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showModal]);

  // Auto-logout when staff checks the guest out
  useEffect(() => {
    if (!guestProfile || rooms.length === 0) return;
    const myRoom = rooms.find((r) => r.room_number === guestProfile.roomNumber);
    if (!myRoom) return;
    
    // If the room became available, or occupied by a different guest
    if (myRoom.status === 'available' || (myRoom.guest_name && myRoom.guest_name !== guestProfile.name)) {
      useAppStore.getState().logout();
      toast('You have been checked out. Thank you for staying with us!', { icon: '👋' });
      navigate('/');
    }
  }, [rooms, guestProfile, navigate]);

  if (!guestProfile) return null;

  const handleSOS = async () => {
    setSosActive(true);
    setShowModal(true);
    // Use actual message (custom if 'Other' selected)
    const message = emergencyCategory === 'Other'
      ? (customEmergency.trim() || 'Emergency — Other')
      : emergencyCategory;
    // Use pre-mapped severity (Gemini AI on backend will also override if available)
    const severity = currentSeverity;
    try {
      await api.createAlert({
        guestName: guestProfile.name,
        roomNumber: guestProfile.roomNumber,
        floor: guestProfile.floor,
        severity,
        message,
        category: message,
      });
      toast.error('🚨 SOS sent! Staff have been notified.');
    } catch (e) {
      toast.error('Could not reach servers. Find nearest exit!');
    }
  };

  const targetLabels: Record<string, string> = {
    all: 'All Guests', floor1: 'Floor 1', floor2: 'Floor 2', floor3: 'Floor 3',
  };

  return (
    <Layout showBackground={true}>
      <Navbar role="guest" />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 sm:p-6">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-6">

          {/* Guest Info */}
          <GlassCard>
            <h1 className="font-playfair text-gold text-4xl font-bold">
              Room {guestProfile.roomNumber}
            </h1>
            <p className="text-white/70 mt-1">
              {guestProfile.name} · Floor {guestProfile.floor}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle size={16} className="text-safe" />
              <span className="bg-safe/20 text-safe rounded-full text-xs font-semibold px-3 py-1">
                Checked In
              </span>
              <span className="bg-white/10 text-white/60 rounded-full text-xs px-3 py-1">
                {guestProfile.language}
              </span>
            </div>
          </GlassCard>

          {/* SOS Panic Button */}
          <GlassCard>
            <div className="flex flex-col items-center gap-5">
              <h2 className="font-playfair text-red-400 text-2xl font-bold">Emergency SOS</h2>

              {!sosActive && (
                <div className="w-full max-w-xs mb-2 flex flex-col gap-2">
                  <label className="text-white/50 text-xs">What is your emergency?</label>
                  <select
                    value={emergencyCategory}
                    onChange={(e) => { setEmergencyCategory(e.target.value); setCustomEmergency(''); }}
                    className="w-full bg-navy-light text-white p-2.5 rounded-lg border border-white/20 text-sm focus:outline-none focus:border-red-400"
                  >
                    {EMERGENCY_OPTIONS.map(o => (
                      <option key={o.label} value={o.label}>{o.label}</option>
                    ))}
                  </select>

                  {/* Custom text box for Other */}
                  {emergencyCategory === 'Other' && (
                    <input
                      value={customEmergency}
                      onChange={(e) => setCustomEmergency(e.target.value)}
                      placeholder="Describe your emergency…"
                      className="w-full bg-navy-light text-white p-2.5 rounded-lg border border-red-400/50 text-sm focus:outline-none focus:border-red-400 placeholder:text-white/30"
                    />
                  )}

                  {/* Live severity badge */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${SEVERITY_COLORS[currentSeverity]}`}>
                    <span>Risk Level:</span>
                    <span className="font-bold text-sm">{currentSeverity}/5</span>
                    <span className="opacity-70">{'▮'.repeat(currentSeverity)}{'▯'.repeat(5 - currentSeverity)}</span>
                  </div>
                </div>
              )}

              <div className="relative flex items-center justify-center">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`absolute w-44 h-44 rounded-full border-2 border-danger/50 ${
                      sosActive ? ['ring-animate-1', 'ring-animate-2', 'ring-animate-3'][i] : ''
                    }`}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleSOS}
                  disabled={sosActive}
                  className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center gap-2 border-none shadow-2xl cursor-pointer transition-colors ${
                    sosActive ? 'bg-red-800 animate-pulse' : 'bg-danger hover:bg-red-600'
                  }`}
                >
                  <AlertTriangle size={40} className="text-white" />
                  <span className="text-white text-2xl font-bold">
                    {sosActive ? 'HELP COMING' : 'SOS'}
                  </span>
                </motion.button>
              </div>

              {sosActive && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  <Button variant="safe" onClick={async () => {
                    setSosActive(false);
                    try { await api.resolveAlertsByRoom(guestProfile.roomNumber); } catch(e){}
                    toast.success("Glad you're safe! Alert cleared."); 
                  }}>
                    ✓ I'm Safe
                  </Button>
                </motion.div>
              )}
            </div>
          </GlassCard>

          {/* Announcements */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={18} className="text-gold" />
              <h2 className="font-playfair text-white text-lg font-semibold">Staff Announcements</h2>
            </div>
            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto custom-scroll">
              <AnimatePresence>
                {apiBroadcasts.length === 0 ? (
                  <p className="text-white/40 text-sm italic">No announcements at this time.</p>
                ) : (
                  apiBroadcasts.map((msg, idx) => (
                    <motion.div
                      key={msg.id || idx}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-white/5 rounded-xl p-3 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/40 text-xs">{msg.timestamp.split('T')[1] ?? msg.timestamp}</span>
                        <span className="bg-gold/20 text-gold text-xs rounded-full px-2 py-0.5">
                          {msg.target.startsWith('room') ? 'Room Targeted' : targetLabels[msg.target] || 'General'}
                        </span>
                      </div>
                      <p className="text-white/80 text-sm">{msg.message}</p>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </GlassCard>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-6">
          <GlassCard>
            <h2 className="font-playfair text-white text-xl font-semibold mb-4">
              🏨 Hotel Floor Map
            </h2>
            <HotelMap
              rooms={rooms}
              dangerZones={dangerZones}
              defaultFloor={guestProfile.floor}
              showLegend={true}
              readOnly={true}
              sosActive={sosActive}
            />
            <div className={`mt-3 p-3 rounded-xl border transition-all duration-500 ${
              sosActive
                ? 'bg-red-900/30 border-red-500/60 animate-pulse'
                : 'bg-white/5 border-white/10'
            }`}>
              <p className="text-white/70 text-sm font-medium flex items-center gap-2">
                <span className={`w-4 h-1 rounded-full flex-shrink-0 ${
                  sosActive ? 'bg-red-400' : 'bg-green-400 animate-pulse'
                }`} />
                {sosActive ? '🚨 Active Evacuation Route — Room ' : 'Live Evacuation Route — Room '}{guestProfile.roomNumber}
              </p>
              <p className="text-white/50 text-xs mt-2">
                Follow the <strong className="text-white">pulsing green dashed line</strong> on the map above. The route is the safest and fastest path to the nearest emergency exit.
              </p>
              {sosActive && (
                <p className="text-red-300 text-xs font-bold mt-1.5 uppercase tracking-wide">
                  ⚡ Emergency active — evacuate immediately via the marked route!
                </p>
              )}
              <p className="text-white/30 text-[11px] mt-1">
                * Route auto-avoids danger zones in real-time.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* SOS Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <GlassCard className="max-w-sm w-full text-center relative">
                <button
                  onClick={() => setShowModal(false)}
                  className="absolute top-4 right-4 text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
                <AlertTriangle size={48} className="text-red-400 mx-auto mb-3" />
                <h2 className="font-playfair text-white text-2xl font-bold mb-2">
                  SOS Sent — Room {guestProfile.roomNumber}
                </h2>
                <p className="text-white/60 text-sm mb-4">
                  Staff have been notified. Stay calm and follow your exit map below.
                </p>
                <div className="text-4xl font-bold text-danger mb-2">{countdown}</div>
                <p className="text-white/30 text-xs">This dialog closes automatically</p>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
