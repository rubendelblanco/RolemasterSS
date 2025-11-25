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
