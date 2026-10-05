import { Info, Link2 } from 'lucide';

import type { AppTranslator } from '../i18n/i18n';
import type { ImportNote } from '../logic/link-import';
import { useLL } from '../state/context';
import { Icon } from './icon';

const noteText = (LL: AppTranslator, note: ImportNote) => {
    switch (note.kind) {
        case 'filled':
            return LL.linkImport.filledFrom({ host: note.host });
        case 'partial':
            return LL.linkImport.filledPartial({ host: note.host });
        default:
            return LL.linkImport.errors[note.reason]();
    }
};

/** Tells where the prefilled editor values came from, or why nothing was filled in. */
export const ImportNoteBanner = ({ note }: { note: ImportNote }) => {
    const LL = useLL();
    const failed = note.kind === 'failed';

    return (
        <p
            class={
                failed
                    ? 'card card-border import-note import-note-failed'
                    : 'card card-border import-note'
            }
            role='status'
        >
            <Icon icon={failed ? Info : Link2} />
            <span>{noteText(LL, note)}</span>
        </p>
    );
};
