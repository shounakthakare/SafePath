import { useNavigate, Navigate } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { QrCode, ShieldCheck, Siren } from 'lucide-react';
import Layout from '../../components/Layout/Layout';
import GlassCard from '../../components/GlassCard/GlassCard';
import Button from '../../components/Button/Button';
import { useAppStore } from '../../store/useAppStore';

const CARD_VARIANTS: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.45, ease: 'easeOut' },
  }),
};

export default function LandingPage() {
  const navigate = useNavigate();
  const guestProfile = useAppStore((s) => s.guestProfile);
  const activeRole   = useAppStore((s) => s.activeRole);

  // Auto-login from cache
  if (guestProfile) {
    return <Navigate to="/guest-dashboard" replace />;
  }
  if (activeRole === 'staff') {
    return <Navigate to="/staff" replace />;
  }
  if (activeRole === 'responder') {
    return <Navigate to="/responder" replace />;
  }

  const roles = [
    {
      key: 'guest',
      icon: <QrCode size={36} className="text-gold" />,
      title: 'Guest Login',
      desc: 'Scan your QR code to access your personalised emergency exit guide and room information.',
      buttonLabel: 'Scan QR Code',
      buttonVariant: 'gold' as const,
      action: () => navigate('/guest-login'),
    },
    {
      key: 'staff',
      icon: <ShieldCheck size={36} className="text-blue-400" />,
      title: 'Hotel Staff',
      desc: 'Register guests, generate QR codes, monitor alerts, manage danger zones and broadcast instructions.',
      buttonLabel: 'Staff Login',
      buttonVariant: 'ghost' as const,
      action: () => navigate('/staff'),
    },
    {
      key: 'responder',
      icon: <Siren size={36} className="text-red-400" />,
      title: 'First Responder',
      desc: 'Live floor view with occupancy data, priority rooms and real-time event log.',
      buttonLabel: 'Responder View',
      buttonVariant: 'danger' as const,
      action: () => navigate('/responder'),
    },
  ];

  return (
    <Layout showBackground={true}>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="text-center mb-12"
        >
          <h1 className="font-playfair text-gold text-6xl sm:text-7xl font-bold tracking-tight">
            SafePath
          </h1>
          <p className="text-white/65 text-lg mt-2 max-w-md mx-auto">
            AI-Powered Emergency Guidance for Hotels
          </p>

          {/* QR flow pill */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 mt-4 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm text-white/60"
          >
            <QrCode size={14} className="text-gold" />
            Staff registers guests · QR code sent · Guest scans to access
          </motion.div>
        </motion.div>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl">
          {roles.map((role, i) => (
            <motion.div
              key={role.key}
              custom={i}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate="visible"
            >
              <GlassCard className="flex flex-col items-center text-center gap-4 h-full">
                <div className="p-3 rounded-2xl bg-white/5">{role.icon}</div>
                <div>
                  <h2 className="font-playfair text-white text-xl font-semibold mb-2">{role.title}</h2>
                  <p className="text-white/55 text-sm leading-relaxed">{role.desc}</p>
                </div>
                <div className="mt-auto w-full">
                  <Button variant={role.buttonVariant} fullWidth onClick={role.action}>
                    {role.buttonLabel}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-white/25 text-xs mt-10 text-center"
        >
          In an emergency, always follow staff instructions and call emergency services.
        </motion.p>
      </div>
    </Layout>
  );
}
