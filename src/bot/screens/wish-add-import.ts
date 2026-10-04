import {
    checkRateLimit,
    selectBoundLimiter,
    telegramRateLimitKey
} from '../../api/rate-limit';
import { createTelegramApi } from '../../api/telegram-api';
import type { WishRecord } from '../../db/repositories';
import {
    LINK_IMPORT_BOT_BUDGET_MS,
    LINK_IMPORT_BOT_IMAGES,
    LINK_IMPORT_IMAGE_BUDGET_MS
} from '../../shared/app-api';
import { formatCurrency } from '../content/intl';
import { inlineKeyboard, removeReplyKeyboard } from '../content/keyboards';
import { renderWishHtml } from '../content/wish-markup';
import { cutDescription, cutTitle } from '../input/limits';
import { claimLinkImport, savePendingInput } from '../runtime/session-store';
import type { BotLinkImport, BotRequest, PendingInput } from '../runtime/types';
import { toLinkImportCompletedInput } from '../services/link-import/link-import-service';
import { resolveShop } from '../services/link-import/shop';
import {
    isSkippedStagedImage,
    type ExtractedProduct,
    type ImportedWishDraft,
    type ImportPreviewResult,
    type LinkImportResult,
    type StageImagesOutcome,
    type StagedImage,
    type StagedImageBody,
    type StagingSkipReason
} from '../services/link-import/types';
import {
    createWishFormatters,
    createWishScreenServices,
    openLinkButton,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { getErrorType } from '../errors';
import { escapeHtml } from '../utils/strings';
import { isTelegramForbidden } from '../utils/telegram-errors';
import { renderEditMenuOnly } from './wish-edit';

const EMPTY_IMAGES_JSON = '[]';
const CLAIM_ATTEMPTS = 4;
const CLAIM_RETRY_DELAY_MS = 150;
const WWW_PREFIX = 'www.';

const wait = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

const claimImport = async (
    req: BotRequest,
    marker: number,
    nextPendingInput: PendingInput | null
) => {
    for (let attempt = 1; attempt <= CLAIM_ATTEMPTS; attempt += 1) {
        const claimed = await claimLinkImport(
            req.repos,
            req.actor.id,
            marker,
            nextPendingInput,
            new Date()
        );

        if (claimed) {
            return true;
        }

        if (attempt < CLAIM_ATTEMPTS) {
            await wait(CLAIM_RETRY_DELAY_MS);
        }
    }

    return false;
};

const getHost = (url: string) => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
};

const getDisplayHost = (result: LinkImportResult, url: string) => {
    const host = result.host ?? getHost(url);

    return host.startsWith(WWW_PREFIX) ? host.slice(WWW_PREFIX.length) : host;
};

const buildFailedResult = (
    url: string,
    elapsedMs: number
): LinkImportResult => {
    return {
        outcome: 'timeout',
        product: null,
        normalizedUrl: null,
        host: null,
        urlHash: null,
        shop: resolveShop(getHost(url)),
        cache: 'miss',
        elapsedMs
    };
};

interface ImportImageCounts {
    staged: number;
    skipped: number;
    ingested: number;
}

const NO_IMAGES: ImportImageCounts = { staged: 0, skipped: 0, ingested: 0 };
const NOTHING_STAGED: StageImagesOutcome = { staged: [], skipped: [] };

const reportCompleted = (
    req: BotRequest,
    result: LinkImportResult,
    images: ImportImageCounts = NO_IMAGES
) => {
    req.telemetry.linkImportCompleted?.(
        toLinkImportCompletedInput(result, images)
    );
};

const runWithinBudget = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    url: string,
    startedAt: number
) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<null>(resolve => {
        timer = setTimeout(() => {
            resolve(null);
        }, LINK_IMPORT_BOT_BUDGET_MS);
    });
    const run = linkImport
        .run({ env: req.env, ...linkImport.deps }, { url, channel: 'bot' })
        .catch(() => null);

    try {
        const result = await Promise.race([run, budget]);

        return result ?? buildFailedResult(url, Date.now() - startedAt);
    } finally {
        clearTimeout(timer);
    }
};

const formatSourcePrice = (
    req: BotRequest,
    sourcePrice: NonNullable<ImportedWishDraft['sourcePrice']>
) => {
    try {
        return formatCurrency(
            sourcePrice.amount,
            req.locale,
            sourcePrice.currency
        );
    } catch {
        return `${sourcePrice.amount} ${sourcePrice.currency}`;
    }
};

const buildNotice = (
    req: BotRequest,
    host: string,
    draft: ImportedWishDraft,
    photos: { failed: boolean; unsupported: boolean }
) => {
    const {
        filledFrom,
        sourcePrice,
        photosFailed: photosFailedText,
        photosUnsupported: photosUnsupportedText
    } = req.LL.wishlist.add.import;

    const lines: string[] = [filledFrom({ host: escapeHtml(host) })];

    if (draft.sourcePrice !== null) {
        lines.push(
            sourcePrice({
                price: escapeHtml(formatSourcePrice(req, draft.sourcePrice))
            })
        );
    }

    if (photos.unsupported) {
        lines.push(photosUnsupportedText());
    } else if (photos.failed) {
        lines.push(photosFailedText());
    }

    return lines.join('\n');
};

const stageSafely = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    product: ExtractedProduct,
    urlHash: string | null,
    startedAt: number
) => {
    const count = Math.min(product.images.length, LINK_IMPORT_BOT_IMAGES);

    if (urlHash === null || count === 0) {
        return NOTHING_STAGED;
    }

    const remainingMs = LINK_IMPORT_BOT_BUDGET_MS - (Date.now() - startedAt);

    try {
        return await linkImport.stageImages(
            { env: req.env, ...linkImport.deps },
            {
                urlHash,
                imageUrls: product.images,
                indexes: Array.from({ length: count }, (_, index) => {
                    return index;
                }),
                budgetMs: Math.max(
                    0,
                    Math.min(remainingMs, LINK_IMPORT_IMAGE_BUDGET_MS)
                )
            }
        );
    } catch {
        return NOTHING_STAGED;
    }
};

const loadBodies = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    urlHash: string,
    staged: readonly StagedImage[]
) => {
    const loaded = await Promise.all(
        [...staged]
            .sort((left, right) => {
                return left.index - right.index;
            })
            .map(image => {
                return linkImport
                    .loadStagedImage(
                        { env: req.env, ...linkImport.deps },
                        { urlHash, index: image.index }
                    )
                    .catch(() => {
                        return { skipped: 'failed' } as const;
                    });
            })
    );

    return {
        bodies: loaded.filter((image): image is StagedImageBody => {
            return !isSkippedStagedImage(image);
        }),
        skipped: loaded.filter(isSkippedStagedImage).map(image => {
            return image.skipped;
        })
    };
};

const deliverPreview = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    wish: WishRecord,
    bodies: readonly StagedImageBody[]
): Promise<ImportPreviewResult> => {
    const html = renderWishHtml(req.LL, wish, createWishFormatters(req), {
        audience: 'owner',
        detail: 'full',
        showHidden: true
    });
    const linkRow = openLinkButton(req, wish.link);
    const keyboard = linkRow.length > 0 ? inlineKeyboard([linkRow]) : undefined;
    const sendText = () => {
        return req.send.text(html, keyboard);
    };

    if (bodies.length === 0) {
        await sendText();

        return { fileIds: [], rejected: 0, textDelivered: true };
    }

    let delivered: ImportPreviewResult = {
        fileIds: [],
        rejected: 0,
        textDelivered: false
    };

    try {
        delivered = await linkImport.sendPreview(
            createTelegramApi({ botToken: req.env.BOT_TOKEN }),
            {
                chatId: req.ctx.chat?.id ?? req.actor.id,
                html,
                ...(keyboard === undefined ? {} : { replyMarkup: keyboard }),
                images: bodies
            }
        );
    } catch (error) {
        if (isTelegramForbidden(error)) {
            throw error;
        }

        req.telemetry.internalFailure({
            event: 'wish_media_failed',
            errorType: getErrorType(error)
        });
    }

    if (!delivered.textDelivered) {
        await sendText();
    }

    return delivered;
};

const ingestPreview = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    wish: WishRecord,
    product: ExtractedProduct,
    result: LinkImportResult,
    startedAt: number
) => {
    const user = requireUser(req);
    const staging = await stageSafely(
        req,
        linkImport,
        product,
        result.urlHash,
        startedAt
    );
    const loaded =
        result.urlHash === null
            ? { bodies: [], skipped: [] }
            : await loadBodies(req, linkImport, result.urlHash, staging.staged);
    const { fileIds, rejected } = await deliverPreview(
        req,
        linkImport,
        wish,
        loaded.bodies
    );

    if (fileIds.length > 0) {
        await createWishScreenServices(req).wishes.reorderImages(
            wish.id,
            user.id,
            fileIds,
            EMPTY_IMAGES_JSON
        );
    }

    const unsupported =
        countUnsupported(staging.skipped.map(toReason)) +
        countUnsupported(loaded.skipped) +
        rejected;

    return {
        counts: {
            staged: staging.staged.length,
            skipped: staging.skipped.length + loaded.skipped.length + rejected,
            ingested: fileIds.length
        },
        unsupported
    };
};

const toReason = (skipped: { reason: StagingSkipReason }) => {
    return skipped.reason;
};

const countUnsupported = (reasons: readonly StagingSkipReason[]) => {
    return reasons.filter(reason => {
        return reason === 'unsupportedFormat';
    }).length;
};

const finishWithoutWish = async (
    req: BotRequest,
    url: string,
    marker: number,
    result: LinkImportResult
) => {
    const claimed = await claimImport(req, marker, {
        kind: 'wishTitleNew',
        link: url
    });

    reportCompleted(req, result);

    if (!claimed) {
        return;
    }

    const { failed, rateLimited } = req.LL.wishlist.add.import;

    await req.send.text(
        result.outcome === 'rateLimited' ? rateLimited() : failed(),
        removeReplyKeyboard()
    );
};

const buildNewWishFields = (
    req: BotRequest,
    url: string,
    title: string,
    draft: ImportedWishDraft
) => {
    return {
        title,
        description:
            draft.description === null
                ? null
                : cutDescription(draft.description),
        link: url,
        currency: draft.currency ?? req.displayCurrency,
        ...(draft.price === null ? {} : { price: draft.price })
    };
};

const finishWithWish = async (
    req: BotRequest,
    linkImport: BotLinkImport,
    url: string,
    marker: number,
    result: LinkImportResult,
    product: ExtractedProduct,
    startedAt: number
) => {
    const draft = linkImport.toDraft(product, url);
    const title = cutTitle((draft.title ?? '').trim());

    if (title === '') {
        await finishWithoutWish(req, url, marker, {
            ...result,
            outcome: 'notProduct',
            product: null
        });

        return;
    }

    const claimed = await claimImport(req, marker, null);

    if (!claimed) {
        reportCompleted(req, result);

        return;
    }

    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);

    if (await wishes.isWishLimitReached(user.id)) {
        reportCompleted(req, result);
        await req.send.text(req.LL.wishlist.add.limit(), removeReplyKeyboard());

        return;
    }

    const wish = await wishes.createWithFields(
        user.id,
        buildNewWishFields(req, url, title, draft)
    );

    if (wish === null) {
        reportCompleted(req, result);
        await savePendingInput(
            req.repos,
            req.actor.id,
            { kind: 'wishTitleNew', link: url },
            new Date()
        );
        await req.send.text(
            req.LL.wishlist.add.import.failed(),
            removeReplyKeyboard()
        );

        return;
    }

    req.telemetry.botActionCompleted({ action: 'wish_created' });

    const { counts, unsupported } = await ingestPreview(
        req,
        linkImport,
        wish,
        product,
        result,
        startedAt
    );

    reportCompleted(req, result, counts);
    await renderEditMenuOnly(req, {
        wishId: wish.id,
        notice: buildNotice(req, getDisplayHost(result, url), draft, {
            failed: product.images.length > 0 && counts.ingested === 0,
            unsupported: unsupported > 0
        }),
        withCancel: true
    });
};

export const completeLinkImport = async (
    req: BotRequest,
    url: string,
    marker: number
) => {
    const linkImport = req.services.linkImport;

    if (linkImport === undefined) {
        return;
    }

    const startedAt = Date.now();
    const result = await runWithinBudget(req, linkImport, url, startedAt);

    if (result.product === null) {
        await finishWithoutWish(req, url, marker, result);

        return;
    }

    await finishWithWish(
        req,
        linkImport,
        url,
        marker,
        result,
        result.product,
        startedAt
    );
};

export const startLinkImport = async (req: BotRequest, url: string) => {
    const { LL } = req;
    const gate = await checkRateLimit(
        selectBoundLimiter(req.env, 'import'),
        telegramRateLimitKey(req.actor.id)
    );

    if (gate === 'limited') {
        updateSession(req, {
            pendingInput: { kind: 'wishTitleNew', link: url }
        });
        reportCompleted(req, {
            ...buildFailedResult(url, 0),
            outcome: 'rateLimited'
        });
        await req.send.text(
            LL.wishlist.add.import.rateLimited(),
            removeReplyKeyboard()
        );

        return;
    }

    if (gate !== 'allowed') {
        req.telemetry.importRateLimiterGap?.(gate);
    }

    const marker = req.ctx.update.update_id;

    updateSession(req, {
        pendingInput: { kind: 'wishTitleNew', importMarker: marker }
    });
    await req.send.text(
        LL.wishlist.add.import.searching(),
        removeReplyKeyboard()
    );
    req.defer(() => {
        return completeLinkImport(req, url, marker);
    }, 0);
};
