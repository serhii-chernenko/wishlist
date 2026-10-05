import { useEffect, useState } from 'hono/jsx/dom';

import type {
    OwnerContactDto,
    OwnerDto,
    SharedWishDto,
    ThirdWishDto,
    WishFilterValue
} from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { failureMessage } from '../i18n/messages';
import { hasErrorCode, type AppFailure } from '../logic/errors';
import { hasPendingPhotos } from '../logic/photo-pending';
import {
    describePriceFilter,
    selectPriceFilters,
    type PriceFilterLabel
} from '../logic/format';
import {
    describeGivers,
    nextGiveAction,
    removeWish,
    replaceWish,
    withGiveAction
} from '../logic/givers';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    useNav,
    useSession
} from '../state/context';
import { usePendingPhotoPolling } from '../state/photo-polling';
import { toFailure } from '../state/store';
import { haptics } from '../telegram/haptics';
import { ChipGroup, type ChipOption } from '../ui/chips';
import { ContactRows, Envelope } from '../ui/envelope';
import { TagSkeletons } from '../ui/skeleton';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';
import { WishGrid, WishTag } from '../ui/wish-tag';
import { refreshGives } from './gives';
import { WishDetailsSheet } from './wish-details-sheet';

interface ThirdListData {
    items: ThirdWishDto[];
    total: number;
    nextOffset: number | null;
    payments: string | null;
    contact: OwnerContactDto | null;
    gifted: SharedWishDto[];
    giftedTotal: number;
}

const NO_GIFTED: SharedWishDto[] = [];

const SHARED_STALE_MS = 5 * 60 * 1000;

const describeFilterLabel = (LL: AppTranslator, label: PriceFilterLabel) => {
    switch (label.kind) {
        case 'upTo':
            return LL.filters.upTo({ amount: label.amount });
        case 'from':
            return LL.filters.from({ amount: label.amount });
        case 'range':
            return LL.filters.range({ from: label.from, to: label.to });
        default:
            return LL.filters.all();
    }
};

const describeGiversText = (
    LL: AppTranslator,
    givers: ThirdWishDto['givers']
) => {
    const line = describeGivers(givers);

    if (line === null) {
        return '';
    }

    return line.key === 'you'
        ? LL.third.givers.you()
        : LL.third.givers[line.key]({ count: line.count });
};

const ThirdFailure = ({
    failure,
    onRetry
}: {
    failure: AppFailure;
    onRetry: () => void;
}) => {
    const LL = useLL();
    const nav = useNav();
    const needsNewSearch = hasErrorCode(
        failure,
        'tokenInvalid',
        'tokenExpired',
        'notFound',
        'shareGone'
    );

    return (
        <Tag class='state-tag'>
            <p class='state-text' role='alert'>
                {hasErrorCode(failure, 'notFound')
                    ? LL.errors.listUnavailable()
                    : failureMessage(LL, failure)}
            </p>
            {needsNewSearch ? (
                <button
                    type='button'
                    class='btn btn-primary'
                    onClick={() => {
                        void nav.navigateTo('find', 'replace');
                    }}
                >
                    {LL.third.searchAgain()}
                </button>
            ) : (
                <button type='button' class='btn' onClick={onRetry}>
                    {LL.common.retry()}
                </button>
            )}
        </Tag>
    );
};

const OwnerHeader = ({
    owner,
    total,
    giftedTotal
}: {
    owner: OwnerDto;
    total: number | null;
    giftedTotal: number;
}) => {
    const LL = useLL();

    return (
        <Tag class='third-header'>
            {owner.label === '' ? null : (
                <p class='third-label'>{owner.label}</p>
            )}
            {total === null ? null : (
                <p class='third-count'>
                    {giftedTotal > 0
                        ? LL.third.countWithGifted({
                              active: total,
                              gifted: giftedTotal
                          })
                        : LL.third.count({ count: total })}
                </p>
            )}
        </Tag>
    );
};

const OwnerEnvelope = ({
    payments,
    contact
}: {
    payments: string | null;
    contact: OwnerContactDto | null;
}) => {
    const LL = useLL();

    if (payments === null && contact === null) {
        return null;
    }

    return (
        <Envelope
            title={
                payments === null
                    ? LL.contact.title()
                    : LL.third.payments.title()
            }
        >
            {payments === null ? null : (
                <>
                    <p>{LL.third.payments.text()}</p>
                    <p class='third-payments-text'>{payments}</p>
                </>
            )}
            {contact === null ? null : <ContactRows contact={contact} />}
        </Envelope>
    );
};

export const ThirdListScreen = ({ route }: ScreenProps<'thirdList'>) => {
    const { source } = route;
    const LL = useLL();
    const nav = useNav();
    const services = useApp();
    const { api, toast } = services;
    const { locale, config, me } = useSession();
    const publicId = source.kind === 'share' ? source.publicId : null;
    const [filter, setFilter] = useState<WishFilterValue | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [detailsId, setDetailsId] = useState<number | null>(null);
    const [pendingGives] = useState(() => new Set<number>());

    const shared = useAppResource(
        publicId === null ? null : `third:share:${publicId}`,
        signal => {
            return api.request('openSharedList', {
                params: { publicId: publicId ?? '' },
                signal
            });
        },
        SHARED_STALE_MS
    );
    const opensOwnList = shared.data?.ownList === true;
    const owner =
        source.kind === 'owner'
            ? source.owner
            : opensOwnList
              ? null
              : (shared.data?.owner ?? null);

    useEffect(() => {
        if (opensOwnList) {
            nav.replace({ screen: 'wishes' });
        }
    }, [opensOwnList]);
    const token = owner?.token ?? null;
    const list = useAppResource(
        token === null ? null : `third:list:${token}:${filter ?? 'all'}`,
        async (signal): Promise<ThirdListData> => {
            const page = await api.request('listOwnerWishes', {
                params: { token: token ?? '' },
                query: filter === null ? {} : { filter },
                signal
            });

            return {
                items: page.items,
                total: page.total,
                nextOffset: page.nextOffset,
                payments: page.owner.payments,
                contact: page.owner.contact,
                gifted: page.gifted ?? NO_GIFTED,
                giftedTotal: page.giftedTotal
            };
        }
    );

    const preview = shared.data?.preview ?? null;
    const payments = list.data?.payments ?? owner?.payments ?? null;
    const contact = list.data?.contact ?? owner?.contact ?? null;
    const viewOnly = owner !== null && token === null;
    const visibleItems: ReadonlyArray<ThirdWishDto | SharedWishDto> = viewOnly
        ? (preview?.items ?? [])
        : (list.data?.items ?? []);
    const total = viewOnly ? (preview?.total ?? 0) : (list.data?.total ?? null);
    const nextOffset = viewOnly
        ? (preview?.nextOffset ?? null)
        : (list.data?.nextOffset ?? null);
    const giftedItems = viewOnly
        ? (shared.data?.gifted ?? NO_GIFTED)
        : (list.data?.gifted ?? NO_GIFTED);
    const giftedTotal = viewOnly
        ? (shared.data?.giftedTotal ?? 0)
        : (list.data?.giftedTotal ?? 0);
    const photosPending =
        hasPendingPhotos(visibleItems) || hasPendingPhotos(giftedItems);

    usePendingPhotoPolling(photosPending, () => {
        void (viewOnly ? shared.reload() : list.reload());
    });

    const headerFailure = owner === null ? shared.failure : null;
    const pending =
        owner === null
            ? shared.failure === null
            : !viewOnly && list.data === undefined && list.failure === null;

    const toggleGive = async (wish: ThirdWishDto) => {
        if (token === null || pendingGives.has(wish.id)) {
            return;
        }

        const action = nextGiveAction(wish.givers);

        pendingGives.add(wish.id);
        haptics.impact('light');
        list.mutate(cached => {
            return cached === undefined
                ? cached
                : {
                      ...cached,
                      items: withGiveAction(cached.items, wish.id, action)
                  };
        });

        try {
            if (action === 'give') {
                const settled = await api.request('giveWish', {
                    params: { token, wishId: wish.id }
                });

                list.mutate(cached => {
                    return cached === undefined
                        ? cached
                        : {
                              ...cached,
                              items: replaceWish(cached.items, settled)
                          };
                });
            } else {
                await api.request('removeGive', {
                    params: { wishId: wish.id }
                });
            }

            refreshGives(services);
            toast.show(
                action === 'give' ? LL.third.given() : LL.third.taken(),
                'success'
            );
        } catch (error) {
            const failure = toFailure(error);

            if (action === 'give' && hasErrorCode(failure, 'notFound')) {
                list.mutate(cached => {
                    return cached === undefined
                        ? cached
                        : {
                              ...cached,
                              items: removeWish(cached.items, wish.id),
                              total: Math.max(0, cached.total - 1)
                          };
                });
                haptics.error();
                toast.show(LL.errors.notFound(), 'error');
            } else {
                list.mutate(cached => {
                    return cached === undefined
                        ? cached
                        : {
                              ...cached,
                              items: replaceWish(cached.items, wish)
                          };
                });
                toast.failure(failure);
            }
        }

        pendingGives.delete(wish.id);
    };

    const showMore = async () => {
        if (nextOffset === null || owner === null) {
            return;
        }

        setLoadingMore(true);

        try {
            if (token === null) {
                const page = await api.request('openSharedList', {
                    params: { publicId: publicId ?? '' },
                    query: { offset: nextOffset }
                });
                const more = page.preview;

                shared.mutate(cached => {
                    return cached === undefined ||
                        cached.preview === null ||
                        more === null
                        ? cached
                        : {
                              ...cached,
                              preview: {
                                  items: [
                                      ...cached.preview.items,
                                      ...more.items
                                  ],
                                  total: more.total,
                                  nextOffset: more.nextOffset
                              },
                              gifted: page.gifted ?? NO_GIFTED,
                              giftedTotal: page.giftedTotal
                          };
                });
            } else {
                const page = await api.request('listOwnerWishes', {
                    params: { token },
                    query:
                        filter === null
                            ? { offset: nextOffset }
                            : { offset: nextOffset, filter }
                });

                list.mutate(cached => {
                    return cached === undefined
                        ? cached
                        : {
                              items: [...cached.items, ...page.items],
                              total: page.total,
                              nextOffset: page.nextOffset,
                              payments: page.owner.payments,
                              contact: cached.contact,
                              gifted: page.gifted ?? NO_GIFTED,
                              giftedTotal: page.giftedTotal
                          };
                });
            }
        } catch (error) {
            toast.failure(toFailure(error));
        }

        setLoadingMore(false);
    };

    const filterOptions: ChipOption<WishFilterValue | null>[] = [
        { value: null, label: LL.filters.all() },
        ...selectPriceFilters(config.priceFilters, me.currency).map(
            priceFilter => {
                return {
                    value: priceFilter.filter as WishFilterValue,
                    label: describeFilterLabel(
                        LL,
                        describePriceFilter(priceFilter, locale, me.currency)
                    )
                };
            }
        )
    ];

    const renderGiveButton = (
        wish: ThirdWishDto | SharedWishDto,
        afterToggle?: () => void
    ) => {
        if (!('givers' in wish) || wish.gifted === true) {
            return undefined;
        }

        const action = nextGiveAction(wish.givers);
        const label = action === 'take' ? LL.third.take() : LL.third.give();

        return (
            <button
                type='button'
                class={
                    action === 'take'
                        ? 'btn third-give'
                        : 'btn btn-primary third-give'
                }
                aria-label={`${label}: ${wish.title}`}
                onClick={() => {
                    void toggleGive(wish);
                    afterToggle?.();
                }}
            >
                {label}
            </button>
        );
    };

    const renderWish = (wish: ThirdWishDto | SharedWishDto, index: number) => {
        const givers =
            'givers' in wish && wish.gifted !== true ? wish.givers : null;
        const giveButton = renderGiveButton(wish);

        return (
            <WishTag
                key={wish.id}
                wish={wish}
                index={index}
                onOpen={() => {
                    setDetailsId(wish.id);
                }}
                badges={
                    <>
                        {wish.description === null ? null : (
                            <p class='wish-text third-description'>
                                {wish.description}
                            </p>
                        )}
                        {givers === null ? null : (
                            <p class='third-givers' aria-live='polite'>
                                {describeGiversText(LL, givers)}
                            </p>
                        )}
                    </>
                }
                actions={giveButton}
            />
        );
    };

    const closeDetails = () => {
        setDetailsId(null);
    };

    const detailsWish =
        detailsId === null
            ? undefined
            : [...visibleItems, ...giftedItems].find(wish => {
                  return wish.id === detailsId;
              });

    const listFailure = viewOnly ? null : list.failure;
    const shownGifted = nextOffset === null ? giftedItems : NO_GIFTED;
    const onlyGifted =
        visibleItems.length === 0 &&
        filter === null &&
        giftedTotal > 0 &&
        (viewOnly || list.data !== undefined);

    return (
        <ScreenLayout
            id='thirdList'
            title={LL.third.title()}
            busy={pending}
            sticky={owner !== null}
            {...(owner !== null && {
                summary: (
                    <OwnerHeader
                        owner={owner}
                        total={total}
                        giftedTotal={giftedTotal}
                    />
                )
            })}
            {...(owner !== null &&
                !viewOnly && {
                    toolbar: (
                        <div class='filter-row'>
                            <ChipGroup
                                label={LL.filters.title()}
                                options={filterOptions}
                                value={filter}
                                onChange={setFilter}
                            />
                        </div>
                    )
                })}
        >
            {headerFailure !== null ? (
                <ThirdFailure
                    failure={headerFailure}
                    onRetry={() => {
                        void shared.reload();
                    }}
                />
            ) : null}
            {owner === null ? (
                headerFailure === null ? (
                    <TagSkeletons count={2} hero />
                ) : null
            ) : (
                <>
                    <OwnerEnvelope payments={payments} contact={contact} />
                    {viewOnly ? (
                        <Tag class='third-view-only'>
                            <p role='note'>{LL.third.viewOnly()}</p>
                            <button
                                type='button'
                                class='btn'
                                onClick={() => {
                                    void nav.navigateTo('find');
                                }}
                            >
                                {LL.third.searchAgain()}
                            </button>
                        </Tag>
                    ) : null}
                    {listFailure !== null && list.data === undefined ? (
                        <ThirdFailure
                            failure={listFailure}
                            onRetry={() => {
                                void list.reload();
                            }}
                        />
                    ) : null}
                    {!viewOnly &&
                    list.data === undefined &&
                    listFailure === null ? (
                        <TagSkeletons count={2} />
                    ) : null}
                    {onlyGifted ? (
                        <Tag class='state-tag'>
                            <p class='state-text'>{LL.third.noActive()}</p>
                        </Tag>
                    ) : null}
                    {visibleItems.length > 0 || shownGifted.length > 0 ? (
                        <WishGrid label={LL.third.title()}>
                            {visibleItems.map((wish, index) => {
                                return renderWish(wish, index);
                            })}
                            {shownGifted.map((wish, index) => {
                                return renderWish(
                                    wish,
                                    visibleItems.length + index
                                );
                            })}
                        </WishGrid>
                    ) : null}
                    {visibleItems.length === 0 &&
                    !onlyGifted &&
                    (viewOnly || list.data !== undefined) ? (
                        <Tag class='state-tag'>
                            <p class='state-text'>
                                {filter === null
                                    ? LL.third.empty()
                                    : LL.third.filteredEmpty()}
                            </p>
                        </Tag>
                    ) : null}
                    {nextOffset === null ? null : (
                        <button
                            type='button'
                            class='btn third-more'
                            disabled={loadingMore}
                            aria-busy={String(loadingMore)}
                            onClick={() => {
                                void showMore();
                            }}
                        >
                            {loadingMore ? (
                                <span
                                    class='loading loading-spinner loading-sm'
                                    aria-hidden='true'
                                />
                            ) : null}
                            {LL.common.showMore()}
                        </button>
                    )}
                </>
            )}
            {detailsWish === undefined ? null : (
                <WishDetailsSheet
                    wish={detailsWish}
                    onClose={closeDetails}
                    action={renderGiveButton(detailsWish, closeDetails)}
                />
            )}
        </ScreenLayout>
    );
};
