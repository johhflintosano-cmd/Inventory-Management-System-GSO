import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Package, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { requestsApi, type ItemDecision } from "@/lib/api";

interface ProcessRequestsProps {
  user: { id: string; role: string };
}

const DENIAL_REASONS = [
  { value: "wrong_item_name", label: "Wrong Item Name" },
  { value: "wrong_location", label: "Wrong Location" },
  { value: "wrong_quantity", label: "Wrong Quantity" },
  { value: "wrong_unit_of_measure", label: "Wrong Unit of Measure" },
  { value: "wrong_unit_cost", label: "Wrong Unit Cost" },
  { value: "wrong_amount", label: "Wrong Amount" },
  { value: "other", label: "Other" },
];

export default function ProcessRequests({ user }: ProcessRequestsProps) {
  const { toast } = useToast();
  const isAdmin = user.role === "admin";
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [itemDecisions, setItemDecisions] = useState<Record<string, ItemDecision[]>>({});

  const { data: requests = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/requests'],
  });

  useEffect(() => {
    const socket = getSocket();
    
    const handleRequestChange = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
      refetch();
    };
    
    socket.on('request_change', handleRequestChange);
    socket.on('notification', handleRequestChange);
    
    return () => {
      socket.off('request_change', handleRequestChange);
      socket.off('notification', handleRequestChange);
    };
  }, [refetch]);

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, decisions }: { id: string; status: 'approved' | 'denied' | 'partial'; decisions?: ItemDecision[] }) =>
      requestsApi.review(id, status, decisions),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: "Request processed",
        description: data.approvedCount 
          ? `${data.approvedCount} items approved, ${data.deniedCount} denied`
          : "Request updated successfully",
      });
      setExpandedRequest(null);
      setItemDecisions({});
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const pendingRequests = requests.filter((r: any) => r.status === "pending");
  const processedRequests = requests.filter((r: any) => r.status !== "pending");

  const initializeDecisions = (requestId: string, items: any[]) => {
    if (!itemDecisions[requestId]) {
      const decisions = items.map((_, index) => ({
        index,
        status: "approved" as const,
        reason: undefined,
      }));
      setItemDecisions(prev => ({ ...prev, [requestId]: decisions }));
    }
  };

  const updateDecision = (requestId: string, index: number, status: "approved" | "denied", reason?: string) => {
    setItemDecisions(prev => {
      const decisions = [...(prev[requestId] || [])];
      decisions[index] = { index, status, reason: reason as any };
      return { ...prev, [requestId]: decisions };
    });
  };

  const handleApproveAll = (requestId: string) => {
    reviewMutation.mutate({ id: requestId, status: 'approved' });
  };

  const handleDenyAll = (requestId: string) => {
    reviewMutation.mutate({ id: requestId, status: 'denied' });
  };

  const handleSubmitDecisions = (requestId: string) => {
    const decisions = itemDecisions[requestId] || [];
    const approvedCount = decisions.filter(d => d.status === "approved").length;
    const deniedCount = decisions.filter(d => d.status === "denied").length;
    
    let status: 'approved' | 'denied' | 'partial' = 'partial';
    if (approvedCount === decisions.length) status = 'approved';
    else if (deniedCount === decisions.length) status = 'denied';
    
    reviewMutation.mutate({ id: requestId, status, decisions });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "denied":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Denied</Badge>;
      case "partial":
        return <Badge className="bg-yellow-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Partial</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderRequestCard = (request: any) => {
    const items = request.items as any[];
    const isBulk = request.requestType === "bulk" || items.length > 1;
    const isExpanded = expandedRequest === request.id;

    return (
      <Card key={request.id} className="mb-4" data-testid={`card-request-${request.id}`}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              {isBulk ? <FileSpreadsheet className="h-5 w-5" /> : <Package className="h-5 w-5" />}
              <div>
                <CardTitle className="text-base">
                  {isBulk ? `Bulk Request (${items.length} items)` : items[0]?.itemName || "Item Request"}
                </CardTitle>
                <CardDescription>
                  From: {request.employee?.name || "Unknown"} | 
                  {new Date(request.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
            </div>
            {getStatusBadge(request.status)}
          </div>
        </CardHeader>
        
        <CardContent>
          {!isBulk && items.length === 1 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{items[0].supplier}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{items[0].quantity} {items[0].unitOfMeasure}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>
                  <p className="font-medium">{items[0].location}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <p className="font-medium">PHP {(items[0].quantity * items[0].unitCost).toFixed(2)}</p>
                </div>
              </div>
              {items[0].remarks && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Remarks:</span>
                  <p>{items[0].remarks}</p>
                </div>
              )}
              
              {request.status === "pending" && isAdmin && (
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleApproveAll(request.id)}
                    disabled={reviewMutation.isPending}
                    data-testid={`button-approve-${request.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleDenyAll(request.id)}
                    disabled={reviewMutation.isPending}
                    data-testid={`button-deny-${request.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Deny
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Collapsible 
              open={isExpanded} 
              onOpenChange={(open) => {
                setExpandedRequest(open ? request.id : null);
                if (open && request.status === "pending") {
                  initializeDecisions(request.id, items);
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between" data-testid={`button-expand-${request.id}`}>
                  <span>View {items.length} items</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="pt-4">
                <ScrollArea className="h-[300px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {request.status === "pending" && isAdmin && <TableHead className="w-10"></TableHead>}
                        <TableHead>Item Name</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Amount</TableHead>
                        {request.status === "pending" && isAdmin && <TableHead>Decision</TableHead>}
                        {request.status !== "pending" && <TableHead>Status</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any, index: number) => {
                        const decision = itemDecisions[request.id]?.[index];
                        const itemStatus = request.itemStatuses?.[index.toString()];
                        
                        return (
                          <TableRow key={index} data-testid={`row-item-${request.id}-${index}`}>
                            {request.status === "pending" && isAdmin && (
                              <TableCell>
                                <Checkbox
                                  checked={decision?.status === "approved"}
                                  onCheckedChange={(checked) => 
                                    updateDecision(request.id, index, checked ? "approved" : "denied")
                                  }
                                  data-testid={`checkbox-item-${request.id}-${index}`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell>{item.supplier}</TableCell>
                            <TableCell>{item.quantity} {item.unitOfMeasure}</TableCell>
                            <TableCell>{item.location}</TableCell>
                            <TableCell>PHP {(item.quantity * item.unitCost).toFixed(2)}</TableCell>
                            {request.status === "pending" && isAdmin && (
                              <TableCell>
                                {decision?.status === "denied" && (
                                  <Select
                                    value={decision.reason || ""}
                                    onValueChange={(v) => updateDecision(request.id, index, "denied", v)}
                                  >
                                    <SelectTrigger className="w-[180px]" data-testid={`select-reason-${request.id}-${index}`}>
                                      <SelectValue placeholder="Select reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DENIAL_REASONS.map(r => (
                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                            )}
                            {request.status !== "pending" && (
                              <TableCell>
                                {itemStatus?.status === "approved" ? (
                                  <Badge className="bg-green-600">Approved</Badge>
                                ) : itemStatus?.status === "denied" ? (
                                  <Badge variant="destructive">
                                    Denied{itemStatus.reason && `: ${itemStatus.reason.replace(/_/g, ' ')}`}
                                  </Badge>
                                ) : (
                                  getStatusBadge(request.status)
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
                
                {request.status === "pending" && isAdmin && (
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={() => handleApproveAll(request.id)}
                      disabled={reviewMutation.isPending}
                      data-testid={`button-approve-all-${request.id}`}
                    >
                      Approve All
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleSubmitDecisions(request.id)}
                      disabled={reviewMutation.isPending}
                      data-testid={`button-submit-decisions-${request.id}`}
                    >
                      Submit Decisions
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => handleDenyAll(request.id)}
                      disabled={reviewMutation.isPending}
                      data-testid={`button-deny-all-${request.id}`}
                    >
                      Deny All
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isAdmin ? "Process Requests" : "My Requests"}
        </h1>
        <p className="text-muted-foreground">
          {isAdmin 
            ? "Review and approve employee item requests" 
            : "Track your submitted item requests"}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="processed" data-testid="tab-processed">
            Processed ({processedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading requests...
              </CardContent>
            </Card>
          ) : pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No pending requests
              </CardContent>
            </Card>
          ) : (
            <div>
              {pendingRequests.map((request: any) => renderRequestCard(request))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="processed" className="mt-4">
          {processedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No processed requests
              </CardContent>
            </Card>
          ) : (
            <div>
              {processedRequests.map((request: any) => renderRequestCard(request))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
