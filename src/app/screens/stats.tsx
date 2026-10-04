import { formatCount } from '../logic/format';
import type { ScreenProps } from '../nav/routes';
import { useApp, useAppResource, useLL, useSession } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { isResourcePending, ResourceView } from '../ui/resource-view';

export const StatsScreen = (_props: ScreenProps<'stats'>) => {
    const LL = useLL();
    const { api } = useApp();
    const { locale } = useSession();
    const stats = useAppResource('stats', signal => {
        return api.request('getStats', { signal });
    });

    return (
        <ScreenLayout
            id='stats'
            title={LL.stats.title()}
            busy={isResourcePending(stats)}
        >
            <ResourceView resource={stats} skeletons={3}>
                {data => {
                    const rows = [
                        {
                            id: 'users',
                            value: data.users,
                            label: LL.stats.users()
                        },
                        {
                            id: 'wishes',
                            value: data.wishes,
                            label: LL.stats.wishes()
                        },
                        { id: 'done', value: data.done, label: LL.stats.done() }
                    ];

                    return (
                        <ul class='stats-list'>
                            {rows.map(row => {
                                return (
                                    <li key={row.id} class='note stats-item'>
                                        <div class='note-tag'>
                                            <div class='note-body'>
                                                <p class='stats-value'>
                                                    {formatCount(
                                                        row.value,
                                                        locale
                                                    )}
                                                </p>
                                                <p class='stats-label'>
                                                    {row.label}
                                                </p>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    );
                }}
            </ResourceView>
        </ScreenLayout>
    );
};
