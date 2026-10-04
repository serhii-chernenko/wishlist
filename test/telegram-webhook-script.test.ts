import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadPreviewEnvironment,
    PREVIEW_BOT_USERNAME,
    PreviewOperatorError,
    PRODUCTION_BOT_USERNAME
} from '../scripts/telegram/preview-environment';
import {
    ALLOWED_UPDATES,
    BOT_COMMAND_NAMES,
    callTelegramApi,
    createDropPendingUpdatesParameters,
    createSetMyCommandsParameters,
    formatTelegramWebhookInfo,
    loadLocalizedBotCommandSets,
    parseDropPendingUpdates,
    parseMaxConnections,
    parsePreviewBaseUrl,
    parseWebhookArguments,
    runWebhookCommand,
    TELEGRAM_API_MAX_RESPONSE_BYTES,
    WORKER_NAME,
    type BotCommandSet,
    type WebhookRunDependencies
} from '../scripts/telegram/webhook';

const asFetch = (
    implementation: (
        input: RequestInfo | URL,
        init?: RequestInit
    ) => Promise<Response>
) => {
    return implementation as typeof fetch;
};

const successfulResponse = () => {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
};

test('Telegram helper rejects redirects and attaches a timeout signal', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchImplementation = asFetch(async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return successfulResponse();
    });

    await callTelegramApi('getWebhookInfo', undefined, {
        botToken: '123456:test-token',
        fetchImplementation
    });

    assert.equal(
        requestUrl,
        'https://api.telegram.org/bot123456:test-token/getWebhookInfo'
    );
    assert.equal(requestInit?.method, 'GET');
    assert.equal(requestInit?.redirect, 'error');
    assert.equal(requestInit?.signal instanceof AbortSignal, true);
});

test('Telegram helper returns a validated getWebhookInfo result', async () => {
    const secretPath = '/telegram/wishlist-production';
    const expectedWebhookUrl = `https://worker.example${secretPath}`;
    const botToken = '123456:test-token';
    const webhookInfo = {
        url: expectedWebhookUrl,
        has_custom_certificate: false,
        pending_update_count: 3,
        last_error_date: 1_784_098_000,
        last_error_message: `delivery failed for ${secretPath}`,
        last_synchronization_error_date: 1_784_098_001,
        max_connections: 1,
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        ip_address: botToken,
        unexpected: {
            token: botToken,
            path: secretPath
        }
    };
    const fetchImplementation = asFetch(async () => {
        return new Response(
            JSON.stringify({
                ok: true,
                result: webhookInfo
            })
        );
    });

    const payload = await callTelegramApi('getWebhookInfo', undefined, {
        botToken,
        fetchImplementation
    });

    assert.deepEqual(payload.result, webhookInfo);
    const formattedWebhookInfo = formatTelegramWebhookInfo(
        payload,
        expectedWebhookUrl
    );

    assert.deepEqual(JSON.parse(formattedWebhookInfo), {
        event: 'telegram_webhook_info',
        urlConfigured: true,
        urlMatchesExpected: true,
        hasCustomCertificate: false,
        pendingUpdateCount: 3,
        lastErrorDate: 1_784_098_000,
        lastErrorMessagePresent: true,
        lastSynchronizationErrorDate: 1_784_098_001,
        maxConnections: 1,
        allowedUpdates: ['message', 'callback_query', 'my_chat_member']
    });
    assert.equal(formattedWebhookInfo.includes(secretPath), false);
    assert.equal(formattedWebhookInfo.includes(botToken), false);
    assert.equal(formattedWebhookInfo.includes('delivery failed'), false);
});

test('Telegram webhook info projection rejects malformed and arbitrary fields', () => {
    const secretPath = '/telegram/private-hook';
    const botToken = '987654:private-token';
    const formattedWebhookInfo = formatTelegramWebhookInfo(
        {
            ok: true,
            result: {
                url: `https://attacker.example${secretPath}`,
                has_custom_certificate: botToken,
                pending_update_count: secretPath,
                last_error_date: -1,
                last_error_message: botToken,
                last_synchronization_error_date: 1.5,
                max_connections: Number.MAX_SAFE_INTEGER + 1,
                allowed_updates: ['message', secretPath],
                nested: { botToken, secretPath }
            }
        },
        `https://worker.example${secretPath}`
    );

    assert.deepEqual(JSON.parse(formattedWebhookInfo), {
        event: 'telegram_webhook_info',
        urlConfigured: true,
        urlMatchesExpected: false,
        hasCustomCertificate: null,
        pendingUpdateCount: null,
        lastErrorDate: null,
        lastErrorMessagePresent: true,
        lastSynchronizationErrorDate: null,
        maxConnections: null,
        allowedUpdates: null
    });
    assert.equal(formattedWebhookInfo.includes(secretPath), false);
    assert.equal(formattedWebhookInfo.includes(botToken), false);
});

test('Telegram helper posts URL-encoded webhook parameters', async () => {
    let requestInit: RequestInit | undefined;
    const fetchImplementation = asFetch(async (_input, init) => {
        requestInit = init;
        return successfulResponse();
    });
    const body = new URLSearchParams({ url: 'https://worker.example/hook' });

    await callTelegramApi('setWebhook', body, {
        botToken: '123456:test-token',
        fetchImplementation
    });

    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(requestInit?.headers, {
        'Content-Type': 'application/x-www-form-urlencoded'
    });
    assert.equal(requestInit?.body, body);
});

test('Telegram helper rejects an oversized declared response', async () => {
    const fetchImplementation = asFetch(async () => {
        return new Response('{"ok":true}', {
            headers: {
                'Content-Length': String(TELEGRAM_API_MAX_RESPONSE_BYTES + 1)
            }
        });
    });

    await assert.rejects(
        callTelegramApi('getWebhookInfo', undefined, {
            botToken: '123456:test-token',
            fetchImplementation
        }),
        /response exceeded the size limit/
    );
});

test('Telegram helper caps streamed responses without Content-Length', async () => {
    const fetchImplementation = asFetch(async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new Uint8Array(TELEGRAM_API_MAX_RESPONSE_BYTES)
                );
                controller.enqueue(new Uint8Array(1));
                controller.close();
            }
        });

        return new Response(body);
    });

    await assert.rejects(
        callTelegramApi('getWebhookInfo', undefined, {
            botToken: '123456:test-token',
            fetchImplementation
        }),
        /response exceeded the size limit/
    );
});

test('Telegram helper rejects malformed JSON responses', async () => {
    const fetchImplementation = asFetch(async () => {
        return new Response('{not-json');
    });

    await assert.rejects(
        callTelegramApi('getWebhookInfo', undefined, {
            botToken: '123456:test-token',
            fetchImplementation
        }),
        /returned invalid JSON/
    );
});

test('Telegram helper validates the Telegram response envelope', async () => {
    const fetchImplementation = asFetch(async () => {
        return new Response(JSON.stringify({ ok: 'yes' }));
    });

    await assert.rejects(
        callTelegramApi('getWebhookInfo', undefined, {
            botToken: '123456:test-token',
            fetchImplementation
        }),
        /returned an invalid response/
    );
});

test('Telegram helper aborts requests that exceed its timeout', async () => {
    const fetchImplementation = asFetch(async (_input, init) => {
        await new Promise<void>((_resolve, reject) => {
            assert.ok(init?.signal);
            init.signal.addEventListener(
                'abort',
                () => {
                    reject(new Error('aborted'));
                },
                { once: true }
            );
        });

        return successfulResponse();
    });

    await assert.rejects(
        callTelegramApi('getWebhookInfo', undefined, {
            botToken: '123456:test-token',
            fetchImplementation,
            timeoutMilliseconds: 5
        }),
        /timed out after 5ms/
    );
});

test('webhook set and delete require an explicit pending-update decision on remote targets', () => {
    for (const target of ['production', 'preview'] as const) {
        for (const action of ['set', 'delete'] as const) {
            assert.throws(() => {
                parseDropPendingUpdates(action, target, []);
            }, /requires an explicit --drop-pending-updates=true\|false/);
        }
    }

    assert.equal(
        parseDropPendingUpdates('set', 'production', [
            '--drop-pending-updates=true'
        ]),
        true
    );
    assert.equal(
        parseDropPendingUpdates('delete', 'preview', [
            '--drop-pending-updates=false'
        ]),
        false
    );
    assert.throws(() => {
        parseDropPendingUpdates('set', 'preview', [
            '--drop-pending-updates=yes'
        ]);
    }, /Use --drop-pending-updates=true or =false/);
    assert.throws(() => {
        parseDropPendingUpdates('info', 'preview', [
            '--drop-pending-updates=true'
        ]);
    }, /does not accept flags/);
});

test('local webhook commands may omit the pending-update flag', () => {
    assert.equal(parseDropPendingUpdates('set', 'local', []), undefined);
    assert.equal(
        createDropPendingUpdatesParameters(undefined).has(
            'drop_pending_updates'
        ),
        false
    );
    assert.equal(
        createDropPendingUpdatesParameters(true).get('drop_pending_updates'),
        'true'
    );
    assert.equal(
        createDropPendingUpdatesParameters(false).get('drop_pending_updates'),
        'false'
    );
});

test('preview webhook set and info require an explicit workers.dev https URL', () => {
    const url = 'https://feat-x-wishlist.acme.workers.dev';

    assert.deepEqual(
        parseWebhookArguments('set', 'preview', [
            '--',
            '--url',
            `${url}/`,
            '--drop-pending-updates=true'
        ]),
        { dropPendingUpdates: true, baseUrl: url }
    );
    assert.deepEqual(
        parseWebhookArguments('info', 'preview', [`--url=${url}`]),
        { dropPendingUpdates: undefined, baseUrl: url }
    );
    assert.throws(() => {
        parseWebhookArguments('set', 'preview', [
            '--drop-pending-updates=true'
        ]);
    }, /requires --url/);
    assert.throws(() => {
        parseWebhookArguments('set', 'preview', ['--url', url]);
    }, /requires an explicit --drop-pending-updates/);
    assert.throws(() => {
        parseWebhookArguments('set', 'preview', ['--url']);
    }, /--url requires a value/);
});

test('preview webhook delete takes no URL and other targets reject one', () => {
    assert.deepEqual(
        parseWebhookArguments('delete', 'preview', [
            '--drop-pending-updates=false'
        ]),
        { dropPendingUpdates: false, baseUrl: undefined }
    );
    assert.throws(() => {
        parseWebhookArguments('delete', 'preview', [
            '--url',
            'https://a.b.workers.dev',
            '--drop-pending-updates=false'
        ]);
    }, /does not accept --url/);
    assert.throws(() => {
        parseWebhookArguments('set', 'production', [
            '--url',
            'https://a.b.workers.dev',
            '--drop-pending-updates=false'
        ]);
    }, /only supported for the preview target/);
});

test('preview base URL validation rejects non-workers.dev, non-https and decorated URLs', () => {
    assert.equal(
        parsePreviewBaseUrl('https://a.b.workers.dev'),
        'https://a.b.workers.dev'
    );

    for (const invalid of [
        'not a url',
        'http://a.b.workers.dev',
        'https://wishlist.chernenko.dev',
        'https://workers.dev',
        'https://evilworkers.dev',
        'https://a.b.workers.dev.evil.com',
        'https://user:pass@a.b.workers.dev',
        'https://a.b.workers.dev:8443',
        'https://a.b.workers.dev/path',
        'https://a.b.workers.dev/?q=1'
    ]) {
        assert.throws(() => {
            parsePreviewBaseUrl(invalid);
        }, /--url/);
    }
});

test('preview base URL validation rejects the production Worker origin only', () => {
    assert.throws(
        () => parsePreviewBaseUrl('https://wishlist.chernenko.workers.dev'),
        /production Worker origin/
    );
    assert.equal(
        parsePreviewBaseUrl('https://preview-wishlist.chernenko.workers.dev'),
        'https://preview-wishlist.chernenko.workers.dev'
    );
    assert.equal(
        parsePreviewBaseUrl('https://wishlist.other.workers.dev'),
        'https://wishlist.other.workers.dev'
    );
});

const shellBotToken = '999999:production-shell-token';
const previewFileBotToken = '123456:preview-file-token';
const previewFileSecret = 'preview-file-secret';
const previewFilePath = '/telegram/preview-file-path';
const shellEnvironment = {
    BOT_TOKEN: shellBotToken,
    TELEGRAM_WEBHOOK_SECRET: 'production-shell-secret',
    TELEGRAM_WEBHOOK_PATH: '/telegram/production-shell-path'
};
const previewOrigin = 'https://feat-demo-wishlist.chernenko.workers.dev';
const previewWebhookArguments = [
    '--url',
    previewOrigin,
    '--drop-pending-updates=true'
];

const createTelegramFake = (username: string) => {
    const requests: { method: string; url: string; body: string }[] = [];
    const fetchImplementation = asFetch(async (input, init) => {
        const url = String(input);

        requests.push({
            method: url.slice(url.lastIndexOf('/') + 1),
            url,
            body: String(init?.body ?? '')
        });

        return new Response(
            JSON.stringify({ ok: true, result: { username } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    });

    return {
        requests,
        fetchImplementation,
        methods: () => {
            return requests.map(request => {
                return request.method;
            });
        }
    };
};

const withShellEnvironment = async (action: () => Promise<void>) => {
    const names = [...Object.keys(shellEnvironment), 'WORKER_BASE_URL'];
    const previous = names.map(name => {
        return [name, process.env[name]] as const;
    });
    const originalLog = console.log;

    Object.assign(process.env, shellEnvironment);
    console.log = () => undefined;

    try {
        await action();
    } finally {
        console.log = originalLog;

        for (const [name, value] of previous) {
            if (value === undefined) {
                Reflect.deleteProperty(process.env, name);
            } else {
                process.env[name] = value;
            }
        }
    }
};

const createRunDependencies = (
    fake: ReturnType<typeof createTelegramFake>,
    overrides: Partial<WebhookRunDependencies> = {}
): WebhookRunDependencies => {
    return {
        loadPreviewEnvironment: () => {
            return loadPreviewEnvironment({
                runCommand: async () => {
                    throw new Error('not a git checkout');
                },
                cwd: '/repo',
                fileExists: () => true,
                load: (_filePath, environment) => {
                    environment.BOT_TOKEN = previewFileBotToken;
                    environment.TELEGRAM_WEBHOOK_SECRET = previewFileSecret;
                    environment.TELEGRAM_WEBHOOK_PATH = previewFilePath;
                }
            });
        },
        loadOptionalEnvFile: () => {
            throw new Error('Unexpected env file load');
        },
        telegram: { fetchImplementation: fake.fetchImplementation },
        ...overrides
    };
};

test('raw preview set uses the preview env file over a shell BOT_TOKEN', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('InevixTestBot');

        await runWebhookCommand(
            'set',
            'preview',
            previewWebhookArguments,
            createRunDependencies(fake)
        );

        assert.deepEqual(fake.methods(), ['getMe', 'setWebhook']);

        for (const request of fake.requests) {
            assert.equal(
                request.url.startsWith(
                    `https://api.telegram.org/bot${previewFileBotToken}/`
                ),
                true
            );
            assert.equal(request.url.includes(shellBotToken), false);
        }

        const setBody = new URLSearchParams(fake.requests[1]?.body);

        assert.equal(setBody.get('url'), `${previewOrigin}${previewFilePath}`);
        assert.equal(setBody.get('secret_token'), previewFileSecret);
    });
});

test('raw preview delete checks the bot identity before deleting', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('InevixTestBot');

        await runWebhookCommand(
            'delete',
            'preview',
            ['--drop-pending-updates=false'],
            createRunDependencies(fake)
        );

        assert.deepEqual(fake.methods(), ['getMe', 'deleteWebhook']);
        assert.equal(
            fake.requests.every(request => {
                return request.url.includes(`bot${previewFileBotToken}/`);
            }),
            true
        );
    });
});

test('raw preview set and delete abort before changing anything for another bot', async () => {
    const attempts: [string, string[]][] = [
        ['set', previewWebhookArguments],
        ['delete', ['--drop-pending-updates=true']]
    ];

    for (const [action, arguments_] of attempts) {
        await withShellEnvironment(async () => {
            const fake = createTelegramFake('wishlist_ua_bot');

            await assert.rejects(
                runWebhookCommand(
                    action as 'set' | 'delete',
                    'preview',
                    arguments_,
                    createRunDependencies(fake)
                ),
                PreviewOperatorError
            );
            assert.deepEqual(fake.methods(), ['getMe']);
        });
    }
});

test('raw preview info does not require getMe', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('wishlist_ua_bot');

        await runWebhookCommand(
            'info',
            'preview',
            ['--url', previewOrigin],
            createRunDependencies(fake)
        );

        assert.deepEqual(fake.methods(), ['getWebhookInfo']);
        assert.equal(
            fake.requests[0]?.url.includes(`bot${previewFileBotToken}/`),
            true
        );
    });
});

test('raw preview commands stop when the preview env file is missing', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('InevixTestBot');

        await assert.rejects(
            runWebhookCommand(
                'set',
                'preview',
                previewWebhookArguments,
                createRunDependencies(fake, {
                    loadPreviewEnvironment: () => {
                        return loadPreviewEnvironment({
                            runCommand: async () => {
                                throw new Error('not a git checkout');
                            },
                            cwd: '/repo',
                            fileExists: () => false
                        });
                    }
                })
            ),
            PreviewOperatorError
        );
        assert.deepEqual(fake.methods(), []);
        assert.equal(process.env.BOT_TOKEN, shellBotToken);
    });
});

test('raw local and production targets keep the previous loading and skip getMe', async () => {
    for (const target of ['local', 'production'] as const) {
        await withShellEnvironment(async () => {
            const fake = createTelegramFake('anyone');
            const loadedTargets: string[] = [];

            process.env.WORKER_BASE_URL = 'https://worker.example';

            await runWebhookCommand(
                'set',
                target,
                target === 'local' ? [] : ['--drop-pending-updates=true'],
                createRunDependencies(fake, {
                    loadPreviewEnvironment: async () => {
                        throw new Error('Unexpected preview env load');
                    },
                    loadOptionalEnvFile: loadedTarget => {
                        loadedTargets.push(loadedTarget);
                    }
                })
            );

            assert.deepEqual(loadedTargets, [target]);
            assert.deepEqual(fake.methods(), ['setWebhook']);
            assert.equal(
                fake.requests[0]?.url.includes(`bot${shellBotToken}/`),
                true
            );
        });
    }
});

test('the Worker name and bot usernames are wishlist specific', () => {
    assert.equal(WORKER_NAME, 'wishlist');
    assert.equal(PREVIEW_BOT_USERNAME, 'InevixTestBot');
    assert.equal(PRODUCTION_BOT_USERNAME, 'wishlist_ua_bot');
});

test('raw production set subscribes to message, callback_query and my_chat_member with one connection', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('anyone');

        process.env.WORKER_BASE_URL = 'https://worker.example';

        await runWebhookCommand(
            'set',
            'production',
            ['--drop-pending-updates=false'],
            createRunDependencies(fake, {
                loadOptionalEnvFile: () => undefined
            })
        );

        const setBody = new URLSearchParams(fake.requests[0]?.body);

        assert.deepEqual(ALLOWED_UPDATES, [
            'message',
            'callback_query',
            'my_chat_member'
        ]);
        assert.deepEqual(JSON.parse(setBody.get('allowed_updates') ?? ''), [
            'message',
            'callback_query',
            'my_chat_member'
        ]);
        assert.equal(setBody.get('max_connections'), '1');
        assert.equal(setBody.get('drop_pending_updates'), 'false');
    });
});

test('webhook set accepts an explicit max connections override', async () => {
    assert.equal(parseMaxConnections('40'), 40);
    assert.deepEqual(
        parseWebhookArguments('set', 'production', [
            '--drop-pending-updates=true',
            '--max-connections=5'
        ]),
        { dropPendingUpdates: true, baseUrl: undefined, maxConnections: 5 }
    );

    for (const invalid of ['0', '101', '1.5', 'many', '-2', '']) {
        assert.throws(() => {
            parseMaxConnections(invalid);
        }, /--max-connections must be an integer/);
    }

    assert.throws(() => {
        parseWebhookArguments('delete', 'production', [
            '--drop-pending-updates=true',
            '--max-connections=5'
        ]);
    }, /only supported for webhook set/);

    await withShellEnvironment(async () => {
        const fake = createTelegramFake('anyone');

        process.env.WORKER_BASE_URL = 'https://worker.example';

        await runWebhookCommand(
            'set',
            'production',
            ['--drop-pending-updates=true', '--max-connections=7'],
            createRunDependencies(fake, {
                loadOptionalEnvFile: () => undefined
            })
        );

        const setBody = new URLSearchParams(fake.requests[0]?.body);

        assert.equal(setBody.get('max_connections'), '7');
    });
});

test('webhook commands accepts no flags', () => {
    assert.deepEqual(parseWebhookArguments('commands', 'production', []), {
        dropPendingUpdates: undefined,
        baseUrl: undefined
    });
    assert.deepEqual(parseWebhookArguments('commands', 'preview', ['--']), {
        dropPendingUpdates: undefined,
        baseUrl: undefined
    });

    for (const flags of [
        ['--drop-pending-updates=true'],
        ['--url', 'https://a.b.workers.dev'],
        ['--max-connections=2']
    ]) {
        assert.throws(() => {
            parseWebhookArguments('commands', 'production', flags);
        }, /does not accept flags/);
    }
});

const commandSets: BotCommandSet[] = [
    {
        languageCode: null,
        commands: [{ command: 'start', description: 'Start' }]
    },
    {
        languageCode: 'uk',
        commands: [{ command: 'start', description: 'Старт' }]
    },
    {
        languageCode: 'pl',
        commands: [{ command: 'start', description: 'Start PL' }]
    }
];

test('setMyCommands parameters carry the commands JSON and an optional language code', () => {
    const defaultParameters = createSetMyCommandsParameters(
        commandSets[0] as BotCommandSet
    );
    const ukrainianParameters = createSetMyCommandsParameters(
        commandSets[1] as BotCommandSet
    );

    assert.equal(defaultParameters.has('language_code'), false);
    assert.deepEqual(JSON.parse(defaultParameters.get('commands') ?? ''), [
        { command: 'start', description: 'Start' }
    ]);
    assert.equal(ukrainianParameters.get('language_code'), 'uk');
});

test('raw preview commands verify the preview bot and set every command set', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('InevixTestBot');

        await runWebhookCommand(
            'commands',
            'preview',
            [],
            createRunDependencies(fake, {
                loadBotCommandSets: async () => commandSets
            })
        );

        assert.deepEqual(fake.methods(), [
            'getMe',
            'setMyCommands',
            'setMyCommands',
            'setMyCommands'
        ]);
        assert.equal(
            fake.requests.every(request => {
                return request.url.includes(`bot${previewFileBotToken}/`);
            }),
            true
        );
        assert.deepEqual(
            fake.requests.slice(1).map(request => {
                return new URLSearchParams(request.body).get('language_code');
            }),
            [null, 'uk', 'pl']
        );
    });
});

test('raw preview commands abort for the production bot before changing anything', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('wishlist_ua_bot');

        await assert.rejects(
            runWebhookCommand(
                'commands',
                'preview',
                [],
                createRunDependencies(fake, {
                    loadBotCommandSets: async () => commandSets
                })
            ),
            /production bot/
        );
        assert.deepEqual(fake.methods(), ['getMe']);
    });
});

test('raw production commands skip getMe and load the production env file', async () => {
    await withShellEnvironment(async () => {
        const fake = createTelegramFake('anyone');
        const loadedTargets: string[] = [];

        await runWebhookCommand(
            'commands',
            'production',
            [],
            createRunDependencies(fake, {
                loadPreviewEnvironment: async () => {
                    throw new Error('Unexpected preview env load');
                },
                loadOptionalEnvFile: target => {
                    loadedTargets.push(target);
                },
                loadBotCommandSets: async () => commandSets
            })
        );

        assert.deepEqual(loadedTargets, ['production']);
        assert.deepEqual(fake.methods(), [
            'setMyCommands',
            'setMyCommands',
            'setMyCommands'
        ]);
        assert.equal(
            fake.requests[0]?.url.includes(`bot${shellBotToken}/`),
            true
        );
    });
});

test('the app command is registered after the existing commands', () => {
    assert.deepEqual(
        [...BOT_COMMAND_NAMES],
        ['start', 'lang', 'releases', 'app']
    );
});

test('localized bot commands cover the default scope plus uk, en and pl from the translations', async () => {
    const loadedSets = await loadLocalizedBotCommandSets();

    assert.deepEqual(
        loadedSets.map(commandSet => commandSet.languageCode),
        [null, 'uk', 'en', 'pl']
    );

    for (const commandSet of loadedSets) {
        assert.deepEqual(
            commandSet.commands.map(command => command.command),
            [...BOT_COMMAND_NAMES]
        );

        for (const command of commandSet.commands) {
            assert.match(command.command, /^[a-z]{1,32}$/);
            assert.ok(command.description.length >= 3, command.command);
            assert.ok(command.description.length <= 256, command.command);
        }
    }
});
