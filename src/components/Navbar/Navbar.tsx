import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import clsx from 'clsx';
import type { UserRole } from '../../types';

interface NavbarProps {
  role: UserRole;
}

const roleConfig: Record<UserRole, { label: string; bgClass: string }> = {
  guest: { label: 'Guest', bgClass: 'bg-gold/20 text-gold border border-gold/40' },
  staff: { label: 'Staff', bgClass: 'bg-blue-500/20 text-blue-400 border border-blue-400/40' },
  responder: { label: 'Responder', bgClass: 'bg-danger/20 text-red-400 border border-red-400/40' },
};

export default function Navbar({ role }: NavbarProps) {
  const config = roleConfig[role];

  return (
    <nav className="bg-navy/80 backdrop-blur-md sticky top-0 z-50 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="text-gold" size={22} />
          <span className="font-playfair text-gold font-semibold text-xl tracking-wide">
            SafePath
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx('text-xs font-semibold px-3 py-1 rounded-full', config.bgClass)}>
            {config.label}
          </span>
          <Link
            to="/"
            onClick={() => {
              import('../../store/useAppStore').then(({ useAppStore }) => {
                useAppStore.getState().logout();
              });
            }}
            className="text-white/60 hover:text-gold text-sm transition-colors flex items-center gap-1"
          >
            ← Home (Log Out)
          </Link>
        </div>
      </div>
    </nav>
  );
}
