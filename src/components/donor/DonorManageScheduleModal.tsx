import AppModal from '@/components/AppModal';
import WeeklySchedule from '@/components/WeeklySchedule';
import { Button } from '@radix-ui/themes';
import type { AvailabilityBlock } from '@/types/food';

type DonorManageScheduleModalProps = { open: boolean; blocks: AvailabilityBlock[]; onBlocksChange: (blocks: AvailabilityBlock[]) => void; lockedStarts: ReadonlySet<string>; maxDateTime?: string; saving: boolean; onClose: () => void; onSave: () => void };
// Keeps published pickup schedule editing separate from listing metadata and request workflows.
const DonorManageScheduleModal = ({ open, blocks, onBlocksChange, lockedStarts, maxDateTime, saving, onClose, onSave }: DonorManageScheduleModalProps) => <AppModal open={open} onOpenChange={nextOpen => { if (!nextOpen && !saving) onClose(); }} title="Manage pickup schedule" description="Add, adjust, duplicate, or remove unbooked availability. Booked slots are locked." trigger={<span />}><WeeklySchedule blocks={blocks} onChange={onBlocksChange} lockedStarts={lockedStarts} maxDateTime={maxDateTime} showSelectionSummary={false} /><div className="mt-4 flex justify-end gap-3"><Button type="button" variant="outline" color="gray" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" disabled={saving} onClick={onSave}>{saving ? 'Saving...' : 'Save Schedule'}</Button></div></AppModal>;
export default DonorManageScheduleModal;
