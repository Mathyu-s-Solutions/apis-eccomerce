import {
  Building2,
  Calculator,
  FileCheck2,
  FileText,
  Gauge,
  Layers,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  Building2,
  Calculator,
  FileCheck2,
  FileText,
  Gauge,
  Layers,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
  Webhook,
};

export function FeatureIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = MAP[name] ?? ShieldCheck;
  return <Icon size={size} />;
}
