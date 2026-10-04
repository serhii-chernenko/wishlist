import type { WishPriority } from '../../shared/app-api';
import type { Currency, ExchangeRates } from '../../shared/money';
import type { WebTheme } from '../theme';
import type { SupportLink } from '../../bot/content/support-links';
import type { SharePageLanguage } from './public-id';

export type WebCurrencyChoice = Currency | 'auto';

export interface ShareWishPhoto {
    url: string;
    alt: string;
}

export interface ShareWishView {
    title: string;
    description: string | null;
    link: string | null;
    price: number;
    currency: Currency;
    priority: WishPriority;
    createdAt: Date;
    updatedAt: Date;
    photos?: readonly ShareWishPhoto[];
}

export interface SharePageModel {
    language: SharePageLanguage;
    theme?: WebTheme;
    publicId: string;
    origin: string;
    assetVersion: string;
    displayName: string | null;
    username: string | null;
    payments: string | null;
    displayCurrency: Currency;
    currencyChoice: WebCurrencyChoice;
    deliveryHintShown: boolean;
    rates: ExchangeRates;
    visibleCount: number;
    lastUpdatedAt: Date | null;
    wishes: readonly ShareWishView[];
    indexable: boolean;
    botUrl: string;
    githubUrl: string;
    supportLinks: readonly SupportLink[];
}

export interface HomePageModel {
    language: SharePageLanguage;
    theme?: WebTheme;
    origin: string;
    assetVersion: string;
    indexable: boolean;
    botUrl: string;
    githubUrl: string;
    authorUrl: string;
    princessUrl: string;
    supportLinks: readonly SupportLink[];
}
