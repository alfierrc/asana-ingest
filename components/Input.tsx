import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Input: React.FC<InputProps> = ({ label, className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-textMuted uppercase tracking-wider ml-1">
        {label}
      </label>
      <input
        className={`bg-surface border border-border text-textMain rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-zinc-600 ${className}`}
        {...props}
      />
    </div>
  );
};