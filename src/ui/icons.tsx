import React from 'react'
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  Baby,
  Calendar,
  Car,
  ChartPie,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock,
  Cloud,
  CloudUpload,
  Copy,
  CreditCard,
  Download,
  Dumbbell,
  Ellipsis,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  House,
  Info,
  Landmark,
  Laptop,
  Lock,
  Pencil,
  PartyPopper,
  PiggyBank,
  PieChart,
  Plane,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Sliders,
  Sparkles,
  Sun,
  Target,
  Ticket,
  Trash2,
  Umbrella,
  Upload,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from 'lucide-react'

// Mapa exhaustivo de iconKey -> componente Lucide
export const ICON_MAP: Record<string, React.ComponentType<{ size?: number | string; className?: string; color?: string }>> = {
  // Categorías
  'shopping-basket': ShoppingBasket,
  food: ShoppingBasket,
  ticket: Ticket,
  leisure: Ticket,
  car: Car,
  transport: Car,
  shirt: Shirt,
  clothes: Shirt,
  'refresh-cw': RefreshCw,
  subscriptions: RefreshCw,
  dumbbell: Dumbbell,
  sport: Dumbbell,
  plane: Plane,
  travel: Plane,
  'heart-pulse': HeartPulse,
  health: HeartPulse,
  house: House,
  home: Home,
  gift: Gift,
  laptop: Laptop,
  ellipsis: Ellipsis,
  other: Ellipsis,

  // Objetivos y Reservas
  shield: Shield,
  emergency: Shield,
  'graduation-cap': GraduationCap,
  studies: GraduationCap,
  target: Target,
  goals: Target,
  sun: Sun,
  summer: Sun,
  sparkles: Sparkles,
  christmas: Sparkles,
  'party-popper': PartyPopper,
  party: PartyPopper,
  baby: Baby,
  wrench: Wrench,
  umbrella: Umbrella,

  // Interfaz y Navegación
  receipt: ReceiptText,
  calendar: Calendar,
  'piggy-bank': PiggyBank,
  'more-horizontal': Ellipsis,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'arrow-left-right': ArrowLeftRight,
  'arrow-down-left': ArrowDownLeft,
  'credit-card': CreditCard,
  wallet: Wallet,
  landmark: Landmark,
  check: Check,
  x: X,
  trash: Trash2,
  'trash-2': Trash2,
  info: Info,
  lock: Lock,
  plus: Plus,
  search: Search,
  edit: Pencil,
  pencil: Pencil,
  sliders: Sliders,
  settings: Settings,
  user: User,
  users: Users,
  'shield-check': ShieldCheck,
  'circle-alert': CircleAlert,
  clock: Clock,
  activity: Activity,
  cloud: Cloud,
  'cloud-upload': CloudUpload,
  download: Download,
  upload: Upload,
  'chart-pie': ChartPie,
  'pie-chart': PieChart,
  statistics: ChartPie,
  circle: Circle,
  copy: Copy,
  zap: Zap,
}

// Mapeo retrocompatible de antiguos símbolos y emojis a iconKey
export const LEGACY_SYMBOL_TO_KEY: Record<string, string> = {
  // Símbolos de categorías iniciales
  '◌': 'shopping-basket',
  '◇': 'ticket',
  '↗': 'car',
  '□': 'shirt',
  '○': 'refresh-cw',
  '△': 'dumbbell',
  '⌁': 'plane',
  '·': 'ellipsis',

  // Emojis de objetivos y cuentas
  '🗾': 'plane',
  '🛡️': 'shield',
  '🎯': 'target',
  '🚗': 'car',
  '🏠': 'house',
  '✈️': 'plane',
  '💻': 'laptop',
  '🎓': 'graduation-cap',
  '🎁': 'gift',
  '💳': 'credit-card',
  '🏦': 'landmark',
  '⇄': 'arrow-left-right',
  '↓': 'arrow-down-left',
  '⌂': 'home',
  '≡': 'receipt',
  '•••': 'more-horizontal',
  '◫': 'credit-card',
  '↻': 'refresh-cw',
  '◔': 'target',
  '◎': 'sliders',
  '⚙': 'settings',
  '›': 'chevron-right',
  '‹': 'chevron-left',
  'ℹ️': 'info',
  '🔒': 'lock',
  '✓': 'check',
}

/**
 * Resuelve un string (sea emoji, símbolo o iconKey existente) al iconKey canónico estable.
 * Si es desconocido, devuelve 'circle' o 'target' como fallback seguro.
 */
export function resolveIconKey(rawIcon: string | undefined | null, fallback = 'target'): string {
  if (!rawIcon || typeof rawIcon !== 'string') return fallback
  const trimmed = rawIcon.trim()
  if (LEGACY_SYMBOL_TO_KEY[trimmed]) {
    return LEGACY_SYMBOL_TO_KEY[trimmed]
  }
  if (ICON_MAP[trimmed.toLowerCase()]) {
    return trimmed.toLowerCase()
  }
  return fallback
}

export interface AppIconProps {
  name: string
  size?: number | string
  className?: string
  color?: string
}

export function AppIcon({ name, size = 18, className = '', color }: AppIconProps) {
  const resolvedKey = resolveIconKey(name)
  const Component = ICON_MAP[resolvedKey] ?? Circle
  return <Component size={size} className={className} color={color} />
}

// Opciones estándar para el selector visual de iconos en objetivos y reservas
export const GOAL_RESERVE_ICON_OPTIONS = [
  { key: 'target', label: 'Meta general' },
  { key: 'shield-check', label: 'Fondo emergencia' },
  { key: 'plane', label: 'Viaje / Vacaciones' },
  { key: 'house', label: 'Casa / Hogar' },
  { key: 'car', label: 'Coche / Vehículo' },
  { key: 'sparkles', label: 'Navidad / Especial' },
  { key: 'sun', label: 'Verano' },
  { key: 'gift', label: 'Regalos / Cumpleaños' },
  { key: 'party-popper', label: 'Fiestas / Eventos' },
  { key: 'graduation-cap', label: 'Estudios' },
  { key: 'laptop', label: 'Tecnología' },
  { key: 'umbrella', label: 'Seguros / Imprevistos' },
  { key: 'wrench', label: 'Mantenimiento' },
  { key: 'baby', label: 'Familia' },
]

export const CATEGORY_ICON_OPTIONS = [
  { key: 'shopping-basket', label: 'Alimentación' },
  { key: 'ticket', label: 'Ocio' },
  { key: 'car', label: 'Transporte' },
  { key: 'shirt', label: 'Ropa' },
  { key: 'refresh-cw', label: 'Suscripciones' },
  { key: 'dumbbell', label: 'Deporte' },
  { key: 'plane', label: 'Viajes' },
  { key: 'heart-pulse', label: 'Salud' },
  { key: 'house', label: 'Casa' },
  { key: 'gift', label: 'Regalos' },
  { key: 'laptop', label: 'Tecnología' },
  { key: 'ellipsis', label: 'Otros' },
]
