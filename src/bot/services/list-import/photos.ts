import type { TelegramApi } from '../../../api/telegram-api';
import type {
    DrainCandidate,
    PendingPhotoWish
} from '../../../db/repositories';
import {
    LINK_IMPORT_IMAGE_TIMEOUT_MS,
    LIST_IMPORT_LEASE_MS,
    LIST_IMPORT_PHOTO_PACE_MS
} from '../../../shared/app-api';
import {
    isTelegramBadRequest,
    isTelegramTooManyRequests
} from '../../utils/telegram-errors';
import { ingestStagedImage } from '../link-import/ingest';
import { downloadTelegramPhoto } from '../link-import/stage-images';
import type { SafeFetcher, StagedImageBody } from '../link-import/types';
import type {
    ListImportAdapters,
    ListImportDrainRequest,
    ListImportDrainSummary,
    ListImportSourceAdapter
} from './types';

export const DRAIN_USERS_PER_RUN = 50;
export const DRAIN_WISHES_PER_PAGE = 20;

const SOURCE_REF_SEPARATOR = ':';

/** Plain-promise storage the drain needs; the service backs it with the repositories. */
export interface PhotoDrainStore {
    listCandidates(limit: number, userId?: number): Promise<DrainCandidate[]>;
    acquireLease(jobId: number, now: Date, leaseUntil: Date): Promise<boolean>;
    releaseLease(
        jobId: number,
        leaseUntil: Date,
        heldUntil?: Date | null
    ): Promise<void>;
    listPending(userId: number, limit: number): Promise<PendingPhotoWish[]>;
    appendImage(
        wishId: number,
        userId: number,
        fileId: string
    ): Promise<boolean>;
    clearImage(wishId: number, userId: number): Promise<boolean>;
    clearAll(userId: number): Promise<number>;
    touchShare(userId: number, now: Date): Promise<void>;
}

export interface PhotoDrainPorts {
    store: PhotoDrainStore;
    adapters: ListImportAdapters;
    fetcher: SafeFetcher;
    telegram: TelegramApi;
    acquireHostToken(host: string): Promise<boolean>;
    now(): number;
    sleep(milliseconds: number): Promise<void>;
    waitUntil?: (promise: Promise<unknown>) => void;
}

type UserDrainOutcome = 'finished' | 'budget' | 'stopped';

type SendOutcome =
    | { kind: 'sent'; fileId: string }
    | { kind: 'rejected' }
    | { kind: 'forbidden' }
    | { kind: 'stopped' };

interface UserRun {
    ports: PhotoDrainPorts;
    candidate: DrainCandidate;
    deadline: number;
    summary: ListImportDrainSummary;
    hostTokenTaken: boolean;
    lastSentAt: number | null;
    touched: boolean;
}

const acceptsImportedImage = (wish: PendingPhotoWish) => {
    const visible = !wish.removed || (wish.done && !wish.giftedHidden);

    return visible && wish.imageCount === 0;
};

const findAdapter = (
    adapters: ListImportAdapters,
    sourceRef: string | null
): ListImportSourceAdapter | null => {
    const [source] = (sourceRef ?? '').split(SOURCE_REF_SEPARATOR);

    return (
        Object.values(adapters).find(adapter => {
            return adapter.source === source;
        }) ?? null
    );
};

const toAllowedCandidates = (
    adapter: ListImportSourceAdapter,
    rawImageUrl: string
) => {
    return adapter.photoCandidates(rawImageUrl).filter(candidate => {
        try {
            return adapter.imageHosts.includes(new URL(candidate).hostname);
        } catch {
            return false;
        }
    });
};

const hostOf = (url: string) => {
    return new URL(url).hostname;
};

const remainingMs = (run: UserRun) => {
    return run.deadline - run.ports.now();
};

const hasTimeForOnePhoto = (run: UserRun) => {
    return (
        remainingMs(run) >=
        LINK_IMPORT_IMAGE_TIMEOUT_MS + LIST_IMPORT_PHOTO_PACE_MS
    );
};

const downloadFirstCandidate = async (
    run: UserRun,
    candidates: readonly string[]
): Promise<StagedImageBody | null> => {
    for (const candidate of candidates) {
        const downloaded = await downloadTelegramPhoto(
            run.ports.fetcher,
            candidate,
            Math.min(
                LINK_IMPORT_IMAGE_TIMEOUT_MS,
                Math.max(0, remainingMs(run))
            )
        );

        if (downloaded.ok) {
            return downloaded.image;
        }

        if (downloaded.reason === 'unsupportedFormat') {
            return null;
        }
    }

    return null;
};

const waitForPace = async (run: UserRun) => {
    if (run.lastSentAt === null) {
        return;
    }

    const waitMs = run.lastSentAt + LIST_IMPORT_PHOTO_PACE_MS - run.ports.now();

    if (waitMs > 0) {
        await run.ports.sleep(waitMs);
    }
};

const observeSendPhotoErrors = (api: TelegramApi) => {
    const observed: { error: unknown } = { error: undefined };
    const observedApi: TelegramApi = {
        ...api,
        async sendPhoto(chatId, photo, extra) {
            try {
                return await api.sendPhoto(chatId, photo, extra);
            } catch (error) {
                observed.error = error;
                throw error;
            }
        }
    };

    return { observed, observedApi };
};

const sendPhoto = async (
    run: UserRun,
    image: StagedImageBody
): Promise<SendOutcome> => {
    await waitForPace(run);

    const { observed, observedApi } = observeSendPhotoErrors(
        run.ports.telegram
    );
    const result = await ingestStagedImage(observedApi, {
        chatId: run.candidate.telegramId,
        image,
        ...(run.ports.waitUntil === undefined
            ? {}
            : { waitUntil: run.ports.waitUntil })
    });

    run.lastSentAt = run.ports.now();

    if (result.ok) {
        return { kind: 'sent', fileId: result.fileId };
    }

    if (result.reason === 'writeAccessRequired') {
        return { kind: 'forbidden' };
    }

    if (isTelegramTooManyRequests(observed.error)) {
        return { kind: 'stopped' };
    }

    return observed.error === undefined || isTelegramBadRequest(observed.error)
        ? { kind: 'rejected' }
        : { kind: 'stopped' };
};

const clearWishImage = async (run: UserRun, wish: PendingPhotoWish) => {
    const cleared = await run.ports.store.clearImage(
        wish.id,
        run.candidate.userId
    );

    run.touched = run.touched || cleared;
};

const clearAllWishImages = async (run: UserRun) => {
    const cleared = await run.ports.store.clearAll(run.candidate.userId);

    run.touched = run.touched || cleared > 0;
};

const failWish = async (run: UserRun, wish: PendingPhotoWish) => {
    await clearWishImage(run, wish);
    run.summary.failed += 1;
};

const takeHostToken = async (run: UserRun, candidate: string) => {
    if (run.hostTokenTaken) {
        return true;
    }

    const allowed = await run.ports.acquireHostToken(hostOf(candidate));

    run.hostTokenTaken = allowed;

    return allowed;
};

type WishOutcome = 'next' | 'forbidden' | 'stopped';

const drainWish = async (
    run: UserRun,
    wish: PendingPhotoWish
): Promise<WishOutcome> => {
    const { store } = run.ports;
    const { userId } = run.candidate;
    const adapter = findAdapter(run.ports.adapters, wish.sourceRef);

    if (!acceptsImportedImage(wish) || adapter === null) {
        await clearWishImage(run, wish);

        return 'next';
    }

    const candidates = toAllowedCandidates(adapter, wish.sourceImageUrl);
    const [firstCandidate] = candidates;

    if (firstCandidate === undefined) {
        await failWish(run, wish);

        return 'next';
    }

    if (!(await takeHostToken(run, firstCandidate))) {
        return 'stopped';
    }

    const image = await downloadFirstCandidate(run, candidates);

    if (image === null) {
        await failWish(run, wish);

        return 'next';
    }

    const sent = await sendPhoto(run, image);

    if (sent.kind === 'forbidden' || sent.kind === 'stopped') {
        return sent.kind;
    }

    if (sent.kind === 'rejected') {
        await failWish(run, wish);

        return 'next';
    }

    if (await store.appendImage(wish.id, userId, sent.fileId)) {
        run.summary.ingested += 1;
        run.touched = true;
    } else {
        await clearWishImage(run, wish);
    }

    return 'next';
};

const drainUserWishes = async (run: UserRun): Promise<UserDrainOutcome> => {
    const { store } = run.ports;
    const { userId } = run.candidate;

    if (run.candidate.blocked) {
        await clearAllWishImages(run);

        return 'finished';
    }

    for (;;) {
        const pending = await store.listPending(userId, DRAIN_WISHES_PER_PAGE);

        if (pending.length === 0) {
            return 'finished';
        }

        for (const wish of pending) {
            if (!hasTimeForOnePhoto(run)) {
                return 'budget';
            }

            const outcome = await drainWish(run, wish);

            if (outcome === 'forbidden') {
                await clearAllWishImages(run);

                return 'finished';
            }

            if (outcome === 'stopped') {
                return 'stopped';
            }
        }
    }
};

const toHeldUntil = (
    ports: PhotoDrainPorts,
    startedAt: number,
    holdLeaseMs: number | undefined
) => {
    const heldUntil = startedAt + (holdLeaseMs ?? 0);

    return holdLeaseMs !== undefined && heldUntil > ports.now()
        ? new Date(heldUntil)
        : null;
};

const drainUser = async (
    ports: PhotoDrainPorts,
    candidate: DrainCandidate,
    deadline: number,
    summary: ListImportDrainSummary,
    holdLeaseMs: number | undefined
): Promise<UserDrainOutcome | 'locked'> => {
    const startedAt = ports.now();
    const leaseUntil = new Date(deadline + LIST_IMPORT_LEASE_MS);

    if (
        !(await ports.store.acquireLease(
            candidate.leaseJobId,
            new Date(startedAt),
            leaseUntil
        ))
    ) {
        return 'locked';
    }

    const run: UserRun = {
        ports,
        candidate,
        deadline,
        summary,
        hostTokenTaken: false,
        lastSentAt: null,
        touched: false
    };

    try {
        return await drainUserWishes(run);
    } finally {
        if (run.touched) {
            await ports.store.touchShare(
                candidate.userId,
                new Date(ports.now())
            );
        }

        await ports.store.releaseLease(
            candidate.leaseJobId,
            leaseUntil,
            toHeldUntil(ports, startedAt, holdLeaseMs)
        );
    }
};

/**
 * Downloads the cover photo of imported wishes and re-uploads it to Telegram,
 * one user at a time under a lease on that user's oldest finished import, a
 * row that stays the same while newer imports finish, so two runs never drain
 * one user at once. Only users with such an import row are drained, so wishes copied from
 * production into preview with a pending URL but no job are never touched.
 * Uploads to one chat stay `LIST_IMPORT_PHOTO_PACE_MS` apart. A failed or
 * unsupported image clears that wish's URL, a 403 or a blocked user clears all
 * of the user's pending photos, and the host limiter, a Telegram 429 or any
 * other transient Telegram error stops the run and leaves the URLs for later.
 */
export const drainPendingPhotos = async (
    ports: PhotoDrainPorts,
    request: Pick<ListImportDrainRequest, 'budgetMs' | 'userId' | 'holdLeaseMs'>
): Promise<ListImportDrainSummary> => {
    const deadline = ports.now() + request.budgetMs;
    const summary: ListImportDrainSummary = {
        result: 'drained',
        ingested: 0,
        failed: 0
    };
    const candidates = await ports.store.listCandidates(
        DRAIN_USERS_PER_RUN,
        request.userId
    );

    if (candidates.length === 0) {
        return { ...summary, result: 'idle' };
    }

    for (const candidate of candidates) {
        if (ports.now() >= deadline) {
            return { ...summary, result: 'budget' };
        }

        const outcome = await drainUser(
            ports,
            candidate,
            deadline,
            summary,
            request.holdLeaseMs
        );

        if (outcome === 'stopped') {
            return { ...summary, result: 'rateLimited' };
        }

        if (outcome === 'budget') {
            return { ...summary, result: 'budget' };
        }
    }

    return summary;
};
