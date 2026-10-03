import type { Child } from 'hono/jsx';

import type { ResourceHandle } from '../state/store';
import { ErrorState } from './error-state';
import { TagSkeletons } from './skeleton';

export const isResourcePending = <Value,>(resource: ResourceHandle<Value>) => {
    return resource.data === undefined && resource.failure === null;
};

/** Shows the loaded data, a skeleton while the first load runs, or the failure with a retry; stale data stays visible during revalidation. */
export const ResourceView = <Value,>({
    resource,
    skeletons = 2,
    children
}: {
    resource: ResourceHandle<Value>;
    skeletons?: number;
    children: (data: Value) => Child;
}) => {
    if (resource.data !== undefined) {
        return <>{children(resource.data)}</>;
    }

    if (resource.failure !== null) {
        return (
            <ErrorState
                failure={resource.failure}
                onRetry={() => {
                    void resource.reload();
                }}
            />
        );
    }

    return <TagSkeletons count={skeletons} />;
};
