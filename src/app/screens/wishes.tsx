import { useEffect, useState } from 'hono/jsx/dom';
import { Share2, Trash2 } from 'lucide';

import type {
    OwnWishDto,
    WishFilterValue,
    WishListDto,
    WishPriority
} from '../../shared/app-api';
import type { ApiClient } from '../api/client';
import type { AppTranslator } from '../i18n/i18n';
import { hasErrorCode, type AppFailure } from '../logic/errors';
import { describePriceFilter, selectPriceFilters } from '../logic/format';
import {
    appendPage,
    createLatestGate,
    emptyPage,
    loadPagesUntil,
    patchInPage,
    pickFields,
    removeFromPage,
    replaceInPage,
    restoreToPage,
    revertInPage,
    revertPatch,
    runOptimistic,
    type KeyOf,
    type RemovedItem
} from '../logic/optimistic';
import {
    isHighPriority,
    toToggledPriority,
    type DraftFlag
} from '../logic/wish-draft';
import { newWishRoute } from '../logic/nav';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    useSession,
    type AppServices,
    type Session
} from '../state/context';
import { toFailure, type ResourceCache } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { confirmAction } from '../telegram/popups';
import { ChipGroup, type ChipOption } from '../ui/chips';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { HEART_SYMBOL_ID } from '../ui/heart';
import { Icon } from '../ui/icon';
import { ScreenLayout } from '../ui/screen';
import { TagSkeletons } from '../ui/skeleton';
import { WishGrid, WishTag } from '../ui/wish-tag';
import { GiftedSheet } from './gifted-sheet';

export const WISHES_PREFIX = 'wishes:';
export const WISHES_LIST_KEY = `${WISHES_PREFIX}list`;
export const GIVES_LIST_KEY = 'gives:list';

export const wishItemKey = (id: number) => {
    return `${WISHES_PREFIX}item:${id}`;
};

export const ownWishKey: KeyOf<OwnWishDto> = wish => wish.id;

type Counts = NonNullable<Session['counts']>;

export const updateCounts = (
    services: AppServices,
    update: (counts: Counts) => Counts
) => {
    services.session.set(current => {
        return current.counts === null
            ? current
            : { ...current, counts: update(current.counts) };
    });
};

const hasListData = (cache: ResourceCache) => {
    return cache.read<WishListDto>(WISHES_LIST_KEY).data !== undefined;
};

const mutateList = (
    cache: ResourceCache,
    update: (page: WishListDto) => WishListDto
) => {
    if (hasListData(cache)) {
        cache.mutate<WishListDto>(WISHES_LIST_KEY, page => {
            return page === undefined ? page : update(page);
        });
    }
};

export const readCachedWish = (cache: ResourceCache, id: number) => {
    return cache.read<OwnWishDto>(wishItemKey(id)).data;
};

const pendingFlagWrites = new Map<number, number>();
const pendingWishRemovals = new Set<number>();
const pendingGiftedHides = new Set<number>();

const withoutGifted = (page: WishListDto, id: number): WishListDto => {
    const { page: next, removed } = removeFromPage(page, ownWishKey, id);

    return removed === null
        ? page
        : {
              ...next,
              total: page.total,
              giftedTotal: Math.max(0, page.giftedTotal - 1)
          };
};

/** Leaves out wishes whose removal or hiding still waits for its undo countdown, so a reload does not bring them back early. */
const withoutPendingWishes = (page: WishListDto): WishListDto => {
    let next = page;

    for (const id of pendingWishRemovals) {
        next = removeFromPage(next, ownWishKey, id).page;
    }

    for (const id of pendingGiftedHides) {
        next = withoutGifted(next, id);
    }

    return next;
};

/** Writes a server copy of a wish into the list page and its editor entry; the list goes stale because any change moves the wish in the server order. */
export const storeWish = (cache: ResourceCache, wish: OwnWishDto) => {
    mutateList(cache, page => replaceInPage(page, ownWishKey, wish));
    cache.invalidate(WISHES_LIST_KEY);
    cache.mutate<OwnWishDto>(wishItemKey(wish.id), () => wish);
};

/** Reloads the own list keeping as many items as "Show more" had loaded. */
export const loadWishRange = async (
    api: ApiClient,
    cache: ResourceCache,
    signal?: AbortSignal
) => {
    const loaded =
        cache.read<WishListDto>(WISHES_LIST_KEY).data?.items.length ?? 0;
    const page = await loadPagesUntil<OwnWishDto, WishListDto>(
        offset => {
            return api.request('listWishes', {
                ...(offset > 0 && { query: { offset } }),
                ...(signal !== undefined && { signal })
            });
        },
        loaded,
        ownWishKey
    );

    return withoutPendingWishes(page);
};

const refreshWishList = (api: ApiClient, cache: ResourceCache) => {
    if (hasListData(cache) && pendingFlagWrites.size === 0) {
        void cache.load(WISHES_LIST_KEY, signal => {
            return loadWishRange(api, cache, signal);
        });
    }
};

const patchWish = (
    cache: ResourceCache,
    id: number,
    patch: Partial<OwnWishDto>
) => {
    mutateList(cache, page => patchInPage(page, ownWishKey, id, patch));

    if (readCachedWish(cache, id) !== undefined) {
        cache.mutate<OwnWishDto>(wishItemKey(id), wish => {
            return wish === undefined ? wish : { ...wish, ...patch };
        });
    }
};

const revertWish = (
    cache: ResourceCache,
    id: number,
    applied: Partial<OwnWishDto>,
    previous: Partial<OwnWishDto>
) => {
    mutateList(cache, page => {
        return revertInPage(page, ownWishKey, id, applied, previous);
    });

    const cached = readCachedWish(cache, id);

    if (cached !== undefined) {
        const [restored] = revertPatch(
            [cached],
            ownWishKey,
            id,
            applied,
            previous
        );

        cache.mutate<OwnWishDto>(wishItemKey(id), () => restored);
    }
};

/** Drops a removed (or vanished) wish from every cached view and from the Home count. */
export const forgetWish = (services: AppServices, id: number) => {
    mutateList(services.cache, page => {
        return removeFromPage(page, ownWishKey, id).page;
    });
    services.cache.remove(wishItemKey(id));
    services.cache.invalidate(WISHES_LIST_KEY);
    updateCounts(services, counts => {
        return { ...counts, wishes: Math.max(0, counts.wishes - 1) };
    });
};

const removeGiftedFromList = (cache: ResourceCache, id: number) => {
    mutateList(cache, page => withoutGifted(page, id));
};

const reloadWishList = (api: ApiClient, cache: ResourceCache) => {
    cache.invalidate(WISHES_LIST_KEY);
    refreshWishList(api, cache);
};

/** Removes a wish from the cached list and the Home count only, and hands back what an undo needs to put it back. */
export const removeWishLocally = (services: AppServices, id: number) => {
    let removed: RemovedItem<OwnWishDto> | null = null;

    pendingWishRemovals.add(id);
    mutateList(services.cache, page => {
        const result = removeFromPage(page, ownWishKey, id);

        removed = result.removed;

        return result.page;
    });
    updateCounts(services, counts => {
        return { ...counts, wishes: Math.max(0, counts.wishes - 1) };
    });

    return {
        restore() {
            const restored = removed;

            pendingWishRemovals.delete(id);
            updateCounts(services, counts => {
                return { ...counts, wishes: counts.wishes + 1 };
            });

            if (restored !== null) {
                mutateList(services.cache, page => {
                    return restoreToPage(page, ownWishKey, restored);
                });
            }
        },
        settle() {
            pendingWishRemovals.delete(id);
            services.cache.remove(wishItemKey(id));
            reloadWishList(services.api, services.cache);
        }
    };
};

/** Restore and hide-with-undo for gifted cards; both end with a reload because either moves the wish in the server order. */
const useGiftedActions = (reload: () => void) => {
    const services = useApp();
    const LL = useLL();
    const { api, cache, toast } = services;

    return {
        async restore(wish: OwnWishDto) {
            try {
                const restored = await api.request('restoreWish', {
                    params: { id: wish.id }
                });

                haptics.success();
                cache.mutate<OwnWishDto>(wishItemKey(restored.id), () => {
                    return restored;
                });
                toast.show(LL.gifted.restored(), 'success');
            } catch (error) {
                const failure = toFailure(error);

                if (hasErrorCode(failure, 'notFound')) {
                    removeGiftedFromList(cache, wish.id);
                }

                toast.failure(failure);
            }

            reload();
        },
        hide(wish: OwnWishDto) {
            toast.undoable({
                message: LL.gifted.hidden(),
                apply() {
                    pendingGiftedHides.add(wish.id);
                    removeGiftedFromList(cache, wish.id);
                },
                restore() {
                    pendingGiftedHides.delete(wish.id);
                    reloadWishList(api, cache);
                },
                commit() {
                    return api.request('hideGiftedWish', {
                        params: { id: wish.id },
                        body: { hidden: true }
                    });
                },
                committed() {
                    pendingGiftedHides.delete(wish.id);
                    reloadWishList(api, cache);
                }
            });
        }
    };
};

const priorityToast = (LL: AppTranslator, priority: WishPriority) => {
    if (priority === 'none') {
        return LL.wishes.toasts.priorityRemoved();
    }

    return LL.wishes.toasts.priorityChanged({
        level: LL.editor.priority.levels[priority]()
    });
};

const flagToast = (LL: AppTranslator, flag: DraftFlag, value: boolean) => {
    if (flag === 'priority') {
        return priorityToast(LL, toToggledPriority(value));
    }

    return value ? LL.wishes.toasts.hidden() : LL.wishes.toasts.shown();
};

const trackFlagWrite = (id: number, delta: number) => {
    const next = (pendingFlagWrites.get(id) ?? 0) + delta;

    if (next <= 0) {
        pendingFlagWrites.delete(id);
    } else {
        pendingFlagWrites.set(id, next);
    }

    return next;
};

const useOptimisticFlagPatch = () => {
    const services = useApp();

    return (
        wish: OwnWishDto,
        flag: DraftFlag,
        applied: Partial<OwnWishDto>,
        message: string
    ) => {
        const { api, cache, toast } = services;
        const previous = pickFields(wish, [flag]);

        void runOptimistic({
            apply() {
                trackFlagWrite(wish.id, 1);
                patchWish(cache, wish.id, applied);
            },
            commit() {
                return api.request('updateWish', {
                    params: { id: wish.id },
                    body: applied
                });
            },
            rollback() {
                trackFlagWrite(wish.id, -1);
                revertWish(cache, wish.id, applied, previous);
            },
            settle(updated) {
                if (trackFlagWrite(wish.id, -1) === 0) {
                    storeWish(cache, updated);
                    refreshWishList(api, cache);
                }

                toast.show(message, 'success');
            },
            fail(error) {
                const failure = toFailure(error);

                if (hasErrorCode(failure, 'notFound')) {
                    forgetWish(services, wish.id);
                }

                toast.failure(failure);
            }
        });
    };
};

/** Optimistic priority (high or none) and hidden switches shared by the cards and the editor. */
export const useWishFlagToggle = () => {
    const LL = useLL();
    const patchFlag = useOptimisticFlagPatch();

    return (wish: OwnWishDto, flag: DraftFlag, value: boolean) => {
        const applied: Partial<OwnWishDto> =
            flag === 'priority'
                ? { priority: toToggledPriority(value) }
                : { hidden: value };

        patchFlag(wish, flag, applied, flagToast(LL, flag, value));
    };
};

export const useWishPriorityChange = () => {
    const LL = useLL();
    const patchFlag = useOptimisticFlagPatch();

    return (wish: OwnWishDto, priority: WishPriority) => {
        if (priority !== wish.priority) {
            patchFlag(
                wish,
                'priority',
                { priority },
                priorityToast(LL, priority)
            );
        }
    };
};

const HEART_ICON_VIEW_BOX = '-112 -112 224 180';

const HeartIcon = () => {
    return (
        <svg
            class='icon-toggle-glyph'
            viewBox={HEART_ICON_VIEW_BOX}
            aria-hidden='true'
            focusable='false'
        >
            <use href={`#${HEART_SYMBOL_ID}`} />
        </svg>
    );
};

const EyeIcon = ({ crossed }: { crossed: boolean }) => {
    return (
        <svg
            class='icon-toggle-glyph icon-toggle-eye'
            viewBox='0 0 24 24'
            aria-hidden='true'
            focusable='false'
        >
            <path d='M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z' />
            <circle cx='12' cy='12' r='3' />
            {crossed ? <path d='M4 3.5 20 20.5' /> : null}
        </svg>
    );
};

export const WishQuickToggles = ({ wish }: { wish: OwnWishDto }) => {
    const LL = useLL();
    const toggleFlag = useWishFlagToggle();

    return (
        <div class='quick-toggles'>
            <button
                type='button'
                class='icon-toggle icon-toggle-heart'
                aria-pressed={String(isHighPriority(wish.priority))}
                aria-label={LL.wishes.priorityToggle()}
                title={LL.wishes.priorityToggle()}
                onClick={() => {
                    haptics.selection();
                    toggleFlag(
                        wish,
                        'priority',
                        !isHighPriority(wish.priority)
                    );
                }}
            >
                <HeartIcon />
            </button>
            <button
                type='button'
                class='icon-toggle icon-toggle-hidden'
                aria-pressed={String(wish.hidden)}
                aria-label={LL.wishes.hiddenToggle()}
                title={LL.wishes.hiddenToggle()}
                onClick={() => {
                    haptics.selection();
                    toggleFlag(wish, 'hidden', !wish.hidden);
                }}
            >
                <EyeIcon crossed={wish.hidden} />
            </button>
        </div>
    );
};

export interface MenuItem {
    id: string;
    label: string;
    onSelect: () => void;
    destructive?: boolean;
}

/** A disclosure menu for secondary screen actions; closes on Escape, outside taps and selection. */
export const OverflowMenu = ({
    label,
    items
}: {
    label: string;
    items: readonly MenuItem[];
}) => {
    const [open, setOpen] = useState(false);
    const menuId = 'screen-menu';
    const toggleId = 'screen-menu-toggle';

    useEffect(() => {
        if (!open) {
            return;
        }

        const close = (event: Event) => {
            const target = event.target;

            if (
                target instanceof Node &&
                document.getElementById(menuId)?.parentElement?.contains(target)
            ) {
                return;
            }

            setOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                document.getElementById(toggleId)?.focus();
            }
        };

        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', handleKey);
        document
            .getElementById(menuId)
            ?.querySelector<HTMLButtonElement>('button')
            ?.focus();

        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    return (
        <div class='overflow'>
            <button
                type='button'
                id={toggleId}
                class='overflow-toggle'
                aria-label={label}
                aria-expanded={String(open)}
                aria-controls={menuId}
                onClick={() => {
                    setOpen(!open);
                }}
            >
                <span class='overflow-dots' aria-hidden='true' />
            </button>
            {open ? (
                <ul id={menuId} class='overflow-menu'>
                    {items.map(item => {
                        return (
                            <li key={item.id}>
                                <button
                                    type='button'
                                    class={
                                        item.destructive
                                            ? 'overflow-item overflow-item-danger'
                                            : 'overflow-item'
                                    }
                                    onClick={() => {
                                        setOpen(false);
                                        item.onSelect();
                                    }}
                                >
                                    {item.destructive ? (
                                        <Icon
                                            icon={Trash2}
                                            class='danger-icon'
                                        />
                                    ) : null}
                                    {item.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
};

export const ShowMore = ({
    visible,
    loading,
    onClick
}: {
    visible: boolean;
    loading: boolean;
    onClick: () => void;
}) => {
    const LL = useLL();

    if (!visible) {
        return null;
    }

    return (
        <div class='show-more'>
            <button
                type='button'
                class='btn show-more-button'
                disabled={loading}
                aria-busy={String(loading)}
                onClick={onClick}
            >
                {loading ? (
                    <span
                        class='loading loading-spinner loading-sm'
                        aria-hidden='true'
                    />
                ) : null}
                {LL.common.showMore()}
            </button>
        </div>
    );
};

export const LoadingOrError = ({
    failure,
    onRetry,
    count = 3
}: {
    failure: AppFailure | null;
    onRetry: () => void;
    count?: number;
}) => {
    return failure === null ? (
        <TagSkeletons count={count} />
    ) : (
        <ErrorState failure={failure} onRetry={onRetry} />
    );
};

type FilterChoice = WishFilterValue | null;

const useFilterOptions = (): ChipOption<FilterChoice>[] => {
    const LL = useLL();
    const { config, locale, me } = useSession();

    return [
        { value: null, label: LL.filters.all() },
        ...selectPriceFilters(config.priceFilters, me.currency).map(filter => {
            const label = describePriceFilter(filter, locale, me.currency);
            const text =
                label.kind === 'upTo'
                    ? LL.filters.upTo({ amount: label.amount })
                    : label.kind === 'from'
                      ? LL.filters.from({ amount: label.amount })
                      : label.kind === 'range'
                        ? LL.filters.range({ from: label.from, to: label.to })
                        : LL.filters.all();

            return { value: filter.filter, label: text };
        })
    ];
};

export const WishesScreen = (_props: ScreenProps<'wishes'>) => {
    const services = useApp();
    const { api, nav, toast } = services;
    const LL = useLL();
    const { counts, config } = useSession();
    const filterOptions = useFilterOptions();
    const [gate] = useState(createLatestGate);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [giftedSheetWish, setGiftedSheetWish] = useState<OwnWishDto | null>(
        null
    );
    const list = useAppResource<WishListDto>(WISHES_LIST_KEY, signal => {
        return loadWishRange(api, services.cache, signal);
    });
    const page = list.data;
    const giftedActions = useGiftedActions(() => {
        void list.reload();
    });

    useEffect(() => {
        if (page !== undefined && page.filter === null) {
            updateCounts(services, current => {
                return current.wishes === page.total
                    ? current
                    : { ...current, wishes: page.total };
            });
        }
    }, [page?.total, page?.filter]);

    useBottomButton({
        text: LL.wishes.add(),
        onClick: () => {
            nav.push(newWishRoute(config.linkImportEnabled));
        }
    });

    const selectFilter = (next: FilterChoice) => {
        const previous = page?.filter ?? null;
        const ticket = gate.next();

        void runOptimistic({
            apply() {
                list.mutate(current => {
                    return current === undefined
                        ? current
                        : { ...current, filter: next };
                });
            },
            commit() {
                return api.request('setWishFilter', {
                    body: { filter: next }
                });
            },
            rollback() {
                if (gate.isLatest(ticket)) {
                    list.mutate(current => {
                        return current === undefined
                            ? current
                            : { ...current, filter: previous };
                    });
                }
            },
            settle(result) {
                services.updateMe({
                    ...services.session.get().me,
                    wishlistFilter: result.filter
                });

                if (gate.isLatest(ticket)) {
                    void list.reload();
                }
            },
            fail(error) {
                if (gate.isLatest(ticket)) {
                    toast.failure(toFailure(error));
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
            const next = await api.request('listWishes', {
                query: { offset: page.nextOffset }
            });

            list.mutate(current => {
                return current === undefined
                    ? current
                    : appendPage(
                          current,
                          withoutPendingWishes(next),
                          ownWishKey
                      );
            });
        } catch (error) {
            toast.failure(toFailure(error));
        } finally {
            setLoadingMore(false);
        }
    };

    const clean = async () => {
        const texts = LL.wishes.clean;
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
            const { removed } = await api.request('cleanWishes');

            haptics.success();
            list.mutate(current => {
                return current === undefined ? current : emptyPage(current);
            });
            services.cache.invalidate(WISHES_PREFIX);
            updateCounts(services, current => ({ ...current, wishes: 0 }));
            toast.show(
                removed > 0 ? texts.success() : texts.empty(),
                'success'
            );
        } catch (error) {
            toast.failure(toFailure(error));
        } finally {
            setCleaning(false);
        }
    };

    const filter = page?.filter ?? null;
    const items = page?.items ?? [];
    const activeItems = items.filter(wish => wish.gifted !== true);
    const giftedItems = items.filter(wish => wish.gifted === true);
    const nothingAtAll = filter === null || counts?.wishes === 0;
    const refreshing = list.loading && page !== undefined;

    return (
        <ScreenLayout
            id='wishes'
            title={LL.wishes.title()}
            sticky
            busy={page === undefined && list.failure === null}
            {...(page !== undefined &&
                page.total > 0 && {
                    lead: LL.wishes.count({ count: page.total })
                })}
            {...(page !== undefined &&
                (items.length > 0 || filter !== null) && {
                    toolbar: (
                        <div class='filter-row'>
                            <ChipGroup
                                label={LL.filters.title()}
                                options={filterOptions}
                                value={filter}
                                onChange={selectFilter}
                            />
                        </div>
                    )
                })}
            actions={
                <>
                    <button
                        type='button'
                        class='header-icon-button'
                        aria-label={LL.nav.share()}
                        title={LL.nav.share()}
                        onClick={() => {
                            haptics.selection();
                            void nav.navigateTo('share');
                        }}
                    >
                        <Icon icon={Share2} />
                    </button>
                    <OverflowMenu
                        label={LL.common.moreActions()}
                        items={[
                            {
                                id: 'clean',
                                label: LL.wishes.menu.clean(),
                                destructive: true,
                                onSelect: () => {
                                    if (!cleaning) {
                                        void clean();
                                    }
                                }
                            }
                        ]}
                    />
                </>
            }
        >
            {page === undefined ? (
                <LoadingOrError
                    failure={list.failure}
                    onRetry={() => {
                        void list.reload();
                    }}
                />
            ) : (
                <>
                    {activeItems.length > 0 ? null : nothingAtAll ? (
                        <EmptyState
                            title={LL.wishes.empty.title()}
                            text={LL.wishes.empty.text()}
                            action={{
                                label: LL.wishes.empty.cta(),
                                onClick: () => {
                                    nav.push(
                                        newWishRoute(config.linkImportEnabled)
                                    );
                                }
                            }}
                        />
                    ) : (
                        <EmptyState
                            title={LL.wishes.filteredEmpty.title()}
                            text={LL.wishes.filteredEmpty.text()}
                            action={{
                                label: LL.wishes.filteredEmpty.cta(),
                                onClick: () => {
                                    selectFilter(null);
                                }
                            }}
                        />
                    )}
                    {items.length === 0 ? null : (
                        <div
                            class={
                                refreshing
                                    ? 'list-frame list-frame-busy'
                                    : 'list-frame'
                            }
                            aria-busy={String(refreshing)}
                        >
                            <WishGrid label={LL.wishes.title()}>
                                {activeItems.map((wish, index) => {
                                    return (
                                        <WishTag
                                            key={wish.id}
                                            wish={wish}
                                            index={index}
                                            onOpen={() => {
                                                nav.push({
                                                    screen: 'wishEditor',
                                                    wishId: wish.id
                                                });
                                            }}
                                            actions={
                                                <WishQuickToggles wish={wish} />
                                            }
                                        />
                                    );
                                })}
                                {giftedItems.map((wish, index) => {
                                    return (
                                        <WishTag
                                            key={wish.id}
                                            wish={wish}
                                            index={activeItems.length + index}
                                            onOpen={() => {
                                                setGiftedSheetWish(wish);
                                            }}
                                        />
                                    );
                                })}
                            </WishGrid>
                        </div>
                    )}
                    <ShowMore
                        visible={page.nextOffset !== null}
                        loading={loadingMore}
                        onClick={() => {
                            void showMore();
                        }}
                    />
                </>
            )}
            {giftedSheetWish === null ? null : (
                <GiftedSheet
                    wish={giftedSheetWish}
                    onClose={() => {
                        setGiftedSheetWish(null);
                    }}
                    onRestore={wish => {
                        setGiftedSheetWish(null);
                        void giftedActions.restore(wish);
                    }}
                    onHide={wish => {
                        setGiftedSheetWish(null);
                        giftedActions.hide(wish);
                    }}
                />
            )}
        </ScreenLayout>
    );
};
