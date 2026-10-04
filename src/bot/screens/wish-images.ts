import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { screen as homeScreen } from './home';

const renderHome = async (req: BotRequest) => {
    await homeScreen.render(req, undefined);
};

export const screen: ScreenModule = {
    id: 'wishImages',
    render: renderHome
};

export const callbacks: CallbackTable = {
    wishImagesOrder: renderHome,
    wishImageFirst: renderHome
};
