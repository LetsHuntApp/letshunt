import React, { useState } from 'react';
import { Share, PlusSquare, Download, CheckCircle, X, Globe, Apple, Chrome } from 'lucide-react';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallClick: () => void;
  isInstalled: boolean;
  hasCustomBackground?: boolean;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallClick,
  isInstalled,
  hasCustomBackground = false,
}) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('ios');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className={`border text-slate-100 ${hasCustomBackground ? "bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-700" : "bg-slate-900 border-slate-700 dark:bg-slate-900 dark:border-slate-800"} rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src="./hunt-icon-120.png"
              alt="LetsHunt"
              className="w-10 h-10 rounded-xl object-cover"
            />
            <div>
              <h3 className="text-base font-extrabold text-white">Turn Into Web App</h3>
              <p className="text-xs text-slate-400">Add to Home Screen for instant stand access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Direct Install Banner if prompt available */}
          {deferredPrompt && !isInstalled && (
            <div className="bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle className="w-4 h-4" />
                <span>1-Click App Installation Ready</span>
              </div>
              <p className="text-xs text-slate-200">
                Install <strong>LetsHunt</strong> directly to your phone's home screen for offline access and full-screen hunting experience.
              </p>
              <button
                onClick={onInstallClick}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Install Web App Now</span>
              </button>
            </div>
          )}

          {isInstalled && (
            <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">App Installed Successfully!</h4>
              <p className="text-xs text-slate-300">
                LetsHunt is running as a home screen web application on your device.
              </p>
            </div>
          )}

          {/* OS Selector Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('ios')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'ios' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Apple className="w-4 h-4" />
              <span>iPhone / iOS</span>
            </button>
            <button
              onClick={() => setActiveTab('android')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'android' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Chrome className="w-4 h-4" />
              <span>Android / Chrome</span>
            </button>
            <button
              onClick={() => setActiveTab('desktop')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'desktop' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Desktop / Mac</span>
            </button>
          </div>

          {/* Instructions per OS */}
          {activeTab === 'ios' && (
            <div className="space-y-3 text-xs bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
              <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Apple className="w-4 h-4" /> How to Add to iPhone Home Screen:
              </h4>
              <ol className="space-y-3 text-slate-300 list-decimal list-inside leading-relaxed">
                <li className="pl-1">
                  Open this page in <strong className="text-white">Safari</strong> browser on your iPhone.
                </li>
                <li className="pl-1 flex items-start gap-2">
                  <span className="flex-1">
                    Tap the <strong className="text-white">Share</strong> icon at the bottom center of Safari navigation bar.
                  </span>
                  <Share className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                </li>
                <li className="pl-1 flex items-start gap-2">
                  <span className="flex-1">
                    Scroll down in the share menu and tap <strong className="text-emerald-400">Add to Home Screen</strong>.
                  </span>
                  <PlusSquare className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                </li>
                <li className="pl-1">
                  Tap <strong className="text-white">Add</strong> in the top right corner. The <strong>LetsHunt</strong> app icon will now appear directly on your iPhone home screen!
                </li>
              </ol>
            </div>
          )}

          {activeTab === 'android' && (
            <div className="space-y-3 text-xs bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
              <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Chrome className="w-4 h-4" /> How to Add to Android Home Screen:
              </h4>
              <ol className="space-y-3 text-slate-300 list-decimal list-inside leading-relaxed">
                <li className="pl-1">
                  Open this page in <strong className="text-white">Chrome</strong> on your Android device.
                </li>
                <li className="pl-1">
                  Tap the <strong className="text-white">Three Dots (⋮)</strong> menu in the top right corner of Chrome.
                </li>
                <li className="pl-1">
                  Select <strong className="text-emerald-400">Add to Home screen</strong> or <strong className="text-emerald-400">Install App</strong>.
                </li>
                <li className="pl-1">
                  Confirm <strong className="text-white">Add</strong>. LetsHunt will launch like a standalone native app from your app drawer!
                </li>
              </ol>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="space-y-3 text-xs bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
              <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> How to Install on PC or Mac:
              </h4>
              <ol className="space-y-3 text-slate-300 list-decimal list-inside leading-relaxed">
                <li className="pl-1">
                  In Chrome or Edge, look at the right side of your address bar for the <strong className="text-emerald-400">Install icon (⊕)</strong>.
                </li>
                <li className="pl-1">
                  Click <strong className="text-white">Install</strong> to save LetsHunt as a dedicated desktop application window.
                </li>
                <li className="pl-1">
                  Alternatively, click Chrome menu (⋮) ➔ <strong className="text-white">Save and Share</strong> ➔ <strong className="text-emerald-400">Install LetsHunt</strong>.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
          >
            Got it, Close
          </button>
        </div>
      </div>
    </div>
  );
};
