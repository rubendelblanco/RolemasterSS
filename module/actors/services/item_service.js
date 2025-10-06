/**
 * Service to handle skill-related operations on items.
 */
export default class ItemService {
    /**
     * Toggle the "favorite" status of a given item.
     *
     * This method inverses the current favorite flag of the provided item.
     * If the item is currently marked as a favorite, it will be unmarked;
     * if it is not marked as favorite, it will be set as favorite.
     *
     * @param {Item} item - The Foundry VTT item document whose favorite state will be toggled.
     * @returns {Promise<void>} Resolves once the item has been successfully updated.
     */
    static async toggleFavorite(item) {
        const isFav = item.system.favorite === true;
        await item.update({"system.favorite": !isFav});
    }
}