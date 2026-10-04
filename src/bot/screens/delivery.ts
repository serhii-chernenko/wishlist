import type { Message } from 'telegraf/types';

import {
    callbackButton,
    homeButton,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import type { AddressRejection } from '../input/address';
import { ADDRESS_MAX_LENGTH } from '../input/limits';
import { clearPendingInput, deriveRequest } from '../runtime/context';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule,
    UserRecord
} from '../runtime/types';
import { createContactService } from '../services/contact-service';
import { escapeHtml } from '../utils/strings';
import { getMessageText } from '../utils/telegram';
import { screen as homeScreen } from './home';
import { screen as settingsScreen } from './settings';

const isPhoneShown = (user: Pick<UserRecord, 'phone' | 'showPhone'>) => {
    return user.showPhone && user.phone !== null;
};

const getContactService = (req: BotRequest) => {
    return createContactService(req.repos);
};

const describeRejection = (req: BotRequest, reason: AddressRejection) => {
    const { errors } = req.LL.delivery;

    switch (reason) {
        case 'tooShort':
            return errors.tooShort();
        case 'containsLink':
            return errors.containsLink();
        case 'tooManyLines':
            return errors.tooManyLines();
        case 'tooLong':
            return errors.tooLong({ max: ADDRESS_MAX_LENGTH });
    }
};

const render = async (req: BotRequest) => {
    const { LL, user } = req;

    if (!user) {
        await homeScreen.render(req, undefined);
        return;
    }

    const current = user.deliveryAddress
        ? `\n\n<blockquote>${escapeHtml(user.deliveryAddress)}</blockquote>`
        : '';
    const phoneShown = isPhoneShown(user);
    const warning = phoneShown ? '' : `\n\n${LL.delivery.phoneWarning()}`;

    req.setSession({
        ...req.session,
        pendingInput: { kind: 'deliveryAddress' }
    });
    await req.send.text(
        `${LL.delivery.description({ current })}${warning}`,
        singleColumnKeyboard([
            user.deliveryAddress
                ? callbackButton(LL.actions.remove(), {
                      type: 'deliveryRemove'
                  })
                : null,
            phoneShown
                ? null
                : navigationButton(LL.disclosure.title(), 'disclosure'),
            navigationButton(LL.actions.back(), 'settings'),
            homeButton(LL)
        ])
    );
};

const onInput = async (
    req: BotRequest,
    _input: PendingInput,
    message: Message
) => {
    const { LL, user } = req;

    if (!user) {
        clearPendingInput(req);
        await homeScreen.render(req, undefined);
        return;
    }

    const outcome = await getContactService(req).saveDeliveryAddress(
        user,
        getMessageText(message)
    );

    if (!outcome.ok) {
        await req.send.text(
            describeRejection(req, outcome.reason),
            removeReplyKeyboard()
        );
        await render(req);
        return;
    }

    clearPendingInput(req);
    req.telemetry.botActionCompleted({ action: 'delivery_address_updated' });

    const warning = isPhoneShown(outcome.user)
        ? ''
        : `\n\n${LL.delivery.phoneWarning()}`;

    await req.send.text(
        `${LL.delivery.success.update()}${warning}`,
        removeReplyKeyboard()
    );
    await settingsScreen.render(
        deriveRequest(req, { user: outcome.user }),
        undefined
    );
};

export const screen: ScreenModule = {
    id: 'delivery',
    render,
    onInput
};

export const callbacks: CallbackTable = {
    async deliveryRemove(req) {
        const { LL, user } = req;

        if (!user) {
            await homeScreen.render(req, undefined);
            return;
        }

        const updated =
            await getContactService(req).removeDeliveryAddress(user);

        clearPendingInput(req);
        req.telemetry.botActionCompleted({
            action: 'delivery_address_removed'
        });
        await req.send.text(
            LL.delivery.success.remove(),
            removeReplyKeyboard()
        );
        await settingsScreen.render(
            deriveRequest(req, { user: updated }),
            undefined
        );
    }
};
