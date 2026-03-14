import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageCircle,
  Mail,
  Globe,
  Instagram,
  Facebook,
  Phone,
  Plus,
  ChevronRight,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { Button, StatusDot, Modal, Input, Select } from '../../components/common';
import { channelsApi } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import type { Channel } from '../../lib/types';

interface ChannelType {
  id: string;
  name: string;
  icon: React.ReactNode;
  available: boolean;
  description?: string;
}

// Country code options
const countryCodes = [
  { value: '852', label: '+852 (Hong Kong)' },
  { value: '86', label: '+86 (China)' },
  { value: '1', label: '+1 (USA/Canada)' },
  { value: '44', label: '+44 (UK)' },
  { value: '65', label: '+65 (Singapore)' },
  { value: '60', label: '+60 (Malaysia)' },
  { value: '81', label: '+81 (Japan)' },
  { value: '82', label: '+82 (South Korea)' },
  { value: '886', label: '+886 (Taiwan)' },
  { value: '61', label: '+61 (Australia)' },
];

type CreateStep = 'form' | 'qr' | 'success';

export const ChannelList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const channelTypes: ChannelType[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: <MessageCircle className="w-5 h-5 text-green-500" />,
      available: true,
      description: t('channels.qrLink'),
    },
    {
      id: 'email',
      name: 'Email',
      icon: <Mail className="w-5 h-5 text-blue-500" />,
      available: false,
      description: t('channels.comingSoon'),
    },
    {
      id: 'web',
      name: 'Live Chat',
      icon: <Globe className="w-5 h-5 text-purple-500" />,
      available: false,
      description: t('channels.comingSoon'),
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: <Instagram className="w-5 h-5 text-pink-500" />,
      available: false,
      description: t('channels.comingSoon'),
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: <Facebook className="w-5 h-5 text-blue-600" />,
      available: false,
      description: t('channels.comingSoon'),
    },
    {
      id: 'sms',
      name: 'SMS',
      icon: <Phone className="w-5 h-5 text-gray-500" />,
      available: false,
      description: t('channels.comingSoon'),
    },
  ];
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Form state
  const [channelName, setChannelName] = useState('');
  const [countryCode, setCountryCode] = useState('852');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Multi-step modal state
  const [createStep, setCreateStep] = useState<CreateStep>('form');
  const [createdChannel, setCreatedChannel] = useState<Channel | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [isRefreshingQR, setIsRefreshingQR] = useState(false);
  const [error, setError] = useState<string>('');

  const fetchChannels = async () => {
    try {
      const data = await channelsApi.list();
      setChannels(data);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  // Listen for channel status updates via WebSocket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStatusUpdate = (data: { channelId: string; status: string; phoneNumber?: string }) => {
      // Update channel in list
      setChannels((prev) =>
        prev.map((ch) =>
          ch._id === data.channelId
            ? { ...ch, status: data.status as Channel['status'], phoneNumber: data.phoneNumber || ch.phoneNumber }
            : ch
        )
      );
      
      // If this is the channel we're creating and it's now connected, show success
      if (createdChannel && data.channelId === createdChannel._id && data.status === 'connected') {
        setCreatedChannel((prev) => prev ? { ...prev, status: 'connected', phoneNumber: data.phoneNumber } : prev);
        setCreateStep('success');
      }
    };

    socket.on('channel:status', handleStatusUpdate);

    return () => {
      socket.off('channel:status', handleStatusUpdate);
    };
  }, [createdChannel]);

  // Poll for connection status when showing QR code
  useEffect(() => {
    if (createStep !== 'qr' || !createdChannel) return;

    const pollStatus = async () => {
      try {
        const result = await channelsApi.checkStatus(createdChannel._id);
        console.log('Poll status result:', result);
        
        if (result.status === 'connected') {
          setCreatedChannel((prev) => prev ? { ...prev, status: 'connected', phoneNumber: result.phoneNumber } : prev);
          setCreateStep('success');
          
          // Update in channels list
          setChannels((prev) =>
            prev.map((ch) =>
              ch._id === createdChannel._id
                ? { ...ch, status: 'connected', phoneNumber: result.phoneNumber }
                : ch
            )
          );
        }
      } catch (error) {
        console.error('Failed to poll status:', error);
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(pollStatus, 3000);
    
    // Also poll immediately
    pollStatus();

    return () => clearInterval(interval);
  }, [createStep, createdChannel]);

  const resetModal = () => {
    setShowCreateModal(false);
    setChannelName('');
    setCountryCode('852');
    setPhoneNumber('');
    setCreateStep('form');
    setCreatedChannel(null);
    setQrCode('');
    setError('');
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      setError('Channel name is required');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('Phone number is required');
      return;
    }

    setError('');
    setIsCreating(true);
    try {
      // Create channel with phone number
      const fullPhoneNumber = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;
      const channel = await channelsApi.create({ 
        name: channelName.trim(),
        phoneNumber: fullPhoneNumber,
      });
      
      setCreatedChannel(channel);
      
      // Connect to get QR code
      const connectResult = await channelsApi.connect(channel._id);
      if (connectResult.qrCode) {
        setQrCode(connectResult.qrCode);
      }
      
      setCreateStep('qr');
      
      // Also add to channels list
      setChannels((prev) => [channel, ...prev]);
    } catch (error) {
      console.error('Failed to create channel:', error);
      setError('Failed to create channel. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefreshQR = useCallback(async () => {
    if (!createdChannel) return;
    
    setIsRefreshingQR(true);
    try {
      const result = await channelsApi.getQRCode(createdChannel._id);
      if (result.qrCode) {
        setQrCode(result.qrCode);
      }
    } catch (error) {
      console.error('Failed to refresh QR code:', error);
    } finally {
      setIsRefreshingQR(false);
    }
  }, [createdChannel]);

  const handleFinish = () => {
    resetModal();
    fetchChannels(); // Refresh channels list
  };

  const getStatusFromChannel = (channel: Channel): 'connected' | 'disconnected' | 'connecting' => {
    return channel.status;
  };

  return (
    <div className="flex h-screen">
      {/* Channel List Panel */}
      <div className="w-[280px] h-full bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t('channels.title')}</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Connected Channels */}
          {channels.length > 0 && (
            <div className="mb-4">
              <p className="px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('channels.whatsappChannels')}
              </p>
              {channels.map((channel) => (
                <button
                  key={channel._id}
                  onClick={() => navigate(`/channels/${channel._id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      getStatusFromChannel(channel) === 'connected' 
                        ? 'bg-green-100' 
                        : 'bg-gray-100'
                    }`}>
                      <MessageCircle className={`w-5 h-5 ${
                        getStatusFromChannel(channel) === 'connected'
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }`} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{channel.name}</p>
                      {channel.phoneNumber && getStatusFromChannel(channel) === 'connected' ? (
                        <p className="text-xs text-green-600 font-medium">
                          +{channel.phoneNumber}
                        </p>
                      ) : (
                        <div className="flex items-center gap-1">
                          <StatusDot
                            status={
                              getStatusFromChannel(channel) === 'connected'
                                ? 'online'
                                : getStatusFromChannel(channel) === 'connecting'
                                ? 'connecting'
                                : 'offline'
                            }
                          />
                          <span className="text-xs text-gray-500 capitalize">
                            {channel.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          {/* Available Channel Types */}
          <div>
            <p className="px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('channels.availableChannels')}
            </p>
            {channelTypes.map((type) => (
              <button
                key={type.id}
                disabled={!type.available}
                onClick={() => type.available && setShowCreateModal(true)}
                className={`w-full flex items-center justify-between p-3 rounded-lg ${
                  type.available
                    ? 'hover:bg-gray-50 cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  {type.icon}
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{type.name}</p>
                    <p className="text-xs text-gray-500">{type.description}</p>
                  </div>
                </div>
                {type.available && (
                  <Plus className="w-4 h-4 text-gray-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        {isLoading ? (
          <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : channels.length === 0 ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {t('channels.noChannels')}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('channels.connectFirst')}
            </p>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              {t('channels.addWhatsApp')}
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {t('channels.selectChannel')}
            </h3>
            <p className="text-sm text-gray-500">
              {t('channels.chooseChannel')}
            </p>
          </div>
        )}
      </div>

      {/* Create Modal - Multi-step */}
      <Modal
        isOpen={showCreateModal}
        onClose={createStep === 'qr' ? undefined : resetModal}
        title={
          createStep === 'form' 
            ? t('channels.createChannel')
            : createStep === 'qr' 
            ? t('channels.scanQR')
            : t('channels.connectedSuccess')
        }
        size="sm"
        footer={
          createStep === 'form' ? (
            <>
              <Button variant="ghost" onClick={resetModal}>
                {t('channels.cancel')}
              </Button>
              <Button onClick={handleCreateChannel} isLoading={isCreating}>
                {t('channels.createConnect')}
              </Button>
            </>
          ) : createStep === 'success' ? (
            <Button onClick={handleFinish}>
              {t('channels.done')}
            </Button>
          ) : null
        }
      >
        {/* Step 1: Form */}
        {createStep === 'form' && (
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}
            <Input
              label={t('channels.channelName')}
              placeholder="My WhatsApp Channel"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('channels.phoneNumber')} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="w-40">
                  <Select
                    value={countryCode}
                    onChange={setCountryCode}
                    options={countryCodes}
                    placeholder="Country"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="91234567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter the phone number that will be connected to WhatsApp
              </p>
            </div>
          </div>
        )}

        {/* Step 2: QR Code */}
        {createStep === 'qr' && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm text-center">
              {t('channels.scanInstructions')}
            </p>
            
            <div className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl">
              {qrCode ? (
                <div className="relative">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Loading QR code...</p>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleRefreshQR}
                isLoading={isRefreshingQR}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                {t('channels.refreshQR')}
              </Button>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <span>{t('channels.waitingForScan')}</span>
            </div>
            
            <p className="text-xs text-gray-500 text-center">
              Phone: +{countryCode}{phoneNumber}
            </p>
          </div>
        )}

        {/* Step 3: Success */}
        {createStep === 'success' && createdChannel && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {t('channels.whatsappConnected')}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('channels.whatsappSuccess')}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
              <MessageCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800">
                +{createdChannel.phoneNumber || `${countryCode}${phoneNumber}`}
              </span>
              <StatusDot status="online" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
