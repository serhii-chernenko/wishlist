import type { Message } from 'telegraf/types';

import { isLinkImportEnabled } from '../../worker/env';
import {
    callbackButton,
    homeButton,
    inlineKeyboard
} from '../content/keyboards';
import { extractLink } from '../input/link';
import type { BotRequest, LinkOffer, SessionState } from './types';

export const LINK_OFFER_TTL_MS = 15 * 60 * 1000;

export const getMessageText = (message: Message) => {
    return 'text' in message ? message.text : undefined;
};

export const getBareLink = (text: string | undefined) => {
    const trimmed = text?.trim() ?? '';

    return trimmed !== '' && extractLink(trimmed) === trimmed ? trimmed : null;
};

export const isLinkImportAvailable = (
    req: Pick<BotRequest, 'env' | 'services'>
) => {
    return (
        req.services.linkImport !== undefined && isLinkImportEnabled(req.env)
    );
};

export const setLinkOffer = (req: BotRequest, offer: LinkOffer | null) => {
    const next: SessionState = { ...req.session };

    if (offer === null) {
        delete next.linkOffer;
    } else {
        next.linkOffer = offer;
    }

    req.setSession(next);
};

export const takeLinkOffer = (req: BotRequest, createdAt: number) => {
    const offer = req.session.linkOffer;

    setLinkOffer(req, null);

    const isCurrent = offer !== undefined && offer.createdAt === createdAt;

    return isCurrent && Date.now() - offer.createdAt <= LINK_OFFER_TTL_MS
        ? offer.url
        : null;
};

export const offerLinkImport = async (req: BotRequest, url: string) => {
    const { offer } = req.LL.wishlist.add.import;
    const createdAt = Date.now();

    setLinkOffer(req, { url, createdAt });
    await req.send.text(
        offer.text(),
        inlineKeyboard([
            [
                callbackButton(offer.confirm(), {
                    type: 'linkOfferAccept',
                    createdAt
                })
            ],
            [homeButton(req.LL)]
        ])
    );
};
