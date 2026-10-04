import { useState } from 'hono/jsx/dom';

import {
    normalizeAddress,
    parseAddress,
    type AddressRejection
} from '../../bot/input/address';
import type { FieldErrorCode, MeDto } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { fieldErrorMessage } from '../i18n/messages';
import { getFieldErrors } from '../logic/errors';
import { useDirtyGuard } from '../nav/guards';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useEntryKey,
    useLL,
    useNav,
    useSession
} from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { DangerButton } from '../ui/danger-button';
import { Field } from '../ui/field';
import { ScreenLayout } from '../ui/screen';

type PendingAction = 'save' | 'remove';

const describeFieldError = (
    LL: AppTranslator,
    code: FieldErrorCode,
    max: number
) => {
    if (code === 'containsLink') {
        return LL.delivery.errors.containsLink();
    }

    if (code === 'tooManyLines') {
        return LL.delivery.errors.tooManyLines();
    }

    return code === 'tooShort' || code === 'tooLong'
        ? fieldErrorMessage(LL, code, max)
        : LL.delivery.hint();
};

const isPhoneShown = (me: Pick<MeDto, 'disclosure' | 'phoneMasked'>) => {
    return me.disclosure.phone && me.phoneMasked !== null;
};

export const DeliveryScreen = (_props: ScreenProps<'delivery'>) => {
    const LL = useLL();
    const nav = useNav();
    const entryKey = useEntryKey();
    const { api, toast, updateMe, reportEvent } = useApp();
    const { me, config } = useSession();
    const saved = me.deliveryAddress ?? '';
    const [text, setText] = useState(saved);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const max = config.limits.address;
    const normalized = normalizeAddress(text);
    const dirty = normalized !== normalizeAddress(saved);

    useDirtyGuard(dirty);

    const leave = () => {
        nav.setDirty(entryKey, false);
        void nav.back();
    };

    const rejectLocally = (code: AddressRejection) => {
        setError(describeFieldError(LL, code, max));
        haptics.error();
        reportEvent('validationFailed', 'delivery', { field: 'address', code });
    };

    const save = async () => {
        if (pending !== null) {
            return;
        }

        const parsed = parseAddress(text);

        if (!parsed.ok) {
            rejectLocally(parsed.reason);

            return;
        }

        setPending('save');
        setError(null);

        try {
            updateMe(
                await api.request('setDeliveryAddress', {
                    body: { text: parsed.value }
                })
            );
            haptics.success();
            toast.show(LL.delivery.saved(), 'success');
            leave();

            return;
        } catch (failureSource) {
            const failure = toFailure(failureSource);
            const fieldError = getFieldErrors(failure).text;

            if (fieldError === undefined) {
                toast.failure(failure);
            } else {
                haptics.error();
                reportEvent('validationFailed', 'delivery', {
                    field: 'address',
                    code: fieldError
                });
                setError(describeFieldError(LL, fieldError, max));
            }
        }

        setPending(null);
    };

    const remove = async () => {
        if (pending !== null) {
            return;
        }

        setPending('remove');

        try {
            updateMe(await api.request('removeDeliveryAddress'));
            toast.show(LL.delivery.removed(), 'success');
            leave();

            return;
        } catch (failureSource) {
            toast.failure(toFailure(failureSource));
        }

        setPending(null);
    };

    useBottomButton({
        text: pending === 'save' ? LL.common.saving() : LL.delivery.save(),
        disabled: !dirty || normalized === '' || pending === 'remove',
        progress: pending === 'save',
        onClick: () => {
            void save();
        }
    });

    return (
        <ScreenLayout
            id='delivery'
            title={LL.delivery.title()}
            lead={LL.delivery.lead()}
        >
            <form
                class='delivery-form'
                onSubmit={(event: Event) => {
                    event.preventDefault();
                }}
            >
                <Field
                    id='delivery-text'
                    label={LL.delivery.label()}
                    hint={LL.delivery.hint()}
                    placeholder={LL.delivery.placeholder()}
                    value={text}
                    multiline
                    rows={4}
                    maxLength={max}
                    error={error}
                    onValue={value => {
                        setText(value);
                        setError(null);
                    }}
                />
            </form>
            {isPhoneShown(me) ? null : (
                <div class='contact-note' role='note'>
                    <p>{LL.delivery.phoneWarning()}</p>
                    <button
                        type='button'
                        class='text-button'
                        onClick={() => {
                            haptics.selection();
                            void nav.navigateTo('share');
                        }}
                    >
                        {LL.share.details.title()}
                    </button>
                </div>
            )}
            {me.deliveryAddress === null ? null : (
                <DangerButton
                    class='delivery-remove'
                    label={LL.delivery.remove()}
                    disabled={pending !== null}
                    onCommit={() => {
                        void remove();
                    }}
                />
            )}
        </ScreenLayout>
    );
};
