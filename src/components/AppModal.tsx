import { Dialog } from '@radix-ui/themes';
import type { ComponentProps, ReactNode } from 'react';

type AppModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  maxWidth?: ComponentProps<typeof Dialog.Content>['maxWidth'];
};

const AppModal = ({ open, onOpenChange, trigger, title, description, children, maxWidth = '560px' }: AppModalProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Trigger>{trigger}</Dialog.Trigger>
    <Dialog.Content maxWidth={maxWidth}>
      <Dialog.Title className="font-heading">{title}</Dialog.Title>
      <Dialog.Description size="2" mb="4">{description}</Dialog.Description>
      {children}
    </Dialog.Content>
  </Dialog.Root>
);

export const ModalClose = Dialog.Close;
export default AppModal;
