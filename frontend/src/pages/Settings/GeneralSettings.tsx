import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, Building } from 'lucide-react';
import { Button, Input, Select } from '../../components/common';
import { companyApi, uploadApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Company } from '../../lib/types';

/** Resolve logo URL so it works for all users (relative paths point to backend origin). */
function resolveLogoUrl(logo: string | undefined): string | undefined {
  if (!logo) return undefined;
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo;
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
  return `${base}${logo.startsWith('/') ? '' : '/'}${logo}`;
}

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('Asia/Hong_Kong');
  const [logo, setLogo] = useState<string | undefined>();

  const isAdmin = user?.role === 'admin';
  const logoDisplayUrl = resolveLogoUrl(logo);

  useEffect(() => {
    loadCompany();
  }, []);

  const loadCompany = async () => {
    try {
      const data = await companyApi.get();
      setCompany(data);
      setName(data.name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setWebsite(data.website || '');
      setTimezone(data.timezone || 'Asia/Hong_Kong');
      setLogo(data.logo);
    } catch (error) {
      console.error('Failed to load company:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPG, PNG, GIF or WebP image.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB.');
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { url } = await uploadApi.image(base64, file.type);
      
      const updated = await companyApi.update({ logo: url });
      setCompany(updated);
      setLogo(url);
    } catch (error: unknown) {
      console.error('Failed to upload logo:', error);
      const err = error as { code?: string; response?: { data?: { error?: string } }; message?: string };
      let msg = err.response?.data?.error ?? err.message ?? null;
      if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') {
        msg = msg || (err.code === 'ECONNABORTED' ? 'Request timed out.' : 'Network error. Check the backend is running.');
      }
      alert(msg || 'Failed to upload logo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name?.trim()) {
      alert(t('general.companyInfo.nameRequired') || 'Company name is required.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await companyApi.update({
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        address: address?.trim() || undefined,
        website: website?.trim() || undefined,
        timezone,
      });
      setCompany(updated);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error: unknown) {
      console.error('Failed to update company:', error);
      const err = error as { response?: { data?: { error?: string; details?: { message: string }[] } } };
      const msg = err.response?.data?.details?.[0]?.message
        ?? err.response?.data?.error
        ?? (typeof (err as Error)?.message === 'string' ? (err as Error).message : null);
      alert(msg || 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const timezones = [
    { value: 'Asia/Hong_Kong', label: t('timezones.hongKong') },
    { value: 'UTC', label: t('timezones.utc') },
    { value: 'America/New_York', label: t('timezones.eastern') },
    { value: 'America/Chicago', label: t('timezones.central') },
    { value: 'America/Denver', label: t('timezones.mountain') },
    { value: 'America/Los_Angeles', label: t('timezones.pacific') },
    { value: 'Europe/London', label: t('timezones.london') },
    { value: 'Europe/Paris', label: t('timezones.paris') },
    { value: 'Asia/Tokyo', label: t('timezones.tokyo') },
    { value: 'Asia/Shanghai', label: t('timezones.shanghai') },
    { value: 'Asia/Singapore', label: t('timezones.singapore') },
    { value: 'Australia/Sydney', label: t('timezones.sydney') },
  ];

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="card p-6">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">{t('general.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('general.subtitle')}
        </p>
      </div>

      {/* Company Logo */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('general.logo.title')}</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            {logoDisplayUrl ? (
              <img
                src={logoDisplayUrl}
                alt="Company logo"
                className="w-20 h-20 rounded-lg object-cover border border-border"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center border border-border">
                <Building className="w-8 h-8 text-gray-400" />
              </div>
            )}
            {isAdmin && (
              <button
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 disabled:opacity-50 translate-x-1/4 translate-y-1/4"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
              disabled={!isAdmin}
            />
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={isUploading}
                >
                  {t('general.logo.upload')}
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  {t('general.logo.hint')}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Company Information */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('general.companyInfo.title')}</h2>
        <div className="space-y-4">
          <Input
            label={t('general.companyInfo.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
          />

          <Input
            label={t('general.companyInfo.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('general.companyInfo.emailPlaceholder')}
            disabled={!isAdmin}
          />

          <Input
            label={t('general.companyInfo.phone')}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('general.companyInfo.phonePlaceholder')}
            disabled={!isAdmin}
          />

          <Input
            label={t('general.companyInfo.address')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t('general.companyInfo.addressPlaceholder')}
            disabled={!isAdmin}
          />

          <Input
            label={t('general.companyInfo.website')}
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t('general.companyInfo.websitePlaceholder')}
            disabled={!isAdmin}
          />

          <Select
            label={t('general.companyInfo.timezone')}
            value={timezone}
            onChange={setTimezone}
            options={timezones}
            disabled={!isAdmin}
          />
        </div>
      </div>

      {/* Save Button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving}>
            {isSaved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t('common.saved')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </div>
      )}

      {!isAdmin && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-500">
            {t('general.adminOnly')}
          </p>
        </div>
      )}
    </div>
  );
};
