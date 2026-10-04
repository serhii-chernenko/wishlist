import { createElement } from 'hono/jsx/dom';

export type IconNode = readonly (readonly [
    tag: string,
    attrs: Readonly<Record<string, string | number | undefined>>
])[];

/** Renders a Lucide icon node as an inline, decorative SVG; import icons one by one (`import { Gift } from 'lucide'`) so the bundle keeps only those. */
export const Icon = ({
    icon,
    class: className
}: {
    icon: IconNode;
    class?: string;
}) => {
    return (
        <svg
            class={className === undefined ? 'icon' : `icon ${className}`}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
            aria-hidden='true'
            focusable='false'
        >
            {icon.map(([tag, attrs]) => {
                return createElement(tag, { ...attrs });
            })}
        </svg>
    );
};
