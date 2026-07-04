const RULES: [string, string[]][] = [
  ['Courses',     ['CARREFOUR','LECLERC','LIDL','ALDI','MONOPRIX','INTERMARCHE','LEADER PRICE','CASINO','SUPERMARCHE','MARCHE','FRANPRIX','PICARD','NATURALIA']],
  ['Restaurant',  ['RESTAURANT','BRASSERIE','SNACK','PIZZA','BURGER','SUSHI','KFC','MCDO','DOMINO','SUBWAY','UBER EATS','DELIVEROO','JUST EAT','TAKEWAY']],
  ['Transport',   ['SNCF','RATP','UBER','BOLT','TAXI','PARKING','ESSENCE','TOTAL','BP','SHELL','AUTOROUTE','VINCI','SANEF','TRANSDEV']],
  ['Santé',       ['PHARMACIE','PHIE','MEDECIN','DOCTEUR','HOPITAL','CLINIQUE','MUTUELLE','CPAM','CGSS','SECU','DENTAL','OPTIQUE']],
  ['Abonnement',  ['NETFLIX','SPOTIFY','DEEZER','DISNEY','APPLE','GOOGLE','MICROSOFT','AMAZON PRIME','CANAL','ORANGE','FREE','SFR','BOUYGUES','ADOBE','DROPBOX']],
  ['Loyer',       ['LOYER','GESTIMMO','IMMOBILIER','SCI','SYNDIC','HABITAT','AGENCE']],
  ['Assurance',   ['ASSURANCE','HABITATION','MMA','AXA','ALLIANZ','MAIF','MAAF','GMF']],
  ['Banque',      ['COTIS','FRAIS','AGIOS','COMMISSION','INTERETS','ABONNEMENT CARTE']],
  ['Sport',       ['FITNESS','GYM','PISCINE','SPORT','DECATHLON','GO SPORT','INTERSPORT']],
  ['Cinéma',      ['CINEMA','CINE','UGC','GAUMONT','PATHE','MK2']],
  ['Salaire',     ['SALAIRE','REMUNERATION','TRAITEMENT']],
  ['Virement',    ['VIREMENT','VIR SEPA','VIR INST']],
  ['Prélèvement', ['PRELEVEMENT','PRLV SEPA']],
]

export function catFromLabel(label: string): string {
  const up = label.toUpperCase()
  for (const [cat, kws] of RULES) {
    if (kws.some(k => up.includes(k))) return cat
  }
  return 'Autre'
}

export const ICONS: Record<string, string> = {
  'Courses': '🛒', 'Restaurant': '🍽️', 'Transport': '🚗',
  'Santé': '💊', 'Abonnement': '📱', 'Loyer': '🏠',
  'Assurance': '🛡️', 'Banque': '🏦', 'Sport': '💪',
  'Cinéma': '🎬', 'Salaire': '💰', 'Virement': '💸',
  'Prélèvement': '🏦', 'Autre': '📦',
}

export function iconForCat(cat: string): string {
  return ICONS[cat] ?? '📦'
}
