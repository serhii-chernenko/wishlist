import releaseMediaConfig from '../../../releases.media.json';

export const RELEASE_MEDIA_MIN_ITEMS = 1;
export const RELEASE_MEDIA_MAX_ITEMS = 10;

export type ReleaseMediaConfig = Record<string, readonly string[]>;

const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

export const isValidReleaseMediaFileIds = (
    value: unknown
): value is readonly string[] => {
    return (
        Array.isArray(value) &&
        value.length >= RELEASE_MEDIA_MIN_ITEMS &&
        value.length <= RELEASE_MEDIA_MAX_ITEMS &&
        value.every(isNonEmptyString)
    );
};

export const findReleaseMediaProblems = (config: unknown) => {
    if (!isRecord(config)) {
        return ['The release media config must be a JSON object'];
    }

    return Object.entries(config).flatMap(([version, fileIds]) => {
        const problems: string[] = [];

        if (!releaseVersionPattern.test(version)) {
            problems.push(`${version}: the key must be a release version`);
        }

        if (!isValidReleaseMediaFileIds(fileIds)) {
            problems.push(
                `${version}: expected ${RELEASE_MEDIA_MIN_ITEMS} to ${RELEASE_MEDIA_MAX_ITEMS} non-empty file ids`
            );
        }

        return problems;
    });
};

export const readReleaseMediaFileIds = (
    config: unknown,
    releaseVersion: string
): readonly string[] => {
    if (!isRecord(config) || !Object.hasOwn(config, releaseVersion)) {
        return [];
    }

    const fileIds = config[releaseVersion];

    return isValidReleaseMediaFileIds(fileIds) ? fileIds : [];
};

export const getReleaseMedia = (releaseVersion: string) => {
    return readReleaseMediaFileIds(releaseMediaConfig, releaseVersion);
};
