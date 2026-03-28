import React from 'react';
import { PurchaseOrder, Supplier } from '../types';
import { format } from 'date-fns';

interface PurchaseOrderDocumentProps {
  po: PurchaseOrder;
  supplier?: Supplier;
}

export function PurchaseOrderDocument({ po, supplier }: PurchaseOrderDocumentProps) {
  const hotelInfo = {
    name: 'Hotel Alia Matraman',
    address: 'Jl. Matraman Raya No.224',
    city: 'Jakarta Timur',
    zip: '13150',
    phone: '(021) 8590 5555'
  };

  const subtotal = po.items?.reduce((acc, item) => acc + (item.quantity * item.price), 0) || 0;
  const tax = 0; // Assuming 0 for now or can be calculated
  const shipping = 0;
  const total = subtotal + tax + shipping;

  return (
    <div className="bg-white text-black p-8 shadow-2xl max-w-[800px] mx-auto font-sans border border-gray-200" id="po-document">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-2">{hotelInfo.name}</h1>
          <div className="text-sm text-gray-600 space-y-0.5">
            <p>{hotelInfo.address}</p>
            <p>{hotelInfo.city}, {hotelInfo.zip}</p>
            <p>Phone: {hotelInfo.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-bold text-gray-800 uppercase tracking-tighter">Purchase Order</h2>
        </div>
      </div>

      {/* To / Ship To Section */}
      <div className="grid grid-cols-2 gap-0 mb-8 border border-gray-400">
        <div className="border-r border-gray-400">
          <div className="bg-gray-200 px-3 py-1 border-b border-gray-400 font-bold text-sm">To:</div>
          <div className="p-3 text-sm space-y-1 min-h-[120px]">
            <p><span className="font-semibold">Name:</span> {supplier?.contact_person || '-'}</p>
            <p><span className="font-semibold">Company:</span> {supplier?.name || '-'}</p>
            <p><span className="font-semibold">Address:</span> {supplier?.address || '-'}</p>
            <p><span className="font-semibold">Phone:</span> {supplier?.phone || '-'}</p>
          </div>
        </div>
        <div>
          <div className="bg-gray-200 px-3 py-1 border-b border-gray-400 font-bold text-sm">Ship To:</div>
          <div className="p-3 text-sm space-y-1 min-h-[120px]">
            <p><span className="font-semibold">Name:</span> Receiving Dept</p>
            <p><span className="font-semibold">Company:</span> {hotelInfo.name}</p>
            <p><span className="font-semibold">Address:</span> {hotelInfo.address}</p>
            <p><span className="font-semibold">City, State, Zip:</span> {hotelInfo.city}, {hotelInfo.zip}</p>
            <p><span className="font-semibold">Phone:</span> {hotelInfo.phone}</p>
          </div>
        </div>
      </div>

      {/* Info Table */}
      <div className="mb-8 overflow-hidden border border-gray-400">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-200 border-b border-gray-400">
              <th className="px-3 py-1 border-r border-gray-400 text-center w-1/4">Date</th>
              <th className="px-3 py-1 border-r border-gray-400 text-center w-1/4">Requisitioned By</th>
              <th className="px-3 py-1 border-r border-gray-400 text-center w-1/4">F.O.B Point</th>
              <th className="px-3 py-1 text-center w-1/4">Terms</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 border-r border-gray-400 text-center">{format(new Date(po.created_at), 'dd/MM/yyyy')}</td>
              <td className="px-3 py-2 border-r border-gray-400 text-center">{po.user_profile?.full_name || 'Admin'}</td>
              <td className="px-3 py-2 border-r border-gray-400 text-center">-</td>
              <td className="px-3 py-2 text-center">Net 30</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Items Table */}
      <div className="mb-8 border border-gray-400 min-h-[400px] flex flex-col">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-200 border-b border-gray-400">
              <th className="px-3 py-1 border-r border-gray-400 text-center w-[15%]">Quantity</th>
              <th className="px-3 py-1 border-r border-gray-400 text-left w-[55%]">Description</th>
              <th className="px-3 py-1 border-r border-gray-400 text-right w-[15%]">Unit Price</th>
              <th className="px-3 py-1 text-right w-[15%]">Total</th>
            </tr>
          </thead>
          <tbody>
            {po.items?.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="px-3 py-2 border-r border-gray-400 text-center">{item.quantity} {item.item?.unit}</td>
                <td className="px-3 py-2 border-r border-gray-400 text-left">{item.item?.name}</td>
                <td className="px-3 py-2 border-r border-gray-400 text-right">Rp {item.price.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-semibold">Rp {(item.quantity * item.price).toLocaleString()}</td>
              </tr>
            ))}
            {/* Fill empty rows to maintain layout height */}
            {Array.from({ length: Math.max(0, 10 - (po.items?.length || 0)) }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-gray-100 h-8">
                <td className="border-r border-gray-400"></td>
                <td className="border-r border-gray-400"></td>
                <td className="border-r border-gray-400"></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="grid grid-cols-12 gap-0 border border-gray-400">
        <div className="col-span-8 border-r border-gray-400 p-3">
          <p className="text-xs font-bold uppercase mb-2">Comments:</p>
          <div className="text-sm text-gray-500 italic">
            Please deliver during business hours.
          </div>
        </div>
        <div className="col-span-4">
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b border-gray-400">
                <td className="px-3 py-1 font-bold text-right border-r border-gray-400 w-1/2">Subtotal</td>
                <td className="px-3 py-1 text-right">Rp {subtotal.toLocaleString()}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="px-3 py-1 font-bold text-right border-r border-gray-400">Tax</td>
                <td className="px-3 py-1 text-right">Rp {tax.toLocaleString()}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="px-3 py-1 font-bold text-right border-r border-gray-400">Shipping</td>
                <td className="px-3 py-1 text-right">Rp {shipping.toLocaleString()}</td>
              </tr>
              <tr className="bg-gray-100">
                <td className="px-3 py-2 font-bold text-right border-r border-gray-400">Total</td>
                <td className="px-3 py-2 text-right font-bold">Rp {total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
