import type { Context } from 'hono';
import type { User } from 'telegraf/types';

import type {
    ListImportDeps,
    ListImportService
} from '../bot/services/list-import/types';
import type {
    LinkImportDeps,
    LoadStagedImage,
    RunLinkImport,
    StageImages,
    ToImportedDraft
} from '../bot/services/link-import/types';
import { createDb } from '../db/client';
import { createRepositories, type Repositories } from '../db/repositories';
import type { UserRecord } from '../db/repositories';
import type {
    AppApiRouteKey,
    ApiRouteSpec,
    RateLimitBucket
} from '../shared/app-api';
import type { ExchangeRates } from '../shared/money';
import type { WorkerBindings } from '../worker/env';
import {
    readWorkerExchangeRates,
    type ExchangeRatesSource
} from '../worker/exchange-rates';
import { emitTelemetryEvent, type TelemetryContext } from '../worker/telemetry';
import { getRuntimeCrypto, type ApiCrypto } from './auth/crypto';
import type { ValidatedInitData } from './auth/init-data';
import { createImportSigner, type ImportSigner } from './auth/import-signing';
import { createSigner, type Signer } from './auth/signing';
import { ApiError } from './errors';
import type { RateLimiterLike } from './rate-limit';
import { createTelegramApi, type TelegramApi } from './telegram-api';

export type TelemetryEmitter = (
    env: WorkerBindings,
    context: TelemetryContext,
    fields: Parameters<typeof emitTelemetryEvent>[2]
) => void;

export interface LinkImportServices {
    run: RunLinkImport;
    stageImages: StageImages;
    loadStagedImage: LoadStagedImage;
    toImportedDraft: ToImportedDraft;
}

export interface ApiDeps {
    now: () => Date;
    crypto: ApiCrypto;
    createRepositories: (env: WorkerBindings) => Repositories;
    createTelegramApi: (env: WorkerBindings) => TelegramApi;
    selectLimiter?: (
        env: WorkerBindings,
        bucket: RateLimitBucket
    ) => RateLimiterLike | null;
    emitTelemetry: TelemetryEmitter;
    readExchangeRates: ExchangeRatesSource;
    linkImport?: LinkImportServices;
    listImport?: ListImportService;
}

export type AppApiDependencies = Partial<ApiDeps>;

export const resolveApiDeps = (dependencies: AppApiDependencies): ApiDeps => {
    return {
        now: dependencies.now ?? (() => new Date()),
        crypto: dependencies.crypto ?? getRuntimeCrypto(),
        createRepositories:
            dependencies.createRepositories ??
            (env => createRepositories(createDb(env))),
        createTelegramApi:
            dependencies.createTelegramApi ??
            (env => createTelegramApi({ botToken: env.BOT_TOKEN })),
        ...(dependencies.selectLimiter === undefined
            ? {}
            : { selectLimiter: dependencies.selectLimiter }),
        emitTelemetry: dependencies.emitTelemetry ?? emitTelemetryEvent,
        readExchangeRates:
            dependencies.readExchangeRates ?? readWorkerExchangeRates,
        ...(dependencies.linkImport === undefined
            ? {}
            : { linkImport: dependencies.linkImport }),
        ...(dependencies.listImport === undefined
            ? {}
            : { listImport: dependencies.listImport })
    };
};

export interface ApiRoute extends ApiRouteSpec {
    key: AppApiRouteKey;
    template: string;
}

export interface ApiVariables {
    deps: ApiDeps;
    route: ApiRoute;
    repos: Repositories;
    initData: ValidatedInitData;
    actor: User;
    user: UserRecord | null;
}

export type AppApiEnv = {
    Bindings: WorkerBindings;
    Variables: ApiVariables;
};

export type ApiContext = Context<AppApiEnv>;

export type ApiHandler = (c: ApiContext) => Promise<Response>;

export const getTelemetryContext = (c: Context): TelemetryContext => {
    try {
        return c.executionCtx;
    } catch {
        return undefined;
    }
};

export const runInBackground = async (c: Context, task: Promise<unknown>) => {
    const settled = task.catch(() => undefined);
    const context = getTelemetryContext(c);

    if (context) {
        context.waitUntil(settled);
    } else {
        await settled;
    }
};

export const emitApiTelemetry = (
    c: ApiContext,
    fields: Parameters<TelemetryEmitter>[2]
) => {
    c.var.deps.emitTelemetry(c.env, getTelemetryContext(c), fields);
};

export const readExchangeRates = (c: ApiContext): Promise<ExchangeRates> => {
    return c.var.deps.readExchangeRates(
        c.env,
        getTelemetryContext(c),
        c.var.repos.exchangeRates
    );
};

export const getSigner = (c: ApiContext): Signer => {
    return createSigner({
        botToken: c.env.BOT_TOKEN,
        environment: c.env.BOT_ENVIRONMENT,
        crypto: c.var.deps.crypto
    });
};

export const getImportSigner = (c: ApiContext): ImportSigner => {
    return createImportSigner({
        botToken: c.env.BOT_TOKEN,
        environment: c.env.BOT_ENVIRONMENT,
        crypto: c.var.deps.crypto
    });
};

export const requireLinkImportServices = (
    c: ApiContext
): LinkImportServices => {
    const { linkImport } = c.var.deps;

    if (linkImport === undefined) {
        throw new ApiError('notImplemented');
    }

    return linkImport;
};

export const requireListImportService = (c: ApiContext): ListImportService => {
    const { listImport } = c.var.deps;

    if (listImport === undefined) {
        throw new ApiError('notImplemented');
    }

    return listImport;
};

export const getListImportDeps = (c: ApiContext): ListImportDeps => {
    const context = getTelemetryContext(c);

    return {
        env: c.env,
        now: () => c.var.deps.now().getTime(),
        telegram: getTelegramApi(c),
        ...(context === undefined
            ? {}
            : {
                  waitUntil: (promise: Promise<unknown>) => {
                      context.waitUntil(promise);
                  }
              })
    };
};

export const getLinkImportDeps = (c: ApiContext): LinkImportDeps => {
    const context = getTelemetryContext(c);

    return {
        env: c.env,
        now: () => c.var.deps.now().getTime(),
        ...(context === undefined
            ? {}
            : {
                  waitUntil: (promise: Promise<unknown>) => {
                      context.waitUntil(promise);
                  }
              })
    };
};

export const getTelegramApi = (c: ApiContext) => {
    return c.var.deps.createTelegramApi(c.env);
};

export const requireUser = (c: ApiContext): UserRecord => {
    const { user } = c.var;

    if (user === null) {
        throw new ApiError('registrationRequired');
    }

    return user;
};
