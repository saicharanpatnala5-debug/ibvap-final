import React from 'react';
import {
  Camera,
  Plus,
  Shield,
  ShieldAlert,
  Search,
  Radio,
  SlidersHorizontal,
  Eye,
  Sparkles,
  BrainCircuit,
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
  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand & Product Identifier */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-amber-500 shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-neutral-100 text-lg">IBVAP</span>
                <span className="rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-400">
                  v2.4
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">AI Video Analytics Platform</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-neutral-800/80 pl-6" aria-label="Main Navigation">
            <button
              id="nav-monitoring-tab"
              type="button"
              onClick={() => onSelectTab('monitoring')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'monitoring'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Camera className="h-4 w-4" />
              Live Monitoring
              {cameraCount > 0 && (
                <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.2 font-mono text-[10px] text-neutral-300">
                  {cameraCount}
                </span>
              )}
            </button>

            <button
              id="nav-alerts-tab"
              type="button"
              onClick={() => onSelectTab('alerts')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'alerts'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              Alert Feed
              {alertCount > 0 && (
                <span className="ml-1 rounded-full bg-red-950 border border-red-800 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-300">
                  {alertCount}
                </span>
              )}
            </button>

            <button
              id="nav-command-tab"
              type="button"
              onClick={() => onSelectTab('command')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'command'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              AI Command
            </button>

            <button
              id="nav-intelligence-tab"
              type="button"
              onClick={() => onSelectTab('intelligence')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'intelligence'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <BrainCircuit className="h-4 w-4 text-amber-400" />
              Footage Intelligence
              <span className="rounded bg-amber-500/20 text-amber-400 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider border border-amber-500/30">
                AI
              </span>
            </button>

            <button
              id="nav-anpr-tab"
              type="button"
              onClick={() => onSelectTab('anpr')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'anpr'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Car className="h-4 w-4 text-amber-400" />
              Vehicle Registry
              {plateCount > 0 && (
                <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.2 font-mono text-[10px] text-amber-400">
                  {plateCount}
                </span>
              )}
            </button>

            <button
              id="nav-search-tab"
              type="button"
              onClick={() => onSelectTab('search')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'search'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Search className="h-4 w-4" />
              Search & Investigation
            </button>

            <button
              id="nav-topology-tab"
              type="button"
              onClick={() => onSelectTab('topology')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'topology'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Radio className="h-4 w-4" />
              Camera Topology
            </button>
          </nav>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2.5">
          {/* Accessibility Settings Trigger */}
          <button
            id="open-a11y-settings-btn"
            type="button"
            onClick={onOpenAccessibility}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            title="Accessibility Settings (High Contrast, Reduced Motion, Font Scale)"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Accessibility</span>
          </button>

          {/* Primary Action: + Add Camera */}
          <button
            id="main-add-camera-btn"
            type="button"
            onClick={onOpenAddCamera}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Plus className="h-4 w-4" />
            Add Camera
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="flex md:hidden items-center justify-around border-t border-neutral-800/80 bg-neutral-950 px-2 py-1.5">
        <button
          type="button"
          onClick={() => onSelectTab('monitoring')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'monitoring' ? 'text-amber-400' : 'text-neutral-400'
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          Live ({cameraCount})
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('alerts')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'alerts' ? 'text-amber-400' : 'text-neutral-400'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Alerts ({alertCount})
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('command')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'command' ? 'text-amber-400 font-bold' : 'text-neutral-400'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Command
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('intelligence')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'intelligence' ? 'text-amber-400 font-bold' : 'text-neutral-400'
          }`}
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          Intelligence
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('anpr')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'anpr' ? 'text-amber-400 font-bold' : 'text-neutral-400'
          }`}
        >
          <Car className="h-3.5 w-3.5" />
          Registry
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('search')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'search' ? 'text-amber-400' : 'text-neutral-400'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('topology')}
          className={`flex items-center gap-1.5 py-1 px-2 text-xs font-medium ${
            activeTab === 'topology' ? 'text-amber-400' : 'text-neutral-400'
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          Topology
        </button>
      </div>
    </header>
  );
};
