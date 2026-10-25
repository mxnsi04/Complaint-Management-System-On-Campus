"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusBadgeVariant, getPriorityBadgeVariant, formatStatus } from "@/lib/helpers";
import Link from "next/link";
import { Plus, Search, Filter, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ComplaintItem {
  complaint_id: number;
  title: string;
  status?: string;
  priority?: string;
  date_filed?: string;
  created_at?: string;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchComplaints = async () => {
      if (!user) return;
      try {
        setLoading(true);

        let endpoint = "/complaints"; // admin sees all

        if (user.role === "student") {
          // Students see only their own complaints
          endpoint = `/students/${user.id}/complaints`;
        } else if (user.role === "staff") {
          // Staff see only complaints assigned to them
          endpoint = `/staff/${user.id}/complaints`;
        }

        const { data } = await api.get(endpoint);
        setComplaints(Array.isArray(data) ? data : data.data || []);
      } catch (err) {
        console.error("Failed to load complaints:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchComplaints();
  }, [user]);

  if (authLoading || (loading && complaints.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredComplaints = complaints.filter((c) =>
    c.title?.toLowerCase().includes(search.toLowerCase()) ||
    c.complaint_id?.toString().includes(search)
  );

  const formatComplaintDate = (dateValue?: string) => {
    if (!dateValue) return "Date unavailable";
    return new Date(dateValue).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user?.role === "admin" ? "All Complaints" : user?.role === "staff" ? "My Assigned Complaints" : "My Complaints"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {user?.role === "admin"
              ? "Manage and track all campus complaints."
              : user?.role === "staff"
              ? "Complaints assigned to you."
              : "Your submitted complaints."}
          </p>
        </div>
        {user?.role === "student" && (
          <Link href="/complaints/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Complaint
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search complaints..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid gap-4">
        {filteredComplaints.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center h-48 text-center">
              <p className="mb-2 text-muted-foreground">No complaints found.</p>
              {user?.role === "student" && (
                <Link href="/complaints/new">
                  <Button variant="outline" size="sm">Create your first complaint</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredComplaints.map((complaint) => (
            <Link key={complaint.complaint_id} href={`/complaints/${complaint.complaint_id}`}>
              <Card className="group cursor-pointer transition-colors hover:border-accent">
                <CardHeader className="py-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <CardTitle className="text-lg transition-colors group-hover:text-foreground">
                        {complaint.title}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-3">
                        <span>#{complaint.complaint_id}</span>
                        <span>|</span>
                        <span>{formatComplaintDate(complaint.date_filed || complaint.created_at)}</span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Badge variant={getPriorityBadgeVariant(complaint.priority || "low")}>
                        {formatStatus(complaint.priority || "low")}
                      </Badge>
                      <Badge variant={getStatusBadgeVariant(complaint.status || "pending")}>
                        {formatStatus(complaint.status || "pending")}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
