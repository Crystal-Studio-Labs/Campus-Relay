/** The product's icon family.
 *
 *  One set, one stroke weight, one size scale - every glyph in the interface
 *  comes from here rather than an emoji or a stray Unicode symbol, so the
 *  navigation, buttons and status chips all read as the same hand.
 *
 *  Lucide is the family. The wrapper exists for three reasons: the navigation
 *  addresses icons by a stable *name* rather than by component, an icon-only
 *  control always gets an accessible name from one place, and a missing name
 *  degrades to a neutral dot instead of crashing a screen.
 *
 *  Icons are decorative by default (`aria-hidden`); a control that uses one for
 *  its only label passes `label`, which is applied as `aria-label`.
 */
import type { ComponentType, SVGProps } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileBadge,
  FileText,
  Filter,
  Gauge,
  Headphones,
  Hourglass,
  Inbox,
  Info,
  LayoutDashboard,
  Library,
  List,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MonitorSmartphone,
  Moon,
  Pencil,
  PenSquare,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  UserCircle,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

type Glyph = ComponentType<SVGProps<SVGSVGElement>>

const ICONS = {
  home: Compass,
  dashboard: LayoutDashboard,
  bell: Bell,
  bellRing: BellRing,
  attendance: CalendarCheck,
  markAttendance: CheckCircle2,
  marks: FileText,
  file: FileText,
  list: List,
  enterMarks: Pencil,
  timetable: CalendarDays,
  fees: Wallet,
  feeCollection: Banknote,
  clearance: BadgeCheck,
  library: Library,
  leave: CalendarClock,
  feedback: Mail,
  activities: Sparkles,
  career: Briefcase,
  report: Plus,
  cases: Inbox,
  queue: ListChecks,
  tasks: Check,
  approvals: Hourglass,
  notices: Megaphone,
  noticeStudio: PenSquare,
  gate: ShieldCheck,
  analytics: BarChart3,
  audit: ScrollText,
  people: Users,
  employment: FileBadge,
  payroll: Banknote,
  helpdesk: Headphones,
  kiosk: MonitorSmartphone,
  assistant: Bot,
  sync: RefreshCw,
  guide: Info,
  setup: Settings,
  profile: UserCircle,
  insights: Gauge,
  search: Search,
  menu: Menu,
  close: X,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  wifi: Wifi,
  wifiOff: WifiOff,
  download: Download,
  upload: Upload,
  filter: Filter,
  next: ChevronRight,
  expand: ChevronDown,
  check: Check,
  warning: AlertTriangle,
  trending: Activity,
  arrowRight: ArrowRight,
  book: BookOpen,
  clock: Clock,
} as const satisfies Record<string, Glyph>

export type IconName = keyof typeof ICONS

export function isIconName(name: string): name is IconName {
  return name in ICONS
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className,
  label,
  ...props
}: {
  name: IconName | string
  size?: number
  strokeWidth?: number
  className?: string
  /** Accessible name. Omit for a decorative icon beside visible text. */
  label?: string
} & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const Glyph = isIconName(name) ? ICONS[name] : Compass
  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable={false}
      {...props}
    />
  )
}

/** Convenience for a control whose only content is an icon. */
export function iconButtonProps(name: IconName, label: string) {
  return { 'aria-label': label, title: label, 'data-icon': name }
}
