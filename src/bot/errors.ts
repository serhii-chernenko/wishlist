export class BotUserError extends Error {
    readonly html: boolean;

    readonly silent: boolean;

    constructor(
        message: string,
        options?: { html?: boolean; silent?: boolean }
    ) {
        super(message);
        this.name = 'BotUserError';
        this.html = options?.html ?? true;
        this.silent = options?.silent ?? false;
    }
}

export const isBotUserError = (error: unknown): error is BotUserError => {
    return error instanceof BotUserError;
};

export class BotBlockedError extends Error {
    constructor(telegramUserId: number) {
        super(`Telegram user ${telegramUserId} has blocked the bot`);
        this.name = 'BotBlockedError';
    }
}

export const isBotBlockedError = (error: unknown): error is BotBlockedError => {
    return error instanceof BotBlockedError;
};

export const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};
