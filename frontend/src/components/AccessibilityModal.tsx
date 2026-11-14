import React from 'react';
import { Eye, Monitor, Type, X } from 'lucide-react';
import { AccessibilitySettings } from '../types';

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AccessibilitySettings;
  onUpdateSettings: (newSettings: AccessibilitySettings) => void;
}

export const AccessibilityModal: React.FC<AccessibilityModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <div
        id="accessibility-settings-card"
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-neutral-300" aria-hidden="true" />
            <h2 id="a11y-modal-title" className="text-lg font-semibold tracking-tight">
              Accessibility Settings
            </h2>
          </div>
          <button
            id="close-a11y-modal-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Close accessibility modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 py-4">
          {/* High Contrast */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="high-contrast-toggle" className="font-medium text-neutral-200">
                High Contrast Mode
              </label>
              <p className="text-sm text-neutral-400">
                Enhances border definition and contrast ratios across controls and video overlays to exceed WCAG AAA standards.
              </p>
            </div>
            <button
              id="high-contrast-toggle"
              role="switch"
              aria-checked={settings.highContrast}
              onClick={() =>
                onUpdateSettings({ ...settings, highContrast: !settings.highContrast })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                settings.highContrast ? 'bg-amber-500' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.highContrast ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="reduced-motion-toggle" className="font-medium text-neutral-200">
                Reduced Motion
              </label>
              <p className="text-sm text-neutral-400">
                Disables animated transitions and smooth video tracking trail effects.
              </p>
            </div>
            <button
              id="reduced-motion-toggle"
              role="switch"
              aria-checked={settings.reducedMotion}
              onClick={() =>
                onUpdateSettings({ ...settings, reducedMotion: !settings.reducedMotion })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                settings.reducedMotion ? 'bg-amber-500' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.reducedMotion ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Text Size */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-neutral-400" />
              <span className="font-medium text-neutral-200">Text Scaling</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['normal', 'large', 'xl'] as const).map((size) => (
                <button
                  key={size}
                  id={`text-size-btn-${size}`}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, textSize: size })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    settings.textSize === size
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-750'
                  }`}
                >
                  {size === 'normal' && '100% (Default)'}
                  {size === 'large' && '115% (Large)'}
                  {size === 'xl' && '130% (XL)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-4 flex justify-end">
          <button
            id="done-a11y-btn"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
