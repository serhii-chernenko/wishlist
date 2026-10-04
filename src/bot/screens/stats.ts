import { homeKeyboard } from '../content/keyboards';
import { formatNumber } from '../content/intl';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';

const render = async (req: BotRequest) => {
    const { LL, locale } = req;
    const stats = await req.services.stats.getPublicStats();

    await req.send.text(
        [
            `${LL.stats.title()}\n`,
            LL.stats.users(formatNumber(stats.users, locale)),
            LL.stats.wishes(formatNumber(stats.wishes, locale)),
            LL.stats.done(formatNumber(stats.done, locale))
        ].join('\n'),
        homeKeyboard(LL)
    );
};

export const screen: ScreenModule = {
    id: 'stats',
    render
};

export const callbacks: CallbackTable = {};
