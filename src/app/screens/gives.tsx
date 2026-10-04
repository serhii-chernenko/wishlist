import { useEffect, useState } from 'hono/jsx/dom';

import type { GiveEntryDto, GiveListDto } from '../../shared/app-api';
import { hasErrorCode } from '../logic/errors';
import {
    appendPage,
    emptyPage,
    removeFromPage,
    restoreToPage,
    runOptimistic,
    type KeyOf,
    type RemovedItem
} from '../logic/optimistic';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    type AppServices
} from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { confirmAction } from '../telegram/popups';
import { EmptyState } from '../ui/empty-state';
import { ScreenLayout } from '../ui/screen';
import { WishGrid, WishTag } from '../ui/wish-tag';
import {
    GIVES_LIST_KEY,
    LoadingOrError,
    ShowMore,
    updateCounts
} from './wishes';

const giveKey: KeyOf<GiveEntryDto> = entry => entry.wish.id;

/** Reloads the give list after a give or take elsewhere and takes the Home count from the server, so a give that already existed is not counted twice. */
export const refreshGives = (services: AppServices) => {
    void services.cache
        .load<GiveListDto>(GIVES_LIST_KEY, signal => {
            return services.api.request('listGives', { signal });
        })
        .then(page => {
            if (page !== undefined) {
                updateCounts(services, counts => {
                    return { ...counts, gives: page.total };
                });
            }
        });
};

const GiveBadges = ({ entry }: { entry: GiveEntryDto }) => {
    const LL = useLL();

    if (entry.ownerUsername === null && entry.otherGivers === 0) {
        return null;
    }

    return (
        <ul class='give-meta'>
            {entry.ownerUsername === null ? null : (
                <li class='give-owner'>
                    {LL.gives.owner({ owner: `@${entry.ownerUsername}` })}
                </li>
            )}
            {entry.otherGivers > 0 ? (
                <li class='give-others'>
                    {LL.gives.others({ count: entry.otherGivers })}
                </li>
            ) : null}
        </ul>
    );
};

export const GivesScreen = (_props: ScreenProps<'gives'>) => {
    const services = useApp();
    const { api, nav, toast } = services;
    const LL = useLL();
    const [loadingMore, setLoadingMore] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const list = useAppResource<GiveListDto>(GIVES_LIST_KEY, signal => {
        return api.request('listGives', { signal });
    });
    const page = list.data;

    useBottomButton(null);

    useEffect(() => {
        if (page !== undefined) {
            updateCounts(services, counts => {
                return counts.gives === page.total
                    ? counts
                    : { ...counts, gives: page.total };
            });
        }
    }, [page?.total]);

    const dropGive = (entry: GiveEntryDto) => {
        let removed: RemovedItem<GiveEntryDto> | null = null;

        haptics.impact('light');
        void runOptimistic({
            apply() {
                list.mutate(current => {
                    if (current === undefined) {
                        return current;
                    }

                    const result = removeFromPage(
                        current,
                        giveKey,
                        giveKey(entry)
                    );

                    removed = result.removed;

                    return result.page;
                });
            },
            commit() {
                return api.request('removeGive', {
                    params: { wishId: entry.wish.id }
                });
            },
            rollback() {
                const restored = removed;

                if (restored !== null) {
                    list.mutate(current => {
                        return current === undefined
                            ? current
                            : restoreToPage(current, giveKey, restored);
                    });
                }
            },
            settle() {
                toast.show(LL.gives.removed(), 'success');
            },
            fail(error) {
                const failure = toFailure(error);

                toast.failure(failure);

                if (hasErrorCode(failure, 'notFound')) {
                    void list.reload();
                }
            }
        });
    };

    const showMore = async () => {
        if (page === undefined || page.nextOffset === null) {
            return;
        }

        setLoadingMore(true);

        try {
            const next = await api.request('listGives', {
                query: { offset: page.nextOffset }
            });

            list.mutate(current => {
                return current === undefined
                    ? current
                    : appendPage(current, next, giveKey);
            });
        } catch (error) {
            toast.failure(toFailure(error));
        } finally {
            setLoadingMore(false);
        }
    };

    const clean = async () => {
        const texts = LL.gives.clean;
        const confirmed = await confirmAction({
            title: texts.title(),
            message: texts.text(),
            confirmText: texts.confirm(),
            cancelText: LL.common.cancel(),
            destructive: true
        });

        if (!confirmed) {
            return;
        }

        setCleaning(true);

        try {
            await api.request('cleanGives');
            haptics.success();
            list.mutate(current => {
                return current === undefined ? current : emptyPage(current);
            });
            toast.show(texts.success(), 'success');
        } catch (error) {
            toast.failure(toFailure(error));
        } finally {
            setCleaning(false);
        }
    };

    const items = page?.items ?? [];

    return (
        <ScreenLayout
            id='gives'
            title={LL.gives.title()}
            busy={page === undefined && list.failure === null}
            {...(page !== undefined &&
                page.total > 0 && {
                    lead: LL.gives.count({ count: page.total })
                })}
        >
            {page === undefined ? (
                <LoadingOrError
                    failure={list.failure}
                    onRetry={() => {
                        void list.reload();
                    }}
                />
            ) : items.length === 0 ? (
                <EmptyState
                    title={LL.gives.empty.title()}
                    text={LL.gives.empty.text()}
                    action={{
                        label: LL.gives.empty.cta(),
                        onClick: () => {
                            nav.push({ screen: 'find' });
                        }
                    }}
                />
            ) : (
                <>
                    <WishGrid label={LL.gives.title()}>
                        {items.map(entry => {
                            return (
                                <WishTag
                                    key={entry.wish.id}
                                    wish={entry.wish}
                                    currency={entry.currency}
                                    owner='other'
                                    badges={<GiveBadges entry={entry} />}
                                    actions={
                                        <button
                                            type='button'
                                            class='btn btn-sm give-drop'
                                            onClick={() => {
                                                dropGive(entry);
                                            }}
                                        >
                                            {LL.gives.remove()}
                                        </button>
                                    }
                                />
                            );
                        })}
                    </WishGrid>
                    <ShowMore
                        visible={page.nextOffset !== null}
                        loading={loadingMore}
                        onClick={() => {
                            void showMore();
                        }}
                    />
                    <div class='list-footer'>
                        <button
                            type='button'
                            class='text-button text-button-danger'
                            disabled={cleaning}
                            onClick={() => {
                                void clean();
                            }}
                        >
                            {LL.gives.clean.action()}
                        </button>
                    </div>
                </>
            )}
        </ScreenLayout>
    );
};
