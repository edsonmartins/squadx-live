import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PresenceStatus, TeamMember } from "../types/chat";

export function usePresence() {
  const [myStatus, setMyStatus] = useState<PresenceStatus>("offline");
  const [onlineUsers, setOnlineUsers] = useState<Map<string, boolean>>(new Map());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Update my presence status
  const updateStatus = useCallback(async (status: PresenceStatus) => {
    try {
      await invoke("update_presence", { status });
      setMyStatus(status);
    } catch (err) {
      console.error("Failed to update presence:", err);
    }
  }, []);

  // Load team members and their presence
  const loadTeamMembers = useCallback(async () => {
    try {
      const members = await invoke<TeamMember[]>("get_team_members");
      setTeamMembers(members);

      // Update online users map
      const onlineMap = new Map<string, boolean>();
      members.forEach((member) => {
        onlineMap.set(member.user_id, member.is_online);
      });
      setOnlineUsers(onlineMap);

      return members;
    } catch (err) {
      console.error("Failed to load team members:", err);
      return [];
    }
  }, []);

  // Check if a specific user is online
  const isOnline = useCallback(
    (userId: string) => onlineUsers.get(userId) ?? false,
    [onlineUsers]
  );

  // Auto-update presence on mount/unmount
  useEffect(() => {
    // Set online when component mounts
    updateStatus("online");

    // Set offline when window is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateStatus("away");
      } else {
        updateStatus("online");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Set offline on unmount
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      updateStatus("offline");
    };
  }, [updateStatus]);

  // Periodically refresh team presence
  useEffect(() => {
    loadTeamMembers();

    const interval = setInterval(() => {
      loadTeamMembers();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [loadTeamMembers]);

  return {
    myStatus,
    onlineUsers,
    teamMembers,
    updateStatus,
    loadTeamMembers,
    isOnline,
  };
}
