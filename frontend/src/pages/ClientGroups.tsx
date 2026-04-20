import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/layout";
import { Button, Input } from "../components/common";
import { clientGroupsApi } from "../lib/api";
import type { ClientGroup } from "../lib/types";

type ClientGroupDraft = {
  _id?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
};

const emptyDraft: ClientGroupDraft = {
  name: "",
  sortOrder: 0,
  isActive: true,
  isDefault: false,
};

export const ClientGroups: React.FC = () => {
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [draft, setDraft] = useState<ClientGroupDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => clientGroups.find((group) => group._id === draft._id),
    [clientGroups, draft._id],
  );

  const loadClientGroups = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await clientGroupsApi.list();
      setClientGroups(result);
      if (!draft._id && result.length > 0) {
        const defaultGroup = result.find((group) => group.isDefault) || result[0];
        setDraft({
          _id: defaultGroup._id,
          name: defaultGroup.name,
          sortOrder: defaultGroup.sortOrder,
          isActive: defaultGroup.isActive,
          isDefault: defaultGroup.isDefault,
        });
      }
    } catch (err) {
      console.error("Failed to load client groups:", err);
      setError("Failed to load client groups.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClientGroups();
  }, []);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setError(null);
  };

  const startEdit = (group: ClientGroup) => {
    setDraft({
      _id: group._id,
      name: group.name,
      sortOrder: group.sortOrder,
      isActive: group.isActive,
      isDefault: group.isDefault,
    });
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (draft._id) {
        await clientGroupsApi.update(draft._id, draft);
      } else {
        await clientGroupsApi.create(draft);
      }
      await loadClientGroups();
      resetDraft();
    } catch (err: any) {
      console.error("Failed to save client group:", err);
      setError(err?.response?.data?.error || "Failed to save client group.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (group: ClientGroup) => {
    const confirmed = window.confirm(`Delete client group "${group.name}"?`);
    if (!confirmed) return;

    setError(null);
    try {
      await clientGroupsApi.delete(group._id);
      await loadClientGroups();
      if (draft._id === group._id) {
        resetDraft();
      }
    } catch (err: any) {
      console.error("Failed to delete client group:", err);
      setError(err?.response?.data?.error || "Failed to delete client group.");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Client Groups"
          subtitle="Manage pricing groups. Contacts without an assignment fall back to Basic."
          actions={
            <Button variant="outline" onClick={resetDraft}>
              New Group
            </Button>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Group
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                      Loading client groups...
                    </td>
                  </tr>
                ) : clientGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                      No client groups yet.
                    </td>
                  </tr>
                ) : (
                  clientGroups.map((group) => (
                    <tr key={group._id} className={draft._id === group._id ? "bg-primary-50/40" : ""}>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{group.name}</div>
                        <div className="text-xs text-gray-500">
                          Order: {group.sortOrder}
                          {group.isDefault ? " • Default" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{group.slug}</td>
                      <td className="px-4 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            group.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {group.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(group)}>
                            Edit
                          </Button>
                          {!group.isDefault && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(group)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {draft._id ? "Edit Client Group" : "Create Client Group"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                `Basic` stays available as the default fallback for all contacts.
              </p>
            </div>

            <Input
              label="Group name"
              value={draft.name}
              onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
              placeholder="VIP"
            />

            <Input
              label="Sort order"
              type="number"
              value={draft.sortOrder}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  sortOrder: Number(e.target.value || 0),
                }))
              }
            />

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, isActive: e.target.checked }))
                }
                disabled={selectedGroup?.isDefault}
              />
              Active
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, isDefault: e.target.checked }))
                }
              />
              Make this the default group
            </label>

            <div className="flex gap-3">
              <Button isLoading={isSaving} onClick={handleSave} disabled={!draft.name.trim()}>
                Save Group
              </Button>
              <Button variant="ghost" onClick={resetDraft}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientGroups;
