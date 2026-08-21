import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface AppSelectProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'children'> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  placeholder?: string;
}

const getLayoutClasses = (className = '') => className
  .split(/\s+/)
  .filter((token) => /^(w-|min-w-|max-w-|flex-|grow|shrink|basis-|sm:w-|sm:min-w-|sm:max-w-|sm:flex-)/.test(token))
  .join(' ');

/**
 * An app-owned select control. Native <select> elements open a platform list
 * dialog on mobile PWAs, so this keeps the option list inside the app while
 * preserving the familiar controlled-select onChange shape at call sites.
 */
export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  placeholder = 'Select an option',
  ...buttonProps
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => React.Children.toArray(children)
    .filter((child): child is React.ReactElement<{ value?: string; disabled?: boolean; children?: React.ReactNode }> =>
      React.isValidElement(child) && child.type === 'option'
    )
    .map((option) => ({
      value: String(option.props.value ?? ''),
      label: option.props.children,
      disabled: option.props.disabled === true,
    })), [children]);

  const selected = options.find((option) => option.value === String(value));
  const layoutClasses = getLayoutClasses(className);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const choose = (nextValue: string) => {
    setOpen(false);
    onChange({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={rootRef} className={`relative ${layoutClasses}`}>
      <button
        type="button"
        {...buttonProps}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`relative flex w-full items-center justify-between gap-2 text-left ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          aria-label={buttonProps['aria-label'] || buttonProps.title || placeholder}
          className="absolute left-0 top-[calc(100%+4px)] z-[70] max-h-60 min-w-full overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs font-semibold opacity-60">No options available</div>
          ) : options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === String(value)}
              disabled={option.disabled}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                option.value === String(value)
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              } ${option.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
            >
              <span className="min-w-0 flex-1">{option.label}</span>
              {option.value === String(value) && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
