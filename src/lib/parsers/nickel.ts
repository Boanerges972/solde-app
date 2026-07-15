import type { ParsedTx } from './ofx'

const NICKEL_CATS: Record<string, string[]> = {
  'Courses':['LEADER PRICE','CARREFOUR','GARDEN K','STORES AL','AU SUCRE','COFFEA','BGD','MTZ TRADING','MARCHE','SUPERMARCHE','MONOPRIX','LECLERC','INTERMARCHE','LIDL','ALDI','CASINO'],
  'Restaurant':['TAKEWAY','FOODBT','TI DELICE','YUTSO','GABAN','TRD LES ROCHERS','SAS TAMARA','RESTAURANT','BRASSERIE','SNACK','BURGER','PIZZA','SUSHI','KFC','MCDO','DOMINO','SUBWAY'],
  'Abonnement':['NETFLIX','DEEZER','MICROSOFT','APPLE.COM','GOOGLE PLAY','CRUNCHYROLL','DISNEY','ORANGE','FREE','SFR','BOUYGUES','AMAZON PRIME','SPOTIFY','CANAL'],
  'Transport':['DAB','SNCF','RATP','UBER','BOLT','TAXI','PARKING','ESSENCE','TOTAL','BP','SHELL'],
  'Santé':['PHARMACIE','PHIE','CGSS','MEDECIN','DOCTEUR','HOPITAL','CLINIQUE','MUTUELLE','CPAM'],
  'Sport':['FITNESS','KELEN','OXYZEN','SALLE DE SPORT','GYM','PISCINE','SPORT'],
  'Loyer':['GESTIMMO','LOYER','AGENCE','IMMOBILIER','SCI','SYNDIC'],
  'Cinéma':['CINEMA','CINE'],
  'Salaire':['SALAIRE','GF CONSULTING','GF CONSULT'],
};

const NICKEL_ICONS: Record<string, string> = {
  'Courses':'🛒','Restaurant':'🍽️','Abonnement':'📱','Transport':'🚗',
  'Santé':'💊','Sport':'💪','Loyer':'🏠','Cinéma':'🎬','Salaire':'💰',
  'Virement':'💸','Prélèvement':'🏦','Autre':'📦'
};

function categorizeNickel(libelle: string, typeOp: string): string {
  const l=(libelle+' '+typeOp).toUpperCase();
  for(const[cat,keywords] of Object.entries(NICKEL_CATS)){
    if(keywords.some(k=>l.includes(k)))return cat;
  }
  if(l.includes('VIREMENT'))return 'Virement';
  if(l.includes('PRELEVEMENT'))return 'Prélèvement';
  return 'Autre';
}

function parseNickelText(text: string): ParsedTx[] {
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const transactions: ParsedTx[]=[];

  const dateRe=/^(\d{2}\/\d{2}\/\d{4})$/;

  let i=0;
  while(i<lines.length){
    const l=lines[i];
    if(dateRe.test(l)&&i>0){
      const type=lines[i+1]||'';
      let libelle='';
      let amount: string|null=null;
      let j=i+2;
      while(j<lines.length&&j<i+8){
        const candidate=lines[j].replace(/\s/g,'').replace(',','.');
        const numVal=parseFloat(candidate.replace(/[^-\d.]/g,''));
        if((lines[j].includes('€')||/^-?[\d\s]+,\d{2}$/.test(lines[j]))&&!isNaN(numVal)&&numVal!==0){
          amount=lines[j].replace(/[€\s]/g,'').replace(',','.');
          break;
        }
        if(!dateRe.test(lines[j])&&lines[j]!==type){
          libelle+=(libelle?' ':'')+lines[j];
        }
        j++;
      }
      if(amount&&!isNaN(parseFloat(amount))){
        const[d,m,y]=l.split('/');
        const isoDate=y+'-'+m+'-'+d;
        const cat=categorizeNickel(libelle,type);
        transactions.push({
          dt:isoDate,
          merchant:libelle.substring(0,50)||type,
          category:cat,
          icon:NICKEL_ICONS[cat]||'📦',
          amount:parseFloat(amount),
        });
        i=j+1;
        continue;
      }
    }
    i++;
  }
  return transactions;
}

export async function parseNickelPDF(ab: ArrayBuffer): Promise<ParsedTx[]> {
  // pdfjs chargé À LA DEMANDE (code-split) — évite ~1 Mo au démarrage.
  // Worker émis en asset par Vite (?url), récupéré au 1er parse PDF.
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf=await pdfjs.getDocument({data:new Uint8Array(ab)}).promise;
  let fullText='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const items=(tc.items as any[]).sort((a,b)=>{
      const yDiff=Math.round(b.transform[5]/3)*3-Math.round(a.transform[5]/3)*3;
      return yDiff!==0?yDiff:a.transform[4]-b.transform[4];
    });
    fullText+=items.map((i:any)=>i.str).join('\n')+'\n';
  }
  return parseNickelText(fullText);
}

export async function hashAB(ab: ArrayBuffer): Promise<string> {
  const buf=await crypto.subtle.digest('SHA-256',ab);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function getStoredHashes(uid: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`qdq_nickel_${uid}`) || '{}')
    return Object.keys(parsed)
  } catch {
    return []
  }
}

export function saveHashes(uid: string, hashes: string[]): void {
  const lsKey = `qdq_nickel_${uid}`
  let stored: Record<string, string> = {}
  try {
    stored = JSON.parse(localStorage.getItem(lsKey) || '{}')
  } catch {
    stored = {}
  }
  hashes.forEach(h => { stored[h] = stored[h] ?? '' })
  localStorage.setItem(lsKey, JSON.stringify(stored))
}
