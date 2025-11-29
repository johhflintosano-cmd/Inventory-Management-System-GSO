import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, FileText, Calendar, Printer, CheckSquare, FileSpreadsheet, Package, Eye, Search, Plus, Minus, Trash2, PackageMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { reportsApi, inventoryApi } from "@/lib/api";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getSocket } from "@/lib/socket";
import * as XLSX from 'xlsx';

interface GenerateReportsProps {
  isAdmin?: boolean;
  user?: {
    id: string;
    name: string;
    role: string;
  };
}

interface InventoryItem {
  id: string;
  supplier: string;
  dateReceived: string;
  quantity: number;
  unitOfMeasure: string;
  itemName: string;
  location: string;
  unitCost: string;
  amount: string;
  remarks: string | null;
  createdAt: string;
  particulars?: string;
  unit?: string;
}

interface CartItem {
  inventoryItemId: string;
  particulars: string;
  unit: string;
  unitCost: string;
  quantity: number;
  amount: string;
  availableQty: number;
}

interface Report {
  id: string;
  name: string;
  type: string;
  dateRange: string;
  data: any;
  createdAt: string;
  createdBy: string;
}

interface ReleasedOrderReport {
  id: string;
  sroNo: string;
  rsNo?: string;
  departmentOffice: string;
  isPartial: boolean;
  items: CartItem[];
  totalAmount: string;
  releasedBy: string;
  receivedBy?: string;
  createdAt: string;
}

export default function GenerateReports({ isAdmin = true, user }: GenerateReportsProps) {
  const { toast } = useToast();
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Released Order Report state
  const [showReleasedOrderDialog, setShowReleasedOrderDialog] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentOffice, setDepartmentOffice] = useState("");
  const [rsNo, setRsNo] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [showCartDialog, setShowCartDialog] = useState(false);
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [insufficientItem, setInsufficientItem] = useState<{ name: string; requested: number; available: number } | null>(null);

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: inventoryApi.getAll,
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery<Report[]>({
    queryKey: ['/api/reports'],
    queryFn: reportsApi.getAll,
  });

  const { data: releasedReports = [], isLoading: loadingReleasedReports } = useQuery<ReleasedOrderReport[]>({
    queryKey: ['/api/released-orders/reports'],
  });

  // Listen for real-time inventory changes
  useEffect(() => {
    const socket = getSocket();
    const handleInventoryChange = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    };
    
    socket.on('inventory_change', handleInventoryChange);
    return () => { socket.off('inventory_change', handleInventoryChange); };
  }, []);

  const generateReportMutation = useMutation({
    mutationFn: ({ itemIds, dateRange }: { itemIds: string[]; dateRange: string }) =>
      reportsApi.createReceivingReport(itemIds, dateRange),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      toast({ title: "Report generated successfully", description: `Receiving Report created with ${selectedItems.length} items` });
      setSelectedItems([]);
      setPreviewReport(data);
    },
    onError: (error: any) => {
      toast({ title: "Failed to generate report", description: error.message, variant: "destructive" });
    },
  });

  // Generate released order report mutation
  const generateReleasedReportMutation = useMutation({
    mutationFn: async (data: { items: CartItem[]; departmentOffice: string; rsNo?: string; isPartial?: boolean; receivedBy?: string }) => {
      const res = await apiRequest("POST", "/api/released-orders/generate", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Report Generated", description: `Released Order ${data.sroNo} has been created. Inventory has been deducted.` });
      setCart([]);
      setDepartmentOffice("");
      setRsNo("");
      setIsPartial(false);
      setReceivedBy("");
      setShowCartDialog(false);
      setShowReleasedOrderDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      // Export Excel immediately after generating
      exportReleasedToExcel(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate report", variant: "destructive" });
    },
  });

  const filterByDate = (items: InventoryItem[]) => {
    if (dateFilter === "all") return items;
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (dateFilter) {
      case "today":
        cutoff.setHours(0, 0, 0, 0);
        break;
      case "week":
        cutoff.setDate(now.getDate() - 7);
        break;
      case "month":
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case "quarter":
        cutoff.setMonth(now.getMonth() - 3);
        break;
      default:
        return items;
    }
    
    return items.filter(item => new Date(item.createdAt) >= cutoff);
  };

  const filteredInventory = filterByDate(inventory);

  // Filter items by search for Released Order
  const filteredItemsForRelease = inventory.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    const itemName = item.itemName || item.particulars || '';
    return itemName.toLowerCase().includes(searchLower);
  });

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredInventory.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredInventory.map(item => item.id));
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleGenerateReport = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No items selected", description: "Please select at least one item for the report", variant: "destructive" });
      return;
    }
    generateReportMutation.mutate({ itemIds: selectedItems, dateRange: dateFilter });
  };

  // Add item to cart for Released Order
  const addToCart = (item: InventoryItem) => {
    const itemName = item.itemName || item.particulars || 'Unknown Item';
    const itemUnit = item.unitOfMeasure || item.unit || 'pcs';
    const existingIndex = cart.findIndex(c => c.inventoryItemId === item.id);
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      const newQty = newCart[existingIndex].quantity + 1;
      
      if (newQty > item.quantity) {
        setInsufficientItem({ name: itemName, requested: newQty, available: item.quantity });
        setShowInsufficientDialog(true);
        return;
      }
      
      newCart[existingIndex].quantity = newQty;
      newCart[existingIndex].amount = (newQty * Number(item.unitCost)).toFixed(2);
      setCart(newCart);
    } else {
      if (item.quantity < 1) {
        setInsufficientItem({ name: itemName, requested: 1, available: item.quantity });
        setShowInsufficientDialog(true);
        return;
      }
      
      setCart([...cart, {
        inventoryItemId: item.id,
        particulars: itemName,
        unit: itemUnit,
        unitCost: item.unitCost,
        quantity: 1,
        amount: item.unitCost,
        availableQty: item.quantity,
      }]);
    }
    
    toast({ title: "Added to Cart", description: `${itemName} added to your order.` });
  };

  // Update quantity in cart
  const updateCartQty = (index: number, newQty: number) => {
    if (newQty < 1) {
      removeFromCart(index);
      return;
    }
    
    const item = cart[index];
    const inventoryItem = inventory.find(i => i.id === item.inventoryItemId);
    
    if (inventoryItem && newQty > inventoryItem.quantity) {
      setInsufficientItem({ name: item.particulars, requested: newQty, available: inventoryItem.quantity });
      setShowInsufficientDialog(true);
      return;
    }
    
    const newCart = [...cart];
    newCart[index].quantity = newQty;
    newCart[index].amount = (newQty * Number(item.unitCost)).toFixed(2);
    setCart(newCart);
  };

  // Remove from cart
  const removeFromCart = (index: number) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
  };

  // Calculate cart total
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.amount), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Handle submit released order
  const handleSubmitReleasedOrder = () => {
    if (!departmentOffice.trim()) {
      toast({ title: "Error", description: "Department/Office is required", variant: "destructive" });
      return;
    }
    
    if (cart.length === 0) {
      toast({ title: "Error", description: "Please add items to your order", variant: "destructive" });
      return;
    }
    
    // Convert string values to numbers for API
    const itemsWithNumbers = cart.map(item => ({
      ...item,
      unitCost: Number(item.unitCost),
      amount: Number(item.amount),
    }));
    
    generateReleasedReportMutation.mutate({
      items: itemsWithNumbers,
      departmentOffice,
      rsNo: rsNo || undefined,
      isPartial,
      receivedBy: receivedBy || undefined,
    });
  };

  const exportToExcel = async (report: Report) => {
    const items = report.data.items || [];
    const rrNo = `RR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const primarySupplier = items[0]?.supplier || 'Multiple Suppliers';
    const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    const totalQty = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const maxItemsPerPage = 12;
    
    if (items.length > maxItemsPerPage) {
      toast({ 
        title: "Large report", 
        description: `This report has ${items.length} items. Creating multi-page export...` 
      });
    }
    
    try {
      const response = await fetch('/api/reports/template');
      
      if (response.ok) {
        const templateBuffer = await response.arrayBuffer();
        const numPages = Math.ceil(items.length / maxItemsPerPage);
        const wb = XLSX.utils.book_new();
        
        for (let page = 0; page < numPages; page++) {
          const pageItems = items.slice(page * maxItemsPerPage, (page + 1) * maxItemsPerPage);
          const isLastPage = page === numPages - 1;
          
          const templateWb = XLSX.read(templateBuffer, { type: 'array' });
          const ws = templateWb.Sheets[templateWb.SheetNames[0]];
          
          ws['E5'] = { t: 's', v: new Date(report.createdAt).toLocaleDateString() };
          ws['B6'] = { t: 's', v: `${rrNo}${numPages > 1 ? ` (Page ${page + 1}/${numPages})` : ''}` };
          ws['B7'] = { t: 's', v: primarySupplier };
          
          const dataStartRow = 11;
          
          for (let i = 0; i < maxItemsPerPage; i++) {
            const rowNum = dataStartRow + i;
            if (i < pageItems.length) {
              const item = pageItems[i];
              ws[`A${rowNum}`] = { t: 'n', v: item.quantity };
              ws[`C${rowNum}`] = { t: 's', v: item.itemName };
              ws[`D${rowNum}`] = { t: 's', v: item.location };
              ws[`E${rowNum}`] = { t: 'n', v: Number(item.unitCost) };
              ws[`F${rowNum}`] = { t: 'n', v: Number(item.amount) };
              ws[`G${rowNum}`] = { t: 's', v: item.remarks || '' };
            } else {
              ws[`A${rowNum}`] = { t: 's', v: '' };
              ws[`C${rowNum}`] = { t: 's', v: '' };
              ws[`D${rowNum}`] = { t: 's', v: '' };
              ws[`E${rowNum}`] = { t: 's', v: '' };
              ws[`F${rowNum}`] = { t: 's', v: '' };
              ws[`G${rowNum}`] = { t: 's', v: '' };
            }
          }
          
          if (isLastPage) {
            const totalRow = dataStartRow + Math.min(pageItems.length, maxItemsPerPage);
            ws[`E${totalRow}`] = { t: 's', v: 'TOTAL:' };
            ws[`F${totalRow}`] = { t: 'n', v: totalAmount };
            ws[`G${totalRow}`] = { t: 's', v: `(${totalQty} items)` };
          }
          
          const sheetName = numPages > 1 ? `Page ${page + 1}` : 'Sheet1';
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        
        const fileName = `Receiving_Report_${rrNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        const pageInfo = numPages > 1 ? ` (${numPages} pages)` : '';
        toast({ title: "Excel exported", description: `${fileName} has been downloaded using official template${pageInfo}` });
        return;
      }
    } catch (error) {
      console.error('Template fetch failed, using fallback format:', error);
    }
    
    const wb = XLSX.utils.book_new();
    const numPages = Math.ceil(items.length / maxItemsPerPage);
    
    for (let page = 0; page < numPages; page++) {
      const pageItems = items.slice(page * maxItemsPerPage, (page + 1) * maxItemsPerPage);
      const isLastPage = page === numPages - 1;
      
      const wsData: any[][] = [];
      
      wsData.push(['', '', 'Divine Word College of San Jose', '', '', '', '', '', '']);
      wsData.push(['', '', '', '', '', '', '', '', '']);
      wsData.push(['', '', 'Gen. Lukban Street, San Jose, Occidental Mindoro', '', '', '', '', '', '']);
      wsData.push(['', '', 'RECEIVING REPORT', '', '', '', '', '', '']);
      wsData.push(['', '', '', 'Date:', new Date(report.createdAt).toLocaleDateString(), '', '', '', '']);
      wsData.push([`RR No. : ${rrNo}${numPages > 1 ? ` (Page ${page + 1}/${numPages})` : ''}`, '', '', '', '', '', '', '', '']);
      wsData.push([`Supplier : ${primarySupplier}`, '', '', 'P.O. No:', '', '', '', '', '']);
      wsData.push(['', '', '', 'D.R. No. :', '', '', '', '', '']);
      wsData.push(['', '', '', '', '', '', '', '', '']);
      wsData.push(['QUANTITY', '', 'ITEMS DELIVERED', 'Location', 'Unit Cost', 'Amount', 'REMARKS', '', '']);
      
      pageItems.forEach((item: any) => {
        wsData.push([
          item.quantity,
          '',
          item.itemName,
          item.location,
          Number(item.unitCost).toFixed(2),
          Number(item.amount).toFixed(2),
          item.remarks || '',
          '',
          ''
        ]);
      });
      
      while (wsData.length < 22) {
        wsData.push(['', '', '', '', '', '', '', '', '']);
      }
      
      if (isLastPage) {
        wsData.push(['', '', '', '', 'TOTAL:', totalAmount.toFixed(2), `(${totalQty} items)`, '', '']);
        wsData.push(['RECEIVED & CHECKED BY:', '', '', '', '', '', '', '', '']);
        wsData.push(['', '', '', '', '', '', '', '', '']);
        wsData.push(['', '', '', '', '', '', '', '', '']);
        wsData.push(['ELMER S. MALIBIRAN', '', '', '', '', '', '', '', '']);
        wsData.push(['Signature Over Printed Name', '', '', '', '', '', '', '', '']);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      ws['!cols'] = [
        { wch: 10 }, { wch: 5 }, { wch: 30 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 5 }, { wch: 5 },
      ];
      
      ws['!merges'] = [
        { s: { c: 2, r: 0 }, e: { c: 5, r: 0 } },
        { s: { c: 2, r: 2 }, e: { c: 6, r: 2 } },
        { s: { c: 2, r: 3 }, e: { c: 4, r: 3 } },
        { s: { c: 0, r: 9 }, e: { c: 1, r: 9 } },
        { s: { c: 6, r: 9 }, e: { c: 8, r: 9 } },
      ];
      
      const sheetName = numPages > 1 ? `Page ${page + 1}` : 'Sheet1';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    
    const fileName = `Receiving_Report_${rrNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    const pageInfo = numPages > 1 ? ` (${numPages} pages)` : '';
    toast({ title: "Excel exported", description: `${fileName} has been downloaded${pageInfo}` });
  };

  // Export Released Order to Excel
  const exportReleasedToExcel = async (report: ReleasedOrderReport) => {
    const items = report.items || [];
    const maxItemsPerPage = 12;
    
    try {
      const response = await fetch('/api/released-orders/template');
      
      if (response.ok) {
        const templateBuffer = await response.arrayBuffer();
        const numPages = Math.ceil(Math.max(items.length, 1) / maxItemsPerPage);
        const wb = XLSX.utils.book_new();
        
        for (let page = 0; page < numPages; page++) {
          const pageItems = items.slice(page * maxItemsPerPage, (page + 1) * maxItemsPerPage);
          const isLastPage = page === numPages - 1;
          
          const templateWb = XLSX.read(templateBuffer, { type: 'array' });
          const ws = templateWb.Sheets[templateWb.SheetNames[0]];
          
          const dateStr = new Date(report.createdAt).toLocaleDateString();
          ws['A9'] = { t: 's', v: `DATE: ${dateStr}` };
          
          const sroNoStr = numPages > 1 
            ? `R.S.No.: ${report.sroNo} (Page ${page + 1}/${numPages})`
            : `R.S.No.: ${report.sroNo}`;
          ws['A10'] = { t: 's', v: sroNoStr };
          ws['F10'] = { t: 's', v: report.isPartial ? 'Partial' : 'Full' };
          
          ws['A11'] = { t: 's', v: `Dept./ Office: ${report.departmentOffice}` };
          
          const dataStartRow = 15;
          for (let i = 0; i < maxItemsPerPage; i++) {
            const rowNum = dataStartRow + i;
            if (i < pageItems.length) {
              const item = pageItems[i];
              ws[`A${rowNum}`] = { t: 'n', v: i + 1 + (page * maxItemsPerPage) };
              ws[`B${rowNum}`] = { t: 'n', v: item.quantity };
              ws[`C${rowNum}`] = { t: 's', v: item.unit };
              ws[`D${rowNum}`] = { t: 's', v: item.particulars };
              ws[`E${rowNum}`] = { t: 'n', v: Number(item.unitCost) };
              ws[`F${rowNum}`] = { t: 'n', v: Number(item.amount) };
              ws[`G${rowNum}`] = { t: 's', v: '' };
            } else {
              ws[`A${rowNum}`] = { t: 's', v: '' };
              ws[`B${rowNum}`] = { t: 's', v: '' };
              ws[`C${rowNum}`] = { t: 's', v: '' };
              ws[`D${rowNum}`] = { t: 's', v: '' };
              ws[`E${rowNum}`] = { t: 's', v: '' };
              ws[`F${rowNum}`] = { t: 's', v: '' };
              ws[`G${rowNum}`] = { t: 's', v: '' };
            }
          }
          
          if (isLastPage) {
            ws['F27'] = { t: 'n', v: Number(report.totalAmount) };
          } else {
            ws['D27'] = { t: 's', v: '(Continued on next page)' };
            const pageTotal = pageItems.reduce((sum, item) => sum + Number(item.amount), 0);
            ws['F27'] = { t: 'n', v: pageTotal };
          }
          
          ws['E30'] = { t: 's', v: report.receivedBy || 'REQUESTEE' };
          
          const sheetName = numPages > 1 ? `Page ${page + 1}` : 'Sheet1';
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        
        const fileName = `Released_Order_${report.sroNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        const pageInfo = numPages > 1 ? ` (${numPages} pages)` : '';
        toast({ title: "Excel exported", description: `${fileName} has been downloaded${pageInfo}` });
        return;
      }
    } catch (error) {
      console.error('Template fetch failed, using fallback format:', error);
    }
    
    // Fallback format
    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [];
    
    wsData.push([]);
    wsData.push(['DIVINE WORD COLLEGE OF SAN JOSE', '', '', '', '', '', '']);
    wsData.push(['Gen. Lukban Street, San Jose, Occidental Mindoro', '', '', '', '', '', '']);
    wsData.push(['SUPPLY ROOM', '', '', '', '', '', '']);
    wsData.push([]);
    wsData.push([]);
    wsData.push(['SUPPLIES RELEASE ORDER', '', '', '', '', '', '']);
    wsData.push([]);
    wsData.push([`DATE: ${new Date(report.createdAt).toLocaleDateString()}`, '', '', '', '', '', '']);
    wsData.push([`R.S.No.: ${report.sroNo}`, '', '', '', '', report.isPartial ? 'Partial' : 'Full', '']);
    wsData.push([`Dept./ Office: ${report.departmentOffice}`, '', '', '', '', '', '']);
    wsData.push([]);
    wsData.push([]);
    wsData.push(['No.', 'QUANTITY', 'UNIT', 'PARTICULARS', 'U/Cost', 'AMOUNT', 'REMARKS']);
    
    items.forEach((item: CartItem, index: number) => {
      wsData.push([
        index + 1,
        item.quantity,
        item.unit,
        item.particulars,
        Number(item.unitCost),
        Number(item.amount),
        ''
      ]);
    });
    
    while (wsData.length < 26) {
      wsData.push(['', '', '', '', '', '', '']);
    }
    
    wsData.push(['', '', '', 'XXX-Nothing Follows-XXX', 'TOTAL:', Number(report.totalAmount), '']);
    wsData.push(['Released by:', '', '', '', 'Received by:', '', '']);
    wsData.push([]);
    wsData.push(['RONNIE V. ANDRADE', '', '', '', report.receivedBy || 'REQUESTEE', '', '']);
    wsData.push(['Supply Officer', '', '', '', 'Date:____________________', '', '']);
    wsData.push(['Supply Room Copy', '', '', '', '', '', '']);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    ws['!cols'] = [
      { wch: 8 },
      { wch: 10 },
      { wch: 8 },
      { wch: 35 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    
    const fileName = `Released_Order_${report.sroNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({ title: "Excel exported", description: `${fileName} has been downloaded` });
  };

  const handlePrint = (report: Report) => {
    const items = report.data.items || [];
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups for printing", variant: "destructive" });
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receiving Report - ${new Date(report.createdAt).toLocaleDateString()}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 18px; }
          .header h2 { margin: 5px 0; font-size: 16px; }
          .info { margin-bottom: 20px; }
          .info p { margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; }
          .totals { margin-top: 20px; text-align: right; }
          .footer { margin-top: 40px; }
          .signature-line { display: inline-block; width: 200px; border-bottom: 1px solid #000; margin: 0 20px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DIVINE WORD COLLEGE OF SAN JOSE</h1>
          <h2>RECEIVING REPORT</h2>
        </div>
        <div class="info">
          <p><strong>Date Generated:</strong> ${new Date(report.createdAt).toLocaleDateString()}</p>
          <p><strong>Report Period:</strong> ${report.dateRange}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Supplier</th>
              <th>Date Received</th>
              <th>Item Name</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Location</th>
              <th>Unit Cost</th>
              <th>Amount</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any, index: number) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.supplier}</td>
                <td>${new Date(item.dateReceived).toLocaleDateString()}</td>
                <td>${item.itemName}</td>
                <td>${item.quantity}</td>
                <td>${item.unitOfMeasure}</td>
                <td>${item.location}</td>
                <td>PHP ${Number(item.unitCost).toFixed(2)}</td>
                <td>PHP ${Number(item.amount).toFixed(2)}</td>
                <td>${item.remarks || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals">
          <p><strong>Total Quantity:</strong> ${report.data.totalQuantity}</p>
          <p><strong>Total Amount:</strong> PHP ${Number(report.data.totalAmount).toFixed(2)}</p>
        </div>
        <div class="footer">
          <p>Received by: <span class="signature-line"></span> Date: <span class="signature-line"></span></p>
          <p>Checked by: <span class="signature-line"></span> Date: <span class="signature-line"></span></p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const receivingReports = reports.filter((r: Report) => r.type === 'receiving_report');

  const selectedTotal = filteredInventory
    .filter(item => selectedItems.includes(item.id))
    .reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Generate Reports</h1>
          <p className="text-muted-foreground">Create receiving reports or released order reports</p>
        </div>
        <Button
          size="lg"
          onClick={() => setShowReleasedOrderDialog(true)}
          className="bg-primary hover:bg-primary/90"
          data-testid="button-released-order-report"
        >
          <PackageMinus className="h-5 w-5 mr-2" />
          RELEASED ORDER REPORT
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                <CardTitle>Generate Receiving Report</CardTitle>
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-date-filter">
                  <SelectValue placeholder="Filter by date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="quarter">Last 3 Months</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardDescription>
              Select inventory items to include in the receiving report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredInventory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No inventory items found for this period</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedItems.length === filteredInventory.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                    <Label>Select All ({filteredInventory.length} items)</Label>
                  </div>
                  <Badge variant="secondary">
                    {selectedItems.length} selected | PHP {selectedTotal.toFixed(2)}
                  </Badge>
                </div>

                <ScrollArea className="h-[350px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventory.map((item) => (
                        <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => toggleItem(item.id)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell>{item.supplier}</TableCell>
                          <TableCell>{item.quantity} {item.unitOfMeasure}</TableCell>
                          <TableCell>{item.location}</TableCell>
                          <TableCell className="text-right">PHP {Number(item.amount).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <Button
                  className="w-full"
                  onClick={handleGenerateReport}
                  disabled={selectedItems.length === 0 || generateReportMutation.isPending}
                  data-testid="button-generate-report"
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Generate Receiving Report ({selectedItems.length} items)
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <CardTitle>Recent Reports</CardTitle>
            </div>
            <CardDescription>Previously generated receiving reports</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingReports ? (
              <p className="text-sm text-muted-foreground">Loading reports...</p>
            ) : receivingReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receiving reports generated yet</p>
            ) : (
              <div className="space-y-3">
                {receivingReports.slice(0, 10).map((report: Report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`report-${report.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{report.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(report.createdAt).toLocaleDateString()} | 
                          {(report.data?.items || []).length} items
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPreviewReport(report)}
                        data-testid={`button-view-${report.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => exportToExcel(report)}
                        data-testid={`button-download-${report.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handlePrint(report)}
                        data-testid={`button-print-${report.id}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receiving Report Preview Dialog */}
      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Receiving Report Preview</DialogTitle>
            <DialogDescription>
              {previewReport?.name} - Generated on {previewReport && new Date(previewReport.createdAt).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          
          {previewReport && (
            <div className="flex-1 overflow-auto" ref={printRef}>
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold">DIVINE WORD COLLEGE OF SAN JOSE</h2>
                <h3 className="text-lg font-semibold">RECEIVING REPORT</h3>
                <p className="text-sm text-muted-foreground">Period: {previewReport.dateRange}</p>
              </div>

              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">No.</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(previewReport.data?.items || []).map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{item.supplier}</TableCell>
                        <TableCell>{new Date(item.dateReceived).toLocaleDateString()}</TableCell>
                        <TableCell>{item.itemName}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unitOfMeasure}</TableCell>
                        <TableCell>{item.location}</TableCell>
                        <TableCell className="text-right">PHP {Number(item.unitCost).toFixed(2)}</TableCell>
                        <TableCell className="text-right">PHP {Number(item.amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="mt-4 pt-4 border-t flex justify-between">
                <div>
                  <p className="font-medium">Total Quantity: {previewReport.data?.totalQuantity || 0}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">
                    Total Amount: PHP {Number(previewReport.data?.totalAmount || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewReport(null)}>
              Close
            </Button>
            {previewReport && (
              <>
                <Button variant="outline" onClick={() => exportToExcel(previewReport)}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                <Button onClick={() => handlePrint(previewReport)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Released Order Report Dialog */}
      <Dialog open={showReleasedOrderDialog} onOpenChange={setShowReleasedOrderDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5" />
              Released Order Report
            </DialogTitle>
            <DialogDescription>
              Select items from inventory to release. This will deduct quantities from the database.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto space-y-4">
            {/* Search and Cart Button */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-items"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowCartDialog(true)}
                className="relative"
                data-testid="button-view-cart"
              >
                ITEMS PICKED
                {cart.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Available Items Table */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Available Inventory Items</CardTitle>
                <CardDescription>Click "Add" to include items in your release order</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-center">Available</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItemsForRelease.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            {searchTerm ? 'No items match your search' : 'No inventory items available'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItemsForRelease.map((item) => {
                          const itemName = item.itemName || item.particulars || 'Unknown Item';
                          const itemUnit = item.unitOfMeasure || item.unit || 'pcs';
                          const inCart = cart.find(c => c.inventoryItemId === item.id);
                          
                          return (
                            <TableRow key={item.id} data-testid={`release-item-${item.id}`}>
                              <TableCell className="font-medium">{itemName}</TableCell>
                              <TableCell>{itemUnit}</TableCell>
                              <TableCell className="text-right">PHP {Number(item.unitCost).toFixed(2)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={item.quantity > 0 ? "secondary" : "destructive"}>
                                  {item.quantity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={inCart ? "secondary" : "default"}
                                  onClick={() => addToCart(item)}
                                  disabled={item.quantity < 1}
                                  data-testid={`button-add-${item.id}`}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  {inCart ? `Added (${inCart.quantity})` : 'Add'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReleasedOrderDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cart Dialog */}
      <Dialog open={showCartDialog} onOpenChange={setShowCartDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Your Order Cart</DialogTitle>
            <DialogDescription>
              Review items before generating the released order report
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto space-y-4">
            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="departmentOffice">Department/Office *</Label>
                <Input
                  id="departmentOffice"
                  value={departmentOffice}
                  onChange={(e) => setDepartmentOffice(e.target.value)}
                  placeholder="e.g., Registrar's Office"
                  data-testid="input-department"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsNo">RS No. (Optional)</Label>
                <Input
                  id="rsNo"
                  value={rsNo}
                  onChange={(e) => setRsNo(e.target.value)}
                  placeholder="e.g., RS-2024-001"
                  data-testid="input-rsno"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receivedBy">Received By (Optional)</Label>
              <Input
                id="receivedBy"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Name of person receiving items"
                data-testid="input-received-by"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPartial"
                checked={isPartial}
                onCheckedChange={(checked) => setIsPartial(checked === true)}
                data-testid="checkbox-partial"
              />
              <Label htmlFor="isPartial">Partial Release</Label>
            </div>

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Your cart is empty</p>
                <p className="text-sm">Add items from the available inventory</p>
              </div>
            ) : (
              <ScrollArea className="h-[250px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => (
                      <TableRow key={item.inventoryItemId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.particulars}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.unit} @ PHP {Number(item.unitCost).toFixed(2)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => updateCartQty(index, item.quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center">{item.quantity}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => updateCartQty(index, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          PHP {Number(item.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFromCart(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {/* Total */}
            {cart.length > 0 && (
              <div className="flex justify-between items-center pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">{cartItemCount} items</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">Total: PHP {cartTotal.toFixed(2)}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCartDialog(false)}>
              Continue Shopping
            </Button>
            <Button
              onClick={handleSubmitReleasedOrder}
              disabled={cart.length === 0 || !departmentOffice.trim() || generateReleasedReportMutation.isPending}
              data-testid="button-generate-released-report"
            >
              {generateReleasedReportMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insufficient Stock Alert */}
      <AlertDialog open={showInsufficientDialog} onOpenChange={setShowInsufficientDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Insufficient Stock</AlertDialogTitle>
            <AlertDialogDescription>
              {insufficientItem && (
                <>
                  You requested {insufficientItem.requested} units of <strong>{insufficientItem.name}</strong>, 
                  but only {insufficientItem.available} are available.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
