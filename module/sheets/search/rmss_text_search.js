export class InputTextSearchStrategy {
    constructor(formId) {
        this.formId = formId;
    }

    /**
     * Inicializa la búsqueda cuando el DOM y Foundry están listos.
     */
    load(html) {
        const $form = html.find(`#${this.formId}`);
        if (!$form.length) {
            console.warn(`No se encontró el formulario #${this.formId} en el DOM.`);
            return;
        }

        this.initializeSearch(html, $form);
    }

    /**
     * Configura la funcionalidad de búsqueda usando los atributos del <form>.
     */
    initializeSearch(html, $form) {
        const targetSelector = $form.data("target-selector");
        const targetDataAttribute = $form.data("target-data-attribute") || "";
        const debounceTime = parseInt($form.data("debounce")) || 200;

        if (!targetSelector) {
            console.warn(`Falta 'data-target-selector' en el formulario #${this.formId}`);
            return;
        }

        const $input = $form.find("input[type='text']");
        if (!$input.length) {
            console.warn(`No se encontró un input en el formulario #${this.formId}`);
            return;
        }

        const performSearch = (query) => {
            query = query.toLowerCase().trim();
            const $items = html.find(targetSelector);

            $items.each((_, item) => {
                const $item = $(item);
                let textToSearch = targetDataAttribute
                    ? $item.data(targetDataAttribute) || ''
                    : $item.text() || '';

                textToSearch = textToSearch.toLowerCase();
                $item.toggle(textToSearch.includes(query));
            });
        };

        let debounceTimer;
        $input.on("input", (event) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => performSearch(event.target.value), debounceTime);
        });

        $input.on("keydown", (event) => {
            if (event.key === "Escape") {
                $input.val('');
                performSearch('');
            }
        });
    }

    static create(formId) {
        return new InputTextSearchStrategy(formId);
    }
}
