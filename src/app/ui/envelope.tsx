import type { Child } from 'hono/jsx';

import type { OwnerContactDto } from '../../shared/app-api';
import { useLL, useToast } from '../state/context';
import { haptics } from '../telegram/haptics';
import { copyToClipboard } from './clipboard';

export const Envelope = ({
    title,
    children
}: {
    title: string;
    children?: Child;
}) => {
    return (
        <section class='envelope'>
            <div class='envelope-flap' aria-hidden='true' />
            <h2 class='envelope-title'>{title}</h2>
            <div class='envelope-text'>{children}</div>
        </section>
    );
};

const CopyButton = ({ value, label }: { value: string; label: string }) => {
    const LL = useLL();
    const toast = useToast();

    return (
        <button
            type='button'
            class='text-button contact-action'
            aria-label={`${LL.contact.copy()}: ${label}`}
            onClick={() => {
                void copyToClipboard(value).then(copied => {
                    if (copied) {
                        haptics.success();
                        toast.show(LL.contact.copied(), 'success');
                    }
                });
            }}
        >
            {LL.contact.copy()}
        </button>
    );
};

/** Phone and address rows inside the envelope; values arrive already filtered by the server's disclosure rules. */
export const ContactRows = ({ contact }: { contact: OwnerContactDto }) => {
    const LL = useLL();

    return (
        <dl class='contact-rows'>
            {contact.phone === null ? null : (
                <div class='contact-row'>
                    <dt class='contact-label'>{LL.contact.phone()}</dt>
                    <dd class='contact-value'>{contact.phone}</dd>
                    <dd class='contact-actions'>
                        {contact.phoneHref === null ? null : (
                            <a
                                class='text-button contact-action'
                                href={contact.phoneHref}
                                aria-label={`${LL.contact.call()}: ${contact.phone}`}
                            >
                                {LL.contact.call()}
                            </a>
                        )}
                        <CopyButton
                            value={contact.phone}
                            label={LL.contact.phone()}
                        />
                    </dd>
                </div>
            )}
            {contact.address === null ? null : (
                <div class='contact-row'>
                    <dt class='contact-label'>{LL.contact.address()}</dt>
                    <dd class='contact-value contact-address'>
                        {contact.address}
                    </dd>
                    <dd class='contact-actions'>
                        <CopyButton
                            value={contact.address}
                            label={LL.contact.address()}
                        />
                    </dd>
                </div>
            )}
        </dl>
    );
};
