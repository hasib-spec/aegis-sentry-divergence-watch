"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show banner after 10 seconds of browsing
      setTimeout(() => setShowBanner(true), 10_000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setShowBanner(false);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (installed || !showBanner || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-xl border border-cyan-500/20 bg-[#0a0a14]/95 backdrop-blur-xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center shrink-0">
            <Smartphone size={18} className="text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-white">
              Install AEGIS·SENTRY
            </p>
            <p className="text-[8px] font-mono text-zinc-500 mt-0.5">
              Add to home screen for offline access and instant launch.
              Works on mobile and desktop.
            </p>
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[9px] font-mono font-bold hover:bg-cyan-500/20 transition-all"
              >
                <Download size={10} /> INSTALL
              </button>
              <button
                onClick={() => setShowBanner(false)}
                className="px-3 py-1.5 rounded-lg text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                NOT NOW
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}