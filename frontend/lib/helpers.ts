export const getStatusBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'resolved':
    case 'closed':
      return 'success';
    case 'in_progress':
      return 'warning';
    case 'reopened':
      return 'warning';
    case 'rejected':
      return 'destructive';
    default:
      return 'secondary'; // pending, open
  }
};

export const getPriorityBadgeVariant = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'critical':
    case 'high':
      return 'destructive';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'secondary';
  }
};

export const formatStatus = (status: string) => {
  return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};
