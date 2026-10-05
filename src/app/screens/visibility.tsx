import { useEffect, useRef, useState } from 'hono/jsx/dom';
import { AtSign, BookUser, Phone } from 'lucide';

import type {
    ContactVisibilityType,
    MeDto,
    VisibilityType
} from '../../shared/app-api';
import { fieldErrorMessage, failureMessage } from '../i18n/messages';
import {
    INITIAL_CONTACT_FLOW,
    isContactFlowBusy,
    runContactFlow,
    type ContactFlowDeps,
    type ContactFlowState
} from '../logic/contact-flow';
import { getFieldErrors } from '../logic/errors';
import type { ScreenProps } from '../nav/routes';
import { routesAfterRegistration } from '../logic/nav';
import { useApp, useLL, useNav, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { requestContact, requestWriteAccess } from '../telegram/links';
import { getLaunchContext } from '../telegram/sdk';
import type { WebAppUser } from '../telegram/types';
import { ChoiceCards, type ChoiceOption } from '../ui/choice-cards';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

const CHOICE_ICONS = {
    username: AtSign,
    phone: Phone,
    both: BookUser
} as const;

const USERNAME_MISSING_ID = 'visibility-username-missing';

const waitFor = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

const botCannotWriteFirst = () => {
    const user = getLaunchContext().webApp?.initDataUnsafe.user as
        | (WebAppUser & { allows_write_to_pm?: boolean })
        | undefined;

    return user?.allows_write_to_pm === false;
};

const getInitialChoice = (me: MeDto): VisibilityType => {
    if (me.visibility !== null) {
        return me.visibility;
    }

    return me.telegramUsername === null ? 'phone' : 'username';
};

const isContactChoice = (
    choice: VisibilityType
): choice is ContactVisibilityType => {
    return choice !== 'username';
};

export const VisibilityScreen = (_props: ScreenProps<'visibility'>) => {
    const LL = useLL();
    const nav = useNav();
    const { api, toast, updateMe, reloadSession, launch } = useApp();
    const { me } = useSession();
    const [choice, setChoice] = useState<VisibilityType>(getInitialChoice(me));
    const [saving, setSaving] = useState(false);
    const [flow, setFlow] = useState<ContactFlowState>(INITIAL_CONTACT_FLOW);
    const [message, setMessage] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const hasUsername = me.telegramUsername !== null;
    const busy = saving || isContactFlowBusy(flow);
    const wasRegistered = me.registered;

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const finish = async (next: MeDto) => {
        updateMe(next);
        haptics.success();
        toast.show(
            wasRegistered
                ? LL.visibility.success.user()
                : LL.visibility.success.guest(),
            'success'
        );

        if (wasRegistered) {
            void nav.back();

            return;
        }

        await reloadSession().catch(() => undefined);
        nav.reset(routesAfterRegistration(launch.startParam));
    };

    const saveUsername = async () => {
        setSaving(true);
        setMessage(null);

        try {
            await finish(
                await api.request('setVisibility', {
                    body: { type: 'username' }
                })
            );

            return;
        } catch (error) {
            const failure = toFailure(error);
            const fieldError = getFieldErrors(failure).type;

            haptics.error();
            setMessage(
                fieldError === undefined
                    ? failureMessage(LL, failure)
                    : fieldErrorMessage(LL, fieldError, 0)
            );
        }

        setSaving(false);
    };

    const createContactDeps = (): ContactFlowDeps => {
        return {
            saveIntent: async type => {
                await api.request('startContactIntent', { body: { type } });
            },
            cancelIntent: async () => {
                await api.request('cancelContactIntent');
            },
            requestContact: async () => {
                if (botCannotWriteFirst()) {
                    await requestWriteAccess();
                }

                return requestContact();
            },
            fetchMe: () => {
                return api.request('getMe');
            },
            wait: waitFor,
            now: () => Date.now(),
            toFailure
        };
    };

    const shareContact = async (type: ContactVisibilityType) => {
        const controller = new AbortController();

        abortRef.current = controller;
        setMessage(null);

        const final = await runContactFlow({
            deps: createContactDeps(),
            type,
            onState: setFlow,
            signal: controller.signal
        });

        if (controller.signal.aborted) {
            return;
        }

        if (final.phase === 'success') {
            await finish(final.me);

            return;
        }

        haptics.error();

        if (final.phase === 'failed') {
            const fieldError = getFieldErrors(final.failure).type;

            setMessage(
                fieldError === undefined
                    ? failureMessage(LL, final.failure)
                    : fieldErrorMessage(LL, fieldError, 0)
            );
        } else if (final.phase === 'cancelled') {
            setMessage(LL.visibility.cancelled());
        } else if (final.phase === 'timeout') {
            setMessage(LL.visibility.timeout());
        } else if (final.phase === 'unsupported') {
            setMessage(LL.unsupported.text());
        }
    };

    const submit = () => {
        if (busy) {
            return;
        }

        if (isContactChoice(choice)) {
            void shareContact(choice);
        } else {
            void saveUsername();
        }
    };

    useBottomButton({
        text: isContactChoice(choice)
            ? LL.visibility.shareNumber()
            : LL.visibility.save(),
        disabled: choice === me.visibility,
        progress: busy,
        onClick: submit
    });

    const options: ChoiceOption<VisibilityType>[] = (
        ['username', 'phone', 'both'] as const
    ).map(value => {
        return {
            value,
            icon: CHOICE_ICONS[value],
            title: LL.visibility.options[value].title(),
            hint: LL.visibility.options[value].hint(),
            disabled: value !== 'phone' && !hasUsername
        };
    });

    return (
        <ScreenLayout
            id='visibility'
            title={
                wasRegistered
                    ? LL.visibility.title()
                    : LL.visibility.guestTitle()
            }
            lead={LL.visibility.lead()}
        >
            <section class='visibility-current' aria-live='polite'>
                {me.visibility === null ? (
                    <p>{LL.visibility.currentNone()}</p>
                ) : (
                    <>
                        <p class='visibility-current-label'>
                            {LL.visibility.current()}
                        </p>
                        <p class='visibility-current-value'>
                            {LL.visibility.values[me.visibility]()}
                        </p>
                    </>
                )}
                {me.telegramUsername === null ? null : (
                    <p class='field-hint'>
                        {LL.visibility.yourUsername({
                            username: me.telegramUsername
                        })}
                    </p>
                )}
                {me.phoneMasked === null ? null : (
                    <p class='field-hint'>
                        {LL.visibility.yourPhone({ phone: me.phoneMasked })}
                    </p>
                )}
            </section>
            <ChoiceCards
                name='visibility'
                legend={LL.visibility.title()}
                options={options}
                value={choice}
                disabled={busy}
                describedBy={hasUsername ? undefined : USERNAME_MISSING_ID}
                onChange={next => {
                    setChoice(next);
                    setMessage(null);
                }}
            />
            {hasUsername ? null : (
                <p id={USERNAME_MISSING_ID} class='field-hint visibility-note'>
                    {LL.visibility.usernameMissing()}
                </p>
            )}
            {isContactChoice(choice) ? (
                <p class='field-hint visibility-note'>
                    {LL.visibility.phoneHint()}
                </p>
            ) : null}
            {flow.phase === 'requesting' || flow.phase === 'polling' ? (
                <Tag class='visibility-waiting'>
                    <p role='status' class='visibility-waiting-text'>
                        <span
                            class='loading loading-spinner loading-sm'
                            aria-hidden='true'
                        />
                        {LL.visibility.waiting()}
                    </p>
                </Tag>
            ) : null}
            {message === null ? null : (
                <p class='field-error visibility-message' role='alert'>
                    {message}
                </p>
            )}
            <p class='field-hint visibility-note'>{LL.visibility.later()}</p>
        </ScreenLayout>
    );
};
