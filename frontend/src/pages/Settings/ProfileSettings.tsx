import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check } from 'lucide-react';
import { Button, Input, Select, Avatar } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { authApi, uploadApi } from '../../lib/api';
import { changeLanguage } from '../../i18n';

export const ProfileSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'Asia/Hong_Kong');
  const [language, setLanguage] = useState(user?.language || 'en');
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user?.avatar);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPG, PNG, GIF or WebP image.');
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB.');
      return;
    }

    setIsUploading(true);
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix to get just the base64
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('📸 Uploading avatar:', {
        fileSize: file.size,
        fileType: file.type,
        base64Length: base64.length,
      });

      // Upload the image
      const { url } = await uploadApi.image(base64, file.type);
      console.log('✅ Avatar uploaded successfully:', url);
      
      // Update profile with new avatar URL
      const updated = await authApi.updateProfile({ avatar: url });
      updateUser(updated);
      setAvatarPreview(url);
    } catch (error: any) {
      console.error('Failed to upload avatar:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      
      let errorMsg = error?.response?.data?.error || error?.message || 'Unknown error';
      
      // If there are validation details, show them
      if (error?.response?.data?.details) {
        const details = error.response.data.details
          .map((d: any) => `${d.field}: ${d.message}`)
          .join('\n');
        errorMsg += '\n\nDetails:\n' + details;
      }
      
      alert(`Failed to upload avatar: ${errorMsg}\nPlease try again.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const updated = await authApi.updateProfile({ name, timezone, language });
      updateUser(updated);
      // Update the UI language immediately
      changeLanguage(language);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 6) {
      setPasswordError(t('profile.changePassword.newTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.changePassword.mismatch'));
      return;
    }
    setIsChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      setPasswordError(message || t('profile.changePassword.failed'));
    } finally {
      setIsChangingPassword(false);
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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">{t('profile.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('profile.subtitle')}
        </p>
      </div>

      {/* Avatar Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('profile.avatar.title')}</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar name={user?.name || ''} src={avatarPreview} size="xl" />
            <button 
              className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              isLoading={isUploading}
            >
              {t('profile.avatar.upload')}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              {t('profile.avatar.hint')}
            </p>
          </div>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('profile.personalInfo.title')}</h2>
        <div className="space-y-4">
          <Input
            label={t('profile.personalInfo.fullName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('profile.personalInfo.email')}
            </label>
            <div className="flex items-center gap-2">
              <Input value={user?.email || ''} disabled className="flex-1" />
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded whitespace-nowrap">
                <Check className="w-3 h-3" />
                {t('profile.personalInfo.verified')}
              </span>
            </div>
          </div>

          <Select
            label={t('profile.personalInfo.timezone')}
            value={timezone}
            onChange={setTimezone}
            options={timezones}
          />

          <Select
            label={t('profile.personalInfo.language')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: t('languages.en') },
              { value: 'zh-TW', label: t('languages.zhTW') },
              { value: 'zh-CN', label: t('languages.zhCN') },
            ]}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={isLoading}>
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

      {/* Change Password */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mt-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('profile.changePassword.title')}</h2>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <Input
            type="password"
            label={t('profile.changePassword.currentPassword')}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('profile.changePassword.currentPlaceholder')}
            required
            autoComplete="current-password"
          />
          <Input
            type="password"
            label={t('profile.changePassword.newPassword')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('profile.changePassword.newPlaceholder')}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <Input
            type="password"
            label={t('profile.changePassword.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('profile.changePassword.confirmPlaceholder')}
            required
            autoComplete="new-password"
          />
          {passwordError && (
            <p className="text-sm text-error">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-success flex items-center gap-1">
              <Check className="w-4 h-4" />
              {t('profile.changePassword.success')}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            isLoading={isChangingPassword}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            {t('profile.changePassword.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
};
