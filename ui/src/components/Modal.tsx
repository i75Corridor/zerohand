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
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-900 border border-slate-700/60 rounded-xl p-6 w-full ${maxWidth} shadow-lg max-h-[90vh] overflow-y-auto`}
        >
          <Dialog.Title className="text-lg font-semibold text-white mb-4">
            {titleIcon && <span className="inline mr-2 align-middle">{titleIcon}</span>}
            {title}
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
