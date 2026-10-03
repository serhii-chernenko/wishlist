import { useState } from 'hono/jsx/dom';

import { isValidPayments } from '../../bot/input/payments';
import type { FieldErrorCode } from '../../shared/app-api';
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
import { confirmAction } from '../telegram/popups';
import { Envelope } from '../ui/envelope';
import { Field } from '../ui/field';
import { ScreenLayout } from '../ui/screen';

type PendingAction = 'save' | 'remove';

const describeFieldError = (
    LL: AppTranslator,
    code: FieldErrorCode,
    max: number
) => {
    if (code === 'tooShort') {
        return LL.payments.errors.tooShort();
    }

    return code === 'tooLong'
        ? LL.payments.errors.tooLong({ max })
        : fieldErrorMessage(LL, code, max);
};

export const PaymentsScreen = (_props: ScreenProps<'payments'>) => {
    const LL = useLL();
    const nav = useNav();
    const entryKey = useEntryKey();
    const { api, toast, updateMe, reportEvent } = useApp();
    const { me, config } = useSession();
    const saved = me.payments ?? '';
    const [text, setText] = useState(saved);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const max = config.limits.payments;
    const trimmed = text.trim();
    const dirty = trimmed !== saved.trim();

    useDirtyGuard(dirty);

    const leave = () => {
        nav.setDirty(entryKey, false);
        void nav.back();
    };

    const save = async () => {
        if (pending !== null) {
            return;
        }

        if (!isValidPayments(trimmed)) {
            setError(LL.payments.errors.tooShort());
            haptics.error();
            reportEvent('validationFailed', 'payments', {
                field: 'payments',
                code: 'tooShort'
            });

            return;
        }

        setPending('save');
        setError(null);

        try {
            updateMe(
                await api.request('setPayments', { body: { text: trimmed } })
            );
            haptics.success();
            toast.show(LL.payments.saved(), 'success');
            leave();

            return;
        } catch (failureSource) {
            const failure = toFailure(failureSource);
            const fieldError = getFieldErrors(failure).text;

            if (fieldError === undefined) {
                toast.failure(failure);
            } else {
                haptics.error();
                reportEvent('validationFailed', 'payments', {
                    field: 'payments',
                    code: fieldError
                });
                setError(describeFieldError(LL, fieldError, max));
            }
        }

        setPending(null);
    };

    const remove = async () => {
        const confirmed = await confirmAction({
            title: LL.payments.remove.title(),
            message: LL.payments.remove.text(),
            confirmText: LL.payments.remove.confirm(),
            cancelText: LL.common.cancel(),
            destructive: true
        });

        if (!confirmed) {
            return;
        }

        setPending('remove');

        try {
            updateMe(await api.request('removePayments'));
            haptics.success();
            toast.show(LL.payments.remove.success(), 'success');
            leave();

            return;
        } catch (failureSource) {
            toast.failure(toFailure(failureSource));
        }

        setPending(null);
    };

    useBottomButton({
        text: pending === 'save' ? LL.common.saving() : LL.payments.save(),
        disabled: !dirty || trimmed === '' || pending === 'remove',
        progress: pending === 'save',
        onClick: () => {
            void save();
        }
    });

    return (
        <ScreenLayout
            id='payments'
            title={LL.payments.title()}
            lead={LL.payments.lead()}
        >
            <form
                class='payments-form'
                onSubmit={(event: Event) => {
                    event.preventDefault();
                }}
            >
                <Field
                    id='payments-text'
                    label={LL.payments.label()}
                    hint={LL.payments.hint()}
                    placeholder={LL.payments.placeholder()}
                    value={text}
                    multiline
                    rows={5}
                    maxLength={max}
                    error={error}
                    onValue={value => {
                        setText(value);
                        setError(null);
                    }}
                />
            </form>
            <section
                class='payments-preview'
                aria-labelledby='payments-preview-title'
            >
                <h2 id='payments-preview-title' class='panel-title'>
                    {LL.payments.preview()}
                </h2>
                <Envelope title={LL.third.payments.title()}>
                    <p>{LL.third.payments.text()}</p>
                    <p class='payments-preview-text'>
                        {trimmed === '' ? LL.payments.empty() : trimmed}
                    </p>
                </Envelope>
            </section>
            {me.payments === null ? null : (
                <button
                    type='button'
                    class='btn payments-remove'
                    disabled={pending !== null}
                    onClick={() => {
                        void remove();
                    }}
                >
                    {LL.payments.remove.action()}
                </button>
            )}
        </ScreenLayout>
    );
};
