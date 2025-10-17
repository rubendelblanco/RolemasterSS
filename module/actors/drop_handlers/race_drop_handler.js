// module/actors/drop_handlers/race_drop_handler.js
import RaceService from "../services/race_service.js";

export default class RaceDropHandler {
    constructor(actor) {
        this.actor = actor;
    }

    async handle(itemData) {
        return RaceService.applyRace(this.actor, itemData);
    }
}

