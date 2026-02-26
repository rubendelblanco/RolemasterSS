/**
 * Jest setup file - Mock FoundryVTT global objects
 */
import { jest } from '@jest/globals';

// Mock game object
global.game = {
    i18n: {
        lang: 'en',
        localize: (key) => key
    },
    user: {
        targets: new Set()
    },
    dice3d: null
};

// Mock Roll class
global.Roll = class Roll {
    constructor(formula) {
        this.formula = formula;
        this.total = 50; // Default roll value
    }
    async evaluate() {
        return this;
    }
};

// Mock ChatMessage
global.ChatMessage = {
    create: jest.fn().mockResolvedValue({}),
    getSpeaker: jest.fn().mockReturnValue({})
};

// Mock CONST
global.CONST = {
    CHAT_MESSAGE_TYPES: {
        OTHER: 0
    }
};

// Mock ui
global.ui = {
    notifications: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
    }
};

// Mock fetch for loading JSON tables
global.fetch = jest.fn();

// Mock Hooks and socketlib (needed if rmss.js loads)
global.Hooks = { once: jest.fn(), on: jest.fn() };
global.socketlib = { registerSystem: jest.fn().mockReturnValue({ register: jest.fn() }) };

// Mock Foundry Document/Application classes (needed by various modules)
global.Actor = class Actor {};
global.Item = class Item {};
global.Document = class Document {};
global.Combatant = class Combatant {};
global.Combat = class Combat {};
global.Application = class Application {};
global.ItemSheet = class ItemSheet {};
global.ActorSheet = class ActorSheet {};
global.FormApplication = global.Application;
global.foundry = global.foundry || {};
global.foundry.utils = global.foundry.utils || { mergeObject: (a, b) => ({ ...a, ...b }) };
