//Called when a experience info message is sended
export async function sendExpMessage(actor, expBreakdown, expAmount) {
    const templatePath = "systems/rmss/templates/chat/exp-message.hbs";

    const data = {
        actorName: actor.name,
        expGained: expAmount,
        expBreakdown: expBreakdown,
    };

    const content = await renderTemplate(templatePath, data);
    //send only to user owner an GMs
    const whispers = [];
    if (actor.isOwner) {
        whispers.push(game.user.id);
    }
    if (game.users.filter(u => u.isGM).length > 0) {
        whispers.push(...game.users.filter(u => u.isGM).map(u => u.id));
    }

    ChatMessage.create({
        content: content,
        speaker: "Game Master",
        whisper: whispers
    });
}