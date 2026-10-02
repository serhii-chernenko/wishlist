import type { AppDb } from '../client';
import { createGiveRepository } from './give-repository';
import { createReleaseAnnouncementRepository } from './release-announcement-repository';
import { createSessionRepository } from './session-repository';
import { createStatsRepository } from './stats-repository';
import { createTelegramUpdateRepository } from './telegram-update-repository';
import { createUserRepository } from './user-repository';
import { createWishRepository } from './wish-repository';

export const createRepositories = (db: AppDb) => {
    return {
        users: createUserRepository(db),
        wishes: createWishRepository(db),
        gives: createGiveRepository(db),
        sessions: createSessionRepository(db),
        telegramUpdates: createTelegramUpdateRepository(db),
        releaseAnnouncements: createReleaseAnnouncementRepository(db),
        stats: createStatsRepository(db)
    };
};

export type Repositories = ReturnType<typeof createRepositories>;

export type {
    GiveListEntry,
    GiveListPage,
    GiveRecord
} from './give-repository';
export type { SessionRecord, SessionLanguage } from './session-repository';
export type { PublicStats, StatsSnapshot } from './stats-repository';
export type {
    NewUser,
    ProfileSyncInput,
    SearchableUserQuery,
    UserLanguage,
    UserRecord,
    VisibilityInput
} from './user-repository';
export type {
    WishFieldsPatch,
    WishListOptions,
    WishPage,
    WishRecord
} from './wish-repository';
export { priceFilterRanges } from './wish-repository';
