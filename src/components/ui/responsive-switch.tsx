"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"

/**
 * ResponsiveSwitch renders:
 * - On mobile (< sm): a custom native <span>-based toggle that can't be stretched by flex
 * - On desktop (sm+): the standard Radix <Switch>
 */
function ResponsiveSwitch({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const handleChange = React.useCallback(
    () => { if (!disabled) onCheckedChange(!checked) },
    [checked, onCheckedChange, disabled],
  )

  return (
    <>
      {/* Mobile: pure CSS toggle */}
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={handleChange}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleChange() } }}
        className={`
          sm:hidden
          inline-flex shrink-0 items-center rounded-full
          transition-colors duration-200 cursor-pointer
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${checked ? "bg-[#0d9488]" : "bg-gray-300 dark:bg-gray-600"}
          ${className || ""}
        `}
        style={{ width: 32, height: 18.4, padding: 0 }}
      >
        <span
          className="block rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            width: 16,
            height: 16,
            transform: checked ? "translateX(calc(100% - 2px))" : "translateX(2px)",
            marginLeft: checked ? 0 : 0,
          }}
        />
      </span>

      {/* Desktop: Radix Switch */}
      <span className="hidden sm:inline-flex">
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={className} />
      </span>
    </>
  )
}

export { ResponsiveSwitch }
