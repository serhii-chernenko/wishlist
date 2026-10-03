import { Effect } from 'effect';

import type { AppLocale } from '../../bot/i18n';
import { decodeSessionLanguage } from '../../bot/runtime/session-store';
import { createUserService } from '../../bot/services/user-service';
import type { Repositories, UserRecord } from '../../db/repositories';
import {
    toAppPlatform,
    toAppTheme,
    type BootstrapDto
} from '../../shared/app-api';
import { getStartKind } from '../../shared/app-links';
import { appSessionStartedEvent } from '../../worker/telemetry';
import { emitApiTelemetry, type ApiHandler } from '../context';
import {
    buildAppConfig,
    getAppMessages,
    resolveRequestLocale,
    toMeDto
} from '../dto';

const COUNT_PROBE_LIMIT = 1;

const readSessionLanguage = async (
    repos: Repositories,
    telegramUserId: number,
    user: UserRecord | null
): Promise<AppLocale | null> => {
    if (user !== null) {
        return null;
    }

    const session = await Effect.runPromise(repos.sessions.get(telegramUserId));

    return decodeSessionLanguage(session?.language);
};

const readCounts = async (repos: Repositories, user: UserRecord | null) => {
    if (user === null) {
        return null;
    }

    const [wishes, gives] = await Promise.all([
        Effect.runPromise(
            repos.wishes.listOwned(user.id, {
                filter: null,
                offset: 0,
                limit: COUNT_PROBE_LIMIT
            })
        ),
        Effect.runPromise(
            repos.gives.listForGiver(user.id, {
                offset: 0,
                limit: COUNT_PROBE_LIMIT
            })
        )
    ]);

    return { wishes: wishes.total, gives: gives.total };
};

export const bootstrap: ApiHandler = async c => {
    const { actor, deps, repos } = c.var;
    const storedUser = c.var.user;
    const user =
        storedUser === null
            ? null
            : await createUserService({ repos, now: deps.now }).syncProfile(
                  storedUser,
                  actor,
                  'app'
              );
    const sessionLanguage = await readSessionLanguage(repos, actor.id, user);
    const locale = resolveRequestLocale(actor, user, sessionLanguage);
    const body: BootstrapDto = {
        me: toMeDto({ actor, user, sessionLanguage, locale }),
        messages: getAppMessages(locale),
        counts: await readCounts(repos, user),
        config: buildAppConfig(c.env, locale)
    };

    emitApiTelemetry(
        c,
        appSessionStartedEvent({
            platform: toAppPlatform(c.req.query('platform')),
            startKind: getStartKind(
                c.req.query('start') ?? c.var.initData.startParam
            ),
            isGuest: user === null,
            locale,
            theme: toAppTheme(c.req.query('theme'))
        })
    );

    return c.json(body);
};
