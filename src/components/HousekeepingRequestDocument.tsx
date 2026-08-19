import React from 'react';
import { HKRequest } from '../types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface HousekeepingRequestDocumentProps {
  request: HKRequest;
}

export function HousekeepingRequestDocument({ request }: HousekeepingRequestDocumentProps) {
  if (!request) return null;

  const formatDateDisplay = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMMM yyyy, HH:mm', { locale: idLocale });
    } catch (e) {
      return dateStr || '-';
    }
  };

  const getStatusText = (statusStr?: string) => {
    const s = (statusStr || '').toUpperCase();
    if (s === 'MENUNGGU' || s === 'PENDING') return 'MENUNGGU';
    if (s === 'DIPROSES' || s === 'PROCESSING') return 'DIPROSES';
    if (s === 'SELESAI' || s === 'COMPLETED') return 'SELESAI';
    if (s === 'DITOLAK' || s === 'REJECTED') return 'DITOLAK';
    return s || 'MENUNGGU';
  };

  const reqNum = request.request_number || `REQ-HK-${request.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="print-document bg-white text-black font-sans p-0 mx-auto max-w-[210mm] text-[9.5pt] leading-snug">
      {/* HEADER */}
      <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
        <div>
          <h1 className="text-[20pt] font-black uppercase tracking-wider text-black leading-none mb-1">
            HOTEL ALIA
          </h1>
          <p className="text-[11pt] font-bold tracking-widest text-gray-800 uppercase leading-none">
            MATRAMAN
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-[13pt] font-black text-black uppercase tracking-wide leading-none mb-1">
            FORM PERMINTAAN BARANG
          </h2>
          <p className="text-[8.5pt] font-mono text-gray-600 font-semibold leading-none">
            Dokumen Operasional Housekeeping
          </p>
        </div>
      </div>

      {/* INFORMASI PERMINTAAN */}
      <div className="mb-4 border border-gray-400 p-3 bg-white">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[9.5pt]">
          <div className="flex">
            <span className="w-[120px] font-bold text-gray-800 shrink-0">No. Permintaan</span>
            <span className="font-bold font-mono text-black">: {reqNum}</span>
          </div>
          <div className="flex">
            <span className="w-[110px] font-bold text-gray-800 shrink-0">Occupancy</span>
            <span className="font-bold text-black">: {request.occupancy_count ?? 0} Kamar</span>
          </div>
          <div className="flex">
            <span className="w-[120px] font-bold text-gray-800 shrink-0">Tanggal</span>
            <span className="text-black">: {formatDateDisplay(request.created_at)}</span>
          </div>
          <div className="flex">
            <span className="w-[110px] font-bold text-gray-800 shrink-0">Guest</span>
            <span className="font-bold text-black">: {request.breakfast_pax ?? 0} Tamu</span>
          </div>
          <div className="flex">
            <span className="w-[120px] font-bold text-gray-800 shrink-0">Pemohon</span>
            <span className="font-bold text-black">: {request.requester_name || 'HK'}</span>
          </div>
          <div className="flex">
            <span className="w-[110px] font-bold text-gray-800 shrink-0">Status Req</span>
            <span className="font-bold text-black">: {getStatusText(request.status)}</span>
          </div>
        </div>
      </div>

      {/* DAFTAR BARANG DIMINTA */}
      <div className="mb-4">
        <h3 className="text-[10.5pt] font-bold text-black uppercase tracking-wide mb-2">
          DAFTAR BARANG YANG DIMINTA
        </h3>

        {(() => {
          const validPrintItems = (request.items || []).filter((item) => {
            const qty = Number(item.quantity);
            return Number.isFinite(qty) && qty > 0;
          });

          return (
            <table className="w-full border-collapse border border-gray-400 text-[9pt]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-400">
                  <th className="border-r border-gray-400 py-1.5 px-2 text-center w-[40px] font-bold text-black uppercase">NO</th>
                  <th className="border-r border-gray-400 py-1.5 px-3 text-left font-bold text-black uppercase">NAMA BARANG</th>
                  <th className="border-r border-gray-400 py-1.5 px-3 text-right w-[85px] font-bold text-black uppercase">JUMLAH</th>
                  <th className="border-r border-gray-400 py-1.5 px-2 text-center w-[70px] font-bold text-black uppercase">SATUAN</th>
                  <th className="py-1.5 px-3 text-left w-[180px] font-bold text-black uppercase">KETERANGAN</th>
                </tr>
              </thead>
              <tbody>
                {validPrintItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-300">
                    <td className="border-r border-gray-300 py-1.5 px-2 text-center font-mono">{idx + 1}</td>
                    <td className="border-r border-gray-300 py-1.5 px-3 font-bold text-black">{item.item_name}</td>
                    <td className="border-r border-gray-300 py-1.5 px-3 text-right font-bold font-mono text-black">{item.quantity}</td>
                    <td className="border-r border-gray-300 py-1.5 px-2 text-center text-gray-900">{item.unit}</td>
                    <td className="py-1.5 px-3 text-gray-800 text-[8.5pt]">{item.notes || '-'}</td>
                  </tr>
                ))}
                {validPrintItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500 italic">
                      Tidak ada barang yang diminta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          );
        })()}
      </div>

      {/* CATATAN (JIKA ADA) */}
      {request.notes && request.notes.trim() !== '' && (
        <div className="mb-4 p-2.5 border border-gray-300 bg-gray-50">
          <span className="font-bold text-black uppercase block text-[8.5pt] mb-0.5">CATATAN</span>
          <p className="text-gray-800 italic text-[9pt]">"{request.notes}"</p>
        </div>
      )}

      {/* STATUS PERMINTAAN */}
      <div className="mb-6 p-2 border border-gray-300 font-bold text-[9.5pt] text-black uppercase">
        STATUS PERMINTAAN: {getStatusText(request.status)}
      </div>

      {/* APPROVAL / PARAF */}
      <div className="mt-6 pt-2 border-t border-gray-300 page-break-inside-avoid">
        <div className="grid grid-cols-3 gap-4 text-center text-[9pt]">
          <div>
            <p className="font-bold uppercase text-gray-800 mb-1">DIBUAT OLEH</p>
            <p className="text-gray-600 text-[8.5pt] mb-12">Housekeeping</p>
            <p className="font-bold text-black border-t border-gray-400 pt-1 mx-4">
              ( {request.requester_name || 'HK'} )
            </p>
          </div>

          <div>
            <p className="font-bold uppercase text-gray-800 mb-1">DIPERIKSA OLEH</p>
            <p className="text-gray-600 text-[8.5pt] mb-12">Logistik</p>
            <p className="font-bold text-black border-t border-gray-400 pt-1 mx-4">
              ( Logistik )
            </p>
          </div>

          <div>
            <p className="font-bold uppercase text-gray-800 mb-1">DITERIMA OLEH</p>
            <p className="text-gray-600 text-[8.5pt] mb-12">Penerima</p>
            <p className="font-bold text-black border-t border-gray-400 pt-1 mx-4">
              ( ____________________ )
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-8 pt-2 border-t border-gray-300 flex justify-between items-center text-[8pt] text-gray-600 font-mono">
        <div>Hotel Alia Matraman &bull; Form Permintaan Barang</div>
        <div>Nomor dokumen: {reqNum}</div>
      </div>
    </div>
  );
}
