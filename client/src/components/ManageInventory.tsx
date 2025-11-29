import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { inventoryApi, categoriesApi, requestsApi, type ItemPayload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { getSocket } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, Upload, FileSpreadsheet, Package, Save, X, History, Edit2, Search, FolderOpen, List, ChevronDown, Check, Tags } from "lucide-react";
import type { InventoryItem, Category } from "@shared/schema";

interface Props {
  user: { id: string; role: string };
}

const UNIT_OPTIONS = [
  { value: "pcs", label: "Pieces" },
  { value: "boxes", label: "Boxes" },
  { value: "kg", label: "Kilograms" },
  { value: "liters", label: "Liters" },
  { value: "meters", label: "Meters" },
  { value: "rolls", label: "Rolls" },
  { value: "packs", label: "Packs" },
  { value: "reams", label: "Reams" },
  { value: "sets", label: "Sets" },
  { value: "units", label: "Units" },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Office Supplies": ["paper", "pen", "pencil", "stapler", "folder", "envelope", "notebook", "clip", "tape", "scissors", "ruler", "marker"],
  "Electronics": ["computer", "laptop", "monitor", "keyboard", "mouse", "printer", "cable", "usb", "charger", "battery", "projector"],
  "Furniture": ["chair", "desk", "table", "cabinet", "shelf", "drawer", "rack"],
  "Cleaning Supplies": ["soap", "detergent", "mop", "broom", "brush", "cleaner", "disinfectant", "sanitizer", "tissue", "towel"],
  "Laboratory Equipment": ["beaker", "flask", "microscope", "test tube", "pipette", "thermometer", "scale", "chemical"],
  "Sports Equipment": ["ball", "net", "racket", "mat", "weights", "uniform", "jersey"],
  "Books & Publications": ["book", "textbook", "journal", "magazine", "manual", "guide"],
  "Medical Supplies": ["first aid", "bandage", "gauze", "medicine", "gloves", "mask"],
};

function detectCategory(itemName: string): string | null {
  const lowerName = itemName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lowerName.includes(keyword))) {
      return category;
    }
  }
  return null;
}

const createEmptyItem = (): ItemPayload => ({
  supplier: "",
  quantity: 1,
  unitOfMeasure: "pcs",
  itemName: "",
  location: "",
  unitCost: 0,
  amount: 0,
  remarks: "",
  categoryName: "",
});

export default function ManageInventory({ user }: Props) {
  const { toast } = useToast();
  const isAdmin = user.role === "admin";

  const { data: inventory = [], isLoading: loadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const [mode, setMode] = useState<"view" | "single" | "bulk">("view");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchByName, setSearchByName] = useState(false);
  const [singleItem, setSingleItem] = useState<ItemPayload>(createEmptyItem());
  const [bulkItems, setBulkItems] = useState<ItemPayload[]>([createEmptyItem()]);
  const [sharedSupplier, setSharedSupplier] = useState("");
  const [sharedLocation, setSharedLocation] = useState("");
  const [useSharedLocation, setUseSharedLocation] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [historyCategory, setHistoryCategory] = useState<Category | null>(null);
  const [categoryHistory, setCategoryHistory] = useState<any[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  // Socket.IO listener for real-time updates
  useEffect(() => {
    const socket = getSocket();
    
    const handleInventoryChange = (data: { type: string; item?: any }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
      
      if (data.type === 'create' && data.item) {
        toast({ title: "New item added", description: data.item.itemName });
      }
    };
    
    socket.on('inventory_change', handleInventoryChange);
    return () => { socket.off('inventory_change', handleInventoryChange); };
  }, [toast]);

  const addItemMutation = useMutation({
    mutationFn: (data: ItemPayload) => inventoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Item added successfully" });
      setSingleItem(createEmptyItem());
      setMode("view");
    },
    onError: (error: any) => {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
    },
  });

  const addBulkMutation = useMutation({
    mutationFn: (items: ItemPayload[]) => inventoryApi.createBulk(items),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: `${data.count} items added successfully` });
      setBulkItems([createEmptyItem()]);
      setMode("view");
    },
    onError: (error: any) => {
      toast({ title: "Failed to add items", description: error.message, variant: "destructive" });
    },
  });

  const submitSingleRequestMutation = useMutation({
    mutationFn: (data: ItemPayload) => requestsApi.createSingle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({ title: "Request submitted", description: "Your item request has been sent for approval." });
      setSingleItem(createEmptyItem());
      setMode("view");
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit request", description: error.message, variant: "destructive" });
    },
  });

  const submitBulkRequestMutation = useMutation({
    mutationFn: ({ items, supplier }: { items: ItemPayload[]; supplier?: string }) => 
      requestsApi.createBulk(items, supplier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({ title: "Request submitted", description: "Your bulk items request has been sent for approval." });
      setBulkItems([createEmptyItem()]);
      setMode("view");
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit request", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemPayload> }) => 
      inventoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Item updated successfully" });
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete item", description: error.message, variant: "destructive" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: (error: any) => {
      console.error("Failed to create category:", error);
    },
  });

  const handleCustomCategoryCreate = async (categoryName: string, targetField: 'single' | 'bulk', bulkIndex?: number) => {
    if (!categoryName.trim()) return;
    
    const existingCategory = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    
    if (!existingCategory) {
      try {
        await createCategoryMutation.mutateAsync(categoryName);
        toast({ title: "Category created", description: `"${categoryName}" added to categories` });
      } catch (error) {
        console.error("Failed to create category:", error);
      }
    }
    
    if (targetField === 'single') {
      setSingleItem(prev => ({ ...prev, categoryName }));
    } else if (bulkIndex !== undefined) {
      updateBulkItem(bulkIndex, 'categoryName', categoryName);
    }
    
    setCategoryPopoverOpen(false);
    setCustomCategoryInput("");
  };

  useEffect(() => {
    const amount = singleItem.quantity * singleItem.unitCost;
    if (amount !== singleItem.amount) {
      setSingleItem(prev => ({ ...prev, amount }));
    }
  }, [singleItem.quantity, singleItem.unitCost]);

  useEffect(() => {
    if (singleItem.itemName && !singleItem.categoryName) {
      const detected = detectCategory(singleItem.itemName);
      if (detected) {
        setSingleItem(prev => ({ ...prev, categoryName: detected }));
      }
    }
  }, [singleItem.itemName]);

  const updateBulkItem = (index: number, field: keyof ItemPayload, value: any) => {
    setBulkItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      if (field === "quantity" || field === "unitCost") {
        updated[index].amount = updated[index].quantity * updated[index].unitCost;
      }
      
      if (field === "itemName" && !updated[index].categoryName) {
        const detected = detectCategory(value);
        if (detected) updated[index].categoryName = detected;
      }
      
      if (useSharedLocation && field !== "location") {
        updated[index].location = sharedLocation;
      }
      
      return updated;
    });
  };

  const addBulkRow = () => {
    const newItem = createEmptyItem();
    if (sharedSupplier) newItem.supplier = sharedSupplier;
    if (useSharedLocation && sharedLocation) newItem.location = sharedLocation;
    setBulkItems(prev => [...prev, newItem]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkItems.length > 1) {
      setBulkItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSingleSubmit = () => {
    if (!singleItem.supplier || !singleItem.itemName || !singleItem.location) {
      toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (isAdmin) {
      addItemMutation.mutate(singleItem);
    } else {
      submitSingleRequestMutation.mutate(singleItem);
    }
  };

  const handleBulkSubmit = () => {
    const validItems = bulkItems.filter(item => {
      const hasSupplier = item.supplier || sharedSupplier;
      const hasLocation = useSharedLocation ? sharedLocation : item.location;
      return hasSupplier && item.itemName && hasLocation && item.quantity > 0;
    });

    if (validItems.length === 0) {
      toast({ title: "No valid items", description: "Please fill in all required fields (supplier, item name, location, quantity)", variant: "destructive" });
      return;
    }

    const finalItems = validItems.map(item => ({
      ...item,
      supplier: item.supplier || sharedSupplier,
      location: useSharedLocation ? sharedLocation : item.location,
    }));

    if (isAdmin) {
      addBulkMutation.mutate(finalItems);
    } else {
      submitBulkRequestMutation.mutate({ items: finalItems, supplier: sharedSupplier });
    }
  };

  const handleViewHistory = async (category: Category) => {
    try {
      const history = await categoriesApi.getHistory(category.id);
      setCategoryHistory(history);
      setHistoryCategory(category);
    } catch {
      toast({ title: "Failed to load history", variant: "destructive" });
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "Unknown";
  };

  // Get all available categories (from DB + predefined keywords)
  const allCategoryOptions = useMemo(() => {
    const dbCategories = categories.map(c => c.name);
    const keywordCategories = Object.keys(CATEGORY_KEYWORDS);
    const combined = new Set([...dbCategories, ...keywordCategories]);
    return Array.from(combined).sort();
  }, [categories]);

  const filteredInventory = inventory.filter(item =>
    item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCategoryName(item.categoryId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group items by category and item name for "BY NAME" view
  const groupedInventory = useMemo(() => {
    if (!searchByName) return null;
    
    const groups: Record<string, Record<string, InventoryItem[]>> = {};
    
    filteredInventory.forEach(item => {
      const catName = getCategoryName(item.categoryId);
      const itemName = item.itemName;
      
      if (!groups[catName]) groups[catName] = {};
      if (!groups[catName][itemName]) groups[catName][itemName] = [];
      groups[catName][itemName].push(item);
    });
    
    return groups;
  }, [filteredInventory, searchByName]);

  const renderSingleForm = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          {isAdmin ? "Add Single Item" : "Submit Item Request"}
        </CardTitle>
        <CardDescription>
          {isAdmin ? "Add a new item directly to inventory" : "Submit an item for admin approval"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier *</Label>
            <Input
              id="supplier"
              data-testid="input-supplier"
              value={singleItem.supplier}
              onChange={e => setSingleItem(prev => ({ ...prev, supplier: e.target.value }))}
              placeholder="Enter supplier name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateReceived">Date Received</Label>
            <Input
              id="dateReceived"
              type="date"
              data-testid="input-date"
              value={new Date().toISOString().split('T')[0]}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              data-testid="input-quantity"
              value={singleItem.quantity}
              onChange={e => setSingleItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitOfMeasure">Unit of Measure *</Label>
            <Select 
              value={singleItem.unitOfMeasure} 
              onValueChange={v => setSingleItem(prev => ({ ...prev, unitOfMeasure: v }))}
            >
              <SelectTrigger data-testid="select-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="itemName">Item Name / Description *</Label>
            <Input
              id="itemName"
              data-testid="input-item-name"
              value={singleItem.itemName}
              onChange={e => setSingleItem(prev => ({ ...prev, itemName: e.target.value }))}
              placeholder="Enter item name or description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                  data-testid="select-category"
                >
                  {singleItem.categoryName || "Select or type category..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Search or type new category..." 
                    value={customCategoryInput}
                    onValueChange={setCustomCategoryInput}
                    data-testid="input-category-search"
                  />
                  <CommandList>
                    <CommandEmpty>
                      {customCategoryInput && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => handleCustomCategoryCreate(customCategoryInput, 'single')}
                          data-testid="button-create-category"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create "{customCategoryInput}"
                        </Button>
                      )}
                    </CommandEmpty>
                    <CommandGroup heading="Existing Categories">
                      {allCategoryOptions.map((cat) => (
                        <CommandItem
                          key={cat}
                          value={cat}
                          onSelect={() => {
                            setSingleItem(prev => ({ ...prev, categoryName: cat }));
                            setCategoryPopoverOpen(false);
                            setCustomCategoryInput("");
                          }}
                          data-testid={`category-option-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          <Check className={`mr-2 h-4 w-4 ${singleItem.categoryName === cat ? 'opacity-100' : 'opacity-0'}`} />
                          {cat}
                          {!categories.some(c => c.name === cat) && (
                            <Badge variant="secondary" className="ml-2 text-xs">New</Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input
              id="location"
              data-testid="input-location"
              value={singleItem.location}
              onChange={e => setSingleItem(prev => ({ ...prev, location: e.target.value }))}
              placeholder="e.g., Building A, Room 101"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitCost">Unit Cost (PHP)</Label>
            <Input
              id="unitCost"
              type="number"
              min="0"
              step="0.01"
              data-testid="input-unit-cost"
              value={singleItem.unitCost}
              onChange={e => setSingleItem(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (PHP) (Auto-calculated)</Label>
            <Input
              id="amount"
              type="number"
              data-testid="input-amount"
              value={singleItem.amount.toFixed(2)}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              data-testid="input-remarks"
              value={singleItem.remarks || ""}
              onChange={e => setSingleItem(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="Additional notes or remarks"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setMode("view")} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleSingleSubmit}
            disabled={addItemMutation.isPending || submitSingleRequestMutation.isPending}
            data-testid="button-submit-single"
          >
            <Save className="h-4 w-4 mr-2" />
            {isAdmin ? "Add Item" : "Submit Request"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderBulkForm = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {isAdmin ? "Bulk Add Items" : "Submit Bulk Request"}
        </CardTitle>
        <CardDescription>
          Add multiple items in a spreadsheet-like interface
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div className="space-y-2">
            <Label>Shared Supplier (applies to all)</Label>
            <Input
              data-testid="input-shared-supplier"
              value={sharedSupplier}
              onChange={e => setSharedSupplier(e.target.value)}
              placeholder="Enter supplier for all items"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={useSharedLocation}
                onCheckedChange={(checked) => setUseSharedLocation(!!checked)}
                data-testid="checkbox-shared-location"
              />
              Shared Location
            </Label>
            <Input
              data-testid="input-shared-location"
              value={sharedLocation}
              onChange={e => setSharedLocation(e.target.value)}
              placeholder="Enter location for all items"
              disabled={!useSharedLocation}
            />
          </div>
          <div className="flex items-end">
            <Button 
              variant="outline" 
              onClick={addBulkRow}
              data-testid="button-add-row"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Row
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-24">Unit</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead className="w-32">Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-24">Unit Cost</TableHead>
                <TableHead className="w-24">Amount</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bulkItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={item.supplier || sharedSupplier}
                      onChange={e => updateBulkItem(index, "supplier", e.target.value)}
                      placeholder="Supplier"
                      className="h-8"
                      data-testid={`input-bulk-supplier-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateBulkItem(index, "quantity", parseInt(e.target.value) || 1)}
                      className="h-8"
                      data-testid={`input-bulk-qty-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={item.unitOfMeasure} 
                      onValueChange={v => updateBulkItem(index, "unitOfMeasure", v)}
                    >
                      <SelectTrigger className="h-8" data-testid={`select-bulk-unit-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.itemName}
                      onChange={e => updateBulkItem(index, "itemName", e.target.value)}
                      placeholder="Item name"
                      className="h-8"
                      data-testid={`input-bulk-name-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.categoryName || "__auto__"}
                      onValueChange={v => updateBulkItem(index, "categoryName", v === "__auto__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8" data-testid={`select-bulk-category-${index}`}>
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">Auto-detect</SelectItem>
                        {allCategoryOptions.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={useSharedLocation ? sharedLocation : item.location}
                      onChange={e => updateBulkItem(index, "location", e.target.value)}
                      placeholder="Location"
                      className="h-8"
                      disabled={useSharedLocation}
                      data-testid={`input-bulk-location-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={e => updateBulkItem(index, "unitCost", parseFloat(e.target.value) || 0)}
                      className="h-8"
                      data-testid={`input-bulk-cost-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.amount.toFixed(2)}
                      disabled
                      className="h-8 bg-muted"
                      data-testid={`input-bulk-amount-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeBulkRow(index)}
                      disabled={bulkItems.length === 1}
                      data-testid={`button-remove-row-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex justify-between items-center pt-4">
          <div className="text-sm text-muted-foreground">
            {bulkItems.filter(i => {
              const hasSupplier = i.supplier || sharedSupplier;
              const hasLocation = useSharedLocation ? sharedLocation : i.location;
              return hasSupplier && i.itemName && hasLocation && i.quantity > 0;
            }).length} valid items | 
            Total: PHP {bulkItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMode("view")} data-testid="button-cancel-bulk">
              Cancel
            </Button>
            <Button 
              onClick={handleBulkSubmit}
              disabled={addBulkMutation.isPending || submitBulkRequestMutation.isPending}
              data-testid="button-submit-bulk"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isAdmin ? "Add All Items" : "Submit All Items"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderInventoryList = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Inventory Items</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Manage all inventory items" : "View items and submit requests"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setMode("single")} data-testid="button-add-single">
            <Plus className="h-4 w-4 mr-2" />
            {isAdmin ? "Add Single" : "Request Single"}
          </Button>
          <Button variant="outline" onClick={() => setMode("bulk")} data-testid="button-add-bulk">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {isAdmin ? "Bulk Add" : "Bulk Request"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by item name, supplier, location, or category..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Button
          variant={searchByName ? "default" : "outline"}
          onClick={() => setSearchByName(!searchByName)}
          className="whitespace-nowrap"
          data-testid="button-search-by-name"
        >
          <Tags className="h-4 w-4 mr-2" />
          By Name
        </Button>
      </div>

      {loadingInventory ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading inventory...
          </CardContent>
        </Card>
      ) : filteredInventory.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {searchQuery ? "No items match your search" : "No inventory items yet. Add your first item!"}
          </CardContent>
        </Card>
      ) : searchByName && groupedInventory ? (
        <div className="space-y-4" data-testid="grouped-inventory-view">
          {Object.entries(groupedInventory).map(([categoryName, itemGroups], catIdx) => (
            <Card key={categoryName} data-testid={`category-group-${catIdx}`}>
              <CardHeader className="py-3 px-4 bg-muted/50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <span data-testid={`text-category-name-${catIdx}`}>{categoryName}</span>
                  <Badge variant="secondary" className="ml-2" data-testid={`badge-item-count-${catIdx}`}>
                    {Object.keys(itemGroups).length} item types
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {Object.entries(itemGroups).map(([itemName, items], itemIdx) => (
                  <div 
                    key={itemName} 
                    className="border rounded-lg p-3"
                    data-testid={`item-group-${catIdx}-${itemIdx}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium" data-testid={`text-item-name-${catIdx}-${itemIdx}`}>{itemName}</span>
                      </div>
                      <Badge data-testid={`badge-total-${catIdx}-${itemIdx}`}>
                        {items.length} {items.length === 1 ? 'entry' : 'entries'} | 
                        Total: {items.reduce((sum, i) => sum + i.quantity, 0)} {items[0]?.unitOfMeasure}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map(item => (
                        <div 
                          key={item.id} 
                          className="text-sm p-2 bg-muted/30 rounded flex justify-between items-center"
                          data-testid={`grouped-item-${item.id}`}
                        >
                          <div>
                            <span className="text-muted-foreground">Qty:</span> {item.quantity} | 
                            <span className="text-muted-foreground ml-1">Loc:</span> {item.location}
                          </div>
                          <span className="font-medium text-primary" data-testid={`text-amount-${item.id}`}>PHP {Number(item.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map(item => (
                    <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                      <TableCell className="font-medium">{item.itemName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getCategoryName(item.categoryId)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.supplier}</TableCell>
                      <TableCell>{item.quantity} {item.unitOfMeasure}</TableCell>
                      <TableCell>{item.location}</TableCell>
                      <TableCell>PHP {Number(item.unitCost).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">PHP {Number(item.amount).toFixed(2)}</TableCell>
                      <TableCell>{new Date(item.dateReceived).toLocaleDateString()}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setEditingItem(item)}
                              data-testid={`button-edit-${item.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => {
                                if (confirm("Delete this item?")) {
                                  deleteItemMutation.mutate(item.id);
                                }
                              }}
                              data-testid={`button-delete-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {categories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {categories.map(category => (
                <Badge 
                  key={category.id} 
                  variant="secondary"
                  className="cursor-pointer hover-elevate"
                  onClick={() => handleViewHistory(category)}
                  data-testid={`badge-category-${category.id}`}
                >
                  {category.name}
                  <History className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderEditDialog = () => (
    <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        {editingItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input
                  value={editingItem.itemName}
                  onChange={e => setEditingItem({ ...editingItem, itemName: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={editingItem.supplier}
                  onChange={e => setEditingItem({ ...editingItem, supplier: e.target.value })}
                  data-testid="input-edit-supplier"
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={editingItem.quantity}
                  onChange={e => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                  data-testid="input-edit-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editingItem.location}
                  onChange={e => setEditingItem({ ...editingItem, location: e.target.value })}
                  data-testid="input-edit-location"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost (PHP)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingItem.unitCost}
                  onChange={e => {
                    const newCost = parseFloat(e.target.value) || 0;
                    setEditingItem({ 
                      ...editingItem, 
                      unitCost: newCost.toString(),
                      amount: (editingItem.quantity * newCost).toFixed(2)
                    });
                  }}
                  data-testid="input-edit-cost"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (PHP)</Label>
                <Input
                  value={editingItem.amount}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={editingItem.remarks || ""}
                onChange={e => setEditingItem({ ...editingItem, remarks: e.target.value })}
                data-testid="input-edit-remarks"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingItem(null)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (editingItem) {
                updateItemMutation.mutate({
                  id: editingItem.id,
                  data: {
                    itemName: editingItem.itemName,
                    supplier: editingItem.supplier,
                    quantity: editingItem.quantity,
                    location: editingItem.location,
                    unitCost: parseFloat(String(editingItem.unitCost)),
                    amount: parseFloat(String(editingItem.amount)),
                    remarks: editingItem.remarks || undefined,
                  }
                });
              }
            }}
            disabled={updateItemMutation.isPending}
            data-testid="button-save-edit"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderHistoryDialog = () => (
    <Dialog open={!!historyCategory} onOpenChange={() => setHistoryCategory(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Category History: {historyCategory?.name}</DialogTitle>
          <DialogDescription>
            View purchase history and changes for this category
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[300px]">
          {categoryHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No history available</p>
          ) : (
            <div className="space-y-2">
              {categoryHistory.map((entry, index) => (
                <div key={index} className="p-3 border rounded-lg text-sm">
                  <div className="flex justify-between">
                    <Badge variant="outline">{entry.changeType}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(entry.changedAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.newValue && (
                    <div className="mt-2 text-muted-foreground">
                      {typeof entry.newValue === 'object' 
                        ? Object.entries(entry.newValue).map(([k, v]) => `${k}: ${v}`).join(', ')
                        : JSON.stringify(entry.newValue)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6">
      {mode === "view" && renderInventoryList()}
      {mode === "single" && renderSingleForm()}
      {mode === "bulk" && renderBulkForm()}
      {renderEditDialog()}
      {renderHistoryDialog()}
    </div>
  );
}
