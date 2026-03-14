import React, { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Copy, Trash2, AlertTriangle } from 'lucide-react';
import { Button, Modal, Input } from '../../components/common';

interface APIKey {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsed?: string;
}

// Mock data
const mockKeys: APIKey[] = [
  {
    id: '1',
    name: 'Production API Key',
    keyPreview: 'sk-...x4Kj',
    createdAt: '2024-01-15T10:00:00Z',
    lastUsed: '2024-01-20T15:30:00Z',
  },
  {
    id: '2',
    name: 'Development Key',
    keyPreview: 'sk-...p9Qm',
    createdAt: '2024-01-10T09:00:00Z',
    lastUsed: '2024-01-19T12:00:00Z',
  },
];

export const APIKeysSettings: React.FC = () => {
  const [keys, setKeys] = useState(mockKeys);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Generate a fake key for demo
    const fakeKey = `sk-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setGeneratedKey(fakeKey);

    const newKey: APIKey = {
      id: Math.random().toString(),
      name: newKeyName,
      keyPreview: `sk-...${fakeKey.slice(-4)}`,
      createdAt: new Date().toISOString(),
    };

    setKeys([...keys, newKey]);
    setIsCreating(false);
    setShowCreateModal(false);
    setShowKeyModal(true);
    setNewKeyName('');
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = (id: string) => {
    setKeys(keys.filter((k) => k.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage API keys for programmatic access to your account
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setShowCreateModal(true)}
        >
          Generate New Key
        </Button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl mb-6">
        <AlertTriangle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-900">Keep your API keys secure</p>
          <p className="text-sm text-gray-500">
            Do not share your API keys in public repositories or client-side code.
          </p>
        </div>
      </div>

      {/* Keys Table */}
      {keys.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔑</span>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">No API keys</h3>
          <p className="text-sm text-gray-500 mb-4">
            Generate your first API key to get started
          </p>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Generate New Key
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Key
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Used
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      {key.name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                      {key.keyPreview}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {format(new Date(key.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {key.lastUsed
                      ? format(new Date(key.lastUsed), 'MMM d, yyyy')
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(key.keyPreview, key.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Copy key"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Revoke key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Generate API Key"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={isCreating}>
              Generate
            </Button>
          </>
        }
      >
        <Input
          label="Key Name"
          placeholder="e.g., Production API Key"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
        />
      </Modal>

      {/* Generated Key Modal */}
      <Modal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="API Key Generated"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <p className="text-sm text-gray-600">
                <strong className="text-gray-900">Important:</strong> This key will only be shown once. Copy it now
                and store it securely.
              </p>
            </div>
          </div>

          <div className="relative">
            <code className="block w-full p-4 bg-gray-50 rounded-xl font-mono text-sm break-all border border-gray-200">
              {generatedKey}
            </code>
            <button
              onClick={() => handleCopy(generatedKey, 'generated')}
              className="absolute top-2 right-2 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              {copiedId === 'generated' ? (
                <span className="text-success text-sm">Copied!</span>
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <Button className="w-full" onClick={() => setShowKeyModal(false)}>
            I've saved my key
          </Button>
        </div>
      </Modal>
    </div>
  );
};
