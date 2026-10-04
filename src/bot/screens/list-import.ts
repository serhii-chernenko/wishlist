import {
    homeButton,
    navigationButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';

const render = async (req: BotRequest) => {
    const { LL } = req;

    await req.send.text(
        `${LL.listImport.title()}\n\n${LL.listImport.description()}`,
        singleColumnKeyboard([
            navigationButton(LL.actions.back(), 'settings'),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'listImport',
    render
};

export const callbacks: CallbackTable = {};
