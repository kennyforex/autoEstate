import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

const variantClasses = {
  default: 'bg-gray-100 text-text-secondary',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

const sizeClasses = {
  sm: 'h-5 px-1.5 text-[10px]',
  md: 'h-6 px-2 text-[11px]',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center justify-center whitespace-nowrap font-medium rounded-full
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
};

interface StatusDotProps {
  status: 'online' | 'offline' | 'connecting' | 'active' | 'inactive';
  className?: string;
}

const statusColors = {
  online: 'bg-success',
  offline: 'bg-error',
  connecting: 'bg-warning',
  active: 'bg-success',
  inactive: 'bg-error',
};

export const StatusDot: React.FC<StatusDotProps> = ({ status, className = '' }) => {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${statusColors[status]} ${className}`}
    />
  );
};
