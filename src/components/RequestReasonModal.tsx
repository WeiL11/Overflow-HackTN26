import { useEffect, useState } from 'react';
import { Button, Text, TextArea } from '@radix-ui/themes';
import AppModal, { ModalClose } from '@/components/AppModal';
import type { RequestAction } from '@/types/food';

type RequestReasonModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: RequestAction;
  onSubmit: (note: string) => Promise<void>;
};

const details: Record<RequestAction, { title: string; description: string; label: string }> = {
  complete: { title: 'Done', description: 'Add an optional completion note for this request.', label: 'Done' },
  decline: { title: 'Decline request', description: 'Add an optional reason for declining this request.', label: 'Decline' },
  confirm: { title: 'Confirm pickup', description: 'Add an optional pickup note for this request.', label: 'Confirm Pickup' },
  cancel: { title: 'Cancel request', description: 'Add an optional reason for cancelling this request.', label: 'Cancel Request' },
};

const RequestReasonModal = ({ open, onOpenChange, action, onSubmit }: RequestReasonModalProps) => {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const detail = details[action];
  const actionColor = action === 'decline' ? 'red' : action === 'cancel' ? 'gray' : undefined;

  useEffect(() => {
    setNote('');
  }, [open, action]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(note.trim());
      onOpenChange(false);
    } catch {
      // Keep the modal open so the parent error toast can be read and retried.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      trigger={<span />}
      title={detail.title}
      description={detail.description}
    >
      <div className="space-y-2">
        <Text as="label" size="2" weight="medium" htmlFor="request-status-note">Note (optional)</Text>
        <TextArea
          id="request-status-note"
          className="resize-y"
          maxLength={1000}
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={submitting}
        />
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <ModalClose>
          <Button type="button" variant="outline" color="gray" disabled={submitting}>Cancel</Button>
        </ModalClose>
        <Button type="button" color={actionColor} disabled={submitting} onClick={handleSubmit}>
          {detail.label}
        </Button>
      </div>
    </AppModal>
  );
};

export default RequestReasonModal;
