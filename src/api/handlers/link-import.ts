import { LINK_MAX_LENGTH } from '../../bot/input/limits';
import { isRenderableLink } from '../../bot/input/link';
import { toLinkImportCompletedInput } from '../../bot/services/link-import/link-import-service';
import { resolveShop } from '../../bot/services/link-import/shop';
import type {
    LinkImportResult,
    StageImagesOutcome
} from '../../bot/services/link-import/types';
import {
    LINK_IMPORT_HANDLER_BUDGET_MS,
    LINK_IMPORT_IMAGE_BUDGET_MS,
    LINK_IMPORT_MAX_IMAGE_CANDIDATES,
    LINK_IMPORT_PRESELECTED_IMAGES,
    type LinkImportDto,
    type LinkImportImageDto
} from '../../shared/app-api';
import { linkImportCompletedEvent } from '../../worker/telemetry';
import {
    emitApiTelemetry,
    getImportSigner,
    getLinkImportDeps,
    getTelemetryContext,
    requireLinkImportServices,
    requireUser,
    runInBackground,
    type ApiContext,
    type ApiHandler,
    type LinkImportServices
} from '../context';
import { createBodyReader, readJsonBody, validationError } from '../validate';

const readLinkInput = async (c: ApiContext) => {
    const reader = createBodyReader(await readJsonBody(c));
    const url = reader.requiredString('url', { maxLength: LINK_MAX_LENGTH });

    reader.finish();

    if (url === undefined || !isRenderableLink(url)) {
        throw validationError('url', 'invalid');
    }

    return url;
};

const toTimedOutResult = (url: string): LinkImportResult => {
    return {
        outcome: 'timeout',
        product: null,
        normalizedUrl: null,
        host: null,
        urlHash: null,
        shop: resolveShop(new URL(url).hostname),
        cache: 'miss',
        elapsedMs: LINK_IMPORT_HANDLER_BUDGET_MS
    };
};

const runWithinBudget = async (
    c: ApiContext,
    services: LinkImportServices,
    url: string
): Promise<LinkImportResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<null>(resolve => {
        timer = setTimeout(() => {
            resolve(null);
        }, LINK_IMPORT_HANDLER_BUDGET_MS);
    });
    const running = services.run(getLinkImportDeps(c), {
        url,
        channel: 'app'
    });

    try {
        const winner = await Promise.race([running, budget]);

        if (winner !== null) {
            return winner;
        }

        const context = getTelemetryContext(c);

        if (context) {
            context.waitUntil(running.catch(() => undefined));
        } else {
            running.catch(() => undefined);
        }

        return toTimedOutResult(url);
    } finally {
        clearTimeout(timer);
    }
};

const NOTHING_STAGED: StageImagesOutcome = { staged: [], skipped: [] };

const emitCompleted = (
    c: ApiContext,
    result: LinkImportResult,
    staging: StageImagesOutcome
) => {
    emitApiTelemetry(
        c,
        linkImportCompletedEvent({
            channel: 'app',
            ...toLinkImportCompletedInput(result, {
                staged: staging.staged.length,
                skipped: staging.skipped.length,
                ingested: 0
            })
        })
    );
};

const stageThenEmit = async (
    c: ApiContext,
    services: LinkImportServices,
    result: LinkImportResult,
    urlHash: string,
    imageUrls: readonly string[]
) => {
    const indexes = imageUrls
        .slice(0, LINK_IMPORT_PRESELECTED_IMAGES)
        .map((_, index) => {
            return index;
        });
    let staging = NOTHING_STAGED;

    try {
        staging = await services.stageImages(getLinkImportDeps(c), {
            urlHash,
            imageUrls,
            indexes,
            budgetMs: LINK_IMPORT_IMAGE_BUDGET_MS
        });
    } finally {
        emitCompleted(c, result, staging);
    }
};

const mintImages = (
    c: ApiContext,
    urlHash: string,
    count: number
): Promise<LinkImportImageDto[]> => {
    const signer = getImportSigner(c);
    const now = c.var.deps.now();

    return Promise.all(
        Array.from({ length: count }, async (_, index) => {
            return {
                index,
                url: await signer.buildImportImageUrl({ urlHash, index }, now)
            };
        })
    );
};

const toImportableImages = (result: LinkImportResult) => {
    const { product, urlHash } = result;

    if (product === null || urlHash === null || product.images.length === 0) {
        return null;
    }

    return {
        urlHash,
        imageUrls: product.images.slice(0, LINK_IMPORT_MAX_IMAGE_CANDIDATES)
    };
};

export const importLink: ApiHandler = async c => {
    const services = requireLinkImportServices(c);
    const user = requireUser(c);
    const link = await readLinkInput(c);
    const result = await runWithinBudget(c, services, link);

    if (result.outcome === 'invalidUrl') {
        emitCompleted(c, result, NOTHING_STAGED);

        throw validationError('url', 'invalid');
    }

    const importable = toImportableImages(result);
    const { sourcePrice, ...draft } = services.toImportedDraft(
        result.product,
        link
    );
    let images: LinkImportImageDto[] = [];
    let importToken: string | null = null;

    if (importable === null) {
        emitCompleted(c, result, NOTHING_STAGED);
    } else {
        images = await mintImages(
            c,
            importable.urlHash,
            importable.imageUrls.length
        );
        importToken = await getImportSigner(c).mintImportToken({
            userId: user.id,
            urlHash: importable.urlHash,
            now: c.var.deps.now()
        });
        await runInBackground(
            c,
            stageThenEmit(
                c,
                services,
                result,
                importable.urlHash,
                importable.imageUrls
            )
        );
    }

    const body: LinkImportDto = {
        outcome: result.outcome,
        source: result.product?.source ?? null,
        importToken,
        draft,
        sourcePrice,
        images
    };

    return c.json(body);
};
