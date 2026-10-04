import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { parse as parseDotenv } from 'dotenv';

import {
    APP_API_PREFIX,
    APP_AUTH_SCHEME,
    type OwnWishDto,
    type WishListDto
} from '../../src/shared/app-api';
import { START_SCREENS } from '../../src/shared/app-links';

const DEFAULT_BASE_URL = 'http://localhost:8787';
const DEV_VARS_FILE = '.dev.vars';
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]'
]);
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2 };
const TELEGRAM_VERSION = '9.0';
const TELEGRAM_PLATFORM = 'unknown';
const WAIT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const CHROME_START_TIMEOUT_MS = 20_000;
const PROFILE_REMOVE_RETRIES = 5;
const NOT_IMPLEMENTED_STATUS = 501;
const SCREEN_SELECTOR = '[data-screen]';
const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
];

const THEMES = {
    light: {
        bg_color: '#ffffff',
        text_color: '#000000',
        secondary_bg_color: '#f0f0f0'
    },
    dark: {
        bg_color: '#17212b',
        text_color: '#f5f5f5',
        secondary_bg_color: '#232e3c'
    }
} as const;

type ThemeName = keyof typeof THEMES;

type CdpParams = Record<string, unknown>;

type CdpEventHandler = (params: CdpParams, sessionId?: string) => void;

interface CdpMessage {
    id?: number;
    method?: string;
    params?: CdpParams;
    result?: CdpParams;
    error?: { message: string };
    sessionId?: string;
}

export interface SmokeCredentials {
    botToken: string;
    adminId: number;
}

export class SmokeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SmokeError';
    }
}

export const assertLocalBase = (baseUrl: string) => {
    let hostname: string | null = null;

    try {
        hostname = new URL(baseUrl).hostname;
    } catch {
        hostname = null;
    }

    if (hostname === null || !LOCAL_HOSTNAMES.has(hostname)) {
        throw new SmokeError(
            `--base must point at localhost, 127.0.0.1 or [::1]; the smoke run signs initData with the bot token and must never reach a remote host (got ${baseUrl})`
        );
    }
};

const wait = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

export const readCredentials = (): SmokeCredentials => {
    const values = parseDotenv(fs.readFileSync(DEV_VARS_FILE));
    const botToken = values.BOT_TOKEN ?? '';
    const adminId = Number(values.ADMIN_ID);

    if (botToken === '' || !Number.isSafeInteger(adminId)) {
        throw new SmokeError(
            `${DEV_VARS_FILE} must define BOT_TOKEN and a numeric ADMIN_ID`
        );
    }

    return { botToken, adminId };
};

export const signInitData = (
    credentials: SmokeCredentials,
    startParam: string | null,
    nowSeconds = Math.floor(Date.now() / 1000)
) => {
    const fields: Record<string, string> = {
        auth_date: String(nowSeconds),
        query_id: 'AAHsmokeTestQuery',
        user: JSON.stringify({
            id: credentials.adminId,
            first_name: 'Smoke',
            last_name: 'Test',
            username: 'wishlist_smoke',
            language_code: 'uk',
            allows_write_to_pm: true
        }),
        ...(startParam !== null && { start_param: startParam })
    };
    const checkString = Object.keys(fields)
        .sort()
        .map(key => {
            return `${key}=${fields[key]}`;
        })
        .join('\n');
    const secret = createHmac('sha256', 'WebAppData')
        .update(credentials.botToken)
        .digest();
    const hash = createHmac('sha256', secret).update(checkString).digest('hex');

    return new URLSearchParams({ ...fields, hash }).toString();
};

export const buildAppUrl = (
    baseUrl: string,
    initData: string,
    theme: ThemeName,
    startParam: string | null
) => {
    const fragment = new URLSearchParams({
        tgWebAppData: initData,
        tgWebAppVersion: TELEGRAM_VERSION,
        tgWebAppPlatform: TELEGRAM_PLATFORM,
        tgWebAppThemeParams: JSON.stringify(THEMES[theme]),
        ...(startParam !== null && { tgWebAppStartParam: startParam })
    });

    return `${baseUrl}/app#${fragment.toString()}`;
};

export const findChrome = (explicit: string | undefined) => {
    const candidate = [explicit, process.env.CHROME_PATH, ...CHROME_CANDIDATES]
        .filter((value): value is string => {
            return typeof value === 'string' && value !== '';
        })
        .find(value => {
            return fs.existsSync(value);
        });

    if (candidate === undefined) {
        throw new SmokeError('Chrome was not found; pass --chrome <path>');
    }

    return candidate;
};

export const launchChrome = (executable: string, profileDirectory: string) => {
    const child = spawn(
        executable,
        [
            '--headless=new',
            '--remote-debugging-port=0',
            `--user-data-dir=${profileDirectory}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--hide-scrollbars',
            '--mute-audio',
            `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
            'about:blank'
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    return new Promise<{ child: ChildProcess; endpoint: string }>(
        (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new SmokeError('Chrome did not start in time'));
            }, CHROME_START_TIMEOUT_MS);
            let buffered = '';

            child.stderr?.on('data', (chunk: Buffer) => {
                buffered += chunk.toString('utf8');

                const match = /DevTools listening on (ws:\/\/\S+)/.exec(
                    buffered
                );

                if (match?.[1] !== undefined) {
                    clearTimeout(timer);
                    resolve({ child, endpoint: match[1] });
                }
            });
            child.on('exit', code => {
                clearTimeout(timer);
                reject(new SmokeError(`Chrome exited early with ${code}`));
            });
        }
    );
};

export const stopChrome = (child: ChildProcess) => {
    return new Promise<void>(resolve => {
        if (child.exitCode !== null) {
            resolve();

            return;
        }

        child.once('exit', () => {
            resolve();
        });
        child.kill();
    });
};

export class CdpConnection {
    private readonly socket: WebSocket;
    private nextId = 1;
    private readonly pending = new Map<
        number,
        { resolve: (value: CdpParams) => void; reject: (error: Error) => void }
    >();
    private readonly handlers = new Map<string, Set<CdpEventHandler>>();

    private constructor(socket: WebSocket) {
        this.socket = socket;
        socket.addEventListener('message', event => {
            this.receive(JSON.parse(String(event.data)) as CdpMessage);
        });
    }

    static open(endpoint: string) {
        return new Promise<CdpConnection>((resolve, reject) => {
            const socket = new WebSocket(endpoint);

            socket.addEventListener('open', () => {
                resolve(new CdpConnection(socket));
            });
            socket.addEventListener('error', () => {
                reject(new SmokeError('CDP connection failed'));
            });
        });
    }

    private receive(message: CdpMessage) {
        if (message.id !== undefined) {
            const waiter = this.pending.get(message.id);

            this.pending.delete(message.id);

            if (message.error) {
                waiter?.reject(new SmokeError(message.error.message));
            } else {
                waiter?.resolve(message.result ?? {});
            }

            return;
        }

        if (message.method !== undefined) {
            for (const handler of this.handlers.get(message.method) ?? []) {
                handler(message.params ?? {}, message.sessionId);
            }
        }
    }

    send(method: string, params: CdpParams = {}, sessionId?: string) {
        const id = this.nextId;

        this.nextId += 1;

        return new Promise<CdpParams>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(
                JSON.stringify({
                    id,
                    method,
                    params,
                    ...(sessionId !== undefined && { sessionId })
                })
            );
        });
    }

    on(method: string, handler: CdpEventHandler) {
        const set = this.handlers.get(method) ?? new Set<CdpEventHandler>();

        set.add(handler);
        this.handlers.set(method, set);

        return () => {
            set.delete(handler);
        };
    }

    close() {
        this.socket.close();
    }
}

type FetchRule = (request: {
    url: URL;
    method: string;
    postData: string | undefined;
}) => { status: number; body: unknown; delayMs?: number } | null;

export interface ScreenshotClip {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
}

export class SmokePage {
    readonly errors: string[] = [];
    private readonly unsubscribers: Array<() => void> = [];

    private constructor(
        private readonly cdp: CdpConnection,
        private readonly targetId: string,
        private readonly sessionId: string
    ) {}

    static async open(cdp: CdpConnection, viewportWidth = VIEWPORT.width) {
        const { targetId } = (await cdp.send('Target.createTarget', {
            url: 'about:blank'
        })) as { targetId: string };
        const { sessionId } = (await cdp.send('Target.attachToTarget', {
            targetId,
            flatten: true
        })) as { sessionId: string };
        const page = new SmokePage(cdp, targetId, sessionId);

        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Emulation.setDeviceMetricsOverride', {
            ...VIEWPORT,
            width: viewportWidth,
            mobile: true
        });
        page.listen();

        return page;
    }

    private listen() {
        this.unsubscribers.push(
            this.cdp.on('Runtime.exceptionThrown', (params, sessionId) => {
                if (sessionId === this.sessionId) {
                    const details = params.exceptionDetails as {
                        text?: string;
                        exception?: { description?: string };
                    };

                    this.errors.push(
                        details.exception?.description ??
                            details.text ??
                            'exception'
                    );
                }
            }),
            this.cdp.on('Runtime.consoleAPICalled', (params, sessionId) => {
                if (sessionId === this.sessionId && params.type === 'error') {
                    const args = params.args as Array<{
                        value?: unknown;
                        description?: string;
                    }>;

                    this.errors.push(
                        args
                            .map(arg => {
                                return String(arg.value ?? arg.description);
                            })
                            .join(' ')
                    );
                }
            }),
            this.cdp.on(
                'Page.javascriptDialogOpening',
                (_params, sessionId) => {
                    if (sessionId === this.sessionId) {
                        void this.send('Page.handleJavaScriptDialog', {
                            accept: true
                        });
                    }
                }
            )
        );
    }

    send(method: string, params: CdpParams = {}) {
        return this.cdp.send(method, params, this.sessionId);
    }

    async intercept(rule: FetchRule, stage: 'Request' | 'Response') {
        await this.send('Fetch.enable', {
            patterns: [
                {
                    urlPattern: `*${APP_API_PREFIX}/*`,
                    requestStage: stage
                }
            ]
        });
        this.unsubscribers.push(
            this.cdp.on('Fetch.requestPaused', (params, sessionId) => {
                if (sessionId === this.sessionId) {
                    void this.handlePaused(params, rule, stage);
                }
            })
        );
    }

    private async handlePaused(
        params: CdpParams,
        rule: FetchRule,
        stage: 'Request' | 'Response'
    ) {
        const requestId = params.requestId as string;
        const request = params.request as {
            url: string;
            method: string;
            postData?: string;
        };
        const passThrough =
            stage === 'Response' &&
            params.responseStatusCode !== NOT_IMPLEMENTED_STATUS;
        const reply = passThrough
            ? null
            : rule({
                  url: new URL(request.url),
                  method: request.method,
                  postData: request.postData
              });

        if (reply === null) {
            await this.send(
                stage === 'Response'
                    ? 'Fetch.continueResponse'
                    : 'Fetch.continueRequest',
                { requestId }
            );

            return;
        }

        await wait(reply.delayMs ?? 0);
        await this.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: reply.status,
            responseHeaders: [
                { name: 'Content-Type', value: 'application/json' }
            ],
            body: Buffer.from(
                reply.status === 204 ? '' : JSON.stringify(reply.body)
            ).toString('base64')
        });
    }

    async navigate(url: string) {
        await this.send('Page.navigate', { url });
    }

    async evaluate<Value>(expression: string): Promise<Value> {
        const result = (await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        })) as {
            result: { value?: unknown };
            exceptionDetails?: {
                text: string;
                exception?: { description?: string };
            };
        };

        if (result.exceptionDetails) {
            throw new SmokeError(
                `evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`
            );
        }

        return result.result.value as Value;
    }

    async waitFor(selector: string, timeoutMs = WAIT_TIMEOUT_MS) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (
                await this.evaluate<boolean>(
                    `Boolean(document.querySelector(${JSON.stringify(selector)}))`
                )
            ) {
                return;
            }

            await wait(POLL_INTERVAL_MS);
        }

        const html = await this.evaluate<string>(
            'document.body ? document.body.innerText.slice(0, 400) : ""'
        );

        throw new SmokeError(`timed out waiting for ${selector}: ${html}`);
    }

    async click(selector: string) {
        await this.evaluate(
            `document.querySelector(${JSON.stringify(selector)}).click()`
        );
    }

    async insertText(text: string) {
        for (const character of text) {
            await this.send('Input.insertText', { text: character });
            await this.settle();
        }
    }

    async settle() {
        await this.evaluate(
            'new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))'
        );
    }

    async setFiles(selector: string, files: string[]) {
        const { root } = (await this.send('DOM.getDocument')) as {
            root: { nodeId: number };
        };
        const { nodeId } = (await this.send('DOM.querySelector', {
            nodeId: root.nodeId,
            selector
        })) as { nodeId: number };

        await this.send('DOM.setFileInputFiles', { nodeId, files });
    }

    async screenshot(file: string, clip?: ScreenshotClip) {
        const { data } = (await this.send('Page.captureScreenshot', {
            format: 'png',
            ...(clip !== undefined && { clip })
        })) as { data: string };

        fs.writeFileSync(file, Buffer.from(data, 'base64'));
    }

    async close() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }

        await this.cdp.send('Target.closeTarget', { targetId: this.targetId });
    }
}

const FIXTURE_DATE = '2026-09-28T10:00:00.000Z';

const fixtureWish = (
    id: number,
    title: string,
    price: number,
    extra: Partial<OwnWishDto> = {}
): OwnWishDto => {
    return {
        id,
        title,
        description: `Fixture description for ${title}`,
        link: null,
        linkHost: null,
        price,
        currency: 'UAH',
        priority: 'none',
        hidden: false,
        images: [],
        createdAt: FIXTURE_DATE,
        updatedAt: FIXTURE_DATE,
        ...extra
    };
};

const createFixtureWishes = () => {
    return [
        fixtureWish(1, 'Board game Carcassonne', 1500, { priority: 'high' }),
        fixtureWish(2, 'Coffee grinder', 3200, {
            link: 'https://example.com/grinder',
            linkHost: 'example.com'
        }),
        fixtureWish(3, 'Camping lantern', 0, { hidden: true })
    ];
};

const WISH_PATH = new RegExp(`^${APP_API_PREFIX}/wishes/(\\d+)$`);

const createWishFixtureRule = () => {
    const wishes = createFixtureWishes();

    const rule: FetchRule = ({ url, method, postData }) => {
        if (method === 'GET' && url.pathname === `${APP_API_PREFIX}/wishes`) {
            const body: WishListDto = {
                items: wishes,
                total: wishes.length,
                nextOffset: null,
                filter: null,
                giftedTotal: 0
            };

            return { status: 200, body };
        }

        const wishId = Number(WISH_PATH.exec(url.pathname)?.[1]);
        const wish = wishes.find(item => {
            return item.id === wishId;
        });

        if (wish === undefined) {
            return null;
        }

        if (method === 'PATCH') {
            Object.assign(wish, JSON.parse(postData ?? '{}'));

            return { status: 200, body: wish };
        }

        return method === 'GET' ? { status: 200, body: wish } : null;
    };

    return rule;
};

export const callApi = async (
    baseUrl: string,
    initData: string,
    method: string,
    pathname: string,
    body?: unknown
) => {
    const response = await fetch(`${baseUrl}${APP_API_PREFIX}${pathname}`, {
        method,
        headers: {
            Authorization: `${APP_AUTH_SCHEME} ${initData}`,
            ...(body !== undefined && { 'Content-Type': 'application/json' })
        },
        ...(body !== undefined && { body: JSON.stringify(body) })
    });
    const payload: unknown = await response.json().catch(() => null);

    return { status: response.status, payload };
};

const readTotal = (payload: unknown) => {
    return typeof payload === 'object' &&
        payload !== null &&
        'total' in payload &&
        typeof payload.total === 'number'
        ? payload.total
        : null;
};

const SEED_WISHES = [
    { title: 'Настільна гра «Каркасон»', price: 1500, priority: 'high' },
    { title: 'Кавомолка', price: 3200, link: 'https://example.com/grinder' },
    { title: 'Ліхтар для кемпінгу', hidden: true }
];

/** Registers the admin, then adds the sample wishes and a share only to an empty list, so reruns do not pile up duplicates. */
export const seedThroughApi = async (baseUrl: string, initData: string) => {
    const statuses = [
        (
            await callApi(baseUrl, initData, 'PUT', '/me/visibility', {
                type: 'username'
            })
        ).status
    ];
    const list = await callApi(baseUrl, initData, 'GET', '/wishes');

    statuses.push(list.status);

    if (list.status === 200 && readTotal(list.payload) === 0) {
        for (const wish of SEED_WISHES) {
            statuses.push(
                (await callApi(baseUrl, initData, 'POST', '/wishes', wish))
                    .status
            );
        }

        statuses.push(
            (await callApi(baseUrl, initData, 'POST', '/share/publish')).status
        );
    }

    return statuses;
};

const START_PARAMS: ReadonlyArray<string | null> = [null, ...START_SCREENS];
const STALE_AUTH_AGE_SECONDS = 2 * 24 * 60 * 60;

interface SmokeCase {
    name: string;
    url: string;
    expectedScreen: string | null;
}

const buildCases = (
    baseUrl: string,
    credentials: SmokeCredentials
): SmokeCase[] => {
    const themed = (Object.keys(THEMES) as ThemeName[]).flatMap(theme => {
        return START_PARAMS.map(startParam => {
            return {
                name: `${startParam ?? 'home'}-${theme}`,
                url: buildAppUrl(
                    baseUrl,
                    signInitData(credentials, startParam),
                    theme,
                    startParam
                ),
                expectedScreen: null
            };
        });
    });
    const staleInitData = signInitData(
        credentials,
        null,
        Math.floor(Date.now() / 1000) - STALE_AUTH_AGE_SECONDS
    );

    return [
        ...themed,
        {
            name: 'outside-telegram-light',
            url: `${baseUrl}/app`,
            expectedScreen: 'outsideTelegram'
        },
        {
            name: 'session-expired-dark',
            url: buildAppUrl(baseUrl, staleInitData, 'dark', null),
            expectedScreen: 'sessionExpired'
        }
    ];
};

const captureCase = async (
    cdp: CdpConnection,
    smokeCase: SmokeCase,
    outDirectory: string
) => {
    const page = await SmokePage.open(cdp);
    const failures: string[] = [];
    let file: string | null = null;

    await page.intercept(createWishFixtureRule(), 'Response');
    await page.navigate(smokeCase.url);

    try {
        await page.waitFor('[data-screen][aria-busy="false"]');
        await page.settle();

        const screen = await page.evaluate<string>(
            `document.querySelector(${JSON.stringify(SCREEN_SELECTOR)}).dataset.screen`
        );

        if (
            smokeCase.expectedScreen !== null &&
            screen !== smokeCase.expectedScreen
        ) {
            failures.push(
                `${smokeCase.name}: expected ${smokeCase.expectedScreen}, got ${screen}`
            );
        }

        file = path.join(outDirectory, `${smokeCase.name}.png`);
        await page.screenshot(file);
    } catch (error) {
        failures.push(`${smokeCase.name}: ${String(error)}`);
    }

    failures.push(
        ...page.errors.map(message => {
            return `${smokeCase.name}: ${message}`;
        })
    );
    await page.close();

    return { failures, file };
};

const runScreens = async (
    cdp: CdpConnection,
    baseUrl: string,
    credentials: SmokeCredentials,
    outDirectory: string
) => {
    const failures: string[] = [];
    const files: string[] = [];

    for (const smokeCase of buildCases(baseUrl, credentials)) {
        const result = await captureCase(cdp, smokeCase, outDirectory);

        failures.push(...result.failures);

        if (result.file !== null) {
            files.push(result.file);
        }
    }

    return { failures, files };
};

const main = async () => {
    const { values } = parseArgs({
        allowNegative: true,
        options: {
            base: { type: 'string', default: DEFAULT_BASE_URL },
            out: { type: 'string' },
            chrome: { type: 'string' },
            seed: { type: 'boolean', default: true },
            'check-alignment': { type: 'boolean', default: false },
            shots: { type: 'string' }
        }
    });
    const baseUrl = values.base.replace(/\/+$/, '');

    assertLocalBase(baseUrl);

    if (values['check-alignment']) {
        const { runAlignmentCheck } = await import('./app-alignment');

        process.exitCode = await runAlignmentCheck({
            baseUrl,
            chrome: values.chrome,
            shotsDirectory: values.shots
        });

        return;
    }

    const outDirectory = path.resolve(
        values.out ?? path.join(os.tmpdir(), 'wishlist-app-smoke')
    );
    const credentials = readCredentials();
    const profileDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wishlist-smoke-chrome-')
    );

    fs.mkdirSync(outDirectory, { recursive: true });

    const { child, endpoint } = await launchChrome(
        findChrome(values.chrome),
        profileDirectory
    );
    const cdp = await CdpConnection.open(endpoint);
    let failed = false;

    try {
        if (values.seed) {
            const seeded = await seedThroughApi(
                baseUrl,
                signInitData(credentials, null)
            );

            console.log(`seed statuses: ${seeded.join(', ')}`);
        }

        const { failures, files } = await runScreens(
            cdp,
            baseUrl,
            credentials,
            outDirectory
        );

        console.log(`${files.length} screenshots in ${outDirectory}`);

        for (const failure of failures) {
            console.log(`FAIL ${failure}`);
        }

        failed = failures.length > 0;
    } finally {
        cdp.close();
        await stopChrome(child);
        fs.rmSync(profileDirectory, {
            recursive: true,
            force: true,
            maxRetries: PROFILE_REMOVE_RETRIES
        });
    }

    if (failed) {
        process.exitCode = 1;
    }
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
