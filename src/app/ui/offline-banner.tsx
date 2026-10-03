import { useApp, useLL } from '../state/context';
import { useStore } from '../state/store';

export const OfflineBanner = () => {
    const { online, revalidate } = useApp();
    const isOnline = useStore(online);
    const LL = useLL();

    if (isOnline) {
        return null;
    }

    return (
        <div class='offline-banner' role='alert'>
            <p>{LL.offline.text()}</p>
            <button type='button' class='btn btn-sm' onClick={revalidate}>
                {LL.offline.cta()}
            </button>
        </div>
    );
};
