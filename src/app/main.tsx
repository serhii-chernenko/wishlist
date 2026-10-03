import { render } from 'hono/jsx/dom';

const App = () => {
    return <main class='sr-only'>Wishlist</main>;
};

const root = document.getElementById('root');

if (root) {
    render(<App />, root);
}
