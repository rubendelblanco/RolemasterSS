//Called when a experience info message is sended
export async function sendExpMessage(actor, expBreakdown, expAmount) {
    const templatePath = "systems/rmss/templates/chat/exp-message.hbs";
    const data = {
        actorName: actor.name,
        expGained: expAmount,
        expBreakdown: expBreakdown,
    };

    const content = await renderTemplate(templatePath, data);

    // Crear un Set para evitar duplicados
    const whispers = new Set();

    // Agregar todos los owners del actor
    const owners = game.users.filter(user => actor.testUserPermission(user, "OWNER"));
    owners.forEach(user => whispers.add(user.id));

    // Agregar todos los GMs
    const gms = game.users.filter(user => user.isGM);
    gms.forEach(user => whispers.add(user.id));

    ChatMessage.create({
        content: content,
        speaker: { alias: "Game Master" },
        whisper: Array.from(whispers)
    });
}
