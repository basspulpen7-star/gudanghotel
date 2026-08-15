import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if it's iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    console.log('Is standalone:', isStandalone);
    
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      console.log('beforeinstallprompt fired');
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    console.log('Event listener added for beforeinstallprompt');

    // For iOS, we can't detect beforeinstallprompt, so we show a manual tip
    if (isIOSDevice) {
      const hasShownTip = localStorage.getItem('pwa-ios-tip-shown');
      if (!hasShownTip) {
        setShowPrompt(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const closePrompt = () => {
    setShowPrompt(false);
    if (isIOS) {
      localStorage.setItem('pwa-ios-tip-shown', 'true');
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-8 md:bottom-8 md:w-80 z-[200] animate-in slide-in-from-bottom duration-300 font-sans">
      <div className="bg-white border border-gray-200/90 rounded-2xl shadow-xl p-4 overflow-hidden relative">
        <button 
          onClick={closePrompt}
          className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-grow pr-3">
            <h4 className="text-sm font-black text-gray-900">Pasang Aplikasi</h4>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed font-medium">
              {isIOS 
                ? 'Ketuk ikon "Share" lalu pilih "Add to Home Screen" untuk memasang di iPhone Anda.' 
                : 'Pasang Gudang Alia di layar utama Anda untuk akses lebih cepat dan mudah.'}
            </p>
            
            {!isIOS && deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="mt-3 w-full bg-[#E65C00] hover:bg-[#CF5300] text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Pasang Sekarang
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
