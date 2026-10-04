import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createListImportService } from '../src/bot/services/list-import/list-import-service';
import type { ListImportStore } from '../src/bot/services/list-import/store';
import type { ListImportDeps } from '../src/bot/services/list-import/types';
import type { PendingPhotoWish } from '../src/db/repositories';
import type { TelemetryFields } from '../src/worker/telemetry';

const PENDING_WISH: PendingPhotoWish = {
    id: 1,
    sourceRef: 'rewish:wish:1',
    sourceImageUrl: 'https://evil.test/cover.jpg',
    removed: false,
    done: false,
    giftedHidden: false,
    imageCount: 0
};

interface HarnessOptions {
    hasCandidate: boolean;
    leaseAvailable?: boolean;
    pending?: PendingPhotoWish[];
}

const buildHarness = (options: HarnessOptions) => {
    let pending = options.pending ?? [];
    const events: TelemetryFields[] = [];
    const store = {
        jobs: {
            listDrainCandidates: async () => {
                return options.hasCandidate
                    ? [
                          {
                              userId: 1,
                              telegramId: 1001,
                              blocked: false,
                              leaseJobId: 10
                          }
                      ]
                    : [];
            },
            acquireDrainLease: async () => {
                return options.leaseAvailable ?? true;
            },
            releaseDrainLease: async () => undefined,
            touchShare: async () => undefined
        },
        wishes: {
            listPendingPhotos: async () => {
                return pending;
            },
            clearSourceImage: async () => {
                pending = [];

                return true;
            },
            clearAllSourceImages: async () => 0,
            appendImportedImage: async () => false
        },
        users: {}
    } as unknown as ListImportStore;
    const service = createListImportService({
        createStore: () => store,
        emitTelemetry: (_env, _context, fields) => {
            events.push(fields);
        }
    });
    const deps: ListImportDeps = {
        env: {} as ListImportDeps['env'],
        telegram: {} as NonNullable<ListImportDeps['telegram']>,
        now: () => 1_000_000
    };

    return { events, service, deps };
};

describe('photo drain telemetry', () => {
    it('skips the event for a kick with no pending photos', async () => {
        const { events, service, deps } = buildHarness({ hasCandidate: false });

        await service.drainPhotos(deps, { budgetMs: 1000, trigger: 'kick' });

        assert.equal(events.length, 0);
    });

    it('skips the event for a kick throttled by a held lease', async () => {
        const { events, service, deps } = buildHarness({
            hasCandidate: true,
            leaseAvailable: false
        });

        await service.drainPhotos(deps, { budgetMs: 1000, trigger: 'kick' });

        assert.equal(events.length, 0);
    });

    it('skips the event for a kick that found nothing to drain for the user', async () => {
        const { events, service, deps } = buildHarness({ hasCandidate: true });

        await service.drainPhotos(deps, { budgetMs: 1000, trigger: 'kick' });

        assert.equal(events.length, 0);
    });

    it('emits the event for a kick that cleared a failed photo', async () => {
        const { events, service, deps } = buildHarness({
            hasCandidate: true,
            pending: [PENDING_WISH]
        });

        await service.drainPhotos(deps, { budgetMs: 1000, trigger: 'kick' });

        assert.equal(events.length, 1);
        assert.equal(events[0]?.event, 'list_import_photos_drained');
        assert.equal(events[0]?.trigger, 'kick');
    });

    it('still emits the event for an idle cron run', async () => {
        const { events, service, deps } = buildHarness({ hasCandidate: false });

        await service.drainPhotos(deps, { budgetMs: 1000, trigger: 'cron' });

        assert.equal(events.length, 1);
        assert.equal(events[0]?.trigger, 'cron');
    });
});
