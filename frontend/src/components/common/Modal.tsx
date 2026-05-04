import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
  footer?: React.ReactNode;
  /** When true, modal body scrolls with max height (useful for tall forms). */
  bodyScroll?: boolean;
  /** Extra classes on the modal panel (e.g. min-height for tall editors). */
  className?: string;
  /** Classes merged into the scrollable body wrapper around children (e.g. p-0 for full-bleed). */
  bodyClassName?: string;
  /** Classes on the fixed fullscreen portal root (e.g. z-[100] so confirms stack above other modals). */
  portalClassName?: string;
}

const sizeClasses: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  footer,
  bodyScroll = false,
  className = '',
  bodyClassName,
  portalClassName,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isFull = size === 'full';

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 pointer-events-none',
        isFull ? 'flex flex-col p-3' : 'flex items-center justify-center',
        portalClassName ?? 'z-50',
      )}
    >
      {/* Overlay: must participate in hit-testing independently from the dialog */}
      <div
        className="pointer-events-auto absolute inset-0 z-0 bg-black/50"
        onClick={() => onClose?.()}
        aria-hidden
      />

      {/* Modal */}
      <div
        className={cn(
          'pointer-events-auto relative z-10 flex w-full flex-col rounded-lg bg-white shadow-modal',
          isFull ? 'min-h-0 flex-1 overflow-hidden' : `mx-4 max-h-[90vh] ${sizeClasses[size as keyof typeof sizeClasses]}`,
          className,
        )}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-border">
            {title && (
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            )}
            {showClose && (
              <button
                type="button"
                onClick={() => onClose?.()}
                className="p-1 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={cn(
            'px-6 py-4',
            bodyScroll && 'flex min-h-0 flex-1 flex-col overflow-hidden',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  isLoading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      portalClassName="z-[100]"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-text-secondary">{message}</p>
    </Modal>
  );
};
