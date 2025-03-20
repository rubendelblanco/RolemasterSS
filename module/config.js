export const rmss = {};

rmss.curreny_type = {
  mp: "rmss.curreny_type.mp",
  pp: "rmss.curreny_type.pp",
  gp: "rmss.curreny_type.gp",
  sp: "rmss.curreny_type.sp",
  bp: "rmss.curreny_type.bp",
  cp: "rmss.curreny_type.cp"
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
  special:{
    name: "Special",
    progression: "0*6*5*4*3"
  },
  combined:{
    name: "Combined",
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
  types : {
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
