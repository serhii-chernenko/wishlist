import { useState } from 'hono/jsx/dom';

import type { ShareDto } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    useNav,
    useSession
} from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { buildShareUrl, openLink, openTelegramLink } from '../telegram/links';
import { confirmAction } from '../telegram/popups';
import { EmptyState } from '../ui/empty-state';
import { isResourcePending, ResourceView } from '../ui/resource-view';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';
import { Toggle } from '../ui/toggle';

type ShareAction = 'publish' | 'rotate' | 'stop' | 'username' | 'gifted';

const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        const area = document.createElement('textarea');

        area.value = text;
        area.className = 'sr-only';
        area.setAttribute('readonly', '');
        document.body.append(area);
        area.select();

        const copied = document.execCommand('copy');

        area.remove();

        return copied;
    }
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
        </ScreenLayout>
    );
};
