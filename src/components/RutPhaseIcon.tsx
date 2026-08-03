import React from 'react';
import { Trees, Compass, Sparkles, Flame, Lock, ShieldCheck, Snowflake, LucideIcon } from 'lucide-react';

// Shared rut-phase icon renderer — maps the rut engine's iconName to a lucide icon.
const RUT_ICONS: Record<string, LucideIcon> = {
  Trees,
  Compass,
  Sparkles,
  Flame,
  Lock,
  ShieldCheck,
  Snowflake,
};

interface RutPhaseIconProps {
  iconName?: string;
  className?: string;
}

export const RutPhaseIcon: React.FC<RutPhaseIconProps> = ({ iconName, className }) => {
  const Icon = (iconName && RUT_ICONS[iconName]) || Sparkles;
  return <Icon className={className} aria-hidden="true" />;
};
