import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { formatCurrency } from '../../src/bot/content/intl';
import { getMessages } from '../../src/bot/content/messages';
import { LINK_OFFER_TTL_MS } from '../../src/bot/runtime/link-offer';
import type {
    BotLinkImport,
    LinkImportCompletedInput
} from '../../src/bot/runtime/types';
import { createWishlistBot } from '../../src/bot/telegraf/bot';
import type {
    ExtractedProduct,
    ImportedWishDraft,
    ImportPreviewInput,
    LinkImportResult,
    StageImagesInput
} from '../../src/bot/services/link-import/types';
import { CURRENCIES } from '../../src/shared/money';
import { handleUpdateWithWishlistBot } from '../../src/worker/routes/telegram';
import { createTestUser } from '../fixtures/telegram';
import { createWorkerEnv } from './d1-harness';
import {
    BOT_TOKEN,
    callbackDataOf,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';
import type { Update } from 'telegraf/types';

const LL = getMessages('uk');
const IMPORT = LL.wishlist.add.import;
const PRODUCT_URL = 'https://www.rozetka.com.ua/ua/apple-iphone-15/p123456/';
const URL_HASH = 'a'.repeat(32);
const BOT_KEY = 'bot-link-import-test';
const MARKER_COLUMN_QUERY =
    'SELECT state FROM sessions WHERE telegram_user_id = ?';

interface WishRow {
    id: number;
    title: string;
    description: string | null;
    link: string | null;
    images: string;
    price: number;
    currency: string;
    removed: number;
    done: number;
}

interface ImportScenario {
    result?: Partial<LinkImportResult>;
    product?: Partial<ExtractedProduct> | null;
    stagedIndexes?: number[] | 'all';
    gate?: Promise<void>;
    limiterAllows?: boolean;
    enabled?: boolean;
    throws?: boolean;
}

const buildProduct = (
    overrides: Partial<ExtractedProduct> = {}
): ExtractedProduct => {
    return {
        title: 'Apple iPhone 15 128GB',
        description: 'Смартфон з чудовою камерою',
        price: 32999,
        currency: 'UAH',
        images: [
            'https://cdn.rozetka.example/1.jpg',
            'https://cdn.rozetka.example/2.jpg',
            'https://cdn.rozetka.example/3.jpg'
        ],
        source: 'jsonld',
        canonicalUrl: PRODUCT_URL,
        finalUrl: PRODUCT_URL,
        ...overrides
    };
};

const toFakeDraft = (
    product: ExtractedProduct | null,
    link: string
): ImportedWishDraft => {
    const supported = CURRENCIES.some(currency => {
        return currency === product?.currency;
    });
    const hasPrice = product?.price !== null && product?.price !== undefined;

    return {
        title: product?.title ?? null,
        description: product?.description ?? null,
        link,
        price: supported && hasPrice ? (product?.price ?? null) : null,
        currency:
            supported && hasPrice
                ? (product?.currency as ImportedWishDraft['currency'])
                : null,
        sourcePrice:
            !supported && hasPrice && product?.currency
                ? { amount: product.price ?? 0, currency: product.currency }
                : null
    };
};

describe('Bot link import', () => {
    let webhook: WebhookHarness;
    let scenario: ImportScenario;
    let pendingTasks: Promise<unknown>[];
    let events: LinkImportCompletedInput[];
    let runCalls: string[];
    let stageCalls: StageImagesInput[];
    let previewCalls: ImportPreviewInput[];

    const alice = createTestUser(301, {
        first_name: 'Alice',
        username: 'alice'
    });

    const buildResult = (): LinkImportResult => {
        const product =
            scenario.product === null
                ? null
                : buildProduct(scenario.product ?? {});

        return {
            outcome: product === null ? 'notProduct' : 'ok',
            product,
            normalizedUrl: PRODUCT_URL,
            host: 'www.rozetka.com.ua',
            urlHash: URL_HASH,
            shop: 'rozetka',
            cache: 'miss',
            elapsedMs: 1200,
            ...scenario.result
        };
    };

    const buildLinkImport = (): BotLinkImport => {
        return {
            async run(_deps, request) {
                runCalls.push(request.url);
                await scenario.gate;

                if (scenario.throws) {
                    throw new Error('import crashed');
                }

                return buildResult();
            },
            async stageImages(_deps, input) {
                stageCalls.push(input);

                const indexes =
                    scenario.stagedIndexes === 'all' ||
                    scenario.stagedIndexes === undefined
                        ? input.indexes
                        : scenario.stagedIndexes;

                return indexes.map(index => {
                    return {
                        index,
                        contentType: 'image/jpeg' as const,
                        bytes: 1000,
                        transform: 'passthrough' as const
                    };
                });
            },
            async loadStagedImage(_deps, input) {
                return {
                    body: new ArrayBuffer(input.index + 1),
                    contentType: 'image/jpeg' as const
                };
            },
            toDraft: toFakeDraft,
            async sendPreview(_api, input) {
                previewCalls.push(input);

                return {
                    fileIds: input.images.map((_image, index) => {
                        return `imported-${index}`;
                    }),
                    textDelivered: true
                };
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
                BOT_ENVIRONMENT: 'local',
                LINK_IMPORT_ENABLED:
                    scenario.enabled === false ? 'false' : 'true'
            }),
            APP_IMPORT_LIMITER: {
                async limit() {
                    return { success: scenario.limiterAllows !== false };
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
                    linkImport: buildLinkImport(),
                    telemetry: {
                        ...(deps.telemetry as NonNullable<
                            typeof deps.telemetry
                        >),
                        linkImportCompleted(input) {
                            events.push(input);
                        }
                    }
                });
            },
            {
                waitUntil(promise) {
                    pendingTasks.push(promise);
                }
            }
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

    const readWishes = () => {
        return webhook.queryAll<WishRow>('SELECT * FROM wishes ORDER BY id');
    };

    const readPendingInput = async () => {
        const row = await webhook.queryOne<{ state: string }>(
            MARKER_COLUMN_QUERY,
            alice.id
        );

        return (JSON.parse(row?.state ?? '{}') as { pendingInput?: unknown })
            .pendingInput;
    };

    const readLinkOffer = async () => {
        const row = await webhook.queryOne<{ state: string }>(
            MARKER_COLUMN_QUERY,
            alice.id
        );

        return (
            JSON.parse(row?.state ?? '{}') as {
                linkOffer?: { url: string; createdAt: number };
            }
        ).linkOffer;
    };

    const lastText = () => {
        return webhook.lastMessage().text;
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
        scenario = {};
        pendingTasks = [];
        events = [];
        runCalls = [];
        stageCalls = [];
        previewCalls = [];
        await webhook.registerUser(alice);
    });

    describe('the combined prompt', () => {
        it('asks for a link or a title and offers a no-link button, Back and Home', async () => {
            await sendCallback('n:add');

            const prompt = webhook.lastMessage();

            assert.equal(prompt.text, IMPORT.prompt({ max: 200 }));
            assert.deepEqual(callbackDataOf(prompt), [
                'w:add:nl',
                'n:wl',
                'n:home'
            ]);
            assert.deepEqual(await readPendingInput(), {
                kind: 'wishTitleNew'
            });
        });

        it('shows the plain title prompt after the no-link button', async () => {
            await sendCallback('n:add');
            await sendCallback('w:add:nl');

            assert.equal(lastText(), LL.wishlist.add.description('200'));
            assert.deepEqual(await readPendingInput(), {
                kind: 'wishTitleNew'
            });

            await sendText('Велосипед');

            assert.equal((await readWishes())[0]?.title, 'Велосипед');
            assert.equal(runCalls.length, 0);
        });

        it('treats the no-link label typed as text like the button', async () => {
            await sendCallback('n:add');
            await sendText(IMPORT.withoutLink());

            assert.equal(lastText(), LL.wishlist.add.description('200'));
            assert.equal((await readWishes()).length, 0);
        });

        it('creates a plain wish from a typed title without starting an import', async () => {
            await sendCallback('n:add');
            await sendText('Книга про Rust');

            assert.equal(runCalls.length, 0);
            assert.equal((await readWishes())[0]?.title, 'Книга про Rust');
            assert.equal((await readWishes())[0]?.link, null);
        });
    });

    describe('with the kill switch off', () => {
        it('keeps the plain title behaviour', async () => {
            scenario.enabled = false;
            await sendCallback('n:add');

            assert.equal(lastText(), LL.wishlist.add.description('200'));
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                'n:wl',
                'n:home'
            ]);

            await sendText(PRODUCT_URL);

            assert.equal(runCalls.length, 0);
            assert.equal(lastText(), LL.wishlist.add.description('200'));
            assert.equal((await readWishes()).length, 0);
        });

        it('does not offer a link sent outside a dialog', async () => {
            scenario.enabled = false;
            await sendText(PRODUCT_URL);

            assert.equal(
                webhook.messageTexts().includes(IMPORT.offer.text()),
                false
            );
            assert.equal(await readLinkOffer(), undefined);
        });
    });

    describe('a bare link in the add dialog', () => {
        beforeEach(async () => {
            await sendCallback('n:add');
            webhook.clearApiCalls();
        });

        it('answers immediately, imports in the deferred task and fills the wish', async () => {
            await sendText(PRODUCT_URL);

            const texts = webhook.messageTexts();

            assert.equal(texts[0], IMPORT.searching());
            assert.deepEqual(runCalls, [PRODUCT_URL]);

            const [wish] = await readWishes();

            assert.equal(wish?.title, 'Apple iPhone 15 128GB');
            assert.equal(wish?.description, 'Смартфон з чудовою камерою');
            assert.equal(wish?.link, PRODUCT_URL);
            assert.equal(wish?.price, 32999);
            assert.equal(wish?.currency, 'UAH');
            assert.equal(await readPendingInput(), null);
        });

        it('stores the file ids of the preview message and sends no second album', async () => {
            await sendText(PRODUCT_URL);

            const [wish] = await readWishes();

            assert.equal(previewCalls.length, 1);
            assert.equal(previewCalls[0]?.images.length, 3);
            assert.deepEqual(JSON.parse(wish?.images ?? '[]'), [
                'imported-0',
                'imported-1',
                'imported-2'
            ]);
            assert.equal(webhook.callsOf('sendMediaGroup').length, 0);
            assert.equal(webhook.callsOf('sendPhoto').length, 0);
            assert.deepEqual(stageCalls[0]?.indexes, [0, 1, 2]);
            assert.equal(stageCalls[0]?.urlHash, URL_HASH);
        });

        it('shows the filled-from line with the edit menu and a cancel button', async () => {
            await sendText(PRODUCT_URL);

            const [wish] = await readWishes();
            const menu = webhook.lastMessage();

            assert.ok(
                menu.text.startsWith(
                    IMPORT.filledFrom({ host: 'rozetka.com.ua' })
                )
            );
            assert.ok(menu.text.endsWith(LL.wishlist.edit.description()));
            assert.ok(callbackDataOf(menu).includes(`w:r:n:${wish?.id}`));
            assert.ok(
                menu.reply_markup?.inline_keyboard?.flat().some(button => {
                    return button.text === IMPORT.cancel();
                })
            );
            assert.equal(
                webhook.messageTexts().filter(text => {
                    return text.includes(LL.wishlist.edit.description());
                }).length,
                1
            );
        });

        it('removes the wish without marking it done when cancelled', async () => {
            await sendText(PRODUCT_URL);

            const [wish] = await readWishes();

            await sendCallback(`w:r:n:${wish?.id}`);

            const [removed] = await readWishes();

            assert.equal(removed?.removed, 1);
            assert.equal(removed?.done, 0);
        });

        it('emits one closed-label completion event', async () => {
            await sendText(PRODUCT_URL);

            assert.deepEqual(events, [
                {
                    result: 'ok',
                    source: 'jsonld',
                    shop: 'rozetka',
                    cacheOutcome: 'miss',
                    imagesStaged: 3,
                    imagesIngested: 3,
                    elapsedMs: 1200,
                    transform: 'passthrough'
                }
            ]);
        });

        it('keeps a foreign-currency price out of the wish and shows it as a hint', async () => {
            scenario.product = { price: 49.99, currency: 'GBP' };
            await sendText(PRODUCT_URL);

            const [wish] = await readWishes();

            assert.equal(wish?.price, 0);
            assert.ok(
                webhook.lastMessage().text.includes(
                    IMPORT.sourcePrice({
                        price: formatCurrency(49.99, 'uk', 'GBP')
                    })
                )
            );
        });

        it('saves the wish without photos and says so when no image survives', async () => {
            scenario.stagedIndexes = [];
            await sendText(PRODUCT_URL);

            const [wish] = await readWishes();

            assert.equal(previewCalls.length, 0);
            assert.equal(wish?.images, '[]');
            assert.ok(
                webhook.lastMessage().text.includes(IMPORT.photosFailed())
            );
            assert.ok(
                webhook.messageTexts().some(text => {
                    return text.includes('Apple iPhone 15 128GB');
                })
            );
        });

        it('imports a product without images and sends the wish card as text', async () => {
            scenario.product = { images: [] };
            await sendText(PRODUCT_URL);

            assert.equal(stageCalls.length, 0);
            assert.equal(previewCalls.length, 0);
            assert.equal(
                webhook.lastMessage().text.includes(IMPORT.photosFailed()),
                false
            );
            assert.equal((await readWishes()).length, 1);
        });

        it('asks for a title and remembers the link when the page has no product', async () => {
            scenario.product = null;
            scenario.result = { outcome: 'blocked' };
            await sendText(PRODUCT_URL);

            assert.equal(lastText(), IMPORT.failed());
            assert.equal((await readWishes()).length, 0);
            assert.deepEqual(await readPendingInput(), {
                kind: 'wishTitleNew',
                link: PRODUCT_URL
            });

            await sendText('Айфон');

            const [wish] = await readWishes();

            assert.equal(wish?.title, 'Айфон');
            assert.equal(wish?.link, PRODUCT_URL);
            assert.equal(await readPendingInput(), null);
        });

        it('treats a thrown import like a timeout', async () => {
            scenario.throws = true;
            await sendText(PRODUCT_URL);

            assert.equal(lastText(), IMPORT.failed());
            assert.equal(events[0]?.result, 'timeout');
        });

        it('says so when the shop limiter refused the host', async () => {
            scenario.product = null;
            scenario.result = { outcome: 'rateLimited' };
            await sendText(PRODUCT_URL);

            assert.equal(lastText(), IMPORT.rateLimited());
            assert.deepEqual(await readPendingInput(), {
                kind: 'wishTitleNew',
                link: PRODUCT_URL
            });
        });

        it('refuses before searching when the per-user limiter is exhausted', async () => {
            scenario.limiterAllows = false;
            await sendText(PRODUCT_URL);

            assert.equal(runCalls.length, 0);
            assert.deepEqual(webhook.messageTexts(), [IMPORT.rateLimited()]);
            assert.deepEqual(await readPendingInput(), {
                kind: 'wishTitleNew',
                link: PRODUCT_URL
            });
            assert.equal(events[0]?.result, 'rateLimited');
        });

        it('drops the result when the user moved on before the import finished', async () => {
            let release = () => {};

            scenario.gate = new Promise<void>(resolve => {
                release = resolve;
            });

            await deliver(webhook.builders.message(alice, PRODUCT_URL));
            await deliver(webhook.builders.callback(alice, 'n:home'));
            release();
            await drain();

            assert.equal((await readWishes()).length, 0);
            assert.equal(previewCalls.length, 0);
            assert.equal(
                webhook.messageTexts().some(text => {
                    return text.includes(LL.wishlist.edit.description());
                }),
                false
            );
            assert.equal(events.length, 1);
        });

        it('drops the result when the user typed a title while the import was running', async () => {
            let release = () => {};

            scenario.gate = new Promise<void>(resolve => {
                release = resolve;
            });

            await deliver(webhook.builders.message(alice, PRODUCT_URL));
            await deliver(webhook.builders.message(alice, 'Власна назва'));
            release();
            await drain();

            const wishes = await readWishes();

            assert.equal(wishes.length, 1);
            assert.equal(wishes[0]?.title, 'Власна назва');
        });
    });

    describe('share-to-bot', () => {
        it('offers to add a link sent outside any dialog and keeps the url in the session', async () => {
            await sendText(PRODUCT_URL);

            const offer = webhook.lastMessage();
            const stored = await readLinkOffer();

            assert.equal(offer.text, IMPORT.offer.text());
            assert.equal(stored?.url, PRODUCT_URL);
            assert.deepEqual(callbackDataOf(offer), [
                `w:add:lk:${stored?.createdAt}`,
                'n:home'
            ]);
            assert.equal(runCalls.length, 0);
            assert.ok(
                callbackDataOf(offer).every(data => {
                    return new TextEncoder().encode(data).length <= 64;
                })
            );
        });

        it('imports the stored link when the offer is accepted', async () => {
            await sendText(PRODUCT_URL);

            const stored = await readLinkOffer();

            await sendCallback(`w:add:lk:${stored?.createdAt}`);

            const [wish] = await readWishes();

            assert.deepEqual(runCalls, [PRODUCT_URL]);
            assert.equal(wish?.title, 'Apple iPhone 15 128GB');
            assert.equal(wish?.link, PRODUCT_URL);
            assert.equal(await readLinkOffer(), undefined);
        });

        it('rejects an accept for an older offer after a newer link replaced it', async () => {
            await sendText(PRODUCT_URL);

            const first = await readLinkOffer();

            await sendText('https://www.ikea.com/pl/pl/p/malm-123/');
            await sendCallback(`w:add:lk:${first?.createdAt}`);

            assert.equal(lastText(), IMPORT.offer.expired());
            assert.equal(runCalls.length, 0);
            assert.equal((await readWishes()).length, 0);
        });

        it('expires the offer after fifteen minutes', async () => {
            await sendText(PRODUCT_URL);

            const stored = await readLinkOffer();
            const staleCreatedAt = Date.now() - LINK_OFFER_TTL_MS - 1000;

            await webhook.d1.env.DB.prepare(
                'UPDATE sessions SET state = ? WHERE telegram_user_id = ?'
            )
                .bind(
                    JSON.stringify({
                        v: 1,
                        pendingInput: null,
                        find: null,
                        linkOffer: {
                            url: stored?.url,
                            createdAt: staleCreatedAt
                        }
                    }),
                    alice.id
                )
                .run();
            await sendCallback(`w:add:lk:${staleCreatedAt}`);

            assert.equal(lastText(), IMPORT.offer.expired());
            assert.equal(runCalls.length, 0);
        });

        it('ignores plain text and unregistered users', async () => {
            await sendText('привіт');

            assert.equal(
                webhook.messageTexts().includes(IMPORT.offer.text()),
                false
            );

            const stranger = createTestUser(302, { first_name: 'Bob' });

            await send(webhook.builders.message(stranger, PRODUCT_URL));

            assert.equal(
                webhook.messageTexts().includes(IMPORT.offer.text()),
                false
            );
        });

        it('does not intercept a link typed while another dialog waits for input', async () => {
            await sendCallback('n:find');
            webhook.clearApiCalls();
            await sendText(PRODUCT_URL);

            assert.equal(
                webhook.messageTexts().includes(IMPORT.offer.text()),
                false
            );
            assert.equal(runCalls.length, 0);
        });
    });
});
