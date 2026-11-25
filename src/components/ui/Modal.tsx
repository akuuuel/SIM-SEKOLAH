import React, { useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full' | string;
  maxHeight?: string;
  headerRight?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  maxHeight,
  headerRight,
}) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;


  const resolveMaxWidth = (val: string) => {
    if (val.startsWith('max-w-')) return val;
    const map: Record<string, string> = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
      '3xl': 'max-w-3xl',
      '4xl': 'max-w-4xl',
      '5xl': 'max-w-5xl',
      '6xl': 'max-w-6xl',
      '7xl': 'max-w-7xl',
      full: 'max-w-full',
    };
    return map[val] || 'max-w-md';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-[54px] pb-[96px] sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        className={cn(
          'relative w-full bg-surface rounded-2xl shadow-2xl border border-border z-10 flex flex-col animate-fade-in overflow-hidden',
          maxHeight || 'max-h-[calc(100dvh-175px)] sm:max-h-[82vh]',
          resolveMaxWidth(maxWidth)
        )}
        style={{ willChange: 'transform' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-b border-border shrink-0 bg-surface">
          <div className="pr-2 min-w-0 flex items-center gap-2">
            {title && (
              <h3 className="text-xs sm:text-base font-bold text-content-primary leading-tight truncate">
                {title}
              </h3>
            )}
            {headerRight}
            {description && (
              <p className="text-[11px] text-content-secondary hidden sm:inline ml-1 font-normal truncate">
                &bull; {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-slate-100 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

