import type { InlineKeyboardMarkup } from 'telegraf/types';

import {
    checkRateLimit,
    selectBoundLimiter,
    telegramRateLimitKey
} from '../../api/rate-limit';
import {
    LIST_IMPORT_PROGRESS_EDIT_INTERVAL_MS,
    LIST_IMPORT_VISIBILITIES,
    type ListImportCountsDto,
    type ListImportFailure,
    type ListImportPreviewDto,
    type ListImportStatusDto,
    type ListImportVisibility
} from '../../shared/app-api';
import {
    parseListImportUrl,
    suggestListImportVisibility,
    type ParsedListUrl
} from '../../shared/list-import-url';
import { isListImportEnabled } from '../../worker/env';
import { kickListImport } from '../../worker/list-import';
import {
    callbackButton,
    homeButton,
    homeKeyboard,
    inlineKeyboard,
    navigationButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { clearPendingInput } from '../runtime/context';
import { getMessageText } from '../runtime/link-offer';
import {
    claimPendingMarker,
    isSessionWrittenBefore,
    savePendingInput
} from '../runtime/session-store';
import type {
    BotRequest,
    CallbackActionOf,
    CallbackActionType,
    CallbackHandler,
    CallbackTable,
    PendingInput,
    ScreenModule,
    TextHandle
} from '../runtime/types';
import type {
    ListImportDeps,
    ListImportProgressHandler,
    ListImportService,
    ListImportStartResult
} from '../services/list-import/types';
import { requireUser, updateSession } from '../services/wish-screen-context';
import { isTelegramBadRequest } from '../utils/telegram-errors';
import { screen as homeScreen } from './home';

const CLAIM_ATTEMPTS = 4;
const CLAIM_RETRY_DELAY_MS = 150;
const INPUT_RETRY_FAILURES: ReadonlySet<ListImportFailure> = new Set([
    'invalidUrl',
    'userNotFound',
    'privateCollection',
    'schemaChanged',
    'upstream',
    'timeout',
    'rateLimited'
]);

type PhotosPhase = 'finished' | 'refreshed';

type CountFormatter = (parameters: { count: number }) => string;

interface PreviewClaim {
    parsed: ParsedListUrl;
    marker: number;
    markedAt: Date;
}

interface ImportContext {
    req: BotRequest;
    service: ListImportService;
    deps: ListImportDeps;
    userId: number;
}

const wait = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

export const isListImportAvailable = (
    req: Pick<BotRequest, 'env' | 'services'>
) => {
    return (
        req.services.listImport !== undefined && isListImportEnabled(req.env)
    );
};

const getAvailableService = (req: BotRequest) => {
    return isListImportAvailable(req) ? req.services.listImport : undefined;
};

const toBackgroundDeps = (req: BotRequest): ListImportDeps => {
    return {
        env: req.env,
        waitUntil: promise => {
            req.defer(async () => {
                await promise;
            }, 0);
        }
    };
};

const createContext = (
    req: BotRequest,
    service: ListImportService
): ImportContext => {
    return {
        req,
        service,
        deps: toBackgroundDeps(req),
        userId: requireUser(req).id
    };
};

const renderOutdated = async (req: BotRequest) => {
    await req.send.toast(req.LL.errors.outdatedButton());
    await homeScreen.render(req, undefined);
};

const guarded = <T extends CallbackActionType>(
    handler: (
        context: ImportContext,
        action: CallbackActionOf<T>
    ) => Promise<void>
): CallbackHandler<CallbackActionOf<T>> => {
    return async (req, action) => {
        const service = getAvailableService(req);

        if (service === undefined) {
            await renderOutdated(req);

            return;
        }

        await handler(createContext(req, service), action);
    };
};

const promptKeyboard = (req: BotRequest) => {
    return singleColumnKeyboard([
        navigationButton(req.LL.listImport.cancel(), 'settings')
    ]);
};

const restartKeyboard = (req: BotRequest) => {
    return singleColumnKeyboard([
        navigationButton(req.LL.listImport.entry(), 'listImport'),
        homeButton(req.LL)
    ]);
};

const leaveKeyboard = (req: BotRequest) => {
    return singleColumnKeyboard([
        navigationButton(req.LL.actions.back(), 'settings'),
        homeButton(req.LL)
    ]);
};

const refreshButton = (req: BotRequest, jobId: number) => {
    return callbackButton(req.LL.listImport.refresh(), {
        type: 'listImportRefresh',
        jobId
    });
};

const getVisibilityLabel = (
    req: BotRequest,
    visibility: ListImportVisibility,
    selected: boolean
) => {
    const { visibility: labels } = req.LL.listImport;
    const label = labels[visibility]();

    return selected ? labels.selected({ label }) : label;
};

const buildPreviewKeyboard = (
    req: BotRequest,
    jobId: number,
    selected: ListImportVisibility
) => {
    const { LL } = req;

    return inlineKeyboard([
        LIST_IMPORT_VISIBILITIES.map(visibility => {
            return callbackButton(
                getVisibilityLabel(req, visibility, visibility === selected),
                { type: 'listImportVisibility', jobId, visibility }
            );
        }),
        [
            callbackButton(LL.listImport.commit(), {
                type: 'listImportCommit',
                jobId
            })
        ],
        [
            callbackButton(LL.listImport.cancel(), {
                type: 'listImportCancel',
                jobId
            })
        ]
    ]);
};

const buildNothingToImportKeyboard = (req: BotRequest, jobId: number) => {
    return singleColumnKeyboard([
        callbackButton(req.LL.listImport.cancel(), {
            type: 'listImportCancel',
            jobId
        })
    ]);
};

const buildCountLines = (req: BotRequest, counts: ListImportCountsDto) => {
    const { preview } = req.LL.listImport;
    const lines: [number, CountFormatter][] = [
        [counts.active, preview.active],
        [counts.gifted, preview.gifted],
        [counts.duplicates, preview.duplicates],
        [counts.withoutPrice, preview.withoutPrice],
        [counts.overLimit, preview.overLimit]
    ];

    return lines
        .filter(([count]) => {
            return count > 0;
        })
        .map(([count, format]) => {
            return format({ count });
        });
};

const plannedCount = (counts: ListImportCountsDto) => {
    return counts.active + counts.gifted;
};

const buildCountsSection = (req: BotRequest, counts: ListImportCountsDto) => {
    return [
        req.LL.listImport.preview.title(),
        ...buildCountLines(req, counts)
    ].join('\n');
};

const buildNothingToImportText = (
    req: BotRequest,
    failure: ListImportFailure,
    counts: ListImportCountsDto
) => {
    const { listImport } = req.LL;
    const notice =
        failure === 'limitReached'
            ? listImport.failure.limitReached()
            : listImport.preview.nothing();

    return `${buildCountsSection(req, counts)}\n\n${notice}`;
};

const buildPreviewText = (
    req: BotRequest,
    preview: ListImportPreviewDto,
    counts: ListImportCountsDto
) => {
    const { preview: copy } = req.LL.listImport;
    const planned = plannedCount(counts);
    const sections = [buildCountsSection(req, counts)];

    if (planned - counts.withoutPhoto > 0) {
        sections.push(copy.photosNote());
    }

    if (preview.savedWishesNote) {
        sections.push(copy.savedNote());
    }

    sections.push(planned > 0 ? copy.visibility() : copy.nothing());

    return sections.join('\n\n');
};

const buildProgressText = (
    req: BotRequest,
    status: Pick<ListImportStatusDto, 'created' | 'planned'>
) => {
    return req.LL.listImport.progress({
        created: status.created,
        planned: status.planned
    });
};

const buildDoneText = (
    req: BotRequest,
    status: ListImportStatusDto,
    phase: PhotosPhase
) => {
    const { done } = req.LL.listImport;
    const created = done.summary({ created: status.created });
    const summary =
        status.createdGifted > 0
            ? `${created} ${done.gifted({ gifted: status.createdGifted })}`
            : created;

    if (status.photosPending === 0) {
        return summary;
    }

    const photos =
        phase === 'finished'
            ? done.photos()
            : done.photosLeft({ count: status.photosPending });

    return `${summary}\n${photos}`;
};

const buildFailedText = (req: BotRequest, status: ListImportStatusDto) => {
    const { failed, failure } = req.LL.listImport;
    const summary = failed({ created: status.created });

    return status.failure === null
        ? summary
        : `${summary}\n${failure[status.failure]()}`;
};

const buildStatusText = (
    req: BotRequest,
    status: ListImportStatusDto,
    phase: PhotosPhase
) => {
    switch (status.state) {
        case 'done':
            return buildDoneText(req, status, phase);
        case 'committing':
            return buildProgressText(req, status);
        case 'failed':
            return buildFailedText(req, status);
        default:
            return req.LL.listImport.failure.expired();
    }
};

const buildStatusKeyboard = (req: BotRequest, status: ListImportStatusDto) => {
    switch (status.state) {
        case 'done':
            return singleColumnKeyboard([
                navigationButton(req.LL.listImport.myWishes(), 'wishlist'),
                homeButton(req.LL),
                status.photosPending > 0
                    ? refreshButton(req, status.jobId)
                    : null
            ]);
        case 'committing':
            return singleColumnKeyboard([refreshButton(req, status.jobId)]);
        default:
            return restartKeyboard(req);
    }
};

const editOrSend = async (
    req: BotRequest,
    handle: TextHandle,
    html: string,
    keyboard?: InlineKeyboardMarkup
) => {
    try {
        await handle.edit(html, keyboard);
    } catch (error) {
        if (!isTelegramBadRequest(error)) {
            throw error;
        }

        await req.send.text(html, keyboard);
    }
};

const createProgressReporter = (
    req: BotRequest,
    handle: TextHandle
): ListImportProgressHandler => {
    let lastEditAt = Date.now();

    return async status => {
        const now = Date.now();

        if (now - lastEditAt < LIST_IMPORT_PROGRESS_EDIT_INTERVAL_MS) {
            return;
        }

        lastEditAt = now;

        try {
            await handle.edit(buildProgressText(req, status));
        } catch {
            return;
        }
    };
};

const claimPreview = async (
    req: BotRequest,
    marker: number,
    nextPendingInput: PendingInput | null
) => {
    for (let attempt = 1; attempt <= CLAIM_ATTEMPTS; attempt += 1) {
        const claimed = await claimPendingMarker(
            req.repos,
            req.actor.id,
            'listImportUrl',
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

const recoverLostClaim = async (
    req: BotRequest,
    claim: PreviewClaim,
    message: string
) => {
    if (
        !(await isSessionWrittenBefore(req.repos, req.actor.id, claim.markedAt))
    ) {
        return;
    }

    await savePendingInput(
        req.repos,
        req.actor.id,
        { kind: 'listImportUrl', source: claim.parsed.source },
        new Date()
    );
    await req.send.text(message, promptKeyboard(req));
};

const runPreview = async (
    context: ImportContext,
    parsed: ParsedListUrl
): Promise<ListImportPreviewDto> => {
    try {
        return await context.service.preview(context.deps, {
            userId: context.userId,
            url: parsed,
            channel: 'bot'
        });
    } catch {
        return {
            outcome: 'upstream',
            jobId: null,
            kind: null,
            counts: null,
            suggestedVisibility: suggestListImportVisibility(parsed),
            savedWishesNote: false
        };
    }
};

const reportPreview = (
    req: BotRequest,
    parsed: ParsedListUrl,
    preview: ListImportPreviewDto,
    elapsedMs: number
) => {
    req.telemetry.listImportPreviewed?.({
        source: parsed.source,
        kind: preview.kind,
        result: preview.outcome,
        items: preview.counts?.found ?? 0,
        duplicates: preview.counts?.duplicates ?? 0,
        elapsedMs
    });
};

const abandonPreview = async (
    context: ImportContext,
    claim: PreviewClaim,
    jobId: number
) => {
    await context.service
        .cancel(context.deps, { userId: context.userId, jobId })
        .catch(() => null);
    await recoverLostClaim(context.req, claim, context.req.LL.errors.unknown());
};

const deliverPreview = async (
    context: ImportContext,
    claim: PreviewClaim,
    preview: ListImportPreviewDto,
    jobId: number,
    counts: ListImportCountsDto
) => {
    const { req } = context;

    if (!(await claimPreview(req, claim.marker, null))) {
        await abandonPreview(context, claim, jobId);

        return;
    }

    const keyboard =
        plannedCount(counts) > 0
            ? buildPreviewKeyboard(req, jobId, preview.suggestedVisibility)
            : buildNothingToImportKeyboard(req, jobId);

    await req.send.text(buildPreviewText(req, preview, counts), keyboard);
};

const buildFailureText = (
    req: BotRequest,
    failure: ListImportFailure,
    counts: ListImportCountsDto | null
) => {
    return counts !== null && plannedCount(counts) === 0
        ? buildNothingToImportText(req, failure, counts)
        : req.LL.listImport.failure[failure]();
};

const deliverFailure = async (
    req: BotRequest,
    claim: PreviewClaim,
    failure: ListImportFailure,
    preview: Pick<ListImportPreviewDto, 'jobId' | 'counts'>
) => {
    const busyJobId = preview.jobId;
    const waiting = INPUT_RETRY_FAILURES.has(failure);
    const nextPendingInput: PendingInput | null = waiting
        ? { kind: 'listImportUrl', source: claim.parsed.source }
        : null;
    const message = buildFailureText(req, failure, preview.counts);
    const claimed = await claimPreview(req, claim.marker, nextPendingInput);

    if (!claimed) {
        await recoverLostClaim(req, claim, message);

        return;
    }

    if (waiting) {
        await req.send.text(message, promptKeyboard(req));

        return;
    }

    const keyboard =
        failure === 'busy' ? busyKeyboard(req, busyJobId) : leaveKeyboard(req);

    await req.send.text(message, keyboard);
};

const completePreview = async (req: BotRequest, claim: PreviewClaim) => {
    const service = getAvailableService(req);

    if (service === undefined) {
        return;
    }

    const context = createContext(req, service);
    const startedAt = Date.now();
    const preview = await runPreview(context, claim.parsed);

    reportPreview(req, claim.parsed, preview, Date.now() - startedAt);

    if (preview.outcome !== 'ok') {
        await deliverFailure(req, claim, preview.outcome, preview);

        return;
    }

    if (preview.jobId === null || preview.counts === null) {
        await deliverFailure(req, claim, 'upstream', {
            jobId: null,
            counts: null
        });

        return;
    }

    await deliverPreview(
        context,
        claim,
        preview,
        preview.jobId,
        preview.counts
    );
};

const beginPreview = async (
    req: BotRequest,
    input: Extract<PendingInput, { kind: 'listImportUrl' }>,
    parsed: ParsedListUrl
) => {
    const { LL } = req;
    const gate = await checkRateLimit(
        selectBoundLimiter(req.env, 'import'),
        telegramRateLimitKey(req.actor.id)
    );

    if (gate === 'limited') {
        req.telemetry.listImportPreviewed?.({
            source: parsed.source,
            kind: parsed.kind,
            result: 'rateLimited',
            items: 0,
            duplicates: 0,
            elapsedMs: 0
        });
        await req.send.text(
            LL.listImport.failure.rateLimited(),
            promptKeyboard(req)
        );

        return;
    }

    if (gate !== 'allowed') {
        req.telemetry.rateLimiterGap?.('import', gate);
    }

    const claim: PreviewClaim = {
        parsed,
        marker: req.ctx.update.update_id,
        markedAt: new Date()
    };

    updateSession(req, {
        pendingInput: {
            kind: 'listImportUrl',
            source: input.source,
            importMarker: claim.marker
        }
    });
    await req.persistSession(claim.markedAt);
    await req.send.text(LL.listImport.reading());
    req.defer(() => {
        return completePreview(req, claim);
    }, 0);
};

const busyKeyboard = (req: BotRequest, runningJobId: number | null) => {
    return runningJobId === null
        ? leaveKeyboard(req)
        : singleColumnKeyboard([
              refreshButton(req, runningJobId),
              navigationButton(req.LL.actions.back(), 'settings'),
              homeButton(req.LL)
          ]);
};

const showStartFailure = async (
    req: BotRequest,
    handle: TextHandle,
    refusal: Extract<ListImportStartResult, { ok: false }>
) => {
    if (refusal.outcome === 'busy') {
        await editOrSend(
            req,
            handle,
            req.LL.listImport.failure.busy(),
            busyKeyboard(req, refusal.jobId)
        );

        return;
    }

    await editOrSend(
        req,
        handle,
        req.LL.listImport.failure.expired(),
        restartKeyboard(req)
    );
};

const readStatus = async (context: ImportContext, jobId: number) => {
    try {
        return await context.service.status(context.deps, {
            userId: context.userId,
            jobId
        });
    } catch {
        return null;
    }
};

const runCommitToCompletion = async (
    context: ImportContext,
    handle: TextHandle,
    jobId: number
) => {
    const { req } = context;
    let finalStatus: ListImportStatusDto | null = null;

    try {
        finalStatus = await context.service.runCommit(context.deps, {
            jobId,
            trigger: 'request',
            onProgress: createProgressReporter(req, handle)
        });
    } catch {
        finalStatus = null;
    }

    finalStatus ??= await readStatus(context, jobId);

    if (finalStatus === null) {
        await editOrSend(
            req,
            handle,
            req.LL.errors.unknown(),
            homeKeyboard(req.LL)
        );

        return;
    }

    await editOrSend(
        req,
        handle,
        buildStatusText(req, finalStatus, 'finished'),
        buildStatusKeyboard(req, finalStatus)
    );
    kickListImport(context.service, context.deps, context.userId);
};

const render = async (req: BotRequest) => {
    const { LL } = req;

    if (!isListImportAvailable(req)) {
        await req.send.text(LL.listImport.disabled(), leaveKeyboard(req));

        return;
    }

    await req.send.text(
        `${LL.listImport.title()}\n\n${LL.listImport.description()}`,
        singleColumnKeyboard([
            callbackButton(LL.listImport.sources.rewish(), {
                type: 'listImportSource',
                source: 'rewish'
            }),
            navigationButton(LL.actions.back(), 'settings'),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'listImport',
    render,
    onInput: async (req, input, message) => {
        if (input.kind !== 'listImportUrl') {
            return;
        }

        if (getAvailableService(req) === undefined) {
            clearPendingInput(req);
            await req.send.text(
                req.LL.listImport.disabled(),
                homeKeyboard(req.LL)
            );

            return;
        }

        const parsed = parseListImportUrl(getMessageText(message) ?? '');

        if (parsed === null) {
            await req.send.text(
                req.LL.listImport.failure.invalidUrl(),
                promptKeyboard(req)
            );

            return;
        }

        await beginPreview(req, input, parsed);
    }
};

export const callbacks: CallbackTable = {
    listImportSource: guarded<'listImportSource'>(async ({ req }, action) => {
        updateSession(req, {
            pendingInput: { kind: 'listImportUrl', source: action.source }
        });
        await req.send.text(req.LL.listImport.prompt(), promptKeyboard(req));
    }),
    listImportVisibility: guarded<'listImportVisibility'>(
        async ({ req, service, deps, userId }, action) => {
            const gate = await service.setVisibility(deps, {
                userId,
                jobId: action.jobId,
                visibility: action.visibility
            });

            if (gate !== 'ok') {
                await req.send.removeKeyboard();
                await req.send.text(
                    req.LL.listImport.failure.expired(),
                    restartKeyboard(req)
                );

                return;
            }

            await req.send.replaceKeyboard(
                buildPreviewKeyboard(req, action.jobId, action.visibility)
            );
        }
    ),
    listImportCommit: guarded<'listImportCommit'>(async (context, action) => {
        const { req, service, deps, userId } = context;
        const handle = await req.send.textWithHandle(
            req.LL.listImport.reading()
        );
        const started = await service.startCommit(deps, {
            userId,
            jobId: action.jobId,
            chatMessageId: handle.messageId
        });

        if (!started.ok) {
            await showStartFailure(req, handle, started);

            return;
        }

        await editOrSend(req, handle, buildProgressText(req, started.status));
        req.defer(() => {
            return runCommitToCompletion(context, handle, action.jobId);
        }, 0);
    }),
    listImportCancel: guarded<'listImportCancel'>(
        async ({ req, service, deps, userId }, action) => {
            const gate = await service.cancel(deps, {
                userId,
                jobId: action.jobId
            });

            if (gate === 'ok') {
                await req.send.text(
                    req.LL.listImport.cancelled(),
                    leaveKeyboard(req)
                );

                return;
            }

            await req.send.text(
                req.LL.listImport.failure.expired(),
                restartKeyboard(req)
            );
        }
    ),
    listImportRefresh: guarded<'listImportRefresh'>(async (context, action) => {
        const { req, service, deps, userId } = context;

        kickListImport(service, deps, userId);

        const status = await readStatus(context, action.jobId);

        if (status === null) {
            await req.send.text(
                req.LL.listImport.failure.expired(),
                restartKeyboard(req)
            );

            return;
        }

        await req.send.text(
            buildStatusText(req, status, 'refreshed'),
            buildStatusKeyboard(req, status)
        );
    })
};
