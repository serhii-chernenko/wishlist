import { useState } from 'hono/jsx/dom';

import type { FieldErrorCode } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { failureMessage } from '../i18n/messages';
import { countCharacters } from '../logic/format';
import { getFieldErrors } from '../logic/errors';
import { useDirtyGuard } from '../nav/guards';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { Field } from '../ui/field';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

const describeFieldError = (
    LL: AppTranslator,
    code: FieldErrorCode,
    max: number
) => {
    return code === 'tooLong'
        ? LL.feedback.errors.tooLong({ max })
        : LL.feedback.errors.empty();
};

export const FeedbackScreen = (_props: ScreenProps<'feedback'>) => {
    const LL = useLL();
    const { api, reportEvent } = useApp();
    const { config } = useSession();
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const max = config.limits.feedback;
    const trimmed = text.trim();

    useDirtyGuard(trimmed !== '' && !sent);

    const send = async () => {
        if (sending) {
            return;
        }

        if (trimmed === '') {
            setError(LL.feedback.errors.empty());
            haptics.error();
            reportEvent('validationFailed', 'feedback', {
                field: 'feedback',
                code: 'empty'
            });

            return;
        }

        if (countCharacters(trimmed) > max) {
            setError(LL.feedback.errors.tooLong({ max }));
            haptics.error();
            reportEvent('validationFailed', 'feedback', {
                field: 'feedback',
                code: 'tooLong'
            });

            return;
        }

        setSending(true);
        setError(null);

        try {
            await api.request('sendFeedback', { body: { text: trimmed } });
            haptics.success();
            setText('');
            setSent(true);
        } catch (failureSource) {
            const failure = toFailure(failureSource);
            const fieldError = getFieldErrors(failure).text;

            haptics.error();

            if (fieldError !== undefined) {
                reportEvent('validationFailed', 'feedback', {
                    field: 'feedback',
                    code: fieldError
                });
            }

            setError(
                fieldError === undefined
                    ? failureMessage(LL, failure)
                    : describeFieldError(LL, fieldError, max)
            );
        }

        setSending(false);
    };

    useBottomButton(
        sent
            ? null
            : {
                  text: sending ? LL.common.sending() : LL.feedback.send(),
                  disabled: trimmed === '',
                  progress: sending,
                  onClick: () => {
                      void send();
                  }
              }
    );

    return (
        <ScreenLayout
            id='feedback'
            title={LL.feedback.title()}
            lead={sent ? undefined : LL.feedback.lead()}
        >
            {sent ? (
                <Tag class='state-tag feedback-success'>
                    <div role='status'>
                        <h2 class='state-title'>
                            {LL.feedback.success.title()}
                        </h2>
                        <p class='state-text'>{LL.feedback.success.text()}</p>
                    </div>
                    <button
                        type='button'
                        class='btn'
                        onClick={() => {
                            setSent(false);
                        }}
                    >
                        {LL.feedback.success.another()}
                    </button>
                </Tag>
            ) : (
                <form
                    class='feedback-form'
                    onSubmit={(event: Event) => {
                        event.preventDefault();
                    }}
                >
                    <Field
                        id='feedback-text'
                        label={LL.feedback.label()}
                        hint={LL.feedback.contactHint()}
                        placeholder={LL.feedback.placeholder()}
                        value={text}
                        multiline
                        rows={6}
                        maxLength={max}
                        error={error}
                        onValue={value => {
                            setText(value);
                            setError(null);
                        }}
                    />
                </form>
            )}
        </ScreenLayout>
    );
};
