import { failureMessage } from '../i18n/messages';
import type { AppFailure } from '../logic/errors';
import { useLL } from '../state/context';
import { Tag } from './tag';

export const ErrorState = ({
    failure,
    onRetry
}: {
    failure: AppFailure;
    onRetry?: () => void;
}) => {
    const LL = useLL();

    return (
        <Tag class='state-tag'>
            <p class='state-text' role='alert'>
                {failureMessage(LL, failure)}
            </p>
            {onRetry === undefined ? null : (
                <button type='button' class='btn' onClick={onRetry}>
                    {LL.common.retry()}
                </button>
            )}
        </Tag>
    );
};
