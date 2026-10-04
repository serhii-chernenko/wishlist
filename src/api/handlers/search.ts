import { FIND_QUERY_MAX_LENGTH } from '../../bot/input/limits';
import { isAdminActor } from '../../bot/runtime/context';
import { createSearchService } from '../../bot/services/search-service';
import type { SearchInput, SearchResultDto } from '../../shared/app-api';
import { requireUser, type ApiHandler } from '../context';
import { toOwnerDto } from '../dto';
import { createBodyReader, readJsonBody } from '../validate';
import { emitAppAction } from '../telemetry';
import { mintOwnerToken } from './lists';

const countCodePoints = (value: string) => {
    return Array.from(value).length;
};

const respond = (
    c: Parameters<ApiHandler>[0],
    result: SearchResultDto,
    telemetryResult: string
) => {
    emitAppAction(c, 'wishlist_searched', { result: telemetryResult });

    return c.json(result);
};

export const search: ApiHandler = async c => {
    const viewer = requireUser(c);
    const reader = createBodyReader(await readJsonBody(c));
    const query = reader.requiredString('query');

    reader.finish();

    const input: SearchInput = { query: query ?? '' };

    if (countCodePoints(input.query) > FIND_QUERY_MAX_LENGTH) {
        return respond(c, { status: 'tooLong' }, 'tooLong');
    }

    const outcome = await createSearchService(c.var.repos).findByQuery({
        query: input.query,
        searcherId: viewer.id,
        searcherIsAdmin: isAdminActor(c.env, c.var.actor)
    });

    if (outcome.status !== 'found') {
        return respond(c, { status: outcome.status }, outcome.status);
    }

    return respond(
        c,
        {
            status: 'found',
            owner: toOwnerDto({
                owner: outcome.user,
                token: await mintOwnerToken(c, viewer, outcome.user),
                label: input.query,
                source: 'search',
                contact: null
            })
        },
        'found'
    );
};
