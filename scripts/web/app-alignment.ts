import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    ALIGNMENT_PROBE_SOURCE,
    ALIGNMENT_TOLERANCE_PX,
    type AlignmentReport,
    type AlignmentSample
} from './alignment-probe';
import { APP_API_PREFIX } from '../../src/shared/app-api';
import {
    assertLocalBase,
    buildAppUrl,
    callApi,
    CdpConnection,
    findChrome,
    launchChrome,
    readCredentials,
    seedThroughApi,
    signInitData,
    SmokePage,
    stopChrome,
    type SmokeCredentials
} from './app-smoke';

const LOCALES = ['uk', 'en', 'pl'] as const;
const VIEWPORT_WIDTHS = [360, 390] as const;
const THEME_NAMES = ['light', 'dark'] as const;
const SHOT_WIDTH = 390;
const SHOT_LOCALE = 'uk';
const SHOT_THEME = 'light';
const WEBFONT_FAMILIES = ['Commissioner', 'Unbounded'] as const;
const DESCRIPTION_MAX_ROWS = 12;
const DESCRIPTION_LINES = 40;
const SHORT_DESCRIPTION_LINES = 5;
const HEIGHT_TOLERANCE_PX = 2;
const MAX_PRINTED_FAILURES = 40;
const PROFILE_REMOVE_RETRIES = 5;

type Locale = (typeof LOCALES)[number];
type ThemeName = (typeof THEME_NAMES)[number];

interface AlignmentScreen {
    name: string;
    start: string | null;
    openRow?: number;
    skipLinkStep?: boolean;
}

const SCREENS: readonly AlignmentScreen[] = [
    { name: 'home', start: null },
    { name: 'settings', start: 'settings' },
    { name: 'visibility', start: 'visibility' },
    { name: 'language', start: 'language' },
    { name: 'payments', start: 'payments' },
    { name: 'share', start: 'share' },
    { name: 'currency', start: 'settings', openRow: 2 },
    { name: 'delivery', start: 'settings', openRow: 3 },
    { name: 'linkImport', start: 'add' },
    { name: 'wishEditor', start: 'add', skipLinkStep: true },
    { name: 'feedback', start: 'feedback' },
    { name: 'find', start: 'find' }
];

interface AlignmentOptions {
    baseUrl: string;
    chrome: string | undefined;
    shotsDirectory: string | undefined;
}

const DESCRIPTION_SELECTOR =
    "document.querySelectorAll('textarea.field-control')[1]";

interface TextareaMeasure {
    height: number;
    fieldSizing: string;
    autosize: string | null;
    lineHeight: number;
    verticalChrome: number;
    scrollable: boolean;
    rows: number;
}

const wait = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

const LANDING_SCREENS: Record<string, string> = { add: 'linkImport' };
const WITHOUT_LINK_BUTTON_SELECTOR = '.link-import-actions .text-button';
const EDITOR_FIELD_SELECTOR = 'textarea.field-control';
const OPEN_ATTEMPTS = 5;
const ATTEMPT_TIMEOUT_MS = 6_000;
const RATE_LIMIT_PAUSE_MS = 5_000;

const landingScreen = (screen: AlignmentScreen) => {
    const start = screen.start ?? 'home';

    return screen.openRow === undefined
        ? (LANDING_SCREENS[start] ?? start)
        : 'settings';
};

const waitForScreen = async (page: SmokePage, name: string) => {
    try {
        await page.waitFor(
            `[data-screen="${name}"][aria-busy="false"]`,
            ATTEMPT_TIMEOUT_MS
        );

        return true;
    } catch {
        await wait(RATE_LIMIT_PAUSE_MS);

        return false;
    }
};

const openScreen = async (
    page: SmokePage,
    screen: AlignmentScreen,
    url: string
) => {
    for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt += 1) {
        await page.navigate(url);

        if (await waitForScreen(page, landingScreen(screen))) {
            break;
        }
    }

    await page.waitFor(
        screen.openRow === undefined ? '[data-screen] *' : '.menu-row'
    );
    await page.settle();

    if (screen.openRow !== undefined) {
        await page.evaluate(
            `document.querySelectorAll('.menu-row')[${screen.openRow}].click()`
        );
        await page.waitFor(`[data-screen="${screen.name}"][aria-busy="false"]`);
        await page.settle();
    }

    if (screen.skipLinkStep === true) {
        await page.evaluate(
            `document.querySelector('${WITHOUT_LINK_BUTTON_SELECTOR}').click()`
        );
        await page.waitFor(EDITOR_FIELD_SELECTOR);
        await page.settle();
    }

    await wait(150);
};

const formatSample = (sample: AlignmentSample) => {
    return `${sample.row} / ${sample.item}: delta ${sample.delta.toFixed(2)}px (item ${sample.itemCenter.toFixed(1)}, optical ${sample.opticalCenter.toFixed(1)}, line box ${sample.lineCenter.toFixed(1)}, ${sample.family})`;
};

const checkScreen = async (
    cdp: CdpConnection,
    credentials: SmokeCredentials,
    context: {
        baseUrl: string;
        width: number;
        theme: ThemeName;
        locale: Locale;
        screen: AlignmentScreen;
        shotsDirectory: string | undefined;
    }
) => {
    const { baseUrl, width, theme, locale, screen, shotsDirectory } = context;
    const page = await SmokePage.open(cdp, width);
    const failures: string[] = [];
    const label = `w${width} ${theme} ${locale} ${screen.name}`;
    let samples: AlignmentSample[] = [];

    try {
        await openScreen(
            page,
            screen,
            buildAppUrl(
                baseUrl,
                signInitData(credentials, screen.start),
                theme,
                screen.start
            )
        );

        const report = await page.evaluate<AlignmentReport>(
            ALIGNMENT_PROBE_SOURCE
        );

        samples = report.samples;

        for (const sample of samples) {
            if (
                !WEBFONT_FAMILIES.some(family => {
                    return sample.family.startsWith(family);
                })
            ) {
                failures.push(
                    `${label}: ${sample.row} resolved ${sample.family}, not the webfont`
                );
            }

            if (Math.abs(sample.delta) > ALIGNMENT_TOLERANCE_PX) {
                failures.push(`${label}: ${formatSample(sample)}`);
            }
        }

        for (const narrow of report.narrowControls) {
            failures.push(`${label}: ${narrow}`);
        }

        for (const wrapped of report.pairLabelsWrapped) {
            failures.push(`${label}: pairs label wraps: ${wrapped}`);
        }

        for (const wrapped of report.segmentedLabelsWrapped) {
            failures.push(
                `${label}: segmented label wraps or is clipped: ${wrapped}`
            );
        }

        if (
            shotsDirectory !== undefined &&
            width === SHOT_WIDTH &&
            theme === SHOT_THEME &&
            locale === SHOT_LOCALE
        ) {
            await page.screenshot(
                path.join(
                    shotsDirectory,
                    `${screen.name}-${theme}-${locale}.png`
                )
            );
        }
    } catch (error) {
        failures.push(`${label}: ${String(error)}`);
    }

    failures.push(
        ...page.errors.map(message => {
            return `${label}: ${message}`;
        })
    );
    await page.close();

    return { failures, samples };
};

const measureTextarea = (page: SmokePage) => {
    return page.evaluate<TextareaMeasure>(`(() => {
        const area = ${DESCRIPTION_SELECTOR};
        const style = getComputedStyle(area);
        const lineHeight = parseFloat(style.lineHeight);

        return {
            height: area.getBoundingClientRect().height,
            fieldSizing: style.fieldSizing,
            autosize: area.getAttribute('data-autosize'),
            lineHeight,
            verticalChrome: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
            scrollable: area.scrollHeight > area.clientHeight + 1,
            rows: area.rows
        };
    })()`);
};

const fillTextarea = async (page: SmokePage, lines: number) => {
    await page.evaluate(`(() => {
        const area = ${DESCRIPTION_SELECTOR};
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

        setter.call(area, Array.from({ length: ${lines} }, (_, index) => 'line ' + index).join('\\n'));
        area.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await page.settle();
    await wait(100);
};

const checkTextareaGrowth = async (
    cdp: CdpConnection,
    credentials: SmokeCredentials,
    baseUrl: string,
    forceFallback: boolean
) => {
    const page = await SmokePage.open(cdp, SHOT_WIDTH);
    const failures: string[] = [];
    const mode = forceFallback ? 'fallback' : 'field-sizing';

    try {
        if (forceFallback) {
            await page.send('Page.addScriptToEvaluateOnNewDocument', {
                source: `(() => {
                    const supports = CSS.supports.bind(CSS);

                    CSS.supports = (...args) => {
                        return String(args[0]).includes('field-sizing') ? false : supports(...args);
                    };
                })()`
            });
        }

        await openScreen(
            page,
            { name: 'wishEditor', start: 'add', skipLinkStep: true },
            buildAppUrl(
                baseUrl,
                signInitData(credentials, 'add'),
                SHOT_THEME,
                'add'
            )
        );

        await fillTextarea(page, SHORT_DESCRIPTION_LINES);

        const short = await measureTextarea(page);

        await fillTextarea(page, DESCRIPTION_LINES);

        const long = await measureTextarea(page);
        const maxHeight =
            long.lineHeight * DESCRIPTION_MAX_ROWS + long.verticalChrome;
        const shortHeight =
            short.lineHeight * SHORT_DESCRIPTION_LINES + short.verticalChrome;

        if (Math.abs(short.height - shortHeight) > HEIGHT_TOLERANCE_PX) {
            failures.push(
                `textarea ${mode}: ${SHORT_DESCRIPTION_LINES} lines are ${short.height}px, expected ${shortHeight}px`
            );
        }

        if (Math.abs(long.height - maxHeight) > HEIGHT_TOLERANCE_PX) {
            failures.push(
                `textarea ${mode}: ${DESCRIPTION_LINES} lines are ${long.height}px, expected the ${DESCRIPTION_MAX_ROWS}-row cap ${maxHeight}px`
            );
        }

        if (!long.scrollable) {
            failures.push(`textarea ${mode}: capped textarea does not scroll`);
        }

        if (forceFallback) {
            if (
                long.autosize !== 'rows' ||
                long.rows !== DESCRIPTION_MAX_ROWS
            ) {
                failures.push(
                    `textarea ${mode}: expected data-autosize=rows and ${DESCRIPTION_MAX_ROWS} rows, got ${long.autosize} and ${long.rows}`
                );
            }
        } else if (long.fieldSizing !== 'content' || long.autosize !== null) {
            failures.push(
                `textarea ${mode}: expected native field-sizing, got ${long.fieldSizing}`
            );
        }
    } catch (error) {
        failures.push(`textarea ${mode}: ${String(error)}`);
    }

    failures.push(
        ...page.errors.map(message => {
            return `textarea ${mode}: ${message}`;
        })
    );
    await page.close();

    return failures;
};

const STUCK_HEADER_MAX_PX = 92;
const COMPACT_CHIP_MAX_PX = 33;
const LIST_SCROLL_PX = 600;
const LIST_WIDTHS = [360, 390] as const;
const COLLAPSE_SETTLE_MS = 400;
const LIST_FIXTURE_TITLES = [
    'Настільна гра «Каркасон»',
    'Кавомолка ручна з керамічними жорнами',
    'Konstruktor LEGO Technic Porsche 911 GT3 RS',
    'Навушники',
    'Superdługaczęśćzamówieniabeztwardejspacji',
    'Термочашка',
    'Плед',
    'Сертифікат у книгарню'
];

const listFixtureWishes = () => {
    return LIST_FIXTURE_TITLES.map((title, index) => {
        return {
            id: 9_000 + index,
            title,
            description: null,
            link: index === 1 ? 'https://example.com/grinder' : null,
            linkHost: index === 1 ? 'example.com' : null,
            price: index % 3 === 2 ? 0 : 999_999 - index * 13_750,
            currency: 'UAH',
            priority: index % 2 === 0 ? 'high' : 'none',
            hidden: index % 4 === 0,
            gifted: false,
            images: [],
            createdAt: '2026-09-01T10:00:00.000Z',
            updatedAt: '2026-09-01T10:00:00.000Z'
        };
    });
};

const listFixtureRule = ({ url, method }: { url: URL; method: string }) => {
    if (method !== 'GET' || url.pathname !== `${APP_API_PREFIX}/wishes`) {
        return null;
    }

    const items = listFixtureWishes();

    return {
        status: 200,
        body: {
            items,
            total: items.length,
            nextOffset: null,
            filter: null,
            giftedTotal: 0
        }
    };
};

interface StickyHeaderMeasure {
    stuck: boolean;
    height: number;
    titleLines: number;
    chipHeight: number;
}

const STICKY_HEADER_MEASURE = `(() => {
    const header = document.querySelector('.screen-header-sticky');
    const title = header.querySelector('.screen-title');
    const range = document.createRange();

    range.selectNodeContents(title);

    const chip = header.querySelector('.filter-row .chip');

    return {
        stuck: header.hasAttribute('data-stuck'),
        height: header.getBoundingClientRect().height,
        titleLines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size,
        chipHeight: chip === null ? 0 : chip.getBoundingClientRect().height
    };
})()`;

const CARD_OVERFLOW_PROBE = `(() => {
    const problems = [];
    const cards = [...document.querySelectorAll('.wish-grid .wish-tag')];

    for (const card of cards) {
        const box = card.getBoundingClientRect();
        const name = (card.querySelector('.wish-title')?.textContent ?? '').trim().slice(0, 24);

        for (const part of card.querySelectorAll('.wish-title, .wish-badge, .priority-badge, .price, .wish-link, .wish-actions > *')) {
            const rect = part.getBoundingClientRect();
            const label = [...part.classList][0] ?? part.tagName.toLowerCase();

            if (rect.width === 0) {
                continue;
            }

            if (rect.right > box.right + 0.5 || rect.left < box.left - 0.5 || part.scrollWidth > part.clientWidth + 1) {
                problems.push(name + ': ' + label + ' overflows the card');
            }

            if (part.classList.contains('price')) {
                const style = getComputedStyle(part);
                const textHeight = part.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

                if (textHeight > parseFloat(style.lineHeight) * 1.5) {
                    problems.push(name + ': price wraps');
                }
            }
        }
    }

    return {
        problems,
        cardWidth: cards.length === 0 ? 0 : cards[0].getBoundingClientRect().width
    };
})()`;

const checkListScreen = async (
    cdp: CdpConnection,
    credentials: SmokeCredentials,
    context: {
        baseUrl: string;
        width: number;
        locale: Locale;
        start: string;
        screen: string;
        shotsDirectory: string | undefined;
    }
) => {
    const { baseUrl, width, locale, start, screen, shotsDirectory } = context;
    const page = await SmokePage.open(cdp, width);
    const failures: string[] = [];
    const label = `w${width} ${locale} ${screen} list`;
    let samples: AlignmentSample[] = [];

    try {
        await page.intercept(listFixtureRule, 'Request');

        for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt += 1) {
            await page.navigate(
                buildAppUrl(
                    baseUrl,
                    signInitData(credentials, start),
                    SHOT_THEME,
                    start
                )
            );

            if (await waitForScreen(page, screen)) {
                break;
            }
        }

        await page.waitFor('.screen-header-sticky .filter-row');
        await page.settle();
        await wait(COLLAPSE_SETTLE_MS);

        const unstuck = await page.evaluate<AlignmentReport>(
            ALIGNMENT_PROBE_SOURCE
        );
        const cards = await page.evaluate<{
            problems: string[];
            cardWidth: number;
        }>(CARD_OVERFLOW_PROBE);

        failures.push(
            ...cards.problems.map(problem => {
                return `${label} (card ${cards.cardWidth.toFixed(0)}px): ${problem}`;
            })
        );

        await page.evaluate(`window.scrollTo(0, ${LIST_SCROLL_PX})`);
        await wait(COLLAPSE_SETTLE_MS);
        await page.settle();

        const header = await page.evaluate<StickyHeaderMeasure>(
            STICKY_HEADER_MEASURE
        );
        const stuck = await page.evaluate<AlignmentReport>(
            ALIGNMENT_PROBE_SOURCE
        );

        samples = [...unstuck.samples, ...stuck.samples].filter(sample => {
            return sample.row.includes('header');
        });

        if (!header.stuck) {
            failures.push(`${label}: header is not stuck after scrolling`);
        } else {
            if (header.height > STUCK_HEADER_MAX_PX) {
                failures.push(
                    `${label}: stuck header is ${header.height.toFixed(1)}px, over ${STUCK_HEADER_MAX_PX}px`
                );
            }

            if (header.titleLines > 1) {
                failures.push(`${label}: stuck title wraps`);
            }

            if (header.chipHeight > COMPACT_CHIP_MAX_PX) {
                failures.push(
                    `${label}: compact chips are ${header.chipHeight.toFixed(1)}px tall`
                );
            }
        }

        for (const sample of samples) {
            if (Math.abs(sample.delta) > ALIGNMENT_TOLERANCE_PX) {
                failures.push(`${label}: ${formatSample(sample)}`);
            }
        }

        if (shotsDirectory !== undefined && locale === SHOT_LOCALE) {
            await page.screenshot(
                path.join(shotsDirectory, `${screen}-stuck-w${width}.png`)
            );
        }
    } catch (error) {
        failures.push(`${label}: ${String(error)}`);
    }

    failures.push(
        ...page.errors.map(message => {
            return `${label}: ${message}`;
        })
    );
    await page.close();

    return { failures, samples };
};

const readSharePublicId = async (
    baseUrl: string,
    credentials: SmokeCredentials
) => {
    const share = await callApi(
        baseUrl,
        signInitData(credentials, null),
        'GET',
        '/share'
    );
    const url =
        typeof share.payload === 'object' &&
        share.payload !== null &&
        'url' in share.payload &&
        typeof share.payload.url === 'string'
            ? share.payload.url
            : '';

    return url.split('/w/')[1] ?? null;
};

const setLocale = async (
    baseUrl: string,
    credentials: SmokeCredentials,
    locale: Locale
) => {
    await callApi(
        baseUrl,
        signInitData(credentials, null),
        'PUT',
        '/me/language',
        { choice: locale }
    );
};

export const runAlignmentCheck = async (options: AlignmentOptions) => {
    assertLocalBase(options.baseUrl);

    const credentials = readCredentials();
    const profileDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wishlist-alignment-chrome-')
    );
    const { child, endpoint } = await launchChrome(
        findChrome(options.chrome),
        profileDirectory
    );
    const cdp = await CdpConnection.open(endpoint);
    const failures: string[] = [];
    const allSamples: Array<AlignmentSample & { scope: string }> = [];
    let measured = 0;
    let widest = 0;

    if (options.shotsDirectory !== undefined) {
        fs.mkdirSync(options.shotsDirectory, { recursive: true });
    }

    try {
        await seedThroughApi(options.baseUrl, signInitData(credentials, null));

        for (const locale of LOCALES) {
            await setLocale(options.baseUrl, credentials, locale);

            for (const width of VIEWPORT_WIDTHS) {
                for (const theme of THEME_NAMES) {
                    for (const screen of SCREENS) {
                        const result = await checkScreen(cdp, credentials, {
                            baseUrl: options.baseUrl,
                            width,
                            theme,
                            locale,
                            screen,
                            shotsDirectory: options.shotsDirectory
                        });

                        failures.push(...result.failures);
                        measured += result.samples.length;
                        allSamples.push(
                            ...result.samples.map(sample => {
                                return {
                                    ...sample,
                                    scope: `w${width} ${theme} ${locale} ${screen.name}`
                                };
                            })
                        );

                        for (const sample of result.samples) {
                            widest = Math.max(widest, Math.abs(sample.delta));
                        }
                    }
                }
            }

            const publicId = await readSharePublicId(
                options.baseUrl,
                credentials
            );
            const lists = [
                { start: 'wishes', screen: 'wishes' },
                ...(publicId === null
                    ? []
                    : [{ start: `s_${publicId}`, screen: 'thirdList' }])
            ];

            for (const width of LIST_WIDTHS) {
                for (const list of lists) {
                    const result = await checkListScreen(cdp, credentials, {
                        baseUrl: options.baseUrl,
                        width,
                        locale,
                        start: list.start,
                        screen: list.screen,
                        shotsDirectory: options.shotsDirectory
                    });

                    failures.push(...result.failures);
                    measured += result.samples.length;

                    for (const sample of result.samples) {
                        widest = Math.max(widest, Math.abs(sample.delta));
                    }
                }
            }
        }

        await setLocale(options.baseUrl, credentials, 'uk');

        failures.push(
            ...(await checkTextareaGrowth(
                cdp,
                credentials,
                options.baseUrl,
                false
            )),
            ...(await checkTextareaGrowth(
                cdp,
                credentials,
                options.baseUrl,
                true
            ))
        );
    } finally {
        cdp.close();
        await stopChrome(child);
        fs.rmSync(profileDirectory, {
            recursive: true,
            force: true,
            maxRetries: PROFILE_REMOVE_RETRIES
        });
    }

    if (options.shotsDirectory !== undefined) {
        fs.writeFileSync(
            path.join(options.shotsDirectory, 'alignment.txt'),
            `${failures.join('\n')}\n`
        );
        fs.writeFileSync(
            path.join(options.shotsDirectory, 'samples.json'),
            JSON.stringify(allSamples)
        );
    }

    console.log(
        `${measured} items measured, widest delta ${widest.toFixed(2)}px, ${failures.length} failures`
    );

    for (const failure of failures.slice(0, MAX_PRINTED_FAILURES)) {
        console.log(`FAIL ${failure}`);
    }

    if (failures.length > MAX_PRINTED_FAILURES) {
        console.log(
            `... ${failures.length - MAX_PRINTED_FAILURES} more failures`
        );
    }

    return failures.length > 0 ? 1 : 0;
};
