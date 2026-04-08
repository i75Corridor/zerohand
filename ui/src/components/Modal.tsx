/**
 * Modal -- Shared Radix Dialog wrapper with consistent overlay and content styling.
 *
 * Usage:
 *   <Modal open={showModal} onClose={() => setShowModal(false)} title="Run Pipeline">
 *     <p>Modal body here</p>
 *   </Modal>
 */

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional icon placed before the title. */
  titleIcon?: ReactNode;
  /** Max-width class. Defaults to "max-w-md". */
  maxWidth?: string;
  children: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  titleIcon,
  maxWidth = "max-w-md",
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <Dialog.Content
          className={`pointer-events-auto bg-pawn-surface-900 border border-pawn-surface-700/60 rounded-panel p-6 w-full ${maxWidth} shadow-lg max-h-[90vh] overflow-y-auto animate-scale-in`}
        >
          <Dialog.Title className="text-lg font-semibold text-pawn-text-primary mb-4">
            {titleIcon && <span className="inline mr-2 align-middle">{titleIcon}</span>}
            {title}
          </Dialog.Title>
          {children}
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
