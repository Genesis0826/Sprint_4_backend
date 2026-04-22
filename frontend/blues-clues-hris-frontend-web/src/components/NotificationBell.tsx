"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Loader2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Notification {
  notification_id: string;
  applicant_id?: string;
  message: string;
  type: string;
  job_posting_id?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  applicantId?: string;
  showUnreadBadge?: boolean;
}

export function NotificationBell({ applicantId, showUnreadBadge = true }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/tribeX/auth/v1";

  // Fetch notifications when dropdown opens and poll for updates
  useEffect(() => {
    if (!isOpen || !applicantId) return;

    const fetchNotifications = async () => {
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/applicant/${applicantId}`);
        if (!res.ok) throw new Error("Failed to fetch notifications");
        const data: Notification[] = await res.json();
        setNotifications(data);
        setLoading(false);
      } catch (err) {
        setError("Failed to load notifications");
        console.error(err);
        setLoading(false);
      }
    };

    // Fetch immediately on open
    setLoading(true);
    fetchNotifications();

    // Poll for new notifications every 3 seconds while dropdown is open
    const pollInterval = setInterval(() => {
      fetchNotifications();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isOpen, applicantId, API_BASE_URL]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${notificationId}/mark-read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      
      setNotifications(prev =>
        prev.map(n => n.notification_id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      toast.error("Failed to update notification");
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!applicantId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/applicant/${applicantId}/mark-all-read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      toast.error("Failed to update notifications");
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "status_update":
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case "application_update":
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return <Bell className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-muted-foreground hover:text-primary transition-colors cursor-pointer group p-1.5 rounded-lg hover:bg-muted/50"
      >
        <Bell className="h-5 w-5" />
        {showUnreadBadge && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-background group-hover:scale-110 transition-transform">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute -right-2 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-primary"
                onClick={handleMarkAllAsRead}
              >
                Mark all as read
              </Button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-center text-sm text-destructive">
                {error}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notif) => (
                  <div
                    key={notif.notification_id}
                    className={`px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer ${
                      !notif.is_read ? "bg-primary/5" : ""
                    }`}
                    onClick={() => !notif.is_read && handleMarkAsRead(notif.notification_id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-1">
                        {getNotificationIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-relaxed break-words">
                          {notif.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(notif.created_at)}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <div className="shrink-0 h-2 w-2 rounded-full bg-primary mt-1.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-center">
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
