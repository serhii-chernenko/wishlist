import { createUserService } from '../../bot/services/user-service';
import { CURRENCIES } from '../../shared/money';
import { requireUser, type ApiHandler } from '../context';
import { resolveRequestLocale, toMeDto } from '../dto';
import { ApiError } from '../errors';
import { emitAppAction } from '../telemetry';
import { createBodyReader, readJsonBody } from '../validate';

export const setCurrency: ApiHandler = async c => {
    const { actor, deps, repos } = c.var;
    const user = requireUser(c);
    const reader = createBodyReader(await readJsonBody(c));
    const currency = reader.requiredOneOf('currency', CURRENCIES);

    reader.finish();

    if (currency === undefined) {
        throw new ApiError('validation');
    }

    const updated = await createUserService({
        repos,
        now: deps.now
    }).setCurrency(user, currency);

    if (updated === null) {
        throw new ApiError('registrationRequired');
    }

    emitAppAction(c, 'currency_changed', { result: currency });

    return c.json(
        toMeDto({
            actor,
            user: updated,
            sessionLanguage: null,
            locale: resolveRequestLocale(actor, updated, null)
        })
    );
};
