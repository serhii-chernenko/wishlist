import type { ShareRecord } from '../../db/repositories';
import type {
    ContactDisclosureDto,
    ContactDisclosureField
} from '../../shared/app-api';
import {
    callbackButton,
    homeButton,
    navigationButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { clearPendingInput, deriveRequest } from '../runtime/context';
import type {
    BotRequest,
    CallbackTable,
    ConfirmableDisclosureField,
    ScreenModule,
    UserRecord
} from '../runtime/types';
import {
    createContactService,
    getDisclosure,
    type DisclosureOutcome,
    type DisclosureRejection
} from '../services/contact-service';
import { runRepository } from '../services/run-repository';
import { createShareService } from '../services/share-service';
import { screen as homeScreen } from './home';

const TOGGLE_ORDER: readonly ContactDisclosureField[] = [
    'payments',
    'phone',
    'address'
];

const getShareService = (req: BotRequest) => {
    return createShareService(req.repos);
};

const buildToggleButton = (
    req: BotRequest,
    field: ContactDisclosureField,
    disclosure: ContactDisclosureDto
) => {
    const labels = req.LL.disclosure.toggle[field];

    return callbackButton(disclosure[field] ? labels.on() : labels.off(), {
        type: 'disclosureToggle',
        field
    });
};

const buildIndexingButton = (
    req: BotRequest,
    share: Pick<ShareRecord, 'allowIndexing'>
) => {
    const { indexing } = req.LL.disclosure;

    return callbackButton(
        share.allowIndexing ? indexing.on() : indexing.off(),
        { type: 'wishlistShareIndexing' }
    );
};

const buildDescription = (req: BotRequest, share: ShareRecord | null) => {
    const { disclosure } = req.LL;
    const base = `${disclosure.title()}\n\n${disclosure.description()}`;

    if (share === null) {
        return base;
    }

    return `${base}\n\n<b>${disclosure.indexing.title()}</b>\n${disclosure.indexing.hint()}`;
};

const renderFor = async (req: BotRequest, user: UserRecord) => {
    const share = await getShareService(req).getShare(user.id);
    const disclosure = getDisclosure(user);

    clearPendingInput(req);
    await req.send.text(
        buildDescription(req, share),
        singleColumnKeyboard([
            ...TOGGLE_ORDER.map(field => {
                return buildToggleButton(req, field, disclosure);
            }),
            share === null ? null : buildIndexingButton(req, share),
            navigationButton(req.LL.actions.back(), 'settings'),
            homeButton(req.LL)
        ])
    );
};

const render = async (req: BotRequest) => {
    if (!req.user) {
        await homeScreen.render(req, undefined);
        return;
    }

    await renderFor(req, req.user);
};

const describeRejection = (req: BotRequest, reason: DisclosureRejection) => {
    const { disclosure } = req.LL;

    return reason === 'addressRequired'
        ? disclosure.needsAddress()
        : disclosure.phoneMissing();
};

const finishChange = async (
    req: BotRequest,
    user: UserRecord,
    outcome: DisclosureOutcome
) => {
    if (!outcome.ok) {
        await req.send.text(describeRejection(req, outcome.reason));
        await renderFor(req, user);
        return;
    }

    for (const change of outcome.changes) {
        req.telemetry.botActionCompleted({
            action: 'contact_disclosure_changed',
            field: change.field,
            result: change.shown ? 'on' : 'off'
        });
    }

    await req.send.toast(req.LL.disclosure.saved());
    await renderFor(deriveRequest(req, { user: outcome.user }), outcome.user);
};

const resolveConfirmationKey = (
    user: Pick<UserRecord, 'showPhone'>,
    field: ConfirmableDisclosureField
) => {
    return field === 'address' && !user.showPhone ? 'both' : field;
};

const renderConfirmation = async (
    req: BotRequest,
    user: Pick<UserRecord, 'showPhone'>,
    field: ConfirmableDisclosureField
) => {
    const { LL } = req;

    await req.send.text(
        LL.disclosure.confirm[resolveConfirmationKey(user, field)](),
        singleColumnKeyboard([
            callbackButton(LL.actions.yes(), {
                type: 'disclosureConfirm',
                field
            }),
            navigationButton(LL.actions.no(), 'disclosure')
        ])
    );
};

const precheckEnabling = (
    user: UserRecord,
    field: ConfirmableDisclosureField
): { reason: DisclosureRejection } | null => {
    if (field === 'phone') {
        return user.phone === null ? { reason: 'phoneRequired' } : null;
    }

    if (!user.deliveryAddress) {
        return { reason: 'addressRequired' };
    }

    return user.phone === null ? { reason: 'phoneRequired' } : null;
};

export const screen: ScreenModule = {
    id: 'disclosure',
    render
};

export const callbacks: CallbackTable = {
    async disclosureToggle(req, action) {
        const { user } = req;

        if (!user) {
            await homeScreen.render(req, undefined);
            return;
        }

        const service = createContactService(req.repos);
        const shown = getDisclosure(user)[action.field];

        if (action.field === 'payments' || shown) {
            await finishChange(
                req,
                user,
                await service.setDisclosure(user, { [action.field]: !shown })
            );
            return;
        }

        const rejection = precheckEnabling(user, action.field);

        if (rejection !== null) {
            await req.send.text(describeRejection(req, rejection.reason));
            await renderFor(req, user);
            return;
        }

        await renderConfirmation(req, user, action.field);
    },
    async disclosureConfirm(req, action) {
        const { user } = req;

        if (!user) {
            await homeScreen.render(req, undefined);
            return;
        }

        await finishChange(
            req,
            user,
            await createContactService(req.repos).setDisclosure(user, {
                [action.field]: true
            })
        );
    },
    async wishlistShareIndexing(req) {
        const { user } = req;

        if (!user) {
            await homeScreen.render(req, undefined);
            return;
        }

        const share = await getShareService(req).getShare(user.id);

        if (share !== null) {
            const allowIndexing = !share.allowIndexing;

            await runRepository(
                req.repos.shares.setAllowIndexing(
                    user.id,
                    allowIndexing,
                    new Date()
                )
            );
            req.telemetry.botActionCompleted({
                action: 'wishlist_share_indexing_toggled',
                result: allowIndexing ? 'on' : 'off'
            });
            await req.send.toast(req.LL.disclosure.saved());
        }

        await renderFor(req, user);
    }
};
