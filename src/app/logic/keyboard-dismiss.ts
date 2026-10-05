export interface KeyboardDismissContext {
    activeFieldIsEditable: boolean;
    targetIsInsideEditable: boolean;
    targetIsInsideInteractive: boolean;
}

export const shouldDismissKeyboard = ({
    activeFieldIsEditable,
    targetIsInsideEditable,
    targetIsInsideInteractive
}: KeyboardDismissContext) => {
    return (
        activeFieldIsEditable &&
        !targetIsInsideEditable &&
        !targetIsInsideInteractive
    );
};

export const isEnterToDismiss = ({
    key,
    isComposing
}: {
    key: string;
    isComposing: boolean;
}) => {
    return key === 'Enter' && !isComposing;
};
