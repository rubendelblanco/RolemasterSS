export const rmss = {};

rmss.currency_type = {
  mithril: "rmss.currency_type.mithril",
  platinum: "rmss.currency_type.platinum",
  gold: "rmss.currency_type.gold",
  silver: "rmss.currency_type.silver",
  bronze: "rmss.currency_type.bronze",
  copper: "rmss.currency_type.copper",
  tin: "rmss.currency_type.tin",
  iron: "rmss.currency_type.iron"
};

rmss.currency_type_abb = {
  mithril: "rmss.currency_type_abb.mithril",
  platinum: "rmss.currency_type_abb.platinum",
  gold: "rmss.currency_type_abb.gold",
  silver: "rmss.currency_type_abb.silver",
  bronze: "rmss.currency_type_abb.bronze",
  copper: "rmss.currency_type_abb.copper",
  tin: "rmss.currency_type_abb.tin",
  iron: "rmss.currency_type_abb.iron"
};

rmss.stats = {
  agility: {
    fullname: "Agility",
    shortname: "Ag"
  },
  constitution: {
    fullname: "Constitution",
    shortname: "Co"
  },
  memory: {
    fullname: "Memory",
    shortname: "Me"
  },
  reasoning: {
    fullname: "Reasoning",
    shortname: "Re"
  },
  self_discipline: {
    fullname: "Self Discipline",
    shortname: "SD"
  },
  empathy: {
    fullname: "Empathy",
    shortname: "Em"
  },
  intuition: {
    fullname: "Intuition",
    shortname: "In"
  },
  presence: {
    fullname: "Presence",
    shortname: "Pr"
  },
  quickness: {
    fullname: "Quickness",
    shortname: "Qu"
  },
  strength: {
    fullname: "Strength",
    shortname: "St"
  }
};

rmss.skill_designations = {
  None: "None",
  Occupational: "Occupational",
  Everyman: "Everyman",
  Restricted: "Restricted"
};

rmss.skill_category_progression = {
  standard: {
    name: "Standard",
    data: "standard"
  },
  zero: {
    name: "0*0*0*0*0",
    data: "none"
  }
}

rmss.skill_progression = {
  standard: {
    name: "Standard",
    data: "standard",
    progression: "-15*3*2*1*0.5"
  },
  limited: {
    name: "Limited",
    data: "limited",
    progression: "0*1*1*0.5*0"
  },
  special: {
    name: "Special",
    data: "special",
    progression: "0*6*5*4*3"
  },
  combined: {
    name: "Combined",
    data: "combined",
    progression: "-30*5*3*1.5*0.5"
  }
}

/** Attack tables of type ball (BE spells, area). Add new ball tables here when extending. */
rmss.ballTables = ["fire_ball", "ice_ball"];
/** Attack tables of type bolt (BE and DE spells). Add new bolt tables here when extending. */
rmss.boltTables = ["fire_bolt", "ice_bolt", "lighting_bolt", "shock_bolt", "water_bolt"];

rmss.paths = {
  arms_tables: "systems/rmss/module/combat/tables/arms/",
  critical_tables: "systems/rmss/module/combat/tables/critical/",
  assets_folder: "systems/rmss/assets/",
  images_folder: "systems/rmss/assets/images/",
  sounds_folder: "systems/rmss/assets/sounds/",
  icons_folder: "systems/rmss/assets/default/"
}

rmss.attack = {
  types: {
    none: "None",
    area: "Area",
    base: "Base",
    spell: "Directed spell",
    melee: "Melee",
    missile: "Missile",
  }
}

rmss.criticalDictionary = {
  "S": "slash",
  "K": "krush",
  "P": "puncture",
  "U": "unbalance",
  "G": "grappling",
  "T": "tiny",
  "brawl": "brawl",
  "subdue": "subdue",
  "sweeps": "sweeps",
  "heat": "heat",
  "cold": "cold",
  "electricity": "electricity",
  "impact": "impact",
  "strikes": "strikes",
  "large_melee": "large_melee",
  "large_spell": "large_spell",
  "superlarge_melee": "superlarge_melee",
  "superlarge_spell": "superlarge_spell",
}

rmss.large_critical_types = {
  superlarge_spell: ['normal', 'slaying'],
  large_spell: ['normal', 'slaying'],
  superlarge_melee: ['normal', 'magic', 'mithril', 'sacred', 'slaying'],
  large_melee: ['normal', 'magic', 'mithril', 'sacred', 'slaying']
}

rmss.spell_realm = {
  "essence": "Essence",
  "channeling": "Channeling",
  "mentalism": "Mentalism",
  "arcane": "Arcane"
}

rmss.character_realm = {
  "essence": "Essence",
  "channeling": "Channeling",
  "mentalism": "Mentalism",
  "essence/channeling": "Essence/Channeling",
  "essence/mentalism": "Essence/Mentalism",
  "channeling/mentalism": "Channeling/Mentalism",
  "arcane": "Arcane"
}

rmss.spell_list_type = {
  "open": "Open",
  "closed": "Closed",
  "base": "Base"
}

rmss.skill_tab = {
  "skills": "Skills",
  "spells": "Spells",
  "languages": "Languages"
}

/**
 * Skill categories: slug -> { name, tab }.
 * Tab: "skills" | "spells" | "languages". Slug prefix "spells-" -> spells; default skills.
 * Linked to compendium skill-categories by slug.
 */
rmss.skill_categories = {
  "armor-light": { name: "Armor • Light", tab: "skills" },
  "armor-medium": { name: "Armor • Medium", tab: "skills" },
  "armor-heavy": { name: "Armor • Heavy", tab: "skills" },
  "athletic-brawn": { name: "Athletic • Brawn", tab: "skills" },
  "athletic-endurance": { name: "Athletic • Endurance", tab: "skills" },
  "athletic-gymnastics": { name: "Athletic • Gymnastics", tab: "skills" },
  "artistic-active": { name: "Artistic • Active", tab: "skills" },
  "artistic-passive": { name: "Artistic • Passive", tab: "skills" },
  "awareness-perceptions": { name: "Awareness • Perceptions", tab: "skills" },
  "awareness-searching": { name: "Awareness • Searching", tab: "skills" },
  "awareness-senses": { name: "Awareness • Senses", tab: "skills" },
  "body-development": { name: "Body Development", tab: "skills" },
  "combat-maneuvers": { name: "Combat Maneuvers", tab: "skills" },
  "communications": { name: "Communications", tab: "languages" },
  "crafts": { name: "Crafts", tab: "skills" },
  "directed-spells": { name: "Directed Spells", tab: "skills" },
  "influence": { name: "Influence", tab: "skills" },
  "lore-general": { name: "Lore • General", tab: "skills" },
  "lore-magical": { name: "Lore • Magical", tab: "skills" },
  "lore-obscure": { name: "Lore • Obscure", tab: "skills" },
  "lore-technical": { name: "Lore • Technical", tab: "skills" },
  "martial-arts-striking": { name: "Martial Arts • Striking", tab: "skills" },
  "martial-arts-sweeps": { name: "Martial Arts • Sweeps", tab: "skills" },
  "martial-arts-combat-maneuvers": { name: "Martial Arts • Combat Maneuvers", tab: "skills" },
  "outdoor-animal": { name: "Outdoor • Animal", tab: "skills" },
  "outdoor-environmental": { name: "Outdoor • Environmental", tab: "skills" },
  "power-awareness": { name: "Power Awareness", tab: "skills" },
  "power-manipulation": { name: "Power Manipulation", tab: "skills" },
  "power-point-development": { name: "Power Point Development", tab: "skills" },
  "scienceanalytic-basic": { name: "Science/Analytic • Basic", tab: "skills" },
  "scienceanalytic-specialized": { name: "Science/Analytic • Specialized", tab: "skills" },
  "self-control": { name: "Self Control", tab: "skills" },
  "special-attacks": { name: "Special Attacks", tab: "skills" },
  "special-defenses": { name: "Special Defenses", tab: "skills" },
  "spells-arcane-open-lists": { name: "Spells • Arcane Open Lists", tab: "spells" },
  "spells-arcane-closed-lists": { name: "Spells • Arcane Closed Lists", tab: "spells" },
  "spells-arcane-base-lists": { name: "Spells • Arcane Base Lists", tab: "spells" },
  "spells-own-realm-open-lists": { name: "Spells • Own Realm Open Lists", tab: "spells" },
  "spells-own-realm-closed-lists": { name: "Spells • Own Realm Closed Lists", tab: "spells" },
  "spells-own-realm-own-base-lists": { name: "Spells • Own Realm Own Base Lists", tab: "spells" },
  "spells-own-realm-other-base-lists": { name: "Spells • Own Realm Other Base Lists", tab: "spells" },
  "spells-other-realm-open-lists": { name: "Spells • Other Realm Open Lists", tab: "spells" },
  "spells-other-realm-closed-lists": { name: "Spells • Other Realm Closed Lists", tab: "spells" },
  "spells-other-realm-base-lists": { name: "Spells • Other Realm Base Lists", tab: "spells" },
  "subterfuge-attack": { name: "Subterfuge • Attack", tab: "skills" },
  "subterfuge-mechanics": { name: "Subterfuge • Mechanics", tab: "skills" },
  "subterfuge-stealth": { name: "Subterfuge • Stealth", tab: "skills" },
  "technicaltrade-general": { name: "Technical/Trade • General", tab: "skills" },
  "technicaltrade-professional": { name: "Technical/Trade • Professional", tab: "skills" },
  "technicaltrade-vocational": { name: "Technical/Trade • Vocational", tab: "skills" },
  "urban": { name: "Urban", tab: "skills" },
  "weapon-1-h-edged": { name: "Weapon • 1-H Edged", tab: "skills" },
  "weapon-1-h-concussion": { name: "Weapon • 1-H Concussion", tab: "skills" },
  "weapon-2-handed": { name: "Weapon • 2-Handed", tab: "skills" },
  "weapon-missile": { name: "Weapon • Missile", tab: "skills" },
  "weapon-missile-artillery": { name: "Weapon • Missile Artillery", tab: "skills" },
  "weapon-pole-arms": { name: "Weapon • Pole Arms", tab: "skills" },
  "weapon-thrown": { name: "Weapon • Thrown", tab: "skills" }
}

/** Weapon category slugs (for preference assignment). */
rmss.weapon_category_slugs = [
  "weapon-1-h-edged", "weapon-1-h-concussion", "weapon-2-handed",
  "weapon-missile", "weapon-missile-artillery", "weapon-pole-arms", "weapon-thrown"
]

/** Cost per preference position (1st=1/5, 2nd=2/5, 3rd-5th=2/7, 6th-7th=5). */
rmss.weapon_preference_costs = ["1/5", "2/5", "2/7", "2/7", "2/7", "5", "5"]

/** Slug -> tab, derived from skill_categories. Fallback: "skills". */
rmss.skill_tab_by_slug = Object.fromEntries(
  Object.entries(rmss.skill_categories).map(([slug, data]) => [slug, data.tab])
)

/**
 * Non-spellcaster spell list: cost = base * multiplier.
 * Multiplier by skill rank (spell level) per T-2.4.
 */
rmss.non_spellcaster_spell_list_rank_multipliers = {
  "1-5": 1,
  "6-10": 2,
  "11-15": 3,
  "16-20": 4,
  "21+": 5
}

/**
 * Spell list slug -> { realm, listType } for T-2.4 lookup.
 */
rmss.spell_list_slug_to_table = {
  "spells-own-realm-own-base-lists": { realm: "own_realm", listType: "own_base" },
  "spells-own-realm-open-lists": { realm: "own_realm", listType: "open" },
  "spells-own-realm-closed-lists": { realm: "own_realm", listType: "closed" },
  "spells-own-realm-other-base-lists": { realm: "own_realm", listType: "other_base" },
  "spells-other-realm-open-lists": { realm: "other_realm", listType: "open" },
  "spells-other-realm-closed-lists": { realm: "other_realm", listType: "closed" },
  "spells-other-realm-base-lists": { realm: "other_realm", listType: "other_base" },
  "spells-arcane-open-lists": { realm: "arcane", listType: "open" },
  "spells-arcane-closed-lists": { realm: "arcane", listType: "closed" },
  "spells-arcane-base-lists": { realm: "arcane", listType: "other_base" }
}

/**
 * T-2.4 Spell List DP Cost Table. Exact values from Spell Law.
 * realm.listType.rankTier -> { pure, semi, hybrid }
 * Format: number or "X/Y/Z" (repeat last value for ranks beyond array length)
 */
rmss.spell_list_dp_costs = {
  own_realm: {
    own_base: {
      "1+": { pure: 3, semi: 6, hybrid: 3 },
      "1-5": { arcane_pure: "3/3/3", arcane_semi: "6/6/6" },
      "6-10": { arcane_pure: "3/3/3", arcane_semi: "7/7/7" },
      "11-15": { arcane_pure: "3/3/3", arcane_semi: "7/7/7" },
      "16-20": { arcane_pure: "3/3/3", arcane_semi: "7/7/7" },
      "21+": { arcane_pure: "4/4/4", arcane_semi: "8/8/8" }
    },
    open: {
      "1-5": { pure: "4/4/4", semi: "8/8", hybrid: "4/4/4" },
      "6-10": { pure: "4/4/4", semi: "8/8", hybrid: "4/4/4" },
      "11-15": { pure: "4/4/4", semi: 12, hybrid: "6/6/6" },
      "16-20": { pure: "4/4/4", semi: 18, hybrid: "8/8" },
      "21+": { pure: "6/6/6", semi: 25, hybrid: 12 }
    },
    closed: {
      "1-5": { pure: "4/4/4", semi: "10/10", hybrid: "4/4/4" },
      "6-10": { pure: "4/4/4", semi: 12, hybrid: "6/6/6" },
      "11-15": { pure: "4/4/4", semi: 25, hybrid: "8/8" },
      "16-20": { pure: "4/4/4", semi: 40, hybrid: "10/10" },
      "21+": { pure: "8/8", semi: 60, hybrid: 25 }
    },
    other_base: {
      "1-5": { pure: "8/8", semi: 25, hybrid: "10/10" },
      "6-10": { pure: "10/10", semi: 40, hybrid: 12 },
      "11-15": { pure: 12, semi: 60, hybrid: 25 },
      "16-20": { pure: 25, semi: 80, hybrid: 40 },
      "21+": { pure: 40, semi: 100, hybrid: 60 }
    }
  },
  other_realm: {
    open: {
      "1-5": { pure: "10/10", semi: 30, hybrid: 12 },
      "6-10": { pure: 12, semi: 60, hybrid: 25 },
      "11-15": { pure: 25, semi: 80, hybrid: 40 },
      "16-20": { pure: 40, semi: 100, hybrid: 60 },
      "21+": { pure: 60, semi: 120, hybrid: 80 }
    },
    closed: {
      "1-5": { pure: 20, semi: 45, hybrid: 25 },
      "6-10": { pure: 25, semi: 60, hybrid: 40 },
      "11-15": { pure: 40, semi: 80, hybrid: 60 },
      "16-20": { pure: 60, semi: 100, hybrid: 80 },
      "21+": { pure: 80, semi: 120, hybrid: 100 }
    },
    other_base: {
      "1-5": { pure: 50, semi: 80, hybrid: 60 },
      "6-10": { pure: 70, semi: 100, hybrid: 80 },
      "11-15": { pure: 90, semi: 120, hybrid: 100 },
      "16-20": { pure: 110, semi: 140, hybrid: 120 },
      "21+": { pure: 130, semi: 160, hybrid: 140 }
    }
  },
  arcane: {
    open: {
      "1-5": { pure: "6/6", semi: 12, hybrid: "5/5", arcane_pure: "4/4/4", arcane_semi: "11/11" },
      "6-10": { pure: "8/8", semi: 25, hybrid: "6/6", arcane_pure: "4/4/4", arcane_semi: "11/11" },
      "11-15": { pure: "10/10", semi: 40, hybrid: "8/8", arcane_pure: "4/4/4", arcane_semi: 12 },
      "16-20": { pure: 12, semi: 60, hybrid: "10/10", arcane_pure: "4/4/4", arcane_semi: 18 },
      "21+": { pure: 25, semi: 80, hybrid: 12, arcane_pure: "6/6/6", arcane_semi: 25 }
    },
    closed: {
      "1-5": { pure: "10/10", semi: 18, hybrid: "8/8", arcane_pure: "4/4/4", arcane_semi: "16/16" },
      "6-10": { pure: 12, semi: 25, hybrid: "10/10", arcane_pure: "4/4/4", arcane_semi: 18 },
      "11-15": { pure: 25, semi: 40, hybrid: 12, arcane_pure: "4/4/4", arcane_semi: 25 },
      "16-20": { pure: 40, semi: 60, hybrid: 25, arcane_pure: "4/4/4", arcane_semi: 40 },
      "21+": { pure: 60, semi: 80, hybrid: 40, arcane_pure: "8/8", arcane_semi: 60 }
    },
    other_base: {
      "1-5": { pure: 25, semi: 40, hybrid: 12, arcane_pure: "12/12", arcane_semi: 25 },
      "6-10": { pure: 40, semi: 60, hybrid: 25, arcane_pure: "16/16", arcane_semi: 40 },
      "11-15": { pure: 60, semi: 80, hybrid: 40, arcane_pure: 18, arcane_semi: 60 },
      "16-20": { pure: 80, semi: 100, hybrid: 60, arcane_pure: 25, arcane_semi: 80 },
      "21+": { pure: 100, semi: 120, hybrid: 80, arcane_pure: 40, arcane_semi: 100 }
    }
  }
}

rmss.creature_speed = {
  "in": {
    "name": "Inching",
    "value": -16
  },
  "cr": {
    "name": "Creeping",
    "value": -12
  },
  "vs": {
    "name": "Very Slow",
    "value": -8
  },
  "sl": {
    "name": "Slow",
    "value": -4
  },
  "md": {
    "name": "Medium",
    "value": 0
  },
  "mf": {
    "name": "Moderately Fast",
    "value": 4
  },
  "fa": {
    "name": "Fast",
    "value": 8
  },
  "vf": {
    "name": "Very Fast",
    "value": 12
  },
  "bf": {
    "name": "Blindingly Fast",
    "value": 16
  }
};
