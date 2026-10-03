import type { Child } from 'hono/jsx';

export const Envelope = ({
    title,
    children
}: {
    title: string;
    children?: Child;
}) => {
    return (
        <section class='envelope'>
            <div class='envelope-flap' aria-hidden='true' />
            <h2 class='envelope-title'>{title}</h2>
            <div class='envelope-text'>{children}</div>
        </section>
    );
};
