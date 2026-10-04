import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { screen as homeScreen } from './home';

const renderHome = async (req: BotRequest) => {
    await homeScreen.render(req, undefined);
};

export const screen: ScreenModule = {
    id: 'disclosure',
    render: renderHome
};

export const callbacks: CallbackTable = {
    disclosureToggle: renderHome,
    disclosureConfirm: renderHome,
    wishlistShareIndexing: renderHome
};
