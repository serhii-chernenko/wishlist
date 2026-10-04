import { useEffect, useState } from 'hono/jsx/dom';
import { Trash2, X } from 'lucide';

import type { GiveEntryDto, GiveListDto } from '../../shared/app-api';
import { hasErrorCode } from '../logic/errors';
import {
    appendPage,
    emptyPage,
    removeFromPage,
    restoreToPage,
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
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { ScreenLayout } from '../ui/screen';
import { WishGrid, WishTag } from '../ui/wish-tag';
import {
    GIVES_LIST_KEY,
    LoadingOrError,
    ShowMore,
    updateCounts
} from './wishes';

const giveKey: KeyOf<GiveEntryDto> = entry => entry.wish.id;

const pendingGiveRemovals = new Set<number>();
let pendingGivesClean = false;

const withoutPendingGives = (page: GiveListDto): GiveListDto => {
    if (pendingGivesClean) {
        return emptyPage(page);
    }

    let next = page;

    for (const wishId of pendingGiveRemovals) {
        next = removeFromPage(next, giveKey, wishId).page;
    }

    return next;
};

/** Loads a give page with the removals that are still waiting for their undo countdown left out. */
const loadGives = async (
    services: AppServices,
    offset: number,
    signal?: AbortSignal
) => {
    const page = await services.api.request('listGives', {
        ...(offset > 0 && { query: { offset } }),
        ...(signal !== undefined && { signal })
    });

    return withoutPendingGives(page);
};

const mutateGives = (
    services: AppServices,
    update: (page: GiveListDto) => GiveListDto
) => {
    services.cache.mutate<GiveListDto>(GIVES_LIST_KEY, page => {
        return page === undefined ? page : update(page);
    });
};

const changeGivesCount = (services: AppServices, delta: number) => {
    updateCounts(services, counts => {
        return { ...counts, gives: Math.max(0, counts.gives + delta) };
    });
};

/** Reloads the give list after a give or take elsewhere and takes the Home count from the server, so a give that already existed is not counted twice. */
export const refreshGives = (services: AppServices) => {
    void services.cache
        .load<GiveListDto>(GIVES_LIST_KEY, signal => {
            return loadGives(services, 0, signal);
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
    const list = useAppResource<GiveListDto>(GIVES_LIST_KEY, signal => {
        return loadGives(services, 0, signal);
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
        const wishId = giveKey(entry);
        let removed: RemovedItem<GiveEntryDto> | null = null;

        toast.undoable({
            message: LL.gives.removed(),
            apply() {
                pendingGiveRemovals.add(wishId);
                mutateGives(services, current => {
                    const result = removeFromPage(current, giveKey, wishId);

                    removed = result.removed;

                    return result.page;
                });
                changeGivesCount(services, -1);
            },
            restore() {
                const restored = removed;

                pendingGiveRemovals.delete(wishId);
                changeGivesCount(services, 1);

                if (restored !== null) {
                    mutateGives(services, current => {
                        return restoreToPage(current, giveKey, restored);
                    });
                }
            },
            commit() {
                return api.request('removeGive', { params: { wishId } });
            },
            committed() {
                pendingGiveRemovals.delete(wishId);
            },
            failed(error) {
                const failure = toFailure(error);

                toast.failure(failure);

                if (hasErrorCode(failure, 'notFound')) {
                    refreshGives(services);
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
            const next = await loadGives(services, page.nextOffset);

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

    const clean = () => {
        let snapshot: GiveListDto | undefined;

        toast.undoable({
            message: LL.gives.clean.success(),
            apply() {
                pendingGivesClean = true;
                snapshot =
                    services.cache.read<GiveListDto>(GIVES_LIST_KEY).data;
                mutateGives(services, emptyPage);
                updateCounts(services, counts => ({ ...counts, gives: 0 }));
            },
            restore() {
                pendingGivesClean = false;
                refreshGives(services);

                if (snapshot !== undefined) {
                    const previous = snapshot;

                    mutateGives(services, () => previous);
                }
            },
            commit() {
                return api.request('cleanGives');
            },
            committed() {
                pendingGivesClean = false;
                pendingGiveRemovals.clear();
            }
        });
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
                        {items.map((entry, index) => {
                            return (
                                <WishTag
                                    key={entry.wish.id}
                                    wish={entry.wish}
                                    index={index}
                                    badges={<GiveBadges entry={entry} />}
                                    actions={
                                        <button
                                            type='button'
                                            class='btn btn-sm danger-button give-drop'
                                            onClick={() => {
                                                dropGive(entry);
                                            }}
                                        >
                                            <Icon icon={X} />
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
                            onClick={clean}
                        >
                            <Icon icon={Trash2} />
                            {LL.gives.clean.action()}
                        </button>
                    </div>
                </>
            )}
        </ScreenLayout>
    );
};
