// module/actors/drop_handlers/index.js
import RaceDropHandler from "./race_drop_handler.js";
import SkillCategoryDropHandler from "./skill_category_drop_handler.js";
import SkillDropHandler from "./skill_drop_handler.js";

export const dropHandlers = {
    race: (actor, itemData, event, data) =>
        new RaceDropHandler(actor).handle(itemData, event, data),
    skill_category: (actor, itemData, event, data) =>
        new SkillCategoryDropHandler(actor).handle(itemData, event, data),
    skill: (actor, itemData, event, data) =>
        new SkillDropHandler(actor).handle(itemData, event, data)
};
