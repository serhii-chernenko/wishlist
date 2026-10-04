import type { FC } from 'hono/jsx';

import type { ScreenId, ScreenProps } from '../nav/routes';
import { AboutScreen } from './about';
import { CurrencyScreen } from './currency';
import { DeliveryScreen } from './delivery';
import { DonateScreen } from './donate';
import { FeedbackScreen } from './feedback';
import { FindScreen } from './find';
import { GivesScreen } from './gives';
import { HomeScreen } from './home';
import { LanguageScreen } from './language';
import { LinkImportScreen } from './link-import';
import { ListImportScreen } from './list-import';
import { OnboardingScreen } from './onboarding';
import { PaymentsScreen } from './payments';
import { ReleasesScreen } from './releases';
import { SettingsScreen } from './settings';
import { ShareScreen } from './share';
import { StatsScreen } from './stats';
import { ThirdListScreen } from './third-list';
import { VisibilityScreen } from './visibility';
import { WishEditorScreen } from './wish-editor';
import { WishesScreen } from './wishes';

export type { ScreenProps } from '../nav/routes';

export const SCREENS: { [Screen in ScreenId]: FC<ScreenProps<Screen>> } = {
    home: HomeScreen,
    onboarding: OnboardingScreen,
    wishes: WishesScreen,
    wishEditor: WishEditorScreen,
    linkImport: LinkImportScreen,
    listImport: ListImportScreen,
    gives: GivesScreen,
    find: FindScreen,
    thirdList: ThirdListScreen,
    share: ShareScreen,
    settings: SettingsScreen,
    visibility: VisibilityScreen,
    payments: PaymentsScreen,
    currency: CurrencyScreen,
    delivery: DeliveryScreen,
    language: LanguageScreen,
    feedback: FeedbackScreen,
    stats: StatsScreen,
    donate: DonateScreen,
    releases: ReleasesScreen,
    about: AboutScreen
};
