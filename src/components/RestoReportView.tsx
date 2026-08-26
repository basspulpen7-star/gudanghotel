import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileText, 
  Printer, 
  Download, 
  Calendar, 
  RefreshCw, 
  UtensilsCrossed, 
  Package, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  CheckCircle2,
  TrendingDown
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  subMonths 
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type RestoPeriod = 'today' | 'yesterday' | '7days' | 'this_month' | 'last_month' | 'custom_date' | 'custom_month';

export function RestoReportView() {
  const [period, setPeriod] = useState<RestoPeriod>('today');
  const [customDate, setCustomDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [customMonth, setCustomMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute date range according to selected period
  const { start, end, periodLabel } = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let label = '';

    switch (period) {
      case 'today':
        startDate = startOfDay(now);
        endDate = endOfDay(now);
        label = format(now, 'dd MMMM yyyy', { locale: localeId });
        break;
      case 'yesterday':
        const yesterday = subDays(now, 1);
        startDate = startOfDay(yesterday);
        endDate = endOfDay(yesterday);
        label = format(yesterday, 'dd MMMM yyyy', { locale: localeId });
        break;
      case '7days':
        startDate = startOfDay(subDays(now, 6));
        endDate = endOfDay(now);
        label = `${format(startDate, 'dd MMM yyyy', { locale: localeId })} - ${format(endDate, 'dd MMM yyyy', { locale: localeId })}`;
        break;
      case 'this_month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        label = format(now, 'MMMM yyyy', { locale: localeId });
        break;
      case 'last_month':
        const lastM = subMonths(now, 1);
        startDate = startOfMonth(lastM);
        endDate = endOfMonth(lastM);
        label = format(lastM, 'MMMM yyyy', { locale: localeId });
        break;
      case 'custom_date':
        const cd = new Date(customDate + 'T00:00:00');
        startDate = startOfDay(isNaN(cd.getTime()) ? now : cd);
        endDate = endOfDay(isNaN(cd.getTime()) ? now : cd);
        label = format(startDate, 'dd MMMM yyyy', { locale: localeId });
        break;
      case 'custom_month':
        const [yr, mo] = customMonth.split('-');
        const cmDate = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
        startDate = startOfMonth(cmDate);
        endDate = endOfMonth(cmDate);
        label = format(cmDate, 'MMMM yyyy', { locale: localeId });
        break;
      default:
        startDate = startOfDay(now);
        endDate = endOfDay(now);
        label = format(now, 'dd MMMM yyyy', { locale: localeId });
    }

    return { start: startDate, end: endDate, periodLabel: label };
  }, [period, customDate, customMonth]);

  useEffect(() => {
    fetchRestoReportData();
  }, [start, end]);

  const fetchRestoReportData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          item_id,
          type,
          quantity,
          department,
          notes,
          created_at,
          user_id,
          items:items (
            id,
            name,
            unit,
            department
          )
        `)
        .eq('type', 'OUT')
        .ilike('department', '%resto%')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching resto report data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group transactions by item for the Summary Rekap Table
  const itemSummaryList = useMemo(() => {
    const map: Record<string, { itemId: string; name: string; unit: string; totalQty: number; txCount: number }> = {};

    transactions.forEach(tx => {
      const itId = tx.item_id || tx.items?.id || 'unknown';
      const itName = tx.items?.name || 'Barang Gudang';
      const itUnit = tx.items?.unit || 'pcs';
      const qty = Number(tx.quantity) || 0;

      if (!map[itId]) {
        map[itId] = {
          itemId: itId,
          name: itName,
          unit: itUnit,
          totalQty: 0,
          txCount: 0
        };
      }

      map[itId].totalQty += qty;
      map[itId].txCount += 1;
    });

    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [transactions]);

  const totalQuantityOut = useMemo(() => {
    return transactions.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
  }, [transactions]);

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const printTime = format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: localeId });

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('HOTEL ALIA MATRAMAN', 14, 18);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN PENGAMBILAN BARANG RESTO', 14, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${periodLabel}`, 14, 32);
    doc.text(`Total Transaksi: ${transactions.length} | Total Kuantitas: ${totalQuantityOut} item`, 14, 38);

    // Summary Table (Rekap per Barang)
    const tableBody = itemSummaryList.map((item, idx) => [
      (idx + 1).toString(),
      item.name,
      item.totalQty.toString(),
      item.unit
    ]);

    autoTable(doc, {
      startY: 44,
      head: [['No', 'Barang', 'Total Keluar', 'Satuan']],
      body: tableBody.length > 0 ? tableBody : [['-', 'Tidak ada transaksi pengambilan pada periode ini', '-', '-']],
      theme: 'grid',
      headStyles: { 
        fillColor: [230, 92, 0], // Amber-Orange Alia
        textColor: 255,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 100 },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 30, halign: 'center' }
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 80;

    // Printed timestamp & Signatures
    doc.setFontSize(8);
    doc.text(`Dicetak pada: ${printTime}`, 14, finalY + 12);

    // Signatures
    const sigY = finalY + 22;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Petugas Restoran / Dapur,', 30, sigY);
    doc.text('Kepala Logistik / Gudang,', 130, sigY);

    doc.line(25, sigY + 22, 75, sigY + 22);
    doc.line(125, sigY + 22, 175, sigY + 22);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('( .................................... )', 28, sigY + 26);
    doc.text('( .................................... )', 128, sigY + 26);

    doc.save(`Laporan_Resto_${period}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-16 font-sans animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">
            HOTEL ALIA MATRAMAN
          </span>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Laporan Pengambilan Resto</h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Rekapitulasi pengeluaran barang gudang untuk operasional restoran</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            title="Cetak via Browser"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-[#E65C00] hover:bg-[#CF5300] text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs shadow-orange-500/20"
            title="Unduh PDF Resmi"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* Period Filter Selector */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-3.5 space-y-3 no-print">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-gray-700 uppercase flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
            <span>Pilih Periode Laporan</span>
          </label>
          <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200/60">
            {periodLabel}
          </span>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: 'yesterday', label: 'Kemarin' },
            { id: '7days', label: '7 Hari Terakhir' },
            { id: 'this_month', label: 'Bulan Ini' },
            { id: 'last_month', label: 'Bulan Lalu' },
            { id: 'custom_date', label: 'Pilih Tanggal' },
            { id: 'custom_month', label: 'Pilih Bulan' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id as RestoPeriod)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                period === tab.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Custom Date Input */}
        {period === 'custom_date' && (
          <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">Tanggal:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
            />
          </div>
        )}

        {/* Custom Month Input */}
        {period === 'custom_month' && (
          <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">Bulan:</span>
            <input
              type="month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* KPI Summary Banner */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-xs">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Jumlah Transaksi</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{transactions.length} <span className="text-xs text-gray-400 font-semibold">transaksi</span></p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-xs">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Total Barang Keluar</p>
          <p className="text-2xl font-black text-orange-600 mt-1">{totalQuantityOut} <span className="text-xs text-gray-400 font-semibold">item</span></p>
        </div>
      </div>

      {/* Print Document Header (Visible in print mode) */}
      <div className="hidden print:block text-center border-b-2 border-gray-800 pb-3 mb-4">
        <h1 className="text-xl font-black uppercase tracking-wider">HOTEL ALIA MATRAMAN</h1>
        <h2 className="text-base font-bold">LAPORAN PENGAMBILAN BARANG RESTO</h2>
        <p className="text-xs mt-1">Periode: {periodLabel}</p>
        <p className="text-[10px] text-gray-600">Dicetak pada: {format(new Date(), 'dd MMMM yyyy • HH:mm', { locale: localeId })}</p>
      </div>

      {/* Table: Rekapitulasi per Barang */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-amber-600" />
            <span>Rekapitulasi Barang Keluar Resto</span>
          </h3>
          <span className="text-[11px] font-bold text-gray-500">{itemSummaryList.length} jenis barang</span>
        </div>

        {loading ? (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-600 mx-auto" />
            <p className="text-xs text-gray-500 font-medium">Memuat data rekapitulasi...</p>
          </div>
        ) : itemSummaryList.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Package className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-xs font-bold text-gray-700">Tidak ada data pengambilan pada periode ini</p>
            <p className="text-[11px] text-gray-400">Silakan pilih periode tanggal atau bulan lain</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 font-black uppercase text-[10px] border-b border-gray-200">
                  <th className="py-2.5 px-3.5 w-12 text-center">No</th>
                  <th className="py-2.5 px-3.5">Nama Barang</th>
                  <th className="py-2.5 px-3.5 text-right">Total Keluar</th>
                  <th className="py-2.5 px-3.5 text-center w-24">Satuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itemSummaryList.map((it, idx) => (
                  <tr key={it.itemId} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-2.5 px-3.5 text-center text-gray-500 font-bold">{idx + 1}</td>
                    <td className="py-2.5 px-3.5 font-extrabold text-gray-900">{it.name}</td>
                    <td className="py-2.5 px-3.5 text-right font-black text-orange-600">{it.totalQty}</td>
                    <td className="py-2.5 px-3.5 text-center text-gray-600 font-semibold">{it.unit}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 font-black text-gray-900 border-t border-gray-200">
                  <td colSpan={2} className="py-2.5 px-3.5 text-right uppercase text-[10px]">Total Kuantitas:</td>
                  <td className="py-2.5 px-3.5 text-right text-orange-600 font-black">{totalQuantityOut}</td>
                  <td className="py-2.5 px-3.5 text-center text-gray-500">item</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Detail Riwayat Transaksi on that period */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-4 space-y-3 no-print">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
              Rincian Transaksi
            </h4>
            <span className="text-[11px] text-gray-500 font-bold">{transactions.length} catatan</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {transactions.map(tx => (
              <div 
                key={tx.id}
                className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-900 truncate">
                    {tx.items?.name || 'Barang Gudang'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {format(new Date(tx.created_at), 'dd MMM yyyy • HH:mm', { locale: localeId })}
                    {tx.notes ? ` • "${tx.notes}"` : ''}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/60">
                    {tx.quantity} {tx.items?.unit || 'pcs'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print Signatures Block (Visible only in print mode) */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-8 mt-6 text-center text-xs">
        <div className="space-y-16">
          <p className="font-bold">Petugas Restoran / Dapur,</p>
          <p className="border-t border-gray-400 pt-1 w-48 mx-auto">( .................................... )</p>
        </div>
        <div className="space-y-16">
          <p className="font-bold">Kepala Logistik / Gudang,</p>
          <p className="border-t border-gray-400 pt-1 w-48 mx-auto">( .................................... )</p>
        </div>
      </div>

    </div>
  );
}
