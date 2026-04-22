import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserRole } from "../services/auth";
import { SEARCH_PLACEHOLDERS } from "../constants/config";
import { Colors } from "../constants/colors";
import { getInitial } from "../lib/utils";
import { API_BASE_URL } from "../lib/api";

type Props = {
  role: UserRole;
  userName: string;
  applicantId?: string;
};

type Notification = {
  notification_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export const Header = ({ role, userName, applicantId }: Props) => {
  const initial = getInitial(userName);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  useEffect(() => {
    if (notificationOpen && applicantId && role === "Applicant") {
      fetchNotifications();
    }
  }, [notificationOpen, applicantId, role]);

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const res = await fetch(
        `${API_BASE_URL}/notifications/applicant/${applicantId}`,
      );
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.is_read).length);
      }
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View
      style={{ borderBottomColor: Colors.border }}
      className="bg-white px-4 pt-4 pb-3 flex-row items-center justify-between border-b relative"
    >
      {/* Search Bar */}
      <View className="flex-1 mr-3">
        <View
          style={{
            borderColor: Colors.border,
            backgroundColor: Colors.bgMuted,
          }}
          className="rounded-xl border px-3 py-2.5"
        >
          <Text
            style={{ color: Colors.textPlaceholder }}
            className="text-xs"
          >
            {SEARCH_PLACEHOLDERS[role]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-3 relative z-10">
        {/* Notification Bell */}
        <Pressable
          onPress={() => setNotificationOpen(!notificationOpen)}
          className="relative"
        >
          <View
            style={{ backgroundColor: Colors.primaryLight }}
            className="h-9 w-9 rounded-full items-center justify-center"
          >
            <Text>🔔</Text>
          </View>
          {unreadCount > 0 && (
            <View
              style={{
                backgroundColor: Colors.danger,
                borderColor: Colors.bgCard,
              }}
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
            />
          )}

          {/* Dropdown Menu */}
          {notificationOpen && (
            <View
              style={{
                position: "absolute",
                top: 45,
                right: 0,
                width: 280,
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.border,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 5,
                zIndex: 1000,
              }}
            >
              {/* Header */}
              <View className="px-4 py-3 border-b border-slate-100">
                <Text
                  style={{ color: Colors.textPrimary }}
                  className="font-bold text-sm"
                >
                  Notifications
                </Text>
              </View>

              {/* Content */}
              {loadingNotifications ? (
                <View className="py-8 items-center justify-center">
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : notifications.length === 0 ? (
                <View className="py-6 px-4 items-center">
                  <Text
                    style={{ color: Colors.textSecondary }}
                    className="text-xs text-center"
                  >
                    No notifications yet
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 300 }}
                  showsVerticalScrollIndicator={false}
                >
                  {notifications.map((notif) => (
                    <View
                      key={notif.notification_id}
                      style={{
                        backgroundColor: notif.is_read
                          ? "#FFFFFF"
                          : "#F0F9FF",
                        borderBottomColor: Colors.border,
                      }}
                      className="px-4 py-3 border-b"
                    >
                      <Text
                        style={{ color: Colors.textPrimary }}
                        className="text-xs leading-4"
                      >
                        {notif.message}
                      </Text>
                      <Text
                        style={{ color: Colors.textSecondary }}
                        className="text-xs mt-1"
                      >
                        {formatDate(notif.created_at)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </Pressable>

        {/* Avatar */}
        <View
          style={{ backgroundColor: Colors.primary }}
          className="h-9 w-9 rounded-full items-center justify-center"
        >
          <Text className="text-white font-bold text-sm">{initial}</Text>
        </View>
      </View>
    </View>
  );
};
