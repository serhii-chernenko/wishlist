import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { Update } from 'telegraf/types';

import { encodeCallbackData } from '../../src/bot/callback-data';
import { getMessages } from '../../src/bot/content/messages';
import { createWishlistBot } from '../../src/bot/telegraf/bot';
import type {
    ListImportJobGate,
    ListImportJobRequest,
    ListImportPreviewRequest,
    ListImportResumeRequest,
    ListImportRunRequest,
    ListImportService,
    ListImportStartRequest,
    ListImportStartResult,
    ListImportVisibilityRequest
} from '../../src/bot/services/list-import/types';
import type {
    ListImportPreviewDto,
    ListImportStatusDto
} from '../../src/shared/app-api';
import type { ListImportPreviewedInput } from '../../src/worker/telemetry';
import { handleUpdateWithWishlistBot } from '../../src/worker/routes/telegram';
import { createTestUser } from '../fixtures/telegram';
import { createWorkerEnv } from './d1-harness';
import {
    BOT_TOKEN,
    buttonTextsOf,
    callbackDataOf,
    createTelegramApiError,
    createWebhookHarness,
    type ApiCall,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');
const BOT_KEY = 'bot-list-import-test';
const JOB_ID = 7;
const PROFILE_URL = 'rewish.io/tESt01?utm_source=share';
const CANONICAL_PROFILE_URL = 'https://rewish.io/tESt01/wishes';
const CODED_URL = 'https://rewish.io/tESt01?access_code=test-access-code';
const SESSION_QUERY = 'SELECT state FROM sessions WHERE telegram_user_id = ?';

const navigate = (screen: 'settings' | 'listImport' | 'home' | 'wishlist') => {
    return encodeCallbackData({ type: 'navigate', screen });
};

const encode = (data: Parameters<typeof encodeCallbackData>[0]) => {
    return encodeCallbackData(data);
};

const buildPreview = (
    overrides: Partial<ListImportPreviewDto> = {}
): ListImportPreviewDto => {
    return {
        outcome: 'ok',
        jobId: JOB_ID,
        kind: 'wishes',
        counts: {
            found: 11,
            active: 5,
            gifted: 2,
            duplicates: 3,
            overLimit: 0,
            withoutPrice: 1,
            withoutPhoto: 2
        },
        suggestedVisibility: 'public',
        savedWishesNote: false,
        ...overrides
    };
};

const buildStatus = (
    overrides: Partial<ListImportStatusDto> = {}
): ListImportStatusDto => {
    return {
        jobId: JOB_ID,
        state: 'committing',
        kind: 'wishes',
        visibility: 'public',
        planned: 7,
        created: 0,
        createdGifted: 0,
        photosPending: 0,
        failure: null,
        ...overrides
    };
};

interface Scenario {
    limiterAllows: boolean;
    preview: ListImportPreviewDto;
    previewThrows: boolean;
    visibilityGate: ListImportJobGate;
    cancelGate: ListImportJobGate;
    start: ListImportStartResult;
    progressSteps: ListImportStatusDto[];
    finalStatus: ListImportStatusDto | null;
    status: ListImportStatusDto | null;
    previewGate: Promise<void> | null;
}

describe('Bot list import', () => {
    let webhook: WebhookHarness;
    let scenario: Scenario;
    let pendingTasks: Promise<unknown>[];
    let previewRequests: ListImportPreviewRequest[];
    let visibilityRequests: ListImportVisibilityRequest[];
    let startRequests: ListImportStartRequest[];
    let runRequests: ListImportRunRequest[];
    let cancelRequests: ListImportJobRequest[];
    let statusRequests: ListImportJobRequest[];
    let kickRequests: ListImportResumeRequest[];
    let previewEvents: ListImportPreviewedInput[];
    let userId: number;

    const alice = createTestUser(401, {
        first_name: 'Alice',
        username: 'alice'
    });

    const defaultScenario = (): Scenario => {
        return {
            limiterAllows: true,
            preview: buildPreview(),
            previewThrows: false,
            visibilityGate: 'ok',
            cancelGate: 'ok',
            start: { ok: true, status: buildStatus() },
            progressSteps: [],
            finalStatus: buildStatus({
                state: 'done',
                created: 7,
                createdGifted: 2,
                photosPending: 5
            }),
            status: buildStatus({ state: 'committing', created: 3 }),
            previewGate: null
        };
    };

    const buildService = (): ListImportService => {
        return {
            async preview(_deps, request) {
                previewRequests.push(request);
                await scenario.previewGate;

                if (scenario.previewThrows) {
                    throw new Error('rewish exploded');
                }

                return scenario.preview;
            },
            async setVisibility(_deps, request) {
                visibilityRequests.push(request);

                return scenario.visibilityGate;
            },
            async startCommit(_deps, request) {
                startRequests.push(request);

                return scenario.start;
            },
            async runCommit(_deps, request) {
                runRequests.push(request);

                for (const step of scenario.progressSteps) {
                    await request.onProgress?.(step);
                }

                return scenario.finalStatus;
            },
            async status(_deps, request) {
                statusRequests.push(request);

                return scenario.status;
            },
            async cancel(_deps, request) {
                cancelRequests.push(request);

                return scenario.cancelGate;
            },
            async resumeStale() {
                return 0;
            },
            async drainPhotos() {
                return { result: 'idle', ingested: 0, failed: 0 };
            },
            async prune() {
                return 0;
            },
            async kick(_deps, request) {
                kickRequests.push(request);
            }
        };
    };

    const drain = async () => {
        while (pendingTasks.length > 0) {
            await Promise.all(pendingTasks.splice(0));
        }
    };

    const deliver = async (update: Update) => {
        const env = {
            ...createWorkerEnv(webhook.d1, {
                BOT_TOKEN,
                BOT_ENVIRONMENT: 'local'
            }),
            APP_IMPORT_LIMITER: {
                async limit() {
                    return { success: scenario.limiterAllows };
                }
            }
        } as never;

        await handleUpdateWithWishlistBot(
            env,
            update,
            BOT_KEY,
            (botEnv, deps = {}) => {
                return createWishlistBot(botEnv, {
                    ...deps,
                    sleep: () => {
                        return Promise.resolve();
                    },
                    telemetry: {
                        ...(deps.telemetry as NonNullable<
                            typeof deps.telemetry
                        >),
                        listImportPreviewed(input) {
                            previewEvents.push(input);
                        }
                    }
                });
            },
            {
                waitUntil(promise) {
                    pendingTasks.push(promise);
                }
            },
            undefined,
            undefined,
            buildService()
        );
    };

    const send = async (update: Update) => {
        await deliver(update);
        await drain();
    };

    const sendText = (text: string) => {
        return send(webhook.builders.message(alice, text));
    };

    const sendCallback = (data: string) => {
        return send(webhook.builders.callback(alice, data));
    };

    const sendCallbackFrom = (
        data: string,
        keyboard: { text: string; callback_data: string }[][]
    ) => {
        const update = webhook.builders.callback(alice, data) as unknown as {
            callback_query: { message: Record<string, unknown> };
        };

        update.callback_query.message.reply_markup = {
            inline_keyboard: keyboard
        };

        return send(update as unknown as Update);
    };

    const readPendingInput = async () => {
        const row = await webhook.queryOne<{ state: string }>(
            SESSION_QUERY,
            alice.id
        );

        return (JSON.parse(row?.state ?? '{}') as { pendingInput?: unknown })
            .pendingInput;
    };

    const callsOf = (method: string) => {
        return webhook.callsOf(method).map((call: ApiCall) => {
            return call.payload;
        });
    };

    const editedTexts = () => {
        return callsOf('editMessageText').map(payload => {
            return String(payload.text);
        });
    };

    const previewKeyboard = (selected: 'hidden' | 'public') => {
        const hidden = LL.listImport.visibility.hidden();
        const publicLabel = LL.listImport.visibility.public();
        const mark = (label: string, isSelected: boolean) => {
            return isSelected
                ? LL.listImport.visibility.selected({ label })
                : label;
        };

        return [
            [
                {
                    text: mark(hidden, selected === 'hidden'),
                    callback_data: encode({
                        type: 'listImportVisibility',
                        jobId: JOB_ID,
                        visibility: 'hidden'
                    })
                },
                {
                    text: mark(publicLabel, selected === 'public'),
                    callback_data: encode({
                        type: 'listImportVisibility',
                        jobId: JOB_ID,
                        visibility: 'public'
                    })
                }
            ]
        ];
    };

    const startImportDialog = async () => {
        await sendCallback(navigate('settings'));
        await sendCallback(navigate('listImport'));
        await sendCallback(
            encode({ type: 'listImportSource', source: 'rewish' })
        );
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
        scenario = defaultScenario();
        pendingTasks = [];
        previewRequests = [];
        visibilityRequests = [];
        startRequests = [];
        runRequests = [];
        cancelRequests = [];
        statusRequests = [];
        kickRequests = [];
        previewEvents = [];
        userId = (await webhook.registerUser(alice)).id;
        webhook.respondToApi(call => {
            return call.method === 'editMessageText' ? true : undefined;
        });
    });

    describe('entry points', () => {
        it('shows the import button in settings and opens the source screen', async () => {
            await sendCallback(navigate('settings'));

            assert.ok(
                callbackDataOf(webhook.lastMessage()).includes(
                    navigate('listImport')
                )
            );
            assert.ok(
                buttonTextsOf(webhook.lastMessage()).includes(
                    LL.listImport.entry()
                )
            );

            await sendCallback(navigate('listImport'));

            assert.equal(
                webhook.lastMessage().text,
                `${LL.listImport.title()}\n\n${LL.listImport.description()}`
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                encode({ type: 'listImportSource', source: 'rewish' }),
                navigate('settings'),
                navigate('home')
            ]);
        });
    });

    describe('the link prompt', () => {
        it('asks for a link and waits for it', async () => {
            await startImportDialog();

            assert.equal(webhook.lastMessage().text, LL.listImport.prompt());
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                navigate('settings')
            ]);
            assert.deepEqual(await readPendingInput(), {
                kind: 'listImportUrl',
                source: 'rewish'
            });
        });

        it('keeps waiting after a link that is not a rewish link', async () => {
            await startImportDialog();
            await sendText('https://example.com/list');

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.invalidUrl()
            );
            assert.deepEqual(await readPendingInput(), {
                kind: 'listImportUrl',
                source: 'rewish'
            });
            assert.equal(previewRequests.length, 0);
        });

        it('stops with a rate limit message and keeps waiting', async () => {
            await startImportDialog();
            scenario.limiterAllows = false;
            await sendText(PROFILE_URL);

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.rateLimited()
            );
            assert.equal(previewRequests.length, 0);
            assert.deepEqual(await readPendingInput(), {
                kind: 'listImportUrl',
                source: 'rewish'
            });
            assert.equal(previewEvents[0]?.result, 'rateLimited');
        });
    });

    describe('the preview', () => {
        it('reads the list, then shows only the non-zero counts with the toggle', async () => {
            await startImportDialog();
            await sendText(PROFILE_URL);

            const reading = webhook.messageTexts().at(-2);

            assert.equal(reading, LL.listImport.reading());
            assert.equal(previewRequests.length, 1);
            assert.equal(previewRequests[0]?.userId, userId);
            assert.equal(previewRequests[0]?.channel, 'bot');
            assert.equal(previewRequests[0]?.url.url, CANONICAL_PROFILE_URL);

            const message = webhook.lastMessage();
            const { preview } = LL.listImport;

            assert.equal(
                message.text,
                [
                    [
                        preview.title(),
                        preview.active({ count: 5 }),
                        preview.gifted({ count: 2 }),
                        preview.duplicates({ count: 3 }),
                        preview.withoutPrice({ count: 1 })
                    ].join('\n'),
                    preview.photosNote(),
                    preview.visibility()
                ].join('\n\n')
            );
            assert.equal(message.text.includes(preview.savedNote()), false);
            assert.deepEqual(callbackDataOf(message), [
                encode({
                    type: 'listImportVisibility',
                    jobId: JOB_ID,
                    visibility: 'hidden'
                }),
                encode({
                    type: 'listImportVisibility',
                    jobId: JOB_ID,
                    visibility: 'public'
                }),
                encode({ type: 'listImportCommit', jobId: JOB_ID }),
                encode({ type: 'listImportCancel', jobId: JOB_ID })
            ]);
            assert.deepEqual(buttonTextsOf(message).slice(0, 2), [
                LL.listImport.visibility.hidden(),
                LL.listImport.visibility.selected({
                    label: LL.listImport.visibility.public()
                })
            ]);
            assert.equal(await readPendingInput(), null);
            assert.equal(previewEvents[0]?.result, 'ok');
            assert.equal(previewEvents[0]?.items, 11);
            assert.equal(previewEvents[0]?.duplicates, 3);
        });

        it('adds the saved wishes note and preselects hidden for a link with an access code', async () => {
            scenario.preview = buildPreview({
                suggestedVisibility: 'hidden',
                savedWishesNote: true
            });
            await startImportDialog();
            await sendText(CODED_URL);

            const message = webhook.lastMessage();

            assert.ok(message.text.includes(LL.listImport.preview.savedNote()));
            assert.equal(
                buttonTextsOf(message)[0],
                LL.listImport.visibility.selected({
                    label: LL.listImport.visibility.hidden()
                })
            );
            assert.equal(
                previewRequests[0]?.url.accessCode,
                'test-access-code'
            );
        });

        it('offers only Cancel when everything is a duplicate', async () => {
            scenario.preview = buildPreview({
                counts: {
                    found: 4,
                    active: 0,
                    gifted: 0,
                    duplicates: 4,
                    overLimit: 0,
                    withoutPrice: 0,
                    withoutPhoto: 0
                }
            });
            await startImportDialog();
            await sendText(PROFILE_URL);

            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                encode({ type: 'listImportCancel', jobId: JOB_ID })
            ]);
            assert.equal(
                webhook
                    .lastMessage()
                    .text.includes(LL.listImport.preview.visibility()),
                false
            );
            assert.ok(
                webhook
                    .lastMessage()
                    .text.includes(LL.listImport.preview.nothing())
            );
        });

        it('shows the counts and says nothing is new when every wish is already in the list', async () => {
            scenario.preview = buildPreview({
                outcome: 'empty',
                jobId: null,
                kind: null,
                counts: {
                    found: 6,
                    active: 0,
                    gifted: 0,
                    duplicates: 6,
                    overLimit: 0,
                    withoutPrice: 0,
                    withoutPhoto: 0
                }
            });
            await startImportDialog();
            await sendText(PROFILE_URL);

            const { text } = webhook.lastMessage();

            assert.ok(
                text.includes(LL.listImport.preview.duplicates({ count: 6 }))
            );
            assert.ok(text.includes(LL.listImport.preview.nothing()));
            assert.equal(text.includes(LL.listImport.failure.empty()), false);
            assert.equal(
                callbackDataOf(webhook.lastMessage()).some(data => {
                    return data.startsWith('imp:go');
                }),
                false
            );
            assert.equal(await readPendingInput(), null);
        });

        it('shows the counts with the limit message when nothing fits', async () => {
            scenario.preview = buildPreview({
                outcome: 'limitReached',
                jobId: null,
                kind: null,
                counts: {
                    found: 3,
                    active: 0,
                    gifted: 0,
                    duplicates: 0,
                    overLimit: 3,
                    withoutPrice: 0,
                    withoutPhoto: 0
                }
            });
            await startImportDialog();
            await sendText(PROFILE_URL);

            const { text } = webhook.lastMessage();

            assert.ok(
                text.includes(LL.listImport.preview.overLimit({ count: 3 }))
            );
            assert.ok(text.includes(LL.listImport.failure.limitReached()));
            assert.equal(text.includes(LL.listImport.preview.nothing()), false);
        });

        for (const outcome of ['userNotFound', 'timeout'] as const) {
            it(`explains ${outcome} and lets the user send another link`, async () => {
                scenario.preview = buildPreview({
                    outcome,
                    jobId: null,
                    kind: null,
                    counts: null
                });
                await startImportDialog();
                await sendText(PROFILE_URL);

                assert.equal(
                    webhook.lastMessage().text,
                    LL.listImport.failure[outcome]()
                );
                assert.deepEqual(await readPendingInput(), {
                    kind: 'listImportUrl',
                    source: 'rewish'
                });
                assert.equal(previewEvents[0]?.result, outcome);
            });
        }

        it('ends the dialog after an empty list', async () => {
            scenario.preview = buildPreview({
                outcome: 'empty',
                jobId: null,
                counts: null
            });
            await startImportDialog();
            await sendText(PROFILE_URL);

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.empty()
            );
            assert.equal(await readPendingInput(), null);
        });

        it('offers a refresh button when another import is running', async () => {
            scenario.preview = buildPreview({
                outcome: 'busy',
                jobId: 41,
                counts: null
            });
            await startImportDialog();
            await sendText(PROFILE_URL);

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.busy()
            );
            assert.ok(
                callbackDataOf(webhook.lastMessage()).includes(
                    encode({ type: 'listImportRefresh', jobId: 41 })
                )
            );
            assert.equal(await readPendingInput(), null);
        });

        it('treats a crashed preview as an upstream failure', async () => {
            scenario.previewThrows = true;
            await startImportDialog();
            await sendText(PROFILE_URL);

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.upstream()
            );
            assert.deepEqual(await readPendingInput(), {
                kind: 'listImportUrl',
                source: 'rewish'
            });
        });

        it('drops a preview whose claim was lost and cancels its job', async () => {
            let releasePreview = () => {};

            scenario.previewGate = new Promise<void>(resolve => {
                releasePreview = resolve;
            });
            await startImportDialog();
            await deliver(webhook.builders.message(alice, PROFILE_URL));
            await deliver(webhook.builders.callback(alice, navigate('home')));
            releasePreview();
            await drain();

            assert.equal(
                webhook.messageTexts().some(text => {
                    return text.includes(LL.listImport.preview.visibility());
                }),
                false
            );
            assert.deepEqual(cancelRequests, [{ userId, jobId: JOB_ID }]);
        });
    });

    describe('the visibility toggle', () => {
        it('stores the choice and swaps only the keyboard', async () => {
            await sendCallbackFrom(
                encode({
                    type: 'listImportVisibility',
                    jobId: JOB_ID,
                    visibility: 'hidden'
                }),
                previewKeyboard('public')
            );

            assert.deepEqual(visibilityRequests, [
                { userId, jobId: JOB_ID, visibility: 'hidden' }
            ]);

            const edits = callsOf('editMessageReplyMarkup');

            assert.equal(edits.length, 1);

            const keyboard = (
                edits[0]?.reply_markup as {
                    inline_keyboard: { text: string }[][];
                }
            ).inline_keyboard;

            assert.equal(
                keyboard[0]?.[0]?.text,
                LL.listImport.visibility.selected({
                    label: LL.listImport.visibility.hidden()
                })
            );
            assert.equal(
                keyboard[0]?.[1]?.text,
                LL.listImport.visibility.public()
            );
        });

        it('says the preview expired and strips the keyboard', async () => {
            scenario.visibilityGate = 'expired';
            await sendCallbackFrom(
                encode({
                    type: 'listImportVisibility',
                    jobId: JOB_ID,
                    visibility: 'public'
                }),
                previewKeyboard('hidden')
            );

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.expired()
            );
            assert.equal(callsOf('editMessageReplyMarkup').length, 1);
            assert.equal(
                callsOf('editMessageReplyMarkup')[0]?.reply_markup as
                    | object
                    | undefined,
                undefined
            );
        });
    });

    describe('the commit', () => {
        const commitCallback = encode({
            type: 'listImportCommit',
            jobId: JOB_ID
        });

        it('starts with the stored visibility and the progress message id, then finishes in the same message', async () => {
            scenario.progressSteps = [
                buildStatus({ created: 2 }),
                buildStatus({ created: 4 }),
                buildStatus({ created: 6 })
            ];
            await sendCallbackFrom(commitCallback, previewKeyboard('public'));

            assert.equal(
                webhook.callsOf('sendMessage').at(-1)?.payload.text,
                LL.listImport.reading()
            );
            assert.equal(startRequests.length, 1);
            assert.equal(startRequests[0]?.visibility, undefined);
            assert.equal(startRequests[0]?.userId, userId);
            assert.equal(startRequests[0]?.jobId, JOB_ID);

            const edits = callsOf('editMessageText');

            assert.ok(edits.length > 0);
            assert.equal(
                new Set(
                    edits.map(payload => {
                        return payload.message_id;
                    })
                ).size,
                1
            );
            assert.equal(startRequests[0]?.chatMessageId, edits[0]?.message_id);
            assert.deepEqual(runRequests, [
                {
                    jobId: JOB_ID,
                    trigger: 'request',
                    onProgress: runRequests[0]?.onProgress
                }
            ]);
            assert.deepEqual(kickRequests, [{ userId }]);

            const texts = editedTexts();
            const { done } = LL.listImport;

            assert.equal(
                texts[0],
                LL.listImport.progress({ created: 0, planned: 7 })
            );
            assert.equal(
                texts.at(-1),
                `${done.summary({ created: 7 })} ${done.gifted({ gifted: 2 })}\n${done.photos()}`
            );
            assert.equal(
                texts.some(text => {
                    return (
                        text ===
                        LL.listImport.progress({ created: 4, planned: 7 })
                    );
                }),
                false
            );

            const lastEdit = edits.at(-1);

            assert.deepEqual(
                (
                    lastEdit?.reply_markup as {
                        inline_keyboard: { callback_data?: string }[][];
                    }
                ).inline_keyboard
                    .flat()
                    .map(button => {
                        return button.callback_data;
                    }),
                [
                    navigate('wishlist'),
                    navigate('home'),
                    encode({ type: 'listImportRefresh', jobId: JOB_ID })
                ]
            );
        });

        it('never reads the choice off the keyboard', async () => {
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.equal(startRequests[0]?.visibility, undefined);
            assert.equal(
                Object.hasOwn(startRequests[0] ?? {}, 'visibility'),
                false
            );
        });

        it('shows the busy message with a refresh for the running import', async () => {
            scenario.start = { ok: false, outcome: 'busy', jobId: 77 };
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.deepEqual(editedTexts(), [LL.listImport.failure.busy()]);
            assert.equal(runRequests.length, 0);

            const markup = callsOf('editMessageText').at(-1)?.reply_markup as {
                inline_keyboard: { callback_data?: string }[][];
            };

            assert.ok(
                markup.inline_keyboard.flat().some(button => {
                    return (
                        button.callback_data ===
                        encode({ type: 'listImportRefresh', jobId: 77 })
                    );
                })
            );
        });

        it('shows the busy message without a refresh when the running import is gone', async () => {
            scenario.start = { ok: false, outcome: 'busy', jobId: null };
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            const markup = callsOf('editMessageText').at(-1)?.reply_markup as {
                inline_keyboard: { callback_data?: string }[][];
            };

            assert.equal(
                markup.inline_keyboard.flat().some(button => {
                    return button.callback_data?.startsWith('imp:r') ?? false;
                }),
                false
            );
        });

        it('shows the expired message for an outdated preview', async () => {
            scenario.start = { ok: false, outcome: 'expired' };
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.deepEqual(editedTexts(), [LL.listImport.failure.expired()]);
            assert.equal(runRequests.length, 0);
        });

        it('reports an interrupted import with its failure', async () => {
            scenario.finalStatus = buildStatus({
                state: 'failed',
                created: 3,
                failure: 'upstream'
            });
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.equal(
                editedTexts().at(-1),
                `${LL.listImport.failed({ created: 3 })}\n${LL.listImport.failure.upstream()}`
            );
        });

        it('reads the status when the run was already taken over', async () => {
            scenario.finalStatus = null;
            scenario.status = buildStatus({
                state: 'done',
                created: 5,
                photosPending: 0
            });
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.equal(
                editedTexts().at(-1),
                LL.listImport.done.summary({ created: 5 })
            );
            assert.equal(statusRequests.length, 1);
        });

        it('survives "message is not modified" while editing', async () => {
            webhook.respondToApi(call => {
                if (call.method === 'editMessageText') {
                    throw createTelegramApiError(
                        400,
                        'Bad Request: message is not modified'
                    );
                }

                return undefined;
            });
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.equal(runRequests.length, 1);
            assert.deepEqual(kickRequests, [{ userId }]);
            assert.equal(webhook.loggedErrors.length, 0);
        });

        it('sends a new message when the progress message can no longer be edited', async () => {
            webhook.respondToApi(call => {
                if (call.method === 'editMessageText') {
                    throw createTelegramApiError(
                        400,
                        'Bad Request: message to edit not found'
                    );
                }

                return undefined;
            });
            await sendCallbackFrom(commitCallback, previewKeyboard('hidden'));

            assert.ok(
                webhook.messageTexts().some(text => {
                    return text.includes(
                        LL.listImport.done.summary({ created: 7 })
                    );
                })
            );
        });
    });

    describe('cancel and refresh', () => {
        it('cancels the preview', async () => {
            await sendCallback(
                encode({ type: 'listImportCancel', jobId: JOB_ID })
            );

            assert.deepEqual(cancelRequests, [{ userId, jobId: JOB_ID }]);
            assert.equal(webhook.lastMessage().text, LL.listImport.cancelled());
        });

        it('says an already finished preview has expired', async () => {
            scenario.cancelGate = 'expired';
            await sendCallback(
                encode({ type: 'listImportCancel', jobId: JOB_ID })
            );

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.expired()
            );
        });

        it('shows the running progress with another refresh button and kicks the import', async () => {
            await sendCallback(
                encode({ type: 'listImportRefresh', jobId: JOB_ID })
            );

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.progress({ created: 3, planned: 7 })
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                encode({ type: 'listImportRefresh', jobId: JOB_ID })
            ]);
            assert.deepEqual(kickRequests, [{ userId }]);
        });

        it('shows the photos that are still loading after a finished import', async () => {
            scenario.status = buildStatus({
                state: 'done',
                created: 7,
                photosPending: 3
            });
            await sendCallback(
                encode({ type: 'listImportRefresh', jobId: JOB_ID })
            );

            assert.equal(
                webhook.lastMessage().text,
                `${LL.listImport.done.summary({ created: 7 })}\n${LL.listImport.done.photosLeft({ count: 3 })}`
            );
        });

        it('treats a missing job as expired', async () => {
            scenario.status = null;
            await sendCallback(
                encode({ type: 'listImportRefresh', jobId: 999 })
            );

            assert.equal(
                webhook.lastMessage().text,
                LL.listImport.failure.expired()
            );
        });
    });
});
