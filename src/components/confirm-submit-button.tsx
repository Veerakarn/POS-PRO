"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  confirmLabel?: string;
  disabled?: boolean;
  message: string;
  title: string;
  titleText: string;
};

export function ConfirmSubmitButton({
  ariaLabel,
  children,
  className,
  confirmLabel = "ยืนยัน",
  disabled = false,
  message,
  title,
  titleText,
}: ConfirmSubmitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  function confirm() {
    const form = buttonRef.current?.form;
    setIsOpen(false);
    dialogRef.current?.close();
    form?.requestSubmit();
  }

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={className}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        ref={buttonRef}
        title={title}
        type="button"
      >
        {children}
      </button>
      <dialog
        aria-describedby={messageId}
        aria-labelledby={titleId}
        className="app-confirm-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setIsOpen(false);
        }}
        ref={dialogRef}
      >
        <div className="app-confirm-dialog-icon" aria-hidden="true">
          <svg fill="none" height="24" viewBox="0 0 24 24" width="24"><path d="M12 8v4m0 4h.01M10.3 3.86 1.82 18.5A2 2 0 0 0 3.55 21.5h16.9a2 2 0 0 0 1.73-3L13.7 3.86a2 2 0 0 0-3.46 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
        </div>
        <h2 id={titleId}>{titleText}</h2>
        <p id={messageId}>{message}</p>
        <div className="app-confirm-dialog-actions">
          <button autoFocus className="secondary-button" onClick={() => setIsOpen(false)} type="button">ยกเลิก</button>
          <button className="danger-button" onClick={confirm} type="button">{confirmLabel}</button>
        </div>
      </dialog>
    </>
  );
}
