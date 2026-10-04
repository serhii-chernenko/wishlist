import { homeKeyboard } from '../content/keyboards';
import { renderReleaseNotes } from '../content/releases';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';

export const RELEASE_NOTES_LIMIT = 3;

const render = async (req: BotRequest) => {
    await req.send.text(
        renderReleaseNotes(RELEASE_NOTES_LIMIT, req.locale),
        homeKeyboard(req.LL)
    );
};

export const screen: ScreenModule = {
    id: 'releases',
    render
};

export const callbacks: CallbackTable = {};
