import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSocket } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Minus, Trash2, FileDown, CheckCircle2, XCircle, Clock, AlertTriangle, PackageMinus, Download, Printer } from "lucide-react";
import * as XLSX from 'xlsx';

interface InventoryItem {
  id: string;
  particulars: string;
  unit: string;
  unitCost: string;
  quantity: number;
  amount: string;
  categoryId: string | null;
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

interface ReleasedOrderRequest {
  id: string;
  employeeId: string;
  departmentOffice: string;
  rsNo?: string;
  isPartial: boolean;
  items: CartItem[];
  status: "pending" | "approved" | "denied" | "partial";
  itemStatuses?: Record<string, { status: string; reason?: string }>;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
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

interface ReleasedOrdersProps {
  user: {
    id: string;
    name: string;
    role: string;
  };
}

export default function ReleasedOrders({ user }: ReleasedOrdersProps) {
  const { toast } = useToast();
  const isAdmin = user.role === "admin";
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentOffice, setDepartmentOffice] = useState("");
  const [rsNo, setRsNo] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  
  // Dialogs
  const [showCartDialog, setShowCartDialog] = useState(false);
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [insufficientItem, setInsufficientItem] = useState<{ name: string; requested: number; available: number } | null>(null);

  // Fetch inventory items
  const { data: inventoryItems = [], isLoading: loadingItems } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
  });

  // Fetch my requests (for employees)
  const { data: myRequests = [], isLoading: loadingMyRequests } = useQuery<ReleasedOrderRequest[]>({
    queryKey: ['/api/released-orders/my-requests'],
    enabled: !isAdmin,
  });

  // Fetch all reports
  const { data: reports = [], isLoading: loadingReports } = useQuery<ReleasedOrderReport[]>({
    queryKey: ['/api/released-orders/reports'],
  });

  // Listen for real-time inventory changes (when items are released)
  useEffect(() => {
    const socket = getSocket();
    const handleInventoryChange = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    };
    
    socket.on('inventory_change', handleInventoryChange);
    return () => { socket.off('inventory_change', handleInventoryChange); };
  }, []);

  // Submit request mutation (employee)
  const submitRequestMutation = useMutation({
    mutationFn: async (data: { departmentOffice: string; rsNo?: string; isPartial: boolean; items: CartItem[] }) => {
      const res = await apiRequest("POST", "/api/released-orders/request", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request Submitted", description: "Your released order request has been sent for approval." });
      setCart([]);
      setDepartmentOffice("");
      setRsNo("");
      setIsPartial(false);
      setShowCartDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/my-requests'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit request", variant: "destructive" });
    },
  });

  // Generate report mutation (admin or approved employee)
  const generateReportMutation = useMutation({
    mutationFn: async (data: { requestId?: string; items?: CartItem[]; departmentOffice: string; rsNo?: string; isPartial?: boolean; receivedBy?: string }) => {
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
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate report", variant: "destructive" });
    },
  });

  // Notify admin about insufficient stock
  const notifyInsufficientMutation = useMutation({
    mutationFn: async (data: { itemName: string; requestedQty: number; availableQty: number }) => {
      const res = await apiRequest("POST", "/api/released-orders/notify-insufficient", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Admin Notified", description: "The administrator has been notified about the insufficient stock." });
      setShowInsufficientDialog(false);
      setInsufficientItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to notify admin", variant: "destructive" });
    },
  });

  // Filter items by search - with null check for items that might have missing fields
  const filteredItems = inventoryItems.filter(item =>
    item.particulars && item.particulars.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Add item to cart
  const addToCart = (item: InventoryItem) => {
    const existingIndex = cart.findIndex(c => c.inventoryItemId === item.id);
    
    if (existingIndex >= 0) {
      // Item already in cart, increase quantity
      const newCart = [...cart];
      const newQty = newCart[existingIndex].quantity + 1;
      
      if (newQty > item.quantity) {
        if (!isAdmin) {
          setInsufficientItem({ name: item.particulars, requested: newQty, available: item.quantity });
          setShowInsufficientDialog(true);
        } else {
          toast({ title: "Insufficient Stock", description: `Only ${item.quantity} ${item.unit}(s) available.`, variant: "destructive" });
        }
        return;
      }
      
      newCart[existingIndex].quantity = newQty;
      newCart[existingIndex].amount = (newQty * Number(item.unitCost)).toFixed(2);
      setCart(newCart);
    } else {
      // Add new item to cart
      if (item.quantity < 1) {
        if (!isAdmin) {
          setInsufficientItem({ name: item.particulars, requested: 1, available: item.quantity });
          setShowInsufficientDialog(true);
        } else {
          toast({ title: "Insufficient Stock", description: `${item.particulars} is out of stock.`, variant: "destructive" });
        }
        return;
      }
      
      setCart([...cart, {
        inventoryItemId: item.id,
        particulars: item.particulars,
        unit: item.unit,
        unitCost: item.unitCost,
        quantity: 1,
        amount: item.unitCost,
        availableQty: item.quantity,
      }]);
    }
    
    toast({ title: "Added to Cart", description: `${item.particulars} added to your order.` });
  };

  // Update quantity in cart
  const updateCartQty = (index: number, newQty: number) => {
    if (newQty < 1) {
      removeFromCart(index);
      return;
    }
    
    const item = cart[index];
    const inventoryItem = inventoryItems.find(i => i.id === item.inventoryItemId);
    
    if (inventoryItem && newQty > inventoryItem.quantity) {
      if (!isAdmin) {
        setInsufficientItem({ name: item.particulars, requested: newQty, available: inventoryItem.quantity });
        setShowInsufficientDialog(true);
      } else {
        toast({ title: "Insufficient Stock", description: `Only ${inventoryItem.quantity} ${item.unit}(s) available.`, variant: "destructive" });
      }
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

  // Handle submit
  const handleSubmit = () => {
    if (!departmentOffice.trim()) {
      toast({ title: "Error", description: "Department/Office is required", variant: "destructive" });
      return;
    }
    
    if (cart.length === 0) {
      toast({ title: "Error", description: "Please add items to your order", variant: "destructive" });
      return;
    }
    
    if (isAdmin) {
      // Admin generates report directly
      generateReportMutation.mutate({
        items: cart,
        departmentOffice,
        rsNo: rsNo || undefined,
        isPartial,
        receivedBy: receivedBy || undefined,
      });
    } else {
      // Employee submits request for approval
      submitRequestMutation.mutate({
        departmentOffice,
        rsNo: rsNo || undefined,
        isPartial,
        items: cart,
      });
    }
  };

  // Handle generate from approved request
  const handleGenerateFromRequest = (request: ReleasedOrderRequest) => {
    generateReportMutation.mutate({
      requestId: request.id,
      departmentOffice: request.departmentOffice,
      rsNo: request.rsNo,
      isPartial: request.isPartial,
    });
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case "denied":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Denied</Badge>;
      case "partial":
        return <Badge className="bg-yellow-600"><AlertTriangle className="w-3 h-3 mr-1" />Partial</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  // Export to Excel using DWCSJ template
  const exportToExcel = async (report: ReleasedOrderReport) => {
    const items = report.items || [];
    const maxItemsPerPage = 12; // Template has rows 15-26 (12 data rows)
    
    try {
      const response = await fetch('/api/released-orders/template');
      
      if (response.ok) {
        const templateBuffer = await response.arrayBuffer();
        const numPages = Math.ceil(Math.max(items.length, 1) / maxItemsPerPage);
        const wb = XLSX.utils.book_new();
        
        for (let page = 0; page < numPages; page++) {
          const pageItems = items.slice(page * maxItemsPerPage, (page + 1) * maxItemsPerPage);
          const isLastPage = page === numPages - 1;
          
          // Read fresh copy of template for each page
          const templateWb = XLSX.read(templateBuffer, { type: 'array' });
          const ws = templateWb.Sheets[templateWb.SheetNames[0]];
          
          // Template structure (0-indexed columns):
          // Row 9:  A9=DATE:, value should go after colon
          // Row 10: A10=R.S.No.:, F10=Partial/Full checkbox
          // Row 11: A11=Dept./Office:
          // Row 14: Headers (No., QUANTITY, UNIT, PARTICULARS, U/Cost, AMOUNT, REMARKS)
          // Rows 15-26: Data rows (template has No. 1-12 pre-filled in column A)
          // Row 27: D27=XXX-Nothing Follows-XXX, E27=TOTAL:, F27=total value
          // Row 28: A28=Released by:, E28=Received by:
          // Row 30: A30=RONNIE V. ANDRADE, E30=REQUESTEE
          // Row 31: A31=Supply Officer, E31=Date:____
          
          // Fill header fields - append to existing labels
          const dateStr = new Date(report.createdAt).toLocaleDateString();
          ws['A9'] = { t: 's', v: `DATE: ${dateStr}` };
          
          const sroNoStr = numPages > 1 
            ? `R.S.No.: ${report.sroNo} (Page ${page + 1}/${numPages})`
            : `R.S.No.: ${report.sroNo}`;
          ws['A10'] = { t: 's', v: sroNoStr };
          ws['F10'] = { t: 's', v: report.isPartial ? 'Partial' : 'Full' };
          
          ws['A11'] = { t: 's', v: `Dept./ Office: ${report.departmentOffice}` };
          
          // Fill data rows (15-26)
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
              ws[`G${rowNum}`] = { t: 's', v: '' }; // Remarks
            } else {
              // Clear unused rows
              ws[`A${rowNum}`] = { t: 's', v: '' };
              ws[`B${rowNum}`] = { t: 's', v: '' };
              ws[`C${rowNum}`] = { t: 's', v: '' };
              ws[`D${rowNum}`] = { t: 's', v: '' };
              ws[`E${rowNum}`] = { t: 's', v: '' };
              ws[`F${rowNum}`] = { t: 's', v: '' };
              ws[`G${rowNum}`] = { t: 's', v: '' };
            }
          }
          
          // Row 27: Total amount - preserve template structure
          // Template has: D27="XXX-Nothing Follows-XXX", E27="TOTAL:", F27=value
          // Always keep the "Nothing Follows" text on last page
          // For intermediate pages, show page subtotal but keep structure
          if (isLastPage) {
            // Keep D27's "XXX-Nothing Follows-XXX" - it's already in template
            // E27's "TOTAL:" label is already in template
            ws['F27'] = { t: 'n', v: Number(report.totalAmount) };
          } else {
            // For continuation pages, show subtotal but clear "Nothing Follows"
            ws['D27'] = { t: 's', v: '(Continued on next page)' };
            const pageTotal = pageItems.reduce((sum, item) => sum + Number(item.amount), 0);
            ws['F27'] = { t: 'n', v: pageTotal };
          }
          
          // Row 30: Receiver name (use provided or default)
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
    
    // Fallback: Create DWCSJ format manually if template not available
    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [];
    
    // Header rows matching template layout
    wsData.push([]); // Row 1 empty
    wsData.push(['DIVINE WORD COLLEGE OF SAN JOSE', '', '', '', '', '', '']);
    wsData.push(['Gen. Lukban Street, San Jose, Occidental Mindoro', '', '', '', '', '', '']);
    wsData.push(['SUPPLY ROOM', '', '', '', '', '', '']);
    wsData.push([]); // Row 5 empty
    wsData.push([]); // Row 6 empty
    wsData.push(['SUPPLIES RELEASE ORDER', '', '', '', '', '', '']);
    wsData.push([]); // Row 8 empty
    wsData.push([`DATE: ${new Date(report.createdAt).toLocaleDateString()}`, '', '', '', '', '', '']);
    wsData.push([`R.S.No.: ${report.sroNo}`, '', '', '', '', report.isPartial ? 'Partial' : 'Full', '']);
    wsData.push([`Dept./ Office: ${report.departmentOffice}`, '', '', '', '', '', '']);
    wsData.push([]); // Row 12 empty
    wsData.push([]); // Row 13 empty
    wsData.push(['No.', 'QUANTITY', 'UNIT', 'PARTICULARS', 'U/Cost', 'AMOUNT', 'REMARKS']);
    
    // Data rows (15-26)
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
    
    // Pad to row 26
    while (wsData.length < 26) {
      wsData.push(['', '', '', '', '', '', '']);
    }
    
    // Row 27: Total
    wsData.push(['', '', '', 'XXX-Nothing Follows-XXX', 'TOTAL:', Number(report.totalAmount), '']);
    
    // Footer rows
    wsData.push(['Released by:', '', '', '', 'Received by:', '', '']);
    wsData.push([]); // Row 29 empty
    wsData.push(['RONNIE V. ANDRADE', '', '', '', report.receivedBy || 'REQUESTEE', '', '']);
    wsData.push(['Supply Officer', '', '', '', 'Date:____________________', '', '']);
    wsData.push(['Supply Room Copy', '', '', '', '', '', '']);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths matching template
    ws['!cols'] = [
      { wch: 8 },   // A: No.
      { wch: 10 },  // B: QUANTITY
      { wch: 8 },   // C: UNIT
      { wch: 35 },  // D: PARTICULARS
      { wch: 10 },  // E: U/Cost
      { wch: 12 },  // F: AMOUNT
      { wch: 12 },  // G: REMARKS
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    
    const fileName = `Released_Order_${report.sroNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({ title: "Excel exported", description: `${fileName} has been downloaded` });
  };

  // Print report
  const handlePrint = (report: ReleasedOrderReport) => {
    const items = report.items || [];
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups for printing", variant: "destructive" });
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Released Order - ${report.sroNo}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 16px; }
          .header h2 { margin: 5px 0; font-size: 14px; }
          .header h3 { margin: 5px 0; font-size: 12px; color: #666; }
          .info { margin-bottom: 15px; display: flex; justify-content: space-between; }
          .info-left, .info-right { font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: left; }
          th { background-color: #f0f0f0; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .totals { text-align: right; font-weight: bold; margin-bottom: 30px; }
          .footer { margin-top: 50px; display: flex; justify-content: space-between; }
          .signature { text-align: center; width: 200px; }
          .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DIVINE WORD COLLEGE OF SAN JOSE</h1>
          <h3>Gen. Lukban Street, San Jose, Occidental Mindoro</h3>
          <h3>SUPPLY ROOM</h3>
          <h2>SUPPLIES RELEASE ORDER</h2>
        </div>
        <div class="info">
          <div class="info-left">
            <p><strong>S.R.O No.:</strong> ${report.sroNo}</p>
            <p><strong>Dept/Office:</strong> ${report.departmentOffice}</p>
          </div>
          <div class="info-right">
            <p><strong>Date:</strong> ${new Date(report.createdAt).toLocaleDateString()}</p>
            <p><strong>R.S.No.:</strong> ${report.rsNo || '-'}</p>
            <p><strong>Type:</strong> ${report.isPartial ? 'Partial' : 'Full'}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="text-center">No.</th>
              <th class="text-center">Quantity</th>
              <th>Unit</th>
              <th>Particulars</th>
              <th class="text-right">U/Cost</th>
              <th class="text-right">Amount</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: CartItem, index: number) => `
              <tr>
                <td class="text-center">${index + 1}</td>
                <td class="text-center">${item.quantity}</td>
                <td>${item.unit}</td>
                <td>${item.particulars}</td>
                <td class="text-right">₱${Number(item.unitCost).toFixed(2)}</td>
                <td class="text-right">₱${Number(item.amount).toFixed(2)}</td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals">
          Total Amount: ₱${Number(report.totalAmount).toFixed(2)}
        </div>
        <div class="footer">
          <div class="signature">
            <div class="signature-line">RONNIE V. ANDRADE</div>
            <p>Released by</p>
          </div>
          <div class="signature">
            <div class="signature-line">${report.receivedBy || 'REQUESTEE'}</div>
            <p>Received by</p>
          </div>
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-released-orders-title">Released Orders</h1>
          <p className="text-muted-foreground">Release items from inventory</p>
        </div>
        
        <Button 
          onClick={() => setShowCartDialog(true)}
          className="relative"
          data-testid="button-view-cart"
        >
          ITEMS PICKED
          {cart.length > 0 && (
            <Badge className="absolute -top-2 -right-2 px-2 py-0.5 text-xs" data-testid="badge-cart-count">
              {cartItemCount}
            </Badge>
          )}
        </Button>
      </div>

      <Tabs defaultValue="picker" className="space-y-4">
        <TabsList>
          <TabsTrigger value="picker" data-testid="tab-item-picker">Item Picker</TabsTrigger>
          {!isAdmin && <TabsTrigger value="requests" data-testid="tab-my-requests">My Requests</TabsTrigger>}
          <TabsTrigger value="reports" data-testid="tab-reports">Reports History</TabsTrigger>
        </TabsList>

        <TabsContent value="picker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageMinus className="w-5 h-5" />
                Select Items to Release
              </CardTitle>
              <CardDescription>
                {isAdmin 
                  ? "Select items to release directly. Inventory will be deducted upon generation."
                  : "Select items and submit for admin approval before release."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-items"
                  />
                </div>
              </div>

              <ScrollArea className="h-[400px] rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingItems ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">Loading items...</TableCell>
                      </TableRow>
                    ) : filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">No items found</TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => {
                        const cartItem = cart.find(c => c.inventoryItemId === item.id);
                        const isLowStock = item.quantity <= 5;
                        
                        return (
                          <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                            <TableCell className="font-medium">{item.particulars}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell className="text-right">₱{Number(item.unitCost).toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                              <span className={isLowStock ? "text-yellow-600 font-semibold" : ""}>
                                {item.quantity}
                              </span>
                              {isLowStock && <AlertTriangle className="w-3 h-3 inline ml-1 text-yellow-600" />}
                            </TableCell>
                            <TableCell className="text-center">
                              {cartItem ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Button 
                                    size="icon" 
                                    variant="outline"
                                    onClick={() => updateCartQty(cart.indexOf(cartItem), cartItem.quantity - 1)}
                                    data-testid={`button-decrease-${item.id}`}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span className="w-8 text-center font-medium">{cartItem.quantity}</span>
                                  <Button 
                                    size="icon" 
                                    variant="outline"
                                    onClick={() => updateCartQty(cart.indexOf(cartItem), cartItem.quantity + 1)}
                                    data-testid={`button-increase-${item.id}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button 
                                  size="sm" 
                                  onClick={() => addToCart(item)}
                                  disabled={item.quantity === 0}
                                  data-testid={`button-add-${item.id}`}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add
                                </Button>
                              )}
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
        </TabsContent>

        {!isAdmin && (
          <TabsContent value="requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Requests</CardTitle>
                <CardDescription>Track your released order requests</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {loadingMyRequests ? (
                    <div className="text-center py-8 text-muted-foreground">Loading requests...</div>
                  ) : myRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No requests found</div>
                  ) : (
                    <div className="space-y-4">
                      {myRequests.map((request) => (
                        <Card key={request.id} data-testid={`card-request-${request.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-medium">{request.departmentOffice}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(request.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              {getStatusBadge(request.status)}
                            </div>
                            
                            <div className="text-sm mb-3">
                              <p>{request.items.length} item(s) | {request.isPartial ? "Partial" : "Full"} release</p>
                              {request.rsNo && <p className="text-muted-foreground">RS No: {request.rsNo}</p>}
                            </div>

                            {(request.status === "approved" || request.status === "partial") && (
                              <Button 
                                size="sm" 
                                onClick={() => handleGenerateFromRequest(request)}
                                disabled={generateReportMutation.isPending}
                                data-testid={`button-generate-${request.id}`}
                              >
                                <FileDown className="w-3 h-3 mr-1" />
                                Generate Report
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reports History</CardTitle>
              <CardDescription>Generated released order reports</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {loadingReports ? (
                  <div className="text-center py-8 text-muted-foreground">Loading reports...</div>
                ) : reports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No reports found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SRO No.</TableHead>
                        <TableHead>Department/Office</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report) => (
                        <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                          <TableCell className="font-medium">{report.sroNo}</TableCell>
                          <TableCell>{report.departmentOffice}</TableCell>
                          <TableCell>{report.items.length} item(s)</TableCell>
                          <TableCell className="text-right">₱{Number(report.totalAmount).toFixed(2)}</TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => exportToExcel(report)}
                                data-testid={`button-download-${report.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handlePrint(report)}
                                data-testid={`button-print-${report.id}`}
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cart Dialog */}
      <Dialog open={showCartDialog} onOpenChange={setShowCartDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your Order Cart</DialogTitle>
            <DialogDescription>
              Review items before {isAdmin ? "generating the report" : "submitting for approval"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Your cart is empty. Add items from the Item Picker.
              </div>
            ) : (
              <>
                <ScrollArea className="h-[250px] rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item, index) => (
                        <TableRow key={item.inventoryItemId}>
                          <TableCell className="font-medium">{item.particulars}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-right">₱{Number(item.unitCost).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-6 w-6"
                                onClick={() => updateCartQty(index, item.quantity - 1)}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-6 text-center">{item.quantity}</span>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-6 w-6"
                                onClick={() => updateCartQty(index, item.quantity + 1)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">₱{Number(item.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => removeFromCart(index)}
                              data-testid={`button-remove-${item.inventoryItemId}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="flex justify-end border-t pt-3">
                  <p className="text-lg font-semibold">Total: ₱{cartTotal.toFixed(2)}</p>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="departmentOffice">Department/Office *</Label>
                <Input
                  id="departmentOffice"
                  placeholder="e.g., Accounting Department"
                  value={departmentOffice}
                  onChange={(e) => setDepartmentOffice(e.target.value)}
                  data-testid="input-department"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsNo">RS No. (Optional)</Label>
                <Input
                  id="rsNo"
                  placeholder="Requisition Slip Number"
                  value={rsNo}
                  onChange={(e) => setRsNo(e.target.value)}
                  data-testid="input-rsno"
                />
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="receivedBy">Received By (Optional)</Label>
                <Input
                  id="receivedBy"
                  placeholder="Name of person receiving items"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  data-testid="input-received-by"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="isPartial"
                checked={isPartial}
                onCheckedChange={(checked) => setIsPartial(!!checked)}
                data-testid="checkbox-partial"
              />
              <Label htmlFor="isPartial" className="cursor-pointer">Partial release</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCartDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={cart.length === 0 || submitRequestMutation.isPending || generateReportMutation.isPending}
              data-testid="button-submit-order"
            >
              {isAdmin ? (
                <>
                  <FileDown className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Submit for Approval
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insufficient Stock Alert (Employee only) */}
      <AlertDialog open={showInsufficientDialog} onOpenChange={setShowInsufficientDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Insufficient Stock
            </AlertDialogTitle>
            <AlertDialogDescription>
              You requested <strong>{insufficientItem?.requested}</strong> of <strong>{insufficientItem?.name}</strong>, 
              but only <strong>{insufficientItem?.available}</strong> are available.
              <br /><br />
              Would you like to notify the administrator about this shortage?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (insufficientItem) {
                  notifyInsufficientMutation.mutate({
                    itemName: insufficientItem.name,
                    requestedQty: insufficientItem.requested,
                    availableQty: insufficientItem.available,
                  });
                }
              }}
              data-testid="button-notify-admin"
            >
              Notify Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
