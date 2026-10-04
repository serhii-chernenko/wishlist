import { clearPendingInput } from '../runtime/context';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { screen as homeScreen } from './home';

const renderHome = async (req: BotRequest) => {
    await homeScreen.render(req, undefined);
};

export const screen: ScreenModule = {
    id: 'delivery',
    render: renderHome,
    onInput: async req => {
        clearPendingInput(req);
        await renderHome(req);
    }
};

export const callbacks: CallbackTable = {
    deliveryRemove: renderHome
};
