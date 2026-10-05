import {
    LIST_IMPORT_URL_MAX_LENGTH,
    parseListImportUrl
} from '../../shared/list-import-url';
import {
    LIST_IMPORT_VISIBILITIES,
    type ListImportFailure,
    type ListImportPreviewDto,
    type ListImportStatusDto
} from '../../shared/app-api';
import { kickListImport } from '../../worker/list-import';
import { listImportPreviewedEvent } from '../../worker/telemetry';
import {
    emitApiTelemetry,
    getListImportDeps,
    requireListImportService,
    requireUser,
    runInBackground,
    type ApiContext,
    type ApiHandler
} from '../context';
import { ApiError } from '../errors';
import {
    createBodyReader,
    readIdParam,
    readJsonBody,
    validationError
} from '../validate';

const readPreviewUrl = async (c: ApiContext) => {
    const reader = createBodyReader(await readJsonBody(c));
    const url = reader.requiredString('url', {
        maxLength: LIST_IMPORT_URL_MAX_LENGTH
    });

    reader.finish();

    const parsed = url === undefined ? null : parseListImportUrl(url);

    if (parsed === null) {
        throw validationError('url', 'invalid');
    }

    return parsed;
};

const readCommitVisibility = async (c: ApiContext) => {
    const reader = createBodyReader(await readJsonBody(c));
    const visibility = reader.requiredOneOf(
        'visibility',
        LIST_IMPORT_VISIBILITIES
    );

    reader.finish();

    if (visibility === undefined) {
        throw validationError('visibility', 'invalid');
    }

    return visibility;
};

const withFailure = (
    status: ListImportStatusDto,
    failure: ListImportFailure
): ListImportStatusDto => {
    return { ...status, failure };
};

const emitPreviewed = (
    c: ApiContext,
    preview: ListImportPreviewDto,
    startedAt: number
) => {
    emitApiTelemetry(
        c,
        listImportPreviewedEvent({
            channel: 'app',
            source: 'rewish',
            kind: preview.kind,
            result: preview.outcome,
            items: preview.counts?.found ?? 0,
            duplicates: preview.counts?.duplicates ?? 0,
            elapsedMs: c.var.deps.now().getTime() - startedAt
        })
    );
};

export const previewListImport: ApiHandler = async c => {
    const service = requireListImportService(c);
    const user = requireUser(c);
    const url = await readPreviewUrl(c);
    const startedAt = c.var.deps.now().getTime();
    const preview = await service.preview(getListImportDeps(c), {
        userId: user.id,
        url,
        channel: 'app'
    });

    emitPreviewed(c, preview, startedAt);

    return c.json(preview);
};

export const commitListImport: ApiHandler = async c => {
    const service = requireListImportService(c);
    const user = requireUser(c);
    const jobId = readIdParam(c, 'id');
    const visibility = await readCommitVisibility(c);
    const deps = getListImportDeps(c);
    const started = await service.startCommit(deps, {
        userId: user.id,
        jobId,
        visibility,
        chatMessageId: null
    });

    if (started.ok) {
        await runInBackground(
            c,
            service.runCommit(deps, { jobId, trigger: 'request' }).then(() => {
                kickListImport(service, deps, user.id);
            })
        );

        return c.json(started.status);
    }

    const status = await service.status(deps, { userId: user.id, jobId });

    if (started.outcome === 'notFound' || status === null) {
        throw new ApiError('notFound');
    }

    return c.json(withFailure(status, started.outcome));
};

export const getListImport: ApiHandler = async c => {
    const service = requireListImportService(c);
    const user = requireUser(c);
    const jobId = readIdParam(c, 'id');
    const deps = getListImportDeps(c);
    const status = await service.status(deps, { userId: user.id, jobId });

    if (status === null) {
        throw new ApiError('notFound');
    }

    if (status.state === 'committing' || status.photosPending > 0) {
        kickListImport(service, deps, user.id);
    }

    return c.json(status);
};
