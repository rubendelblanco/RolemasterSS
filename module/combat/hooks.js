Hooks.on("hoverToken", (token, hovered) => {
    if (hovered) {
        let effectInfo= {};
        console.log(token.actor.effects);
        for (let effect of token.actor.effects) {
            const iconPath = effect.img;

            if (effect.name === "Stunned" || effect.name === "Parry" || effect.name === "No parry") {
                if (!effectInfo[iconPath]){
                    effectInfo[iconPath] = effect.duration.rounds
                }
                else {
                    effectInfo[iconPath] = parseInt(effectInfo[iconPath]) + parseInt(effect.duration.rounds)
                }
            }

            if (effect.name === "Bleeding") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath].push(-effect.flags.value);
            }

            if (effect.name === "Penalty") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath].push(effect.flags.value);
            }

            if (effect.name === "Bonus") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath] = effect.duration.rounds + " ("+effect.flags.value+")";
            }

        }

        let tooltipContent = Object.entries(effectInfo).map(([iconPath, value]) => {
            return `<div><img src="${iconPath}" width="20" height="20" style="vertical-align: middle; margin-right: 5px;"> ${value}</div>`;
        }).join("");

        let tooltip = $(`<div class="tooltip" style="position: absolute; z-index: 1000; padding: 5px; 
                          background: black; color: white; border: 1px solid white; border-radius: 5px;">
                          ${tooltipContent || "No effects"}
                          </div>`);

        $("body").append(tooltip);
        $(document).on("mousemove.tooltip", (event) => {
            tooltip.css({ left: event.pageX + 15, top: event.pageY + 15 });
        });
    } else {
        $(".tooltip").remove();
        $(document).off("mousemove.tooltip");
    }
});