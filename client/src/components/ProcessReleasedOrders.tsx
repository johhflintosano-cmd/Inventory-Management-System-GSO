import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Clock, AlertTriangle, PackageMinus, Eye } from "lucide-react";

interface CartItem {
  inventoryItemId: string;
  particulars: string;
  unit: string;
  unitCost: string;
  quantity: number;
  amount: string;
  availableQty?: number;
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

interface ItemDecision {
  index: number;
  status: "approved" | "denied";
  reason?: string;
}

export default function ProcessReleasedOrders() {
  const { toast } = useToast();
  
  const [selectedRequest, setSelectedRequest] = useState<ReleasedOrderRequest | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [itemDecisions, setItemDecisions] = useState<Record<number, ItemDecision>>({});
  const [denialReason, setDenialReason] = useState("");

  // Fetch pending requests
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery<ReleasedOrderRequest[]>({
    queryKey: ['/api/released-orders/requests/pending'],
  });

  // Fetch all requests
  const { data: allRequests = [], isLoading: loadingAll } = useQuery<ReleasedOrderRequest[]>({
    queryKey: ['/api/released-orders/requests'],
  });

  // Fetch users for display
  const { data: users = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/users'],
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status, itemDecisions }: { requestId: string; status: string; itemDecisions?: ItemDecision[] }) => {
      const res = await apiRequest("POST", `/api/released-orders/requests/${requestId}/review`, {
        status,
        itemDecisions,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request Reviewed", description: "The request has been processed." });
      setShowReviewDialog(false);
      setSelectedRequest(null);
      setItemDecisions({});
      setDenialReason("");
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/requests/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/released-orders/requests'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to review request", variant: "destructive" });
    },
  });

  // Get user name by ID
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown User";
  };

  // Open review dialog
  const handleOpenReview = (request: ReleasedOrderRequest) => {
    setSelectedRequest(request);
    
    // Initialize all items as approved by default
    const initialDecisions: Record<number, ItemDecision> = {};
    request.items.forEach((_, idx) => {
      initialDecisions[idx] = { index: idx, status: "approved" };
    });
    setItemDecisions(initialDecisions);
    
    setShowReviewDialog(true);
  };

  // Toggle item decision
  const toggleItemDecision = (index: number) => {
    setItemDecisions(prev => ({
      ...prev,
      [index]: {
        index,
        status: prev[index]?.status === "approved" ? "denied" : "approved",
        reason: prev[index]?.status === "approved" ? denialReason : undefined,
      },
    }));
  };

  // Handle approve all
  const handleApproveAll = () => {
    if (!selectedRequest) return;
    
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      status: "approved",
    });
  };

  // Handle deny all
  const handleDenyAll = () => {
    if (!selectedRequest) return;
    
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      status: "denied",
    });
  };

  // Handle partial approval (item-level decisions)
  const handleSubmitReview = () => {
    if (!selectedRequest) return;
    
    const decisions = Object.values(itemDecisions);
    const approvedCount = decisions.filter(d => d.status === "approved").length;
    const totalCount = decisions.length;
    
    let status: "approved" | "denied" | "partial" = "approved";
    if (approvedCount === 0) {
      status = "denied";
    } else if (approvedCount < totalCount) {
      status = "partial";
    }
    
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      status,
      itemDecisions: decisions,
    });
  };

  // Get status badge
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

  // Count approved items in review
  const getApprovedCount = () => {
    return Object.values(itemDecisions).filter(d => d.status === "approved").length;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-process-released-orders-title">
          Process Released Order Requests
        </h1>
        <p className="text-muted-foreground">
          Review and approve employee requests for releasing inventory items
        </p>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-requests">All Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageMinus className="w-5 h-5" />
                Pending Requests
              </CardTitle>
              <CardDescription>
                Requests awaiting your approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-8 text-muted-foreground">Loading requests...</div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending requests
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <Card key={request.id} data-testid={`card-pending-request-${request.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {getUserName(request.employeeId)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.departmentOffice}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(request.createdAt).toLocaleString()}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {request.items.length} item(s)
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {request.isPartial ? "Partial" : "Full"} release
                              </p>
                            </div>
                            
                            <Button 
                              onClick={() => handleOpenReview(request)}
                              data-testid={`button-review-${request.id}`}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Review
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Requests</CardTitle>
              <CardDescription>Complete history of released order requests</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {loadingAll ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : allRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No requests found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRequests.map((request) => (
                        <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                          <TableCell>{getUserName(request.employeeId)}</TableCell>
                          <TableCell>{request.departmentOffice}</TableCell>
                          <TableCell>{request.items.length} item(s)</TableCell>
                          <TableCell>{getStatusBadge(request.status)}</TableCell>
                          <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {request.status === "pending" ? (
                              <Button 
                                size="sm" 
                                onClick={() => handleOpenReview(request)}
                                data-testid={`button-review-all-${request.id}`}
                              >
                                Review
                              </Button>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowReviewDialog(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
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

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRequest?.status === "pending" ? "Review Request" : "Request Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.status === "pending" 
                ? "Review items and approve or deny this request"
                : "View the details of this request"
              }
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Employee</p>
                  <p className="font-medium">{getUserName(selectedRequest.employeeId)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Department/Office</p>
                  <p className="font-medium">{selectedRequest.departmentOffice}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{new Date(selectedRequest.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Release Type</p>
                  <p className="font-medium">{selectedRequest.isPartial ? "Partial" : "Full"}</p>
                </div>
                {selectedRequest.rsNo && (
                  <div>
                    <p className="text-muted-foreground">RS No.</p>
                    <p className="font-medium">{selectedRequest.rsNo}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedRequest.status)}
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">Requested Items</p>
                <ScrollArea className="h-[200px] rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {selectedRequest.status === "pending" && <TableHead className="w-12">Approve</TableHead>}
                        <TableHead>Item</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {selectedRequest.status !== "pending" && <TableHead>Decision</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRequest.items.map((item, index) => {
                        const decision = itemDecisions[index];
                        const existingStatus = selectedRequest.itemStatuses?.[index.toString()];
                        
                        return (
                          <TableRow key={index}>
                            {selectedRequest.status === "pending" && (
                              <TableCell>
                                <Checkbox
                                  checked={decision?.status === "approved"}
                                  onCheckedChange={() => toggleItemDecision(index)}
                                  data-testid={`checkbox-item-${index}`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{item.particulars}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell className="text-right">₱{Number(item.unitCost).toFixed(2)}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">₱{Number(item.amount).toFixed(2)}</TableCell>
                            {selectedRequest.status !== "pending" && (
                              <TableCell>
                                {existingStatus?.status === "approved" ? (
                                  <Badge className="bg-green-600">Approved</Badge>
                                ) : (
                                  <Badge variant="destructive">Denied</Badge>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {selectedRequest.status === "pending" && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {getApprovedCount()} of {selectedRequest.items.length} items selected for approval
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="denialReason">Denial Reason (for denied items)</Label>
                    <Textarea
                      id="denialReason"
                      placeholder="Optional: Reason for denying items..."
                      value={denialReason}
                      onChange={(e) => setDenialReason(e.target.value)}
                      data-testid="textarea-denial-reason"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === "pending" ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setShowReviewDialog(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDenyAll}
                  disabled={reviewMutation.isPending}
                  data-testid="button-deny-all"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Deny All
                </Button>
                <Button 
                  variant="default" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleApproveAll}
                  disabled={reviewMutation.isPending}
                  data-testid="button-approve-all"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve All
                </Button>
                <Button 
                  onClick={handleSubmitReview}
                  disabled={reviewMutation.isPending || getApprovedCount() === 0}
                  data-testid="button-submit-review"
                >
                  Submit Review ({getApprovedCount()}/{selectedRequest?.items.length})
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setShowReviewDialog(false)}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
