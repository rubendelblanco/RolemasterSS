const CARD_TEMPLATE = "systems/rmss/templates/chat/request-card.html";

/**
 * Generic "player requests -> GM confirms in chat" engine, shared by any flow that
 * needs a whispered pending card resolved into an approved/rejected/failed one
 * (merchant purchases, loot pickups...). This module only owns the chat-card
 * lifecycle — whispering, rendering, and the resolved/already-resolved bookkeeping.
 * All domain validation and mutation (what "accept" actually does) stays in the
 * calling service, passed in as callbacks.
 */
export default class RequestCardService {

  /** GMs + current owners of receiverActor, deduped. */
  static whisperTargets(receiverActor) {
    const ids = new Set();
    game.users.filter(u => u.isGM).forEach(u => ids.add(u.id));
    game.users.filter(u => receiverActor.testUserPermission(u, "OWNER")).forEach(u => ids.add(u.id));
    return Array.from(ids);
  }

  /**
   * Post a new pending request card, whispered to the GM(s) and the receiver's owner(s).
   * @param {object} opts
   * @param {string} opts.requestKind - flag key under flags.rmss, and the value read back
   *   by resolve(); also the value stamped on the Accept/Reject buttons so chat/hooks.js
   *   can route a click to the right resolver.
   * @param {string} opts.title - already-localized card title (frozen into the card).
   * @param {string} opts.icon - FontAwesome class, e.g. "fa-hand-holding-dollar".
   * @param {string} opts.bodyHtml - already-formatted HTML body.
   * @param {Actor} opts.speakerActor - whose name shows as the chat speaker.
   * @param {Actor} opts.receiverActor - used to compute whisper targets.
   * @param {object} opts.data - domain-specific fields to persist on the message flags.
   */
  static async post({ requestKind, title, icon, bodyHtml, speakerActor, receiverActor, data }) {
    const content = await renderTemplate(CARD_TEMPLATE, { pending: true, title, icon, bodyHtml, requestKind });

    await ChatMessage.create({
      content,
      speaker: { alias: speakerActor.name },
      whisper: this.whisperTargets(receiverActor),
      flags: {
        rmss: {
          [requestKind]: { ...data, title, icon, bodyHtml, resolved: false }
        }
      }
    });
  }

  /**
   * Resolve a pending card (GM-only; no-ops if already resolved or missing).
   * @param {ChatMessage} message
   * @param {string} requestKind
   * @param {"accept"|"reject"} decision
   * @param {object} callbacks
   * @param {(data: object) => Promise<{statusClass: string, statusMessage: string}>} callbacks.onAccept
   *   Domain-owned: re-validates and performs the actual mutation, then decides the
   *   resulting statusClass ("approved", or a domain-specific failure class).
   * @param {(data: object) => string} callbacks.rejectedMessage - localized rejection text.
   */
  static async resolve(message, requestKind, decision, { onAccept, rejectedMessage }) {
    if (!game.user.isGM) return;

    const data = message.getFlag("rmss", requestKind);
    if (!data || data.resolved) return;

    let statusClass, statusMessage;
    if (decision === "reject") {
      statusClass = "rejected";
      statusMessage = rejectedMessage(data);
    } else {
      ({ statusClass, statusMessage } = await onAccept(data));
    }

    const content = await renderTemplate(CARD_TEMPLATE, {
      pending: false,
      title: data.title,
      icon: data.icon,
      bodyHtml: data.bodyHtml,
      statusClass,
      statusMessage
    });

    await message.update({
      content,
      flags: { rmss: { [requestKind]: { ...data, resolved: true, decision } } }
    });
  }
}
