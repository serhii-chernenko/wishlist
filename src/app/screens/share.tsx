import { useState } from 'hono/jsx/dom';

import type {
    ContactDisclosureField,
    ContactDisclosureInput,
    MeDto,
    ShareDto
} from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    useNav,
    useSession
} from '../state/context';
import { getFieldErrors, type AppFailure } from '../logic/errors';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { buildShareUrl, openLink, openTelegramLink } from '../telegram/links';
import { confirmAction } from '../telegram/popups';
import { EmptyState } from '../ui/empty-state';
import { isResourcePending, ResourceView } from '../ui/resource-view';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';
import { copyToClipboard } from '../ui/clipboard';
import { Toggle } from '../ui/toggle';

type ShareAction =
    | 'publish'
    | 'rotate'
    | 'stop'
    | 'username'
    | 'indexing'
    | 'gifted';

type ContactConfirmation = 'phone' | 'address' | 'both';

type DetailsNotice = 'phoneMissing' | 'addressMissing' | 'needsPhone';

const CONFIRMATION_PATCHES: Record<
    ContactConfirmation,
    ContactDisclosureInput
> = {
    phone: { phone: true },
    address: { address: true },
    both: { phone: true, address: true }
};

const resolveEnabling = (
    me: Pick<MeDto, 'phoneMasked' | 'deliveryAddress' | 'disclosure'>,
    field: Exclude<ContactDisclosureField, 'payments'>
): { confirm: ContactConfirmation } | { notice: DetailsNotice } => {
    if (me.phoneMasked === null) {
        return { notice: 'phoneMissing' };
    }

    if (field === 'phone') {
        return { confirm: 'phone' };
    }

    if (me.deliveryAddress === null) {
        return { notice: 'addressMissing' };
    }

    return { confirm: me.disclosure.phone ? 'address' : 'both' };
};

const toDetailsNotice = (
    failure: AppFailure,
    hasPhone: boolean
): DetailsNotice | null => {
    const fields = getFieldErrors(failure);
    const codes = [fields.phone, fields.address];

    if (codes.includes('addressRequired')) {
        return 'addressMissing';
    }

    if (codes.includes('phoneRequired')) {
        return hasPhone ? 'needsPhone' : 'phoneMissing';
    }

    return null;
};

const DetailsNoticeView = ({ notice }: { notice: DetailsNotice }) => {
    const LL = useLL();
    const nav = useNav();
    const texts = LL.share.details;
    const target =
        notice === 'phoneMissing'
            ? ({
                  screen: 'visibility',
                  label: LL.settings.visibility()
              } as const)
            : notice === 'addressMissing'
              ? ({ screen: 'delivery', label: LL.delivery.title() } as const)
              : null;

    return (
        <div class='contact-note' role='alert'>
            <p>{texts[notice]()}</p>
            {target === null ? null : (
                <button
                    type='button'
                    class='text-button'
                    onClick={() => {
                        haptics.selection();
                        nav.push({ screen: target.screen });
                    }}
                >
                    {target.label}
                </button>
            )}
        </div>
    );
};

const ContactConfirmationView = ({
    confirmation,
    pending,
    onConfirm,
    onCancel
}: {
    confirmation: ContactConfirmation;
    pending: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const LL = useLL();
    const { confirm } = LL.share.details;

    return (
        <div
            class='contact-confirm'
            role='group'
            aria-labelledby='contact-confirm-text'
        >
            <div id='contact-confirm-text' class='contact-confirm-text'>
                {confirmation === 'address' ? null : <p>{confirm.phone()}</p>}
                {confirmation === 'phone' ? null : <p>{confirm.address()}</p>}
            </div>
            <div class='contact-confirm-actions'>
                <button
                    type='button'
                    class='btn btn-primary'
                    disabled={pending}
                    aria-busy={String(pending)}
                    onClick={onConfirm}
                >
                    {LL.common.confirm()}
                </button>
                <button
                    type='button'
                    class='btn'
                    disabled={pending}
                    onClick={onCancel}
                >
                    {LL.common.cancel()}
                </button>
            </div>
        </div>
    );
};

const ContactDetails = () => {
    const LL = useLL();
    const { api, toast, updateMe } = useApp();
    const { me } = useSession();
    const texts = LL.share.details;
    const [pending, setPending] = useState(false);
    const [confirmation, setConfirmation] =
        useState<ContactConfirmation | null>(null);
    const [notice, setNotice] = useState<DetailsNotice | null>(null);

    const apply = async (patch: ContactDisclosureInput) => {
        setPending(true);
        setNotice(null);

        try {
            updateMe(
                await api.request('setContactDisclosure', { body: patch })
            );
            haptics.success();
            setConfirmation(null);
        } catch (error) {
            const failure = toFailure(error);
            const detailsNotice = toDetailsNotice(
                failure,
                me.phoneMasked !== null
            );

            setConfirmation(null);

            if (detailsNotice === null) {
                toast.failure(failure);
            } else {
                haptics.error();
                setNotice(detailsNotice);
            }
        }

        setPending(false);
    };

    const toggle = (field: ContactDisclosureField, next: boolean) => {
        setNotice(null);
        setConfirmation(null);

        if (field === 'payments' || !next) {
            void apply({ [field]: next });

            return;
        }

        const decision = resolveEnabling(me, field);

        if ('notice' in decision) {
            haptics.error();
            setNotice(decision.notice);

            return;
        }

        setConfirmation(decision.confirm);
    };

    return (
        <section
            class='contact-details'
            aria-labelledby='contact-details-title'
        >
            <h2 id='contact-details-title' class='state-title'>
                {texts.title()}
            </h2>
            <p class='field-hint'>{texts.lead()}</p>
            <Toggle
                id='disclosure-payments'
                label={texts.payments.label()}
                hint={texts.payments.hint()}
                pressed={me.disclosure.payments}
                disabled={pending}
                onToggle={next => {
                    toggle('payments', next);
                }}
            />
            <Toggle
                id='disclosure-phone'
                label={texts.phone.label()}
                hint={texts.phone.hint()}
                pressed={me.disclosure.phone}
                disabled={pending}
                onToggle={next => {
                    toggle('phone', next);
                }}
            />
            <Toggle
                id='disclosure-address'
                label={texts.address.label()}
                hint={texts.address.hint()}
                pressed={me.disclosure.address}
                disabled={pending}
                onToggle={next => {
                    toggle('address', next);
                }}
            />
            {notice === null ? null : <DetailsNoticeView notice={notice} />}
            {confirmation === null ? null : (
                <ContactConfirmationView
                    confirmation={confirmation}
                    pending={pending}
                    onConfirm={() => {
                        void apply(CONFIRMATION_PATCHES[confirmation]);
                    }}
                    onCancel={() => {
                        setConfirmation(null);
                    }}
                />
            )}
        </section>
    );
};

const ShareConsent = ({ share }: { share: ShareDto }) => {
    const LL = useLL();
    const { consent } = LL.share;

    return (
        <Tag class='share-consent'>
            <h2 class='state-title'>{consent.title()}</h2>
            <p>{consent.lead({ host: share.consent.host })}</p>
            <ul class='share-consent-list'>
                <li>{consent.name({ name: share.consent.name })}</li>
                <li>{consent.username()}</li>
                <li>{consent.wishes()}</li>
                <li>{consent.payments()}</li>
            </ul>
            <p>{consent.public()}</p>
            <p>{consent.private()}</p>
            <p>{consent.stop()}</p>
        </Tag>
    );
};

/** Friends get the Telegram link first; the page link rides along in the text for people without Telegram. */
const sendShareLinks = (
    LL: AppTranslator,
    links: { url: string; appUrl: string | null }
) => {
    openTelegramLink(
        links.appUrl === null
            ? buildShareUrl(links.url, LL.share.sendText())
            : buildShareUrl(
                  links.appUrl,
                  [
                      LL.share.sendText(),
                      '',
                      LL.share.sendBrowserHint(),
                      links.url
                  ].join('\n')
              )
    );
};

export const ShareScreen = (_props: ScreenProps<'share'>) => {
    const LL = useLL();
    const nav = useNav();
    const services = useApp();
    const { api, toast } = services;
    const { me } = useSession();
    const [pending, setPending] = useState<ShareAction | null>(null);
    const share = useAppResource('share', signal => {
        return api.request('getShare', { signal });
    });
    const current = share.data;
    const checksVisibleWishes =
        current?.state === 'shared' && me.wishlistFilter === null;
    const ownWishes = useAppResource(
        checksVisibleWishes ? 'share:wishes' : null,
        signal => {
            return api.request('listWishes', { signal });
        }
    );
    const ownActiveWishes =
        ownWishes.data?.items.filter(wish => wish.gifted !== true) ?? [];
    const pageEmpty =
        ownWishes.data !== undefined &&
        ownActiveWishes.length >= ownWishes.data.total &&
        ownActiveWishes.every(wish => {
            return wish.hidden;
        });

    const store = (next: ShareDto) => {
        share.mutate(() => next);
    };

    const run = async (
        action: ShareAction,
        request: () => Promise<ShareDto>,
        successMessage: string
    ) => {
        setPending(action);

        try {
            store(await request());
            haptics.success();
            toast.show(successMessage, 'success');
        } catch (error) {
            const failure = toFailure(error);

            toast.failure(failure);

            if (failure.kind === 'api' && failure.code === 'shareEmpty') {
                void share.reload();
            }
        }

        setPending(null);
    };

    const publish = () => {
        if (pending === null) {
            void run(
                'publish',
                () => api.request('publishShare'),
                LL.share.published()
            );
        }
    };

    const rotate = async () => {
        const confirmed = await confirmAction({
            title: LL.share.rotate.title(),
            message: LL.share.rotate.text(),
            confirmText: LL.share.rotate.confirm(),
            cancelText: LL.common.cancel(),
            destructive: true
        });

        if (confirmed) {
            await run(
                'rotate',
                () => api.request('rotateShare'),
                LL.share.rotate.success()
            );
        }
    };

    const stop = async () => {
        const confirmed = await confirmAction({
            title: LL.share.stop.title(),
            message: LL.share.stop.text(),
            confirmText: LL.share.stop.confirm(),
            cancelText: LL.common.cancel(),
            destructive: true
        });

        if (confirmed) {
            await run(
                'stop',
                () => api.request('stopShare'),
                LL.share.stop.success()
            );
        }
    };

    const toggleUsername = async (previous: ShareDto, show: boolean) => {
        setPending('username');
        store({ ...previous, showUsername: show });

        try {
            store(await api.request('setShareUsername', { body: { show } }));
            toast.show(
                show ? LL.share.username.shown() : LL.share.username.hidden(),
                'success'
            );
        } catch (error) {
            store(previous);
            toast.failure(toFailure(error));
        }

        setPending(null);
    };

    const toggleIndexing = async (
        previous: ShareDto,
        allowIndexing: boolean
    ) => {
        setPending('indexing');
        store({ ...previous, allowIndexing });

        try {
            store(
                await api.request('setShareIndexing', {
                    body: { allowIndexing }
                })
            );
        } catch (error) {
            store(previous);
            toast.failure(toFailure(error));
        }

        setPending(null);
    };

    const toggleShowGifted = async (show: boolean) => {
        const previous = services.session.get().me;

        setPending('gifted');
        services.updateMe({ ...previous, showGifted: show });

        try {
            services.updateMe(
                await api.request('setShowGifted', { body: { show } })
            );
            toast.show(
                show ? LL.share.gifted.shown() : LL.share.gifted.hidden(),
                'success'
            );
        } catch (error) {
            services.updateMe(previous);
            toast.failure(toFailure(error));
        }

        setPending(null);
    };

    const copyLink = async (url: string) => {
        if (await copyToClipboard(url)) {
            haptics.success();
            toast.show(LL.share.link.copied(), 'success');
        }
    };

    useBottomButton(
        current?.state === 'unshared'
            ? {
                  text: LL.share.publish(),
                  progress: pending === 'publish',
                  disabled: pending !== null && pending !== 'publish',
                  onClick: publish
              }
            : current?.state === 'shared' && current.url !== null
              ? {
                    text: LL.share.link.send(),
                    onClick: () => {
                        sendShareLinks(LL, {
                            url: current.url ?? '',
                            appUrl: current.appUrl
                        });
                    }
                }
              : null
    );

    return (
        <ScreenLayout
            id='share'
            title={LL.share.title()}
            busy={isResourcePending(share)}
        >
            <ResourceView resource={share}>
                {data => {
                    if (data.state === 'empty') {
                        return (
                            <EmptyState
                                title={LL.share.empty.title()}
                                text={LL.share.empty.text()}
                                action={{
                                    label: LL.share.empty.cta(),
                                    onClick: () => {
                                        nav.push({
                                            screen: 'wishEditor',
                                            wishId: null
                                        });
                                    }
                                }}
                            />
                        );
                    }

                    if (data.state === 'unshared' || data.url === null) {
                        return <ShareConsent share={data} />;
                    }

                    const url = data.url;
                    const appUrl = data.appUrl;

                    return (
                        <>
                            <Tag class='share-link-card'>
                                <h2 class='state-title'>
                                    {appUrl === null
                                        ? LL.share.link.title()
                                        : LL.share.link.appTitle()}
                                </h2>
                                <p class='share-url'>{appUrl ?? url}</p>
                                {appUrl === null ? null : (
                                    <p class='field-hint'>
                                        {LL.share.link.appHint()}
                                    </p>
                                )}
                                <div class='share-actions'>
                                    <button
                                        type='button'
                                        class='btn'
                                        onClick={() => {
                                            void copyLink(appUrl ?? url);
                                        }}
                                    >
                                        {LL.share.link.copy()}
                                    </button>
                                    <button
                                        type='button'
                                        class='btn'
                                        onClick={() => {
                                            sendShareLinks(LL, { url, appUrl });
                                        }}
                                    >
                                        {LL.share.link.send()}
                                    </button>
                                    <button
                                        type='button'
                                        class='btn'
                                        onClick={() => {
                                            if (appUrl === null) {
                                                openLink(url);
                                            } else {
                                                openTelegramLink(appUrl);
                                            }
                                        }}
                                    >
                                        {appUrl === null
                                            ? LL.share.link.open()
                                            : LL.share.link.openApp()}
                                    </button>
                                </div>
                                <p class='field-hint'>
                                    {LL.share.autoUpdate()}
                                </p>
                            </Tag>
                            {appUrl === null ? null : (
                                <section
                                    class='share-web'
                                    aria-labelledby='share-web-title'
                                >
                                    <h2
                                        id='share-web-title'
                                        class='share-web-title'
                                    >
                                        {LL.share.link.webTitle()}
                                    </h2>
                                    <p class='field-hint'>
                                        {LL.share.link.webHint()}
                                    </p>
                                    <p class='share-url'>{url}</p>
                                    <div class='share-web-actions'>
                                        <button
                                            type='button'
                                            class='text-button'
                                            onClick={() => {
                                                void copyLink(url);
                                            }}
                                        >
                                            {LL.share.link.copy()}
                                        </button>
                                        <button
                                            type='button'
                                            class='text-button'
                                            onClick={() => {
                                                openLink(url);
                                            }}
                                        >
                                            {LL.share.link.open()}
                                        </button>
                                    </div>
                                </section>
                            )}
                            {pageEmpty ? (
                                <p class='share-page-empty' role='note'>
                                    {LL.share.pageEmpty()}
                                </p>
                            ) : null}
                            {data.canShowUsername ? (
                                <Toggle
                                    id='share-username'
                                    label={LL.share.username.label()}
                                    hint={LL.share.username.hint()}
                                    pressed={data.showUsername}
                                    disabled={pending !== null}
                                    onToggle={show => {
                                        void toggleUsername(data, show);
                                    }}
                                />
                            ) : null}
                            <Toggle
                                id='share-indexing'
                                label={LL.share.indexing.title()}
                                hint={LL.share.indexing.hint()}
                                pressed={data.allowIndexing}
                                disabled={pending !== null}
                                onToggle={allowIndexing => {
                                    void toggleIndexing(data, allowIndexing);
                                }}
                            />
                            <Toggle
                                id='share-gifted'
                                label={LL.share.gifted.label()}
                                hint={LL.share.gifted.hint()}
                                pressed={me.showGifted}
                                disabled={pending !== null}
                                onToggle={show => {
                                    void toggleShowGifted(show);
                                }}
                            />
                            <div class='share-manage'>
                                <button
                                    type='button'
                                    class='btn'
                                    disabled={pending !== null}
                                    onClick={() => {
                                        void rotate();
                                    }}
                                >
                                    {LL.share.rotate.action()}
                                </button>
                                <button
                                    type='button'
                                    class='btn share-stop'
                                    disabled={pending !== null}
                                    onClick={() => {
                                        void stop();
                                    }}
                                >
                                    {LL.share.stop.action()}
                                </button>
                            </div>
                        </>
                    );
                }}
            </ResourceView>
            {me.registered ? <ContactDetails /> : null}
        </ScreenLayout>
    );
};
