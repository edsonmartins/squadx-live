import { useState, useEffect } from "react";
import { X, User, Users, Check, Loader2, Search } from "lucide-react";
import type { TeamMember } from "../../types/chat";

interface CreateConversationProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  getTeamMembers: () => Promise<TeamMember[]>;
}

export function CreateConversation({
  isOpen,
  onClose,
  onCreateDirect,
  onCreateGroup,
  getTeamMembers,
}: CreateConversationProps) {
  const [mode, setMode] = useState<"select" | "direct" | "group">("select");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode("select");
      setSelectedMembers([]);
      setGroupName("");
      setSearchQuery("");
      loadMembers();
    }
  }, [isOpen]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const members = await getTeamMembers();
      setTeamMembers(members);
    } catch (err) {
      console.error("Failed to load team members:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = teamMembers.filter((member) =>
    member.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateDirect = async (userId: string) => {
    setIsCreating(true);
    try {
      await onCreateDirect(userId);
      onClose();
    } catch (err) {
      console.error("Failed to create conversation:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;

    setIsCreating(true);
    try {
      await onCreateGroup(groupName.trim(), selectedMembers);
      onClose();
    } catch (err) {
      console.error("Failed to create group:", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-slate-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">
            {mode === "select" && "New Conversation"}
            {mode === "direct" && "New Direct Message"}
            {mode === "group" && "New Group"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {mode === "select" && (
            <div className="space-y-3">
              <button
                onClick={() => setMode("direct")}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-600 p-4 text-left hover:bg-slate-700 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600">
                  <User size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-medium text-white">Direct Message</p>
                  <p className="text-sm text-slate-400">Chat with one person</p>
                </div>
              </button>

              <button
                onClick={() => setMode("group")}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-600 p-4 text-left hover:bg-slate-700 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600">
                  <Users size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-medium text-white">Group Chat</p>
                  <p className="text-sm text-slate-400">Create a group with multiple members</p>
                </div>
              </button>
            </div>
          )}

          {mode === "direct" && (
            <div className="space-y-4">
              <button
                onClick={() => setMode("select")}
                className="text-sm text-primary-400 hover:text-primary-300"
              >
                &larr; Back
              </button>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team members..."
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 py-2 pl-10 pr-4 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none"
                />
              </div>

              {/* Members list */}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">No team members found</p>
                ) : (
                  filteredMembers.map((member) => (
                    <button
                      key={member.user_id}
                      onClick={() => handleCreateDirect(member.user_id)}
                      disabled={isCreating}
                      className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-slate-700 disabled:opacity-50"
                    >
                      <div className="relative">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.display_name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600">
                            <User size={20} className="text-slate-300" />
                          </div>
                        )}
                        {member.is_online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-slate-800" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-white">{member.display_name}</p>
                        <p className="text-xs text-slate-400">
                          {member.is_online ? "Online" : "Offline"}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === "group" && (
            <div className="space-y-4">
              <button
                onClick={() => setMode("select")}
                className="text-sm text-primary-400 hover:text-primary-300"
              >
                &larr; Back
              </button>

              {/* Group name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name..."
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none"
                />
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team members..."
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 py-2 pl-10 pr-4 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none"
                />
              </div>

              {/* Members list with checkboxes */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">No team members found</p>
                ) : (
                  filteredMembers.map((member) => (
                    <button
                      key={member.user_id}
                      onClick={() => toggleMember(member.user_id)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-slate-700"
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          selectedMembers.includes(member.user_id)
                            ? "border-primary-500 bg-primary-600"
                            : "border-slate-500"
                        }`}
                      >
                        {selectedMembers.includes(member.user_id) && (
                          <Check size={14} className="text-white" />
                        )}
                      </div>
                      <div className="relative">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.display_name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
                            <User size={16} className="text-slate-300" />
                          </div>
                        )}
                      </div>
                      <span className="text-white">{member.display_name}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Selected count and create button */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-400">
                  {selectedMembers.length} member(s) selected
                </span>
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedMembers.length === 0 || isCreating}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Group
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
