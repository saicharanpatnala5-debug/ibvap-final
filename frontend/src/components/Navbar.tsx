import React from 'react';
import {
  Camera,
  Plus,
  Shield,
  ShieldAlert,
  Search,
  Radio,
  Eye,
  Sparkles,
  Car,
} from 'lucide-react';

export type ActiveTab = 'monitoring' | 'alerts' | 'command' | 'intelligence' | 'anpr' | 'search' | 'topology';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  cameraCount: number;
  alertCount: number;
  plateCount?: number;
  onOpenAddCamera: () => void;
  onOpenAccessibility: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  cameraCount,
  alertCount,
  plateCount = 0,
  onOpenAddCamera,
  onOpenAccessibility,
}) => {
  // Exactly 6 primary navigation items - strict <= 6 items requirement
  const navItems = [
    {
      id: 'monitoring' as ActiveTab,
      label: 'Live Monitor',
      icon: Camera,
      count: cameraCount,
      countClass: 'bg-neutral-800 border-neutral-700 text-neutral-300',
    },
    {
      id: 'alerts' as ActiveTab,
      label: 'Alerts',
      icon: ShieldAlert,
      count: alertCount,
      countClass: 'bg-red-950 border-red-800 text-red-300 font-bold',
    },
    {
      id: 'anpr' as ActiveTab,
      label: 'Vehicle Registry',
      icon: Car,
      count: plateCount,
      countClass: 'bg-neutral-800 border-neutral-700 text-amber-400',
    },
    {
      id: 'search' as ActiveTab,
      label: 'Forensics',
      icon: Search,
    },
    {
      id: 'command' as ActiveTab,
      label: 'AI Copilot',
      icon: Sparkles,
      iconClass: 'text-amber-400',
    },
    {
      id: 'topology' as ActiveTab,
      label: 'Topology',
      icon: Radio,
    },
  ];

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between px-3 sm:px-6 gap-3">
        {/* Brand & Product Identifier */}
        <div className="flex items-center gap-3 lg:gap-4 shrink min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-amber-500 shadow-xs">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-neutral-100 text-base sm:text-lg">IBVAP</span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <p className="hidden 2xl:block text-[11px] text-neutral-400 truncate">VMS Analytics</p>
            </div>
          </div>

          {/* Desktop Navigation Links (<= 6 items, strict no-clipping) */}
          <nav className="hidden lg:flex items-center gap-1 border-l border-neutral-800/80 pl-3 shrink min-w-0" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}-tab`}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${item.iconClass || ''}`} />
                  <span>{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className={`ml-0.5 rounded-full border px-1.5 py-0.2 font-mono text-[10px] ${item.countClass}`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Side Actions: Guaranteed shrink-0 and relative z-10 to prevent clipping or pointer interception */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative z-10">
          {/* Accessibility Settings Trigger */}
          <button
            id="open-a11y-settings-btn"
            type="button"
            onClick={onOpenAccessibility}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors shrink-0"
            title="Accessibility Settings (High Contrast, Reduced Motion, Font Scale)"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Accessibility</span>
          </button>

          {/* Primary Action: + Add Camera */}
          <button
            id="main-add-camera-btn"
            type="button"
            onClick={onOpenAddCamera}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-400 shrink-0 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar: smooth horizontal scroll swipe */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth border-t border-neutral-800/80 bg-neutral-950 px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}-tab`}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                isActive ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className="rounded-full bg-neutral-800 px-1 font-mono text-[10px] text-neutral-300">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};