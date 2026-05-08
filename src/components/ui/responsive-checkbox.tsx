"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * ResponsiveCheckbox renders:
 * - On mobile (< sm): a custom native <span>-based checkbox that can't be stretched by flex
 * - On desktop (sm+): the standard Radix <Checkbox>
 *
 * Props mirror the Radix Checkbox API for drop-in replacement.
 */
function ResponsiveCheckbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  name,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}) {
  const handleChange = React.useCallback(
    () => { if (!disabled) onCheckedChange(!checked) },
    [checked, onCheckedChange, disabled],
  )

  // Parse the accent colour from className (look for data-[state=checked]:bg-[color])
  const accentMatch = className?.match(/data-\[state=checked\]:bg-\[#([0-9a-fA-F]{6})\]/)
  const accentColor = accentMatch ? `#${accentMatch[1]}` : "#0d9488"

  return (
    <>
      {/* Mobile: pure CSS checkbox */}
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        id={id}
        onClick={handleChange}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleChange() } }}
        className={`
          sm:hidden
          inline-flex shrink-0 items-center justify-center
          rounded-[4px] border-2 transition-all duration-150 cursor-pointer
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${className || ""}
        `}
        style={{
          width: 18,
          height: 18,
          borderColor: checked ? accentColor : "#d1d5db",
          backgroundColor: checked ? accentColor : "#ffffff",
          padding: 0,
        }}
      >
        {checked && <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>

      {/* Desktop: Radix Checkbox */}
      <span className="hidden sm:inline-flex">
        <Checkbox
          id={id}
          name={name}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className={className}
        />
      </span>
    </>
  )
}

export { ResponsiveCheckbox }
