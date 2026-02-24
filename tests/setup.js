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
