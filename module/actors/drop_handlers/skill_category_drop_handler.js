// module/actors/drop_handlers/skill_drop_handler.js
import SkillService from "../services/skill_category_service.js";
import SkillCategoryService from "../services/skill_category_service.js";

export default class SkillCategoryDropHandler {
    constructor(actor) {
        this.actor = actor;
    }

    async handle(itemData, event, data) {
        return SkillCategoryService.applySkillCategory(actor, itemData, event, data);
    }
}