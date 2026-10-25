"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Loader2, MessageSquare, Send, CheckCircle, RefreshCw, MessageCircle
} from "lucide-react";
import Link from "next/link";
import { formatStatus, getPriorityBadgeVariant, getStatusBadgeVariant } from "@/lib/helpers";
import dynamic from "next/dynamic";

// Only load ChatPanel in browser (Socket.IO requires window)
const ChatPanel = dynamic(() => import("@/components/ChatPanel"), { ssr: false });

interface ComplaintResponse {
  date_responded?: string;
  message: string;
  response_id?: number;
  staff_id?: number | null;
  staff_name?: string;
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
  feedback?: { rating: number; message: string } | null;
}

export default function ComplaintDetailPage() {
  const themedSelectClass =
    "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const { id } = useParams();
  const { user } = useAuth();

  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [responses, setResponses] = useState<ComplaintResponse[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [autoReopenNotice, setAutoReopenNotice] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Ref to scroll page to top smoothly
  const topRef = useRef<HTMLDivElement>(null);

  // Forms state
  const [replyMessage, setReplyMessage] = useState("");
  const [statusUpdate, setStatusUpdate] = useState("");
  const [assignStaffId, setAssignStaffId] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("5");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  // ── Initial full fetch (only once) ────────────────────────────────────
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

      if (user?.role === "admin" || user?.role === "staff") {
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
    if (id && user) void fetchData();
  }, [id, user, fetchData]);

  // ── Socket: listen for live status/assignment updates ─────────────────
  // The ChatPanel already joins the socket room. We use a separate lightweight
  // socket connection here just to receive complaint_updated events so both
  // the student AND staff pages update without needing a page refresh.
  useEffect(() => {
    if (!id || !user) return;
    let socket: ReturnType<typeof import("socket.io-client").io> | null = null;

    import("socket.io-client").then(({ io }) => {
      const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
      socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });

      socket.on("connect", () => {
        socket?.emit("join_complaint", id);
      });

      // When staff updates status → update complaint state directly, no scroll jump
      socket.on("complaint_updated", (data: Partial<ComplaintRecord>) => {
        setComplaint((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, ...data };
          if (data.status) setStatusUpdate(data.status);

          // Complaint re-resolved after reopen → clear feedbackSubmitted so the
          // feedback form shows again without needing a page refresh
          if (data.status === "resolved") {
            setFeedbackSubmitted(false);
            setAutoReopenNotice(false);
          }

          // If complaint was reopened remotely (e.g. student submitted bad feedback)
          // scroll to top so the reopen banner is immediately visible
          if (data.status === "reopened") {
            setAutoReopenNotice(true);
            setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }
          return updated;
        });
      });
    });

    return () => {
      socket?.emit("leave_complaint", id);
      socket?.disconnect();
    };
  }, [id, user]);

  // ── Actions: optimistic updates, NO full fetchData() ──────────────────
  // This prevents the page from scrolling to top after every action.

  const handleSendReply = async () => {
    if (!replyMessage.trim() || actionLoading) return;
    const msg = replyMessage.trim();
    setReplyMessage("");
    setActionLoading(true);
    try {
      const res = await api.post("/responses", {
        complaint_id: parseInt(id as string),
        staff_id: user?.id,
        message: msg
      });
      // Optimistically append new response
      setResponses((prev) => [
        {
          response_id: res.data.response_id,
          message: msg,
          staff_id: user?.id,
          staff_name: user?.name,
          date_responded: new Date().toISOString()
        },
        ...prev
      ]);
    } catch (err) {
      console.error("Failed to send reply", err);
      setReplyMessage(msg); // restore on error
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await api.patch(`/complaints/${id}`, { status: statusUpdate });
      // Optimistic update — no fetchData, no scroll
      setComplaint((prev) => prev ? { ...prev, status: statusUpdate } : null);
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const normalizedStaffId = assignStaffId ? Number(assignStaffId) : null;
      await api.patch(`/complaints/${id}/assign`, {
        staff_id: Number.isInteger(normalizedStaffId) ? normalizedStaffId : null
      });
      // Optimistic update
      const assignedStaffMember = staffList.find((s) => s.staff_id === normalizedStaffId);
      setComplaint((prev) =>
        prev
          ? {
              ...prev,
              staff_id: normalizedStaffId,
              assigned_staff: assignedStaffMember?.name || null,
              status: normalizedStaffId && prev.status === "pending" ? "open" : prev.status
            }
          : null
      );
    } catch (err) {
      console.error("Failed to assign", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.post("/feedback", {
        complaint_id: parseInt(id as string),
        student_id: user?.id,
        rating: parseInt(feedbackRating),
        message: feedbackMessage
      });
      setFeedbackSubmitted(true);
      if (res.data.auto_reopened) {
        setAutoReopenNotice(true);
        // Optimistic update status
        setComplaint((prev) => prev ? { ...prev, status: "reopened" } : null);
        // Scroll to top so the yellow reopen banner is front and centre
        setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (err) {
      console.error("Failed to submit feedback", err);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading || !complaint) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isResolved = complaint.status === "resolved" || complaint.status === "closed";
  const isReopened = complaint.status === "reopened";
  const hasAssignedStaff = !!(complaint.staff_id || complaint.assigned_staff);
  const isStaffOrAdmin = user?.role === "admin" || user?.role === "staff";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Invisible anchor at the top — scrolled into view on reopen */}
      <div ref={topRef} />
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      {/* Auto-reopen notice */}
      {(autoReopenNotice || isReopened) && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <RefreshCw className="w-4 h-4 shrink-0" />
          <span>
            <strong>Complaint Reopened</strong> — Automatically reopened due to a low feedback
            rating. This complaint is back in the queue for re-investigation.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ── Left/main column ── */}
        <div className="md:col-span-2 space-y-6">

          {/* Complaint info card */}
          <Card>
            <CardHeader>
              <div className="flex gap-2 mb-2">
                <Badge variant={getStatusBadgeVariant(complaint.status)}>
                  {formatStatus(complaint.status)}
                </Badge>
                <Badge variant={getPriorityBadgeVariant(complaint.priority)}>
                  {formatStatus(complaint.priority)} Priority
                </Badge>
              </div>
              <CardTitle className="text-2xl">{complaint.title}</CardTitle>
              <CardDescription>
                Submitted on{" "}
                {new Date(complaint.date_filed || complaint.created_at || "").toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Description</h3>
              <p className="whitespace-pre-wrap text-foreground">{complaint.description}</p>
            </CardContent>
          </Card>

          {/* Discussion thread — staff/admin only for replying */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Discussion Thread
              </CardTitle>
              {user?.role === "student" && (
                <p className="text-xs text-muted-foreground">
                  Staff responses will appear here. Use the Live Chat below to talk directly with your assigned staff.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {responses.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No staff responses yet.</p>
              ) : (
                <div className="space-y-4">
                  {responses.map((resp) => (
                    <div
                      key={resp.response_id}
                      className="flex flex-col rounded-lg bg-secondary p-4"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-foreground">
                          {resp.staff_name || "Staff"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(resp.date_responded || "").toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{resp.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply box — STAFF/ADMIN only (fixes the 400 AxiosError for students) */}
              {isStaffOrAdmin && !isResolved && (
                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <Textarea
                    placeholder="Type an official response..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="flex-1 min-h-[60px] max-h-[120px]"
                  />
                  <Button onClick={handleSendReply} className="h-auto" disabled={actionLoading}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Chat — visible to both student and assigned staff */}
          {hasAssignedStaff && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Live Chat
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Real-time chat between student and assigned staff
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ChatPanel complaintId={complaint.complaint_id!} />
              </CardContent>
            </Card>
          )}

          {/* Feedback — student only, after resolution.
              Show if: no feedback exists yet, OR existing feedback had low rating
              (low-rating feedback triggers reopen; after re-resolution student can re-evaluate) */}
          {isResolved && user?.role === "student" && !feedbackSubmitted &&
            (!complaint.feedback || (complaint.feedback as { rating: number })?.rating < 2) && (
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
                      {[1, 2, 3, 4, 5].map((num) => (
                        <option key={num} value={num}>
                          {num} Star{num > 1 ? "s" : ""}
                          {num < 2 ? " ⚠ (will reopen complaint)" : ""}
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
                  <Button type="submit" variant="outline" className="w-full" disabled={actionLoading}>
                    Submit Feedback
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {feedbackSubmitted && !autoReopenNotice && (
            <Card className="border-success-border bg-success-bg">
              <CardContent className="flex items-center gap-3 py-4 text-sm text-success-foreground">
                <CheckCircle className="w-5 h-5 shrink-0" />
                Feedback submitted. Thank you!
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right sidebar ── */}
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
                    {complaint.assigned_staff || `Staff #${complaint.staff_id}`}
                  </span>
                ) : (
                  <span className="italic text-muted-foreground">Auto-assigning…</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground">Status</span>
                <Badge variant={getStatusBadgeVariant(complaint.status)}>
                  {formatStatus(complaint.status)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Management actions — staff/admin only */}
          {isStaffOrAdmin && (
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
                    <Button size="sm" onClick={handleUpdateStatus} disabled={actionLoading}>
                      Update
                    </Button>
                  </div>
                </div>

                {user?.role === "admin" && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <Label>Assign Staff (Override)</Label>
                    <div className="flex gap-2">
                      <select
                        className={themedSelectClass}
                        value={assignStaffId}
                        onChange={(e) => setAssignStaffId(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {staffList.map((s) => (
                          <option key={s.staff_id} value={s.staff_id}>
                            {s.name} {s.department ? `(${s.department})` : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={handleAssign}
                        variant="secondary"
                        disabled={actionLoading}
                      >
                        Assign
                      </Button>
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
