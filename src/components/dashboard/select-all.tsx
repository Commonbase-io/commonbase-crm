"use client";

/** Toggles every checkbox with the given name inside the same form. */
export function SelectAll({ name, label = "Select all" }: { name: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4"
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        for (const box of form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`)) {
          if (!box.disabled) box.checked = event.currentTarget.checked;
        }
      }}
    />
  );
}
