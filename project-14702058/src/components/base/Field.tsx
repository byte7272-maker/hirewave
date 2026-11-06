import type { ReactNode } from "react";

const CONTROL =
  "w-full h-10 rounded-control bg-background-50 border text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 transition-colors";

function borderCls(error?: string) {
  return error ? "border-accent-400" : "border-background-200";
}

export interface TextFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  /** Helper text shown under the label. */
  hint?: string;
  /** When set, the field shows an error border + message. */
  error?: string;
  /** Leading Remix Icon class. */
  icon?: string;
  id?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}

/**
 * The design system's text input. One field treatment — label, optional icon,
 * hint and error — used by every form in the app, so inputs read as the same
 * family as the buttons and cards around them. Focus uses the primary ring.
 */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  error,
  icon,
  id,
  name,
  required,
  autoComplete,
  className = "",
}: TextFieldProps) {
  const inputId = id ?? name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-foreground-600 mb-1.5">
          {label}
          {required && <span className="text-accent-600 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-400 pointer-events-none">
            <i className={icon} aria-hidden="true"></i>
          </span>
        )}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL} ${borderCls(error)} ${icon ? "pl-9 pr-3" : "px-3"}`}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-accent-700 flex items-center gap-1">
          <i className="ri-error-warning-line" aria-hidden="true"></i>
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-foreground-500">{hint}</p>
      )}
    </div>
  );
}

export interface SelectFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** `<option>` elements. */
  children: ReactNode;
  /** Render the label inline (left of the control) instead of stacked. */
  inline?: boolean;
  id?: string;
  name?: string;
  /** Width utility for the control, e.g. "min-w-[9rem]". */
  controlClassName?: string;
  className?: string;
}

/**
 * The design system's select. Shares the exact control styling as `TextField`
 * so every dropdown in the app matches, with an optional inline label for
 * compact toolbars.
 */
export function SelectField({
  label,
  value,
  onChange,
  children,
  inline = false,
  id,
  name,
  controlClassName = "",
  className = "",
}: SelectFieldProps) {
  const select = (
    <select
      id={id ?? name}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 rounded-control bg-background-50 border text-sm font-medium text-foreground-800 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer transition-colors ${
        inline ? "px-2.5 py-0" : "px-3 w-full"
      } border-background-200 ${controlClassName}`}
    >
      {children}
    </select>
  );

  if (inline) {
    return (
      <label className={`inline-flex items-center gap-2 text-xs font-medium text-foreground-600 ${className}`}>
        {label && <span className="whitespace-nowrap">{label}</span>}
        {select}
      </label>
    );
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id ?? name} className="block text-xs font-medium text-foreground-600 mb-1.5">
          {label}
        </label>
      )}
      {select}
    </div>
  );
}