"use client";

import { RefObject, useEffect } from "react";

/**
 * While an inline editor is open (`active`), a mousedown anywhere outside its
 * form commits it — `form.requestSubmit()` runs the exact same save the Save
 * button does, and the form's action then collapses the row. So clicking away
 * saves instead of leaving the row stuck open.
 *
 * Ignored:
 *  - clicks inside the form itself (buttons, inputs, the Cancel/✕),
 *  - clicks inside a portaled popover (role="dialog" — the date picker, modals),
 *    which live outside the form's DOM subtree but are part of the same edit.
 *
 * HTML validation still applies: if a required field is empty, requestSubmit is
 * blocked and the row stays open (you can't lose a row by clicking away after
 * breaking it).
 */
export function useClickOutsideSave(
  formRef: RefObject<HTMLFormElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      const form = formRef.current;
      const target = e.target as HTMLElement | null;
      if (!form || !target) return;
      if (form.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      form.requestSubmit();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active, formRef]);
}
