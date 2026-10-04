import type { FC } from 'hono/jsx';

import type { ScreenId, ScreenProps } from '../nav/routes';
import { AboutScreen } from './about';
import { DonateScreen } from './donate';
import { FeedbackScreen } from './feedback';
import { FindScreen } from './find';
import { GivesScreen } from './gives';
import { HomeScreen } from './home';
import { LanguageScreen } from './language';
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
    gives: GivesScreen,
    find: FindScreen,
    thirdList: ThirdListScreen,
    share: ShareScreen,
    settings: SettingsScreen,
    visibility: VisibilityScreen,
    payments: PaymentsScreen,
    language: LanguageScreen,
    feedback: FeedbackScreen,
    stats: StatsScreen,
    donate: DonateScreen,
    releases: ReleasesScreen,
    about: AboutScreen
};
