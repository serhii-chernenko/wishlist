import { getReleaseLabels } from '../../bot/content/release-format';
import {
    getReleaseItemText,
    getReleases,
    releaseGroupOrder
} from '../../bot/content/releases';
import { createStatsService } from '../../bot/services/stats-service';
import {
    APP_RELEASES_MAX_LIMIT,
    APP_RELEASES_PAGE_SIZE,
    type ReleaseDto,
    type ReleasesDto,
    type StatsDto
} from '../../shared/app-api';
import { resolveRequestLocale } from '../dto';
import { readOffset, readOptionalQueryInteger } from '../validate';
import type { ApiHandler } from '../context';
import { loadSessionLanguage } from './me';

export const getStats: ApiHandler = async c => {
    const stats: StatsDto = await createStatsService({
        repos: c.var.repos
    }).getPublicStats();

    return c.json(stats);
};

export const listReleases: ApiHandler = async c => {
    const offset = readOffset(c);
    const limit =
        readOptionalQueryInteger(c, 'limit', 1, APP_RELEASES_MAX_LIMIT) ??
        APP_RELEASES_PAGE_SIZE;
    const locale = resolveRequestLocale(
        c.var.actor,
        c.var.user,
        await loadSessionLanguage(c)
    );
    const labels = getReleaseLabels(locale);
    const releases = getReleases();
    const items = releases
        .slice(offset, offset + limit)
        .map((release): ReleaseDto => {
            return {
                version: release.version,
                date: release.date,
                groups: releaseGroupOrder.flatMap(group => {
                    const entries = release.groups[group];

                    return entries?.length
                        ? [
                              {
                                  group,
                                  label: labels[group],
                                  items: entries.map(entry => {
                                      return getReleaseItemText(entry, locale);
                                  })
                              }
                          ]
                        : [];
                })
            };
        });
    const body: ReleasesDto = { items, total: releases.length };

    return c.json(body);
};
