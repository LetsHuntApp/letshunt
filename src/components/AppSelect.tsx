import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface AppSelectProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'children'> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  placeholder?: string;
}

interface ListPosition {
  left: number;
  top: number;
  minWidth: number;
  maxHeight: number;
  dropUp: boolean;
}

const MAX_LIST_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;
const LIST_GAP = 4;

const getLayoutClasses = (className = '') => className
  .split(/\s+/)
  .filter((token) => /^(w-|min-w-|max-w-|flex-|grow|shrink|basis-|sm:w-|sm:min-w-|sm:max-w-|sm:flex-)/.test(token))
  .join(' ');

/**
 * An app-owned select control. Native <select> elements open a platform list
 * dialog on mobile PWAs, so this keeps the option list inside the app while
 * preserving the familiar controlled-select onChange shape at call sites.
 *
 * The option list is portaled to <body> and positioned in viewport space. That
 * matters inside scrollable panels (the trail cam filters dropdown): an
 * absolutely-positioned list there is clipped by the panel's overflow and
 * stretches its scroll height, instead of floating over the page.
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
  const [position, setPosition] = useState<ListPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const computePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - LIST_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - LIST_GAP - VIEWPORT_MARGIN;
    const dropUp = spaceBelow < Math.min(MAX_LIST_HEIGHT, 160) && spaceAbove > spaceBelow;
    const available = dropUp ? spaceAbove : spaceBelow;
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - VIEWPORT_MARGIN - rect.width)),
      top: dropUp ? rect.top - LIST_GAP : rect.bottom + LIST_GAP,
      minWidth: rect.width,
      maxHeight: Math.max(96, Math.min(MAX_LIST_HEIGHT, available)),
      dropUp,
    });
  }, []);

  // Track the trigger's viewport position while open. Scroll listening uses
  // capture so inner scrollers (the filters panel itself, the gallery) count.
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    computePosition();
    const handleReposition = () => computePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, computePosition]);

  // Once the list is measured, pull it back inside the viewport: horizontally
  // when its content is wider than the trigger (long option labels), and
  // vertically when the natural list height would run past the bottom edge.
  // The vertical pass can also flip the list above the trigger when that side
  // has more room — the decision reads only the anchor rect and content height,
  // never the current drop direction, so it cannot oscillate.
  useLayoutEffect(() => {
    if (!open || !position) return;
    const list = listRef.current;
    if (!list) return;

    const maxLeft = window.innerWidth - list.offsetWidth - VIEWPORT_MARGIN;
    const nextLeft = Math.max(VIEWPORT_MARGIN, Math.min(position.left, maxLeft));

    let nextTop = position.top;
    let nextMaxHeight = position.maxHeight;
    let nextDropUp = position.dropUp;
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor) {
      const spaceBelow = window.innerHeight - anchor.bottom - LIST_GAP - VIEWPORT_MARGIN;
      const spaceAbove = anchor.top - LIST_GAP - VIEWPORT_MARGIN;
      const natural = list.scrollHeight;
      const dropUp = spaceBelow < Math.min(natural, MAX_LIST_HEIGHT) && spaceAbove > spaceBelow;
      nextDropUp = dropUp;
      nextTop = dropUp ? anchor.top - LIST_GAP : anchor.bottom + LIST_GAP;
      nextMaxHeight = Math.max(96, Math.min(MAX_LIST_HEIGHT, natural, dropUp ? spaceAbove : spaceBelow));
    }

    if (
      nextLeft !== position.left ||
      nextTop !== position.top ||
      nextMaxHeight !== position.maxHeight ||
      nextDropUp !== position.dropUp
    ) {
      setPosition((current) => (current
        ? { ...current, left: nextLeft, top: nextTop, maxHeight: nextMaxHeight, dropUp: nextDropUp }
        : current));
    }
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
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

  const list = (
    <div
      ref={listRef}
      role="listbox"
      aria-label={buttonProps['aria-label'] || buttonProps.title || placeholder}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        minWidth: position?.minWidth,
        maxHeight: position?.maxHeight,
        transform: position?.dropUp ? 'translateY(-100%)' : undefined,
      }}
      className="fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-slate-300 bg-white p-1 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
  );

  return (
    <div ref={rootRef} className={`relative ${layoutClasses}`}>
      <button
        type="button"
        ref={buttonRef}
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

      {open && !disabled && position && typeof document !== 'undefined' && createPortal(list, document.body)}
    </div>
  );
};
