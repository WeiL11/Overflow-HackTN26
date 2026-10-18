import { Dialog, Tooltip } from '@radix-ui/themes';
import type { ComponentProps, ReactNode } from 'react';

type AppModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: ComponentProps<typeof Dialog.Content>['maxWidth'];
  triggerTooltip?: string;
};

const AppModal = ({ open, onOpenChange, trigger, title, description, children, maxWidth = '560px', triggerTooltip }: AppModalProps) => {
  const dialogTrigger = <Dialog.Trigger>{trigger}</Dialog.Trigger>;
  return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {triggerTooltip ? <Tooltip content={triggerTooltip}>{dialogTrigger}</Tooltip> : dialogTrigger}
    <Dialog.Content maxWidth={maxWidth} className="max-h-[90vh] overflow-y-auto">
      <Dialog.Title className="font-heading">{title}</Dialog.Title>
      {description && <Dialog.Description size="2" mb="4">{description}</Dialog.Description>}
      {children}
    </Dialog.Content>
  </Dialog.Root>
  );
};

export const ModalClose = Dialog.Close;
export default AppModal;
