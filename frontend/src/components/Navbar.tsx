import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Plus,
  Shield,
  ShieldAlert,
  Search,
  Radio,
  Eye,
  Sparkles,
  BrainCircuit,
  Car,
  ChevronDown,
  MoreHorizontal,
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "More" dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSecondaryActive = activeTab === 'intelligence' || activeTab === 'search' || activeTab === 'topology';

  const secondaryTabs = [
    {
      id: 'intelligence' as ActiveTab,
      label: 'Footage Intelligence',
      icon: BrainCircuit,
      badge: 'AI',
    },
    {
      id: 'search' as ActiveTab,
      label: 'Search & Investigation',
      icon: Search,
    },
    {
      id: 'topology' as ActiveTab,
      label: 'Camera Topology',
      icon: Radio,
    },
  ];

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between px-3 sm:px-6">
        {/* Brand & Product Identifier */}
        <div className="flex items-center gap-4 lg:gap-6 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-amber-500 shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-neutral-100 text-base sm:text-lg">IBVAP</span>
                <span className="rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-400">
                  v2.4
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-neutral-400 truncate">AI Video Analytics Platform</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-neutral-800/80 pl-4 lg:pl-6" aria-label="Main Navigation">
            {/* 1. Live Monitoring */}
            <button
              id="nav-monitoring-tab"
              type="button"
              onClick={() => onSelectTab('monitoring')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'monitoring'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Camera className="h-4 w-4 shrink-0" />
              <span>Live Monitoring</span>
              {cameraCount > 0 && (
                <span className="ml-1 rounded-full bg-neutral-800 border border-neutral-700 px-1.5 py-0.2 font-mono text-[10px] text-neutral-300">
                  {cameraCount}
                </span>
              )}
            </button>

            {/* 2. Alert Feed */}
            <button
              id="nav-alerts-tab"
              type="button"
              onClick={() => onSelectTab('alerts')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'alerts'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Alert Feed</span>
              {alertCount > 0 && (
                <span className="ml-1 rounded-full bg-red-950 border border-red-800 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-300">
                  {alertCount}
                </span>
              )}
            </button>

            {/* 3. AI Command */}
            <button
              id="nav-command-tab"
              type="button"
              onClick={() => onSelectTab('command')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'command'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
              <span>AI Command</span>
            </button>

            {/* 4. Vehicle Registry */}
            <button
              id="nav-anpr-tab"
              type="button"
              onClick={() => onSelectTab('anpr')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'anpr'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Car className="h-4 w-4 shrink-0 text-amber-400" />
              <span>Vehicle Registry</span>
              {plateCount > 0 && (
                <span className="ml-1 rounded-full bg-neutral-800 border border-neutral-700 px-1.5 py-0.2 font-mono text-[10px] text-amber-400">
                  {plateCount}
                </span>
              )}
            </button>

            {/* Large screen inline tabs (>= 1600px): Footage Intelligence, Search, Topology */}
            <div className="hidden 2xl:flex items-center gap-1">
              <button
                id="nav-intelligence-tab"
                type="button"
                onClick={() => onSelectTab('intelligence')}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'intelligence'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <BrainCircuit className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Footage Intelligence</span>
                <span className="rounded bg-amber-500/20 text-amber-400 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider border border-amber-500/30">
                  AI
                </span>
              </button>

              <button
                id="nav-search-tab"
                type="button"
                onClick={() => onSelectTab('search')}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'search'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <Search className="h-4 w-4 shrink-0" />
                <span>Search & Investigation</span>
              </button>

              <button
                id="nav-topology-tab"
                type="button"
                onClick={() => onSelectTab('topology')}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'topology'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <Radio className="h-4 w-4 shrink-0" />
                <span>Camera Topology</span>
              </button>
            </div>

            {/* Collapsed "More" dropdown for screens below 1600px (1024px to 1599px) */}
            <div className="relative 2xl:hidden" ref={moreRef}>
              <button
                id="nav-more-menu-btn"
                type="button"
                onClick={() => setIsMoreOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSecondaryActive
                    ? 'bg-neutral-800 text-amber-400 font-semibold'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
                aria-expanded={isMoreOpen}
                aria-label="More navigation modules"
              >
                <MoreHorizontal className="h-4 w-4 shrink-0" />
                <span>
                  {activeTab === 'intelligence'
                    ? 'Intelligence'
                    : activeTab === 'search'
                    ? 'Search'
                    : activeTab === 'topology'
                    ? 'Topology'
                    : 'More'}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMoreOpen && (
                <div
                  id="nav-more-dropdown"
                  className="absolute left-0 mt-1 w-56 rounded-xl border border-neutral-800 bg-neutral-900/98 p-1.5 shadow-2xl backdrop-blur-md z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  {secondaryTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          onSelectTab(tab.id);
                          setIsMoreOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-neutral-800 text-white font-semibold'
                            : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 ${tab.id === 'intelligence' ? 'text-amber-400' : ''}`} />
                          <span>{tab.label}</span>
                        </div>
                        {tab.badge && (
                          <span className="rounded bg-amber-500/20 text-amber-400 px-1 py-0.2 text-[9px] font-bold border border-amber-500/30">
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right Side Actions: Guaranteed shrink-0 to prevent clipping at any resolution */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shrink-0 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar: smooth horizontal scroll swipe */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth border-t border-neutral-800/80 bg-neutral-950 px-3 py-2">
        <button
          type="button"
          onClick={() => onSelectTab('monitoring')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'monitoring' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Camera className="h-3.5 w-3.5 shrink-0" />
          <span>Live</span>
          {cameraCount > 0 && (
            <span className="rounded-full bg-neutral-800 px-1 font-mono text-[10px] text-neutral-300">
              {cameraCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('alerts')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'alerts' ? 'bg-neutral-800 text-red-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>Alerts</span>
          {alertCount > 0 && (
            <span className="rounded-full bg-red-950 border border-red-800 px-1 font-mono text-[10px] text-red-300 font-bold">
              {alertCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('command')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'command' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>AI Command</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('anpr')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'anpr' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Car className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>Registry</span>
          {plateCount > 0 && (
            <span className="rounded-full bg-neutral-800 px-1 font-mono text-[10px] text-amber-400">
              {plateCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('intelligence')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'intelligence' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>Intelligence</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('search')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'search' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('topology')}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'topology' ? 'bg-neutral-800 text-amber-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Radio className="h-3.5 w-3.5 shrink-0" />
          <span>Topology</span>
        </button>
      </div>
    </header>
  );
};
