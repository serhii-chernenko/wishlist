import type { ListImportSourceAdapter, SourceFetchResult } from '../types';
import {
    fetchRewishCollection,
    fetchRewishProfile,
    REWISH_API_HOSTS
} from './client';
import {
    mapRewishCollection,
    mapRewishWishes,
    orderSourceItems,
    REWISH_IMAGE_HOSTS,
    rewishPhotoCandidates
} from './map';

const toResult = (
    kind: 'wishes' | 'collection',
    groups: Parameters<typeof orderSourceItems>[0]
): SourceFetchResult => {
    const items = orderSourceItems(groups);

    return items.length === 0
        ? { ok: false, outcome: 'empty' }
        : { ok: true, kind, items };
};

export const rewishAdapter: ListImportSourceAdapter = {
    source: 'rewish',
    apiHosts: REWISH_API_HOSTS,
    imageHosts: REWISH_IMAGE_HOSTS,
    async fetchItems(context, url) {
        if (url.kind === 'collection') {
            const collection = await fetchRewishCollection(context, url);

            return collection.ok
                ? toResult('collection', [
                      mapRewishCollection(collection.value)
                  ])
                : collection;
        }

        const profile = await fetchRewishProfile(context, url);

        if (!profile.ok) {
            return profile;
        }

        return toResult(
            'wishes',
            profile.value.lists.map(list => {
                return mapRewishWishes(list.wishes);
            })
        );
    },
    photoCandidates: rewishPhotoCandidates
};
