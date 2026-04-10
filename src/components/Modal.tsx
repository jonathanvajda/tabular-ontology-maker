import type { PropsWithChildren, ReactNode } from "react";

interface ModalProps extends PropsWithChildren {
  title: string;
  open: boolean;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({ title, open, footer, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="tom-modal-backdrop" onClick={onClose}>
      <section
        className="tom-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="tom-modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="tom-modal-body">{children}</div>
        {footer ? <footer className="tom-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
