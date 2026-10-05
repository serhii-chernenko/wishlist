import { useLL } from '../state/context';

export const TagSkeletons = ({
    count = 3,
    hero = false
}: {
    count?: number;
    hero?: boolean;
}) => {
    const LL = useLL();

    return (
        <div class='boot' role='status'>
            <span class='sr-only'>{LL.common.loading()}</span>
            {hero ? (
                <div
                    class='card card-border boot-tag boot-tag-hero'
                    aria-hidden='true'
                />
            ) : null}
            {Array.from({ length: count }, (_, index) => {
                return (
                    <div
                        key={index}
                        class='card card-border boot-tag'
                        aria-hidden='true'
                    />
                );
            })}
        </div>
    );
};
