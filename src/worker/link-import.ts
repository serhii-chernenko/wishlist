import type { BotLinkImport } from '../bot/runtime/types';
import { collectPageSignals } from '../bot/services/link-import/collect';
import { extractProduct } from '../bot/services/link-import/extract';
import { sendBotImportPreview } from '../bot/services/link-import/ingest';
import {
    createLinkImportServices,
    type LinkImportImplementations,
    type LinkImportServiceSet
} from '../bot/services/link-import/link-import-service';
import {
    hashImportUrl,
    normalizeImportUrl
} from '../bot/services/link-import/normalize-url';
import { createSafeFetcher } from '../bot/services/link-import/safe-fetch';
import { isLinkImportEnabled, type WorkerBindings } from './env';

const DEFAULT_IMPLEMENTATIONS: LinkImportImplementations = {
    createSafeFetcher,
    collectPageSignals,
    extractProduct,
    normalizeImportUrl,
    hashImportUrl
};

/**
 * Builds the link import services from the production fetch, collect and
 * extract functions. The services hold no per-request state: the env, clock
 * and `waitUntil` arrive with every call, so one instance serves the Worker.
 */
export const createWorkerLinkImport = (
    overrides: Partial<LinkImportImplementations> = {}
): LinkImportServiceSet => {
    return createLinkImportServices({
        ...DEFAULT_IMPLEMENTATIONS,
        ...overrides
    });
};

/** The bot's view of the services, or nothing while `LINK_IMPORT_ENABLED` is off. */
export const toBotLinkImport = (
    env: Pick<WorkerBindings, 'LINK_IMPORT_ENABLED'>,
    services: LinkImportServiceSet | undefined
): BotLinkImport | undefined => {
    if (services === undefined || !isLinkImportEnabled(env)) {
        return undefined;
    }

    return {
        run: services.run,
        stageImages: services.stageImages,
        loadStagedImage: services.loadStagedImage,
        toDraft: services.toImportedDraft,
        sendPreview: sendBotImportPreview
    };
};
