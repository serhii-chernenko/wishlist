import { useState } from 'hono/jsx/dom';

import { APP_RELEASES_PAGE_SIZE, type ReleasesDto } from '../../shared/app-api';
import { formatIsoDate } from '../logic/format';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useLL,
    useSession,
    useToast
} from '../state/context';
import { toFailure } from '../state/store';
import { EmptyState } from '../ui/empty-state';
import { isResourcePending, ResourceView } from '../ui/resource-view';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const ReleasesScreen = (_props: ScreenProps<'releases'>) => {
    const LL = useLL();
    const toast = useToast();
    const { api } = useApp();
    const { locale } = useSession();
    const [loadingMore, setLoadingMore] = useState(false);
    const releases = useAppResource('releases', signal => {
        return api.request('listReleases', {
            query: { offset: 0, limit: APP_RELEASES_PAGE_SIZE },
            signal
        });
    });

    const showMore = async (current: ReleasesDto) => {
        setLoadingMore(true);

        try {
            const page = await api.request('listReleases', {
                query: {
                    offset: current.items.length,
                    limit: APP_RELEASES_PAGE_SIZE
                }
            });

            releases.mutate(cached => {
                return cached === undefined
                    ? cached
                    : {
                          items: [...cached.items, ...page.items],
                          total: page.total
                      };
            });
        } catch (error) {
            toast.failure(toFailure(error));
        }

        setLoadingMore(false);
    };

    return (
        <ScreenLayout
            id='releases'
            title={LL.releases.title()}
            busy={isResourcePending(releases)}
        >
            <ResourceView resource={releases} skeletons={3}>
                {data => {
                    if (data.items.length === 0) {
                        return <EmptyState title={LL.releases.empty()} />;
                    }

                    return (
                        <>
                            <ul class='release-list'>
                                {data.items.map(release => {
                                    return (
                                        <li key={release.version}>
                                            <Tag class='release-card'>
                                                <h2 class='release-version'>
                                                    {LL.releases.version({
                                                        version: release.version
                                                    })}
                                                </h2>
                                                <p class='release-date'>
                                                    {LL.releases.date({
                                                        date: formatIsoDate(
                                                            release.date,
                                                            locale
                                                        )
                                                    })}
                                                </p>
                                                {release.groups.map(group => {
                                                    return (
                                                        <section
                                                            key={group.group}
                                                            class='release-group'
                                                        >
                                                            <h3 class='release-group-title'>
                                                                {group.label}
                                                            </h3>
                                                            <ul class='release-items'>
                                                                {group.items.map(
                                                                    (
                                                                        item,
                                                                        index
                                                                    ) => {
                                                                        return (
                                                                            <li
                                                                                key={`${index}-${item}`}
                                                                            >
                                                                                {
                                                                                    item
                                                                                }
                                                                            </li>
                                                                        );
                                                                    }
                                                                )}
                                                            </ul>
                                                        </section>
                                                    );
                                                })}
                                            </Tag>
                                        </li>
                                    );
                                })}
                            </ul>
                            {data.items.length < data.total ? (
                                <button
                                    type='button'
                                    class='btn release-more'
                                    disabled={loadingMore}
                                    aria-busy={String(loadingMore)}
                                    onClick={() => {
                                        void showMore(data);
                                    }}
                                >
                                    {loadingMore ? (
                                        <span
                                            class='loading loading-spinner loading-sm'
                                            aria-hidden='true'
                                        />
                                    ) : null}
                                    {LL.releases.showMore()}
                                </button>
                            ) : null}
                        </>
                    );
                }}
            </ResourceView>
        </ScreenLayout>
    );
};
