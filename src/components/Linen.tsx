import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  BedDouble, 
  PackageCheck, 
  Package,
  ArrowDownCircle, 
  ArrowUpCircle, 
  FileText, 
  RotateCw,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useLinenData } from '../hooks/useLinenData';
import { LinenDashboard } from './LinenDashboard';
import { LinenRoomItems } from './LinenRoomItems';
import { LinenCleanItems } from './LinenCleanItems';
import { LinenNewItems } from './LinenNewItems';
import { LinenIncoming } from './LinenIncoming';
import { LinenOutgoing } from './LinenOutgoing';
import { LinenReports } from './LinenReports';

type LinenSubTab = 
  | 'dashboard' 
  | 'room' 
  | 'clean' 
  | 'new' 
  | 'incoming' 
  | 'outgoing' 
  | 'reports';

export function Linen() {
  const [activeTab, setActiveTab] = useState<LinenSubTab>('dashboard');
  const {
    state,
    loading,
    error,
    refresh,
    addRoomItem,
    updateRoomItem,
    deleteRoomItem,
    addIncomingItem,
    updateIncomingItem,
    deleteIncomingItem,
    addOutgoingItem,
    updateOutgoingItem,
    deleteOutgoingItem,
    addNewItemStock,
    takeNewItemToClean,
    updateNewItemTransaction,
    deleteNewItemTransaction,
    updateCleanItem
  } = useLinenData();

  const tabs: Array<{ id: LinenSubTab; label: string; icon: any }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'room', label: 'Terpasang', icon: BedDouble },
    { id: 'clean', label: 'Stok Bersih', icon: PackageCheck },
    { id: 'new', label: 'Stok Baru', icon: Package },
    { id: 'incoming', label: 'Masuk', icon: ArrowDownCircle },
    { id: 'outgoing', label: 'Keluar', icon: ArrowUpCircle },
    { id: 'reports', label: 'Laporan', icon: FileText },
  ];

  if (loading && !state.roomItems.length && !state.incomingItems.length) {
    return (
      <div className="space-y-6 animate-pulse font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-[#303640]">
          <div className="h-8 bg-[#252B34] rounded-xl w-48" />
          <div className="h-8 bg-[#252B34] rounded-xl w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-[#252B34] rounded-2xl" />
          <div className="h-32 bg-[#252B34] rounded-2xl" />
          <div className="h-32 bg-[#252B34] rounded-2xl" />
        </div>
        <div className="h-64 bg-[#252B34] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header & Sub-Nav */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#303640]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-[#C89B3C] tracking-wider uppercase bg-[#C89B3C]/10 px-2 py-0.5 rounded-md border border-[#C89B3C]/20">
              MODUL LINEN
            </span>
            <span className="text-xs text-[#8E99A6] font-medium">Hotel Alia Management</span>
          </div>
          <h1 className="text-2xl font-black text-[#F1F3F5] tracking-tight mt-1 flex items-center gap-2">
            <BedDouble className="w-6 h-6 text-[#E0B85A]" />
            <span>Manajemen Linen</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            className="px-3 py-2 bg-[#252B34] border border-[#343B46] hover:border-[#C89B3C]/50 hover:bg-[#2C333E] rounded-xl text-xs font-bold text-[#D8DEE6] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Muat ulang data linen dari Supabase"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#E0B85A]" />
            <span>Sinkron Data</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#1D2128] border border-[#303640] rounded-2xl overflow-x-auto no-scrollbar shadow-xs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] shadow-sm font-black'
                  : 'text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#252B34]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#171A1F]' : 'text-[#8E99A6]'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-400 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={() => refresh()} 
            className="underline text-xs hover:text-rose-300 font-black"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Tab Views */}
      <div className="mt-4">
        {activeTab === 'dashboard' && (
          <LinenDashboard 
            state={state} 
            onNavigate={(nav) => {
              if (nav === 'transactions') setActiveTab('incoming');
              else setActiveTab(nav as LinenSubTab);
            }} 
          />
        )}

        {activeTab === 'room' && (
          <LinenRoomItems 
            state={state}
            onAdd={addRoomItem}
            onUpdate={updateRoomItem}
            onDelete={deleteRoomItem}
          />
        )}

        {activeTab === 'clean' && (
          <LinenCleanItems 
            state={state}
            onRefresh={refresh}
          />
        )}

        {activeTab === 'new' && (
          <LinenNewItems 
            state={state}
            onAddStock={addNewItemStock}
            onTakeToClean={takeNewItemToClean}
            onUpdate={updateNewItemTransaction}
            onDelete={deleteNewItemTransaction}
          />
        )}

        {activeTab === 'incoming' && (
          <LinenIncoming 
            state={state}
            onAdd={addIncomingItem}
            onUpdate={updateIncomingItem}
            onDelete={deleteIncomingItem}
          />
        )}

        {activeTab === 'outgoing' && (
          <LinenOutgoing 
            state={state}
            onAdd={addOutgoingItem}
            onUpdate={updateOutgoingItem}
            onDelete={deleteOutgoingItem}
          />
        )}

        {activeTab === 'reports' && (
          <LinenReports 
            state={state}
          />
        )}
      </div>
    </div>
  );
}
