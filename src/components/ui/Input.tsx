import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-content-primary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-content-secondary">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full bg-surface text-content-primary text-sm rounded-button border border-border px-3.5 py-2.5 transition-colors placeholder:text-gray-400',
              'focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-status-danger focus:border-status-danger focus:ring-status-danger',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-content-secondary">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs text-status-danger">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-content-secondary">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

