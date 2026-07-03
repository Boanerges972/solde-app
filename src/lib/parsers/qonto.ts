import type { ParsedTx } from './ofx'

const QONTO_CATS: Record<string, string[]> = {
  'Abonnement':['APPLE','GOOGLE','MICROSOFT','NETFLIX','SPOTIFY','AMAZON','ADOBE','DROPBOX','SLACK','ZOOM'],
  'Courses':['CARREFOUR','LEADER','CASINO','LECLERC'],
  'Restaurant':['RESTAURANT','BRASSERIE','UBER EATS','DELIVEROO'],
  'Transport':['SNCF','RATP','UBER','TAXI','ESSENCE'],
  'Santé':['PHARMACIE','MEDECIN','CPAM'],
  'Fournitures':['AMAZON','FNAC','BUREAU'],
  'Salaire':['SALAIRE','REMUNERATION'],
};

function catFromKeywords(libelle: string, catMap: Record<string, string[]>): string {
  const l=libelle.toUpperCase();
  for(const[cat,kws] of Object.entries(catMap)){
    if(kws.some(k=>l.includes(k)))return cat;
  }
  return 'Autre';
}

export function parseQonto(text: string): ParsedTx[] {
  const lines=text.split('\n').filter(Boolean);
  const txs: ParsedTx[]=[];
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(';');
    if(cols.length<25)continue;
    if(cols[0].trim()!=='Exécuté')continue;
    const dateRaw=cols[2].trim().substring(0,10);
    const nom=cols[22]?cols[22].trim():'';
    const montant=cols[5].trim().replace(',','.');
    if(!dateRaw||!montant)continue;
    const [d,m,y]=dateRaw.split('-');
    if(!d||!m||!y)continue;
    const amount=parseFloat(montant);
    if(isNaN(amount))continue;
    const cat=catFromKeywords(nom,QONTO_CATS);
    const icons: Record<string,string>={'Abonnement':'📱','Courses':'🛒','Restaurant':'🍽️','Transport':'🚗','Santé':'💊','Fournitures':'📦','Salaire':'💰','Autre':'📦'};
    txs.push({dt:y+'-'+m+'-'+d,merchant:nom||'Qonto',category:cat,icon:icons[cat]||'📦',amount});
  }
  return txs;
}
