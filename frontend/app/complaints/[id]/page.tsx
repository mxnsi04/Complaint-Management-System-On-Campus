"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, MessageSquare, Send, CheckCircle, RefreshCw, MessageCircle } from "lucide-react";
import Link from "next/link";
import { formatStatus, getPriorityBadgeVariant, getStatusBadgeVariant } from "@/lib/helpers";
import dynamic from "next/dynamic";

// Dynamically import ChatPanel so Socket.IO only runs in browser
const ChatPanel = dynamic(() => import("@/components/ChatPanel"), { ssr: false });

interface ComplaintResponse {
  created_at?: string;
  date_responded?: string;
  id?: number;
  message: string;
  response_id?: number;
  staff_id?: number | null;
}

interface StaffMember {
  department?: string;
  name: string;
  staff_id: number;
}

interface ComplaintRecord {
  assigned_staff?: string | null;
  category?: { name: string } | string | null;
  category_id?: number;
  complaint_id?: number;
  created_at?: string;
  date_filed?: string;
  description: string;
  priority: string;
  staff_id?: number | null;
  status: string;
  student_id: number;
  title: string;
}

export default function ComplaintDetailPage() {
  const themedSelectClass = "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const { id } = useParams();
  const { user } = useAuth();

  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [responses, setResponses] = useState<ComplaintResponse[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [autoReopenNotice, setAutoReopenNotice] = useState(false);

  // Forms state
  const [replyMessage, setReplyMessage] = useState("");
  const [statusUpdate, setStatusUpdate] = useState("");
  const [assignStaffId, setAssignStaffId] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("5");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [compRes, respRes] = await Promise.all([
        api.get(`/complaints/${id}`),
        api.get(`/responses/complaint/${id}`)
      ]);
      setComplaint(compRes.data);
      setResponses(Array.isArray(respRes.data) ? respRes.data : respRes.data.data || []);
      setStatusUpdate(compRes.data.status);
      setAssignStaffId(compRes.data.staff_id ? String(compRes.data.staff_id) : "");

      if (user?.role === 'admin' || user?.role === 'staff') {
        const staffRes = await api.get("/staff");
        setStaffList(Array.isArray(staffRes.data) ? staffRes.data : staffRes.data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, user?.role]);

  useEffect(() => {
    if (id && user) {
      void fetchData();
    }
  }, [id, user, fetchData]);

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;
    try {
      await api.post("/responses", {
        complaint_id: parseInt(id as string),
        staff_id: user?.role === 'staff' || user?.role === 'admin' ? user.id : null,
        message: replyMessage
      });
      setReplyMessage("");
      fetchData();
    } catch (err) {
      console.error("Failed to send reply", err);
    }
  };

  const handleUpdateStatus = async () => {
    try {
      await api.patch(`/complaints/${id}`, { status: statusUpdate });
      fetchData();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleAssign = async () => {
    try {
      const normalizedStaffId = assignStaffId ? Number(assignStaffId) : null;
      await api.patch(`/complaints/${id}/assign`, {
        staff_id: Number.isInteger(normalizedStaffId) ? normalizedStaffId : null
      });
      fetchData();
    } catch (err) {
      console.error("Failed to assign", err);
    }
  };

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/feedback", {
        complaint_id: parseInt(id as string),
        student_id: user?.id,
        rating: parseInt(feedbackRating),
        message: feedbackMessage
      });
      setFeedbackSubmitted(true);
      // --- Workflow 2 notice: if auto-reopened show banner ---
      if (res.data.auto_reopened) {
        setAutoReopenNotice(true);
      }
      fetchData();
    } catch (err) {
      console.error("Failed to submit feedback", err);
    }
  };

  if (loading || !complaint) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isResolved = complaint.status === 'resolved' || complaint.status === 'closed';
  const isReopened = complaint.status === 'reopened';
  const hasAssignedStaff = !!(complaint.staff_id || complaint.assigned_staff);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      {/* Auto-reopen notice banner */}
      {(autoReopenNotice || isReopened) && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <RefreshCw className="w-4 h-4 shrink-0" />
          <span>
            <strong>Complaint Reopened</strong> — This complaint was automatically reopened due to a low feedback rating. The admin has been notified.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex gap-2 mb-2">
                    <Badge variant={getStatusBadgeVariant(complaint.status)}>
                      {formatStatus(complaint.status)}
                    </Badge>
                    <Badge variant={getPriorityBadgeVariant(complaint.priority)}>
                      {formatStatus(complaint.priority)} Priority
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl mt-2">{complaint.title}</CardTitle>
                  <CardDescription className="mt-1">
                    Submitted on {new Date(complaint.date_filed || complaint.created_at).toLocaleString()}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Description</h3>
              <p className="whitespace-pre-wrap text-foreground">{complaint.description}</p>
            </CardContent>
          </Card>

          {/* Discussion / Response Thread */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Discussion thread
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {responses.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No responses yet.</p>
              ) : (
                <div className="space-y-4">
                  {responses.map((resp) => (
                    <div key={resp.response_id || resp.id} className={`flex flex-col rounded-lg p-4 ${resp.staff_id ? "bg-secondary" : "bg-muted"}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-foreground">
                          {resp.staff_id ? 'Staff/Admin' : 'Student'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(resp.date_responded || resp.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{resp.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {!isResolved && (
                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <Textarea
                    placeholder="Type a response..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="flex-1 min-h-[40px] max-h-[120px]"
                  />
                  <Button onClick={handleSendReply} className="h-auto">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* --- Workflow 3: Real-Time Chat Panel --- */}
          {hasAssignedStaff && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Real-Time Chat
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Live chat between student and assigned staff
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ChatPanel complaintId={complaint.complaint_id!} />
              </CardContent>
            </Card>
          )}

          {/* Feedback section */}
          {isResolved && user?.role === 'student' && !feedbackSubmitted && (
            <Card className="border-success-border bg-success-bg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-success-foreground">
                  <CheckCircle className="w-5 h-5" />
                  Provide Feedback
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Rating below 2 stars will automatically reopen this complaint for re-investigation.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFeedback} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Rating (1–5 stars)</Label>
                    <select
                      className={themedSelectClass}
                      value={feedbackRating}
                      onChange={(e) => setFeedbackRating(e.target.value)}
                    >
                      {[1, 2, 3, 4, 5].map(num => (
                        <option key={num} value={num}>
                          {num} Star{num > 1 ? "s" : ""}{num < 2 ? " ⚠ (will reopen complaint)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Feedback Message</Label>
                    <Textarea
                      placeholder="Share your experience..."
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full">Submit Feedback</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {feedbackSubmitted && !autoReopenNotice && (
            <Card className="border-success-border bg-success-bg">
              <CardContent className="flex items-center gap-3 py-4 text-sm text-success-foreground">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>Feedback submitted successfully. Thank you!</span>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="mb-1 block text-muted-foreground">Student ID</span>
                <span className="font-medium text-foreground">#{complaint.student_id}</span>
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground">Category</span>
                <span className="font-medium text-foreground">
                  {typeof complaint.category === "object" && complaint.category !== null
                    ? complaint.category.name
                    : complaint.category || `ID: ${complaint.category_id}`}
                </span>
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground">Assigned Staff</span>
                {hasAssignedStaff ? (
                  <span className="font-medium text-foreground">
                    {complaint.assigned_staff || `Staff ID: #${complaint.staff_id}`}
                  </span>
                ) : (
                  <span className="italic text-muted-foreground">Auto-assigning...</span>
                )}
              </div>
            </CardContent>
          </Card>

          {(user?.role === 'admin' || user?.role === 'staff') && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Management Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Update Status</Label>
                  <div className="flex gap-2">
                    <select
                      className={themedSelectClass}
                      value={statusUpdate}
                      onChange={(e) => setStatusUpdate(e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="rejected">Rejected</option>
                      <option value="reopened">Reopened</option>
                    </select>
                    <Button size="sm" onClick={handleUpdateStatus}>Update</Button>
                  </div>
                </div>

                {user.role === 'admin' && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <Label>Assign Staff (Override)</Label>
                    <div className="flex gap-2">
                      <select
                        className={themedSelectClass}
                        value={assignStaffId}
                        onChange={(e) => setAssignStaffId(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {staffList.map(s => (
                          <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.department})</option>
                        ))}
                      </select>
                      <Button size="sm" onClick={handleAssign} variant="secondary">Assign</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
