import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, UserX, UserCheck, Mail, Loader2 } from "lucide-react";
import {
  Button,
  Avatar,
  Badge,
  Modal,
  Input,
  Select,
} from "../../components/common";
import { usersApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../lib/types";

export const TeamSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "agent" | "viewer">(
    "agent",
  );
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteEmailFeedback, setInviteEmailFeedback] = useState<
    "none" | "not_sent" | "failed" | "sent"
  >("none");
  const [inviteEmailErrorDetail, setInviteEmailErrorDetail] = useState("");
  const [resendTargetId, setResendTargetId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<"success" | "error" | null>(
    null,
  );
  const [resendError, setResendError] = useState("");

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const users = await usersApi.list();
      setMembers(users);
    } catch (error) {
      console.error("Failed to load team members:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError("");
    setInviteEmailFeedback("none");
    setInviteEmailErrorDetail("");
    try {
      const {
        user: newUser,
        emailSent,
        emailError,
      } = await usersApi.invite({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      });
      setMembers([newUser, ...members]);
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("agent");
      if (emailError) {
        setInviteEmailFeedback("failed");
        setInviteEmailErrorDetail(emailError);
      } else if (!emailSent) {
        setInviteEmailFeedback("not_sent");
      } else {
        setInviteEmailFeedback("sent");
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      setInviteError(err.response?.data?.error || "Failed to invite user");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (
    userId: string,
    newRole: "admin" | "agent" | "viewer",
  ) => {
    try {
      const updatedUser = await usersApi.updateRole(userId, newRole);
      setMembers(members.map((m) => (m._id === userId ? updatedUser : m)));
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Failed to update role. Please try again.");
    }
  };

  const handleRemove = async (userId: string, userName: string) => {
    if (!confirm(t("team.confirmRemove", { name: userName }))) {
      return;
    }

    try {
      await usersApi.remove(userId);
      setMembers(members.filter((m) => m._id !== userId));
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || "Failed to remove user");
    }
  };

  const handleStatusChange = async (
    userId: string,
    status: "active" | "inactive",
  ) => {
    try {
      const updatedUser = await usersApi.updateStatus(userId, status);
      setMembers(members.map((m) => (m._id === userId ? updatedUser : m)));
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || "Failed to update status");
    }
  };

  const handleResendInvite = async (userId: string) => {
    setResendTargetId(userId);
    setResendResult(null);
    setResendError("");
    try {
      const { emailSent, emailError } = await usersApi.resendInvite(userId);
      setResendResult(emailSent ? "success" : "error");
      if (emailError) setResendError(emailError);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      setResendResult("error");
      setResendError(
        err.response?.data?.error || "Failed to resend invitation",
      );
    } finally {
      setResendTargetId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="purple">{t("roles.admin.name")}</Badge>;
      case "agent":
        return <Badge variant="info">{t("roles.agent.name")}</Badge>;
      case "viewer":
        return <Badge variant="default">{t("roles.viewer.name")}</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="warning">{t("team.status.pending")}</Badge>;
      case "active":
        return <Badge variant="success">{t("team.status.active")}</Badge>;
      case "inactive":
        return <Badge variant="default">{t("team.status.inactive")}</Badge>;
      default:
        return (
          <Badge variant="default">{status || t("team.status.active")}</Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="card p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("team.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t("team.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowInviteModal(true)}
          >
            {t("team.inviteMember")}
          </Button>
        )}
      </div>

      {/* Resend invite feedback */}
      {resendResult && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            resendResult === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {resendResult === "success" && (
            <p className="text-sm">{t("team.resendSuccess")}</p>
          )}
          {resendResult === "error" && (
            <p className="text-sm">
              {t("team.resendFailed")}
              {resendError && (
                <span className="block mt-1 font-mono text-xs">
                  {resendError}
                </span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setResendResult(null);
              setResendError("");
            }}
            className="mt-2 text-sm underline hover:no-underline"
          >
            {t("team.invite.dismiss")}
          </button>
        </div>
      )}

      {/* Invite email feedback */}
      {inviteEmailFeedback !== "none" && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            inviteEmailFeedback === "sent"
              ? "bg-green-50 border-green-200 text-green-800"
              : inviteEmailFeedback === "failed"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {inviteEmailFeedback === "sent" && (
            <p className="text-sm">{t("team.invite.emailSent")}</p>
          )}
          {inviteEmailFeedback === "not_sent" && (
            <p className="text-sm">{t("team.invite.emailNotSent")}</p>
          )}
          {inviteEmailFeedback === "failed" && (
            <p className="text-sm">
              {t("team.invite.emailFailed")}
              {inviteEmailErrorDetail && (
                <span className="block mt-1 font-mono text-xs">
                  {inviteEmailErrorDetail}
                </span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setInviteEmailFeedback("none");
              setInviteEmailErrorDetail("");
            }}
            className="mt-2 text-sm underline hover:no-underline"
          >
            {t("team.invite.dismiss")}
          </button>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("team.table.member")}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("team.table.role")}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("team.table.status")}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("team.table.joined")}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("team.table.lastLogin")}
              </th>
              {isAdmin && (
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("team.table.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((member) => (
              <tr key={member._id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} src={member.avatar} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {member.name}
                        {member._id === currentUser?._id && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({t("common.you")})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {member.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {isAdmin && member._id !== currentUser?._id ? (
                    <Select
                      value={member.role}
                      onChange={(value) =>
                        handleRoleChange(
                          member._id,
                          value as "admin" | "agent" | "viewer",
                        )
                      }
                      options={[
                        { value: "admin", label: t("roles.admin.name") },
                        { value: "agent", label: t("roles.agent.name") },
                        { value: "viewer", label: t("roles.viewer.name") },
                      ]}
                    />
                  ) : (
                    getRoleBadge(member.role)
                  )}
                </td>
                <td className="px-6 py-4">{getStatusBadge(member.status)}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDate(member.createdAt)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {member.lastLoginAt
                    ? formatDate(member.lastLoginAt)
                    : t("team.lastLoginNever")}
                </td>
                {isAdmin && (
                  <td className="px-6 py-4">
                    {member._id !== currentUser?._id && (
                      <div className="flex items-center gap-1">
                        {member.status === "pending" && (
                          <button
                            onClick={() => handleResendInvite(member._id)}
                            disabled={resendTargetId === member._id}
                            className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary/10 rounded disabled:opacity-60"
                            title={t("team.resendInvite")}
                          >
                            {resendTargetId === member._id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {member.status === "active" ||
                        member.status === undefined ? (
                          <button
                            onClick={() =>
                              handleStatusChange(member._id, "inactive")
                            }
                            className="p-1.5 text-text-secondary hover:text-amber-600 hover:bg-amber-50 rounded"
                            title={t("team.deactivate")}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : member.status === "inactive" ? (
                          <button
                            onClick={() =>
                              handleStatusChange(member._id, "active")
                            }
                            className="p-1.5 text-text-secondary hover:text-green-600 hover:bg-green-50 rounded"
                            title={t("team.activate")}
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleRemove(member._id, member.name)}
                          className="p-1.5 text-text-secondary hover:text-error hover:bg-red-50 rounded"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {members.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500">{t("team.noMembers")}</p>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-500">{t("team.adminOnly")}</p>
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteError("");
        }}
        title={t("team.invite.title")}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowInviteModal(false);
                setInviteError("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleInvite} isLoading={isInviting}>
              {t("team.invite.send")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {inviteError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{inviteError}</p>
            </div>
          )}
          <Input
            label={t("team.invite.email")}
            type="email"
            placeholder={t("team.invite.emailPlaceholder")}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Input
            label={t("team.invite.name")}
            placeholder={t("team.invite.namePlaceholder")}
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <Select
            label={t("team.invite.role")}
            value={inviteRole}
            onChange={(value) =>
              setInviteRole(value as "admin" | "agent" | "viewer")
            }
            options={[
              { value: "admin", label: t("team.invite.roleAdmin") },
              { value: "agent", label: t("team.invite.roleAgent") },
              { value: "viewer", label: t("team.invite.roleViewer") },
            ]}
          />
          <p className="text-xs text-text-secondary">
            {t("team.invite.passwordNote")}
          </p>
        </div>
      </Modal>
    </div>
  );
};
