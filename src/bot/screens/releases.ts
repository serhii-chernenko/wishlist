import {
    callbackButton,
    homeButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { getReleases, renderReleaseNotes } from '../content/releases';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';

export const RELEASE_NOTES_LIMIT = 3;

export interface ReleasesParams {
    offset?: number;
}

const normalizeReleaseOffset = (offset: number, total: number) => {
    if (offset <= 0 || offset >= total) {
        return 0;
    }

    return offset;
};

const render = async (req: BotRequest, params: ReleasesParams | undefined) => {
    const total = getReleases().length;
    const offset = normalizeReleaseOffset(params?.offset ?? 0, total);
    const nextOffset = offset + RELEASE_NOTES_LIMIT;

    await req.send.text(
        renderReleaseNotes(RELEASE_NOTES_LIMIT, req.locale, offset),
        singleColumnKeyboard([
            nextOffset < total
                ? callbackButton(req.LL.releases.previous(), {
                      type: 'releasesPage',
                      offset: nextOffset
                  })
                : null,
            homeButton(req.LL)
        ])
    );
};

export const screen: ScreenModule<ReleasesParams | undefined> = {
    id: 'releases',
    render
};

export const callbacks: CallbackTable = {
    releasesPage: async (req, action) => {
        await render(req, { offset: action.offset });
    }
};
