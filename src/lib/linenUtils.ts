import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState } from '../types-linen';

export function calculateCleanStockMap(state: LinenState): Record<string, number> {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const result: Record<string, number> = {};

  ITEM_TYPES.forEach(type => {
    const cleanItem = state.cleanItems?.find((i: any) => i.itemName === type);
    const currentStock = cleanItem ? Number(cleanItem.quantity || 0) : 0;

    const isItemAfterPeriod = (item: any) => {
      if (!item || !item.date) return false;
      const itemDate = String(item.date).trim().slice(0, 10);
      return itemDate > todayStr;
    };

    const getQuantity = (items: any[], filterFn: (item: any) => boolean) => {
      if (!Array.isArray(items)) return 0;
      return items.filter(item => item.itemName === type && filterFn(item))
                  .reduce((acc, item) => acc + Number(item.quantity || 0), 0);
    };

    const incomingAfter = getQuantity(state.incomingItems, isItemAfterPeriod);
    const outgoingAfter = getQuantity(state.outgoingItems, item => isItemAfterPeriod(item) && (item.destination === 'Laundry' || item.destination === 'Afkir' || item.destination === 'Diambil HK'));
    const roomUsageAfter = getQuantity(state.roomItems, isItemAfterPeriod);

    const totalClean = currentStock - incomingAfter + outgoingAfter + roomUsageAfter;
    result[type] = Math.max(0, totalClean);
  });

  return result;
}

export function calculateNewStockMap(state: LinenState): Record<string, number> {
  const result: Record<string, number> = {};

  ITEM_TYPES.forEach(type => {
    const transactions = Array.isArray(state?.newItemTransactions) ? state.newItemTransactions : [];
    const itemTxs = transactions.filter((t: any) => t.itemName === type);

    if (itemTxs.length > 0) {
      const stockIn = itemTxs
        .filter((t: any) => t.type === 'Stock In')
        .reduce((acc: number, t: any) => acc + Number(t.quantity || 0), 0);
      const takeToClean = itemTxs
        .filter((t: any) => t.type === 'Take to Clean')
        .reduce((acc: number, t: any) => acc + Number(t.quantity || 0), 0);
      result[type] = Math.max(0, stockIn - takeToClean);
    } else {
      const storedItem = state?.newItems?.find((i: any) => i.itemName === type);
      result[type] = storedItem ? Math.max(0, Number(storedItem.quantity || 0)) : 0;
    }
  });

  return result;
}

export const downloadPDF = (title: string, headers: string[][], data: any[][]) => {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Dicetak pada: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 30);

  autoTable(doc, {
    head: headers,
    body: data,
    startY: 35,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [200, 155, 60], textColor: 255 }, // Hotel Alia Gold
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
};
